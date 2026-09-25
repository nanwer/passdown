#!/bin/sh
# Disposable upgrade rehearsal. Installs this version from its compose file,
# then upgrades it to a newer build that adds one migration, three ways:
#
# 1. The Portainer way: change the image in the compose file and redeploy
#    (docker compose up -d) while the new migration is made to fail. Compose
#    stops the old web before migrations run, so the site goes down; the new
#    web must never start against the database, and putting the old image
#    back must bring the old version back with the data intact.
# 2. upgrade.sh with the same failing migration: the old version must keep
#    serving throughout.
# 3. upgrade.sh once the cause is removed: the upgrade applies the migration,
#    keeps the data, and takes a backup first.
#
# Never touches an existing project.
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)
port=${PASSDOWN_CHECK_PORT:-18543}
base_image=${PASSDOWN_IMAGE:-passdown:local}
proxy_image=${PASSDOWN_PROXY_IMAGE:-passdown-caddy:local}
next_image=passdown:upgrade-check-$$
project=passdown-check-upgrade-$$-$(date +%s)
work=$(mktemp -d "${TMPDIR:-/tmp}/passdown-upgrade-check.XXXXXXXX")
install=$work/installation
stage=preflight
started=false
keep_logs=${PASSDOWN_KEEP_LOGS:-0}
unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES
for variable in $(env | awk -F= '/^(PASSDOWN_|GUIDE_|BETTER_AUTH_)/ {print $1}'); do unset "$variable"; done
# The first-run helper refuses any project that is not a disposable check.
export PASSDOWN_CHECK_PROJECT=$project
# The stack's environment, as Portainer would pass it.
export PASSDOWN_URL=https://localhost:$port PASSDOWN_PORT=$port
compose() { docker compose --project-name "$project" -f "$install/compose.yaml" "$@"; }
web_container() { compose ps -a -q web; }
health() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 --cacert "$work/root.crt" "https://localhost:$port/api/health" || true; }
applied() { compose exec -T postgres psql -U guide_owner -d guide_app -tAc 'select count(*) from public.schema_migration'; }
# Point the compose file at an image, as a person editing its version would.
use_image() {
  sed "s#^x-passdown-image: &passdown-image .*#x-passdown-image: \&passdown-image $1#" "$install/compose.yaml" > "$work/compose.next"
  cat "$work/compose.next" > "$install/compose.yaml"
}
observe() { printf '%s: %s\n' "$1" "$2" >> "$work/observations.txt"; }

cleanup() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ]; then
    printf 'Upgrade check failed: %s.\n' "$stage" >&2
    [ "$started" = false ] || compose ps --all 2>/dev/null || true
  fi
  [ ! -f "$work/observations.txt" ] || cat "$work/observations.txt"
  if [ "$started" = true ] && ! compose down -v --remove-orphans >> "$work/docker.log" 2>&1; then
    printf 'Could not remove disposable project %s; remove it before rerunning.\n' "$project" >&2
    result=1
  fi
  docker image rm "$next_image" >> "$work/docker.log" 2>&1 || true
  if [ "$keep_logs" = 1 ]; then
    printf 'Private check evidence retained in %s (contains test credentials; do not publish).\n' "$work"
  else rm -rf "$work"; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
docker image inspect "$base_image" "$proxy_image" > /dev/null

stage='newer build'
# The newer version is this source plus one migration; the manifest compiled
# into the application must list it, so it is a real rebuild.
printf '%s\n' 'Building a newer version with one extra migration.'
mkdir "$work/source"
# Tracked files as they are now, including uncommitted edits.
snapshot=$(git -C "$root" stash create)
git -C "$root" archive "${snapshot:-HEAD}" | tar -x -C "$work/source"
last=$(ls "$work/source/packages/database/migrations" | grep -E '^[0-9]{3}_.*\.sql$' | sort | tail -n 1)
previous=$(printf '%s' "${last%%_*}" | sed 's/^0*//')
number=$(printf '%03d' $((previous + 1)))
printf '%s\n' '-- Upgrade rehearsal only; never shipped.' \
  'CREATE TABLE app.upgrade_check (id integer PRIMARY KEY);' \
  > "$work/source/packages/database/migrations/${number}_upgrade_check.sql"
(cd "$work/source" && node scripts/migration-manifest.mjs)
revision=$(git -C "$root" rev-parse HEAD)
# Failing commands exit outside their redirection so the failure report reaches the console.
if ! docker build -q --build-arg PASSDOWN_REVISION="$revision" -t "$next_image" "$work/source" > "$work/build.log" 2>&1; then exit 1; fi

stage='installation from the compose file'
mkdir "$install"
for file in compose.yaml upgrade.sh backup.sh; do cp "$root/deploy/$file" "$install/"; done
use_image "$base_image"
sed "s#^    image: ghcr.io/nanwer/passdown-caddy:.*#    image: $proxy_image#" "$install/compose.yaml" > "$work/compose.next"
cat "$work/compose.next" > "$install/compose.yaml"
grep -q "image: $proxy_image" "$install/compose.yaml"
started=true
if ! compose up -d --wait --wait-timeout 240 > "$work/up.log" 2>&1; then exit 1; fi
attempt=0
until compose cp proxy:/data/caddy/pki/authorities/local/root.crt "$work/root.crt" > /dev/null 2>&1; do
  attempt=$((attempt + 1)); [ "$attempt" -lt 30 ] || exit 1; sleep 2
done
node "$root/scripts/deployment-first-flow.mjs" --origin "https://localhost:$port" \
  --state-file "$work/session.json" --ca-file "$work/root.crt"
before=$(applied)
[ -n "$before" ]
old_web=$(web_container)

stage='redeploy with a failing migration (docker compose up -d, as Portainer does)'
# A table the new migration creates already exists, so its migration fails.
compose exec -T postgres psql -q -U guide_owner -d guide_app -c 'CREATE TABLE app.upgrade_check (id integer)' > /dev/null
use_image "$next_image"
if compose up -d > "$work/redeploy-failed.log" 2>&1; then redeploy=succeeded; else redeploy=failed; fi
observe 'redeploy exit' "$redeploy"
[ "$redeploy" = failed ]
new_web=$(web_container)
observe 'old web container kept' "$([ "$new_web" = "$old_web" ] && echo yes || echo no)"
web_state=$(docker inspect --format '{{.State.Status}} started={{.State.StartedAt}}' "$new_web")
observe 'web container after redeploy' "$web_state"
observe 'web image after redeploy' "$(docker inspect --format '{{.Config.Image}}' "$new_web")"
observe 'migrate exit code' "$(docker inspect --format '{{.State.ExitCode}}' "$(compose ps -a -q migrate)")"
observe 'health through the proxy' "$(health)"
observe 'migrations recorded' "$(applied) (before: $before)"
# The new web never ran against the database, and nothing was half-applied.
case "$web_state" in created\ started=0001-01-01T00:00:00Z) ;; *) exit 1 ;; esac
[ "$(applied)" = "$before" ]
[ "$(health)" != 200 ]

stage='going back to the previous image after the failed redeploy'
use_image "$base_image"
if ! compose up -d --wait --wait-timeout 240 > "$work/redeploy-back.log" 2>&1; then exit 1; fi
[ "$(health)" = 200 ]
observe 'after putting the previous image back' "health $(health)"
node "$root/scripts/deployment-first-flow.mjs" --resume --origin "https://localhost:$port" \
  --state-file "$work/session.json" --ca-file "$work/root.crt"
old_web=$(web_container)

stage='failed upgrade.sh keeps the old version serving'
use_image "$next_image"
if sh "$install/upgrade.sh" --project "$project" --skip-backup > "$work/upgrade-failed.log" 2>&1; then exit 1; fi
grep -q 'still running the previous version' "$work/upgrade-failed.log"
[ "$(web_container)" = "$old_web" ]
[ "$(health)" = 200 ]
[ "$(applied)" = "$before" ]
observe 'upgrade.sh with the failing migration' "old web kept, health $(health)"
compose exec -T postgres psql -q -U guide_owner -d guide_app -c 'DROP TABLE app.upgrade_check' > /dev/null

stage='successful upgrade'
if ! sh "$install/upgrade.sh" --project "$project" > "$work/upgrade.log" 2>&1; then exit 1; fi
grep -q 'Upgrade complete.' "$work/upgrade.log"
[ "$(web_container)" != "$old_web" ]
[ "$(docker inspect --format '{{.Config.Image}}' "$(web_container)")" = "$next_image" ]
[ "$(applied)" -eq $((before + 1)) ]
ls "$install/backups" | grep -q '^passdown-.*\.tar$'
[ "$(health)" = 200 ]

stage='data after upgrade'
node "$root/scripts/deployment-first-flow.mjs" --resume --origin "https://localhost:$port" \
  --state-file "$work/session.json" --ca-file "$work/root.crt"
printf '%s\n' "Upgrade check passed: a failed redeploy never started the new web and the previous image came back; upgrade.sh kept the old version serving through a failed migration, then applied migration $number and kept setup, session and the private picture."
