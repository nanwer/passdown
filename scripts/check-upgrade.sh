#!/bin/sh
# Disposable upgrade rehearsal. Installs this version from its compose file,
# then upgrades it to a newer build that adds two migrations:
#
# 1. The Portainer way: change both image versions in the compose file and
#    redeploy (docker compose up -d) while the first new migration is made to
#    fail. Compose stops the old web before migrations run, so the site is
#    offline; the new web must never start, visitors and /api/health must be
#    told the upgrade failed with no data changed, and putting the previous
#    versions back must bring the old version back with the data intact.
# 2. upgrade.sh with the same failing migration: the old version must keep
#    serving throughout, and no failure notice is left behind.
# 3. A redeploy where the first migration applies and the second fails: the
#    notice must say some changes were applied rather than "nothing changed".
# 4. A redeploy once the cause is removed: the remaining migration applies,
#    the new version serves the existing data and the notice is gone.
# 5. upgrade.sh to a further version: backup first, then replacement.
#
# Never touches an existing project.
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)
port=${PASSDOWN_CHECK_PORT:-18543}
base_image=${PASSDOWN_IMAGE:-passdown:local}
base_proxy=${PASSDOWN_PROXY_IMAGE:-passdown-caddy:local}
next_image=passdown:upgrade-check-$$
# The same builds under other names: a changed image line, as in a release.
next_proxy=passdown-caddy:upgrade-check-$$
later_image=passdown:upgrade-check-$$-later
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
# fetch PATH: prints the status code; the body is in $work/body.
fetch() { curl -s -o "$work/body" -w '%{http_code}' --max-time 10 --cacert "$work/root.crt" "https://localhost:$port$1" || true; }
health() { fetch /api/health; }
# A recreated proxy takes a moment to listen again.
answering() {
  attempt=0
  while [ "$(health)" = 000 ]; do
    attempt=$((attempt + 1)); [ "$attempt" -lt 30 ] || return 1; sleep 1
  done
}
applied() { compose exec -T postgres psql -U guide_owner -d guide_app -tAc 'select count(*) from public.schema_migration'; }
sql() { compose exec -T postgres psql -q -U guide_owner -d guide_app -c "$1" > /dev/null; }
notices() { compose exec -T proxy ls -A /srv/passdown-status; }
# Point the compose file at images, as a person editing its versions would.
current_proxy=
use_images() {
  sed -e "s#^x-passdown-image: &passdown-image .*#x-passdown-image: \&passdown-image $1#" \
    -e "s#^    image: ${current_proxy:-ghcr.io/nanwer/passdown-caddy:.*}\$#    image: $2#" \
    "$install/compose.yaml" > "$work/compose.next"
  cat "$work/compose.next" > "$install/compose.yaml"
  current_proxy=$2
  grep -q "image: $2" "$install/compose.yaml"
}
observe() { printf '%s: %s\n' "$1" "$2" >> "$work/observations.txt"; }
# The new web must exist but never have run.
never_started() {
  case "$(docker inspect --format '{{.State.Status}} started={{.State.StartedAt}}' "$(web_container)")" in
    created\ started=0001-01-01T00:00:00Z) ;; *) return 1 ;;
  esac
}

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
  docker image rm "$next_image" "$next_proxy" "$later_image" >> "$work/docker.log" 2>&1 || true
  if [ "$keep_logs" = 1 ]; then
    printf 'Private check evidence retained in %s (contains test credentials; do not publish).\n' "$work"
  else rm -rf "$work"; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
docker image inspect "$base_image" "$base_proxy" > /dev/null

stage='newer build'
# The newer version is this source plus two migrations; the manifest compiled
# into the application must list them, so it is a real rebuild.
printf '%s\n' 'Building a newer version with two extra migrations.'
mkdir "$work/source"
# Tracked files as they are now, including uncommitted edits.
snapshot=$(git -C "$root" stash create)
git -C "$root" archive "${snapshot:-HEAD}" | tar -x -C "$work/source"
last=$(ls "$work/source/packages/database/migrations" | grep -E '^[0-9]{3}_.*\.sql$' | sort | tail -n 1)
previous=$(printf '%s' "${last%%_*}" | sed 's/^0*//')
first=$(printf '%03d' $((previous + 1)))
second=$(printf '%03d' $((previous + 2)))
printf '%s\n' '-- Upgrade rehearsal only; never shipped.' \
  'CREATE TABLE app.upgrade_check (id integer PRIMARY KEY);' \
  > "$work/source/packages/database/migrations/${first}_upgrade_check.sql"
printf '%s\n' '-- Upgrade rehearsal only; never shipped.' \
  'CREATE TABLE app.upgrade_check_second (id integer PRIMARY KEY);' \
  > "$work/source/packages/database/migrations/${second}_upgrade_check_second.sql"
(cd "$work/source" && node scripts/migration-manifest.mjs)
revision=$(git -C "$root" rev-parse HEAD)
# Failing commands exit outside their redirection so the failure report reaches the console.
if ! docker build -q --build-arg PASSDOWN_REVISION="$revision" -t "$next_image" "$work/source" > "$work/build.log" 2>&1; then exit 1; fi
docker tag "$base_proxy" "$next_proxy"
docker tag "$next_image" "$later_image"

stage='installation from the compose file'
mkdir "$install"
for file in compose.yaml upgrade.sh backup.sh; do cp "$root/deploy/$file" "$install/"; done
use_images "$base_image" "$base_proxy"
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

stage='redeploy with a failing migration (docker compose up -d, as Portainer does)'
# A table the first new migration creates already exists, so it fails.
sql 'CREATE TABLE app.upgrade_check (id integer)'
use_images "$next_image" "$next_proxy"
if compose up -d > "$work/redeploy-failed.log" 2>&1; then redeploy=succeeded; else redeploy=failed; fi
observe 'redeploy exit' "$redeploy"
[ "$redeploy" = failed ]
answering
observe 'web container after redeploy' "$(docker inspect --format '{{.State.Status}} {{.Config.Image}}' "$(web_container)")"
observe 'migrate exit code' "$(docker inspect --format '{{.State.ExitCode}}' "$(compose ps -a -q migrate)")"
observe 'proxy after redeploy' "$(docker inspect --format '{{.State.Status}} {{.Config.Image}}' "$(compose ps -a -q proxy)")"
observe 'migrations recorded' "$(applied) (before: $before)"
observe 'health through the proxy' "$(health) $(cat "$work/body")"
never_started
[ "$(applied)" = "$before" ]
[ "$(health)" = 503 ]
grep -q '"status": *"upgrade-failed"' "$work/body"
[ "$(fetch /)" = 503 ]
grep -q 'No data was changed' "$work/body"
grep -q 'put the previous version back' "$work/body"
observe 'page for visitors' "$(fetch /) $(sed -n 's:.*<h1>\(.*\)</h1>.*:\1:p' "$work/body")"
compose logs --no-log-prefix migrate > "$work/migrate-failed.log" 2>&1
grep -q 'no data was changed' "$work/migrate-failed.log"
observe 'migrate log' "$(tail -n 1 "$work/migrate-failed.log")"

stage='going back to the previous versions after the failed redeploy'
use_images "$base_image" "$base_proxy"
if ! compose up -d --wait --wait-timeout 240 > "$work/redeploy-back.log" 2>&1; then exit 1; fi
answering
[ "$(health)" = 200 ]
[ -z "$(notices)" ]
observe 'after putting the previous versions back' "health $(health)"
node "$root/scripts/deployment-first-flow.mjs" --resume --origin "https://localhost:$port" \
  --state-file "$work/session.json" --ca-file "$work/root.crt"
old_web=$(web_container)

stage='failed upgrade.sh keeps the old version serving'
use_images "$next_image" "$next_proxy"
if sh "$install/upgrade.sh" --project "$project" --skip-backup > "$work/upgrade-failed.log" 2>&1; then exit 1; fi
grep -q 'still running the previous version' "$work/upgrade-failed.log"
[ "$(web_container)" = "$old_web" ]
[ "$(health)" = 200 ]
[ "$(applied)" = "$before" ]
[ -z "$(notices)" ]
observe 'upgrade.sh with the failing migration' "old web kept, health $(health)"

stage='redeploy where the second migration fails'
sql 'DROP TABLE app.upgrade_check'
sql 'CREATE TABLE app.upgrade_check_second (id integer)'
if compose up -d > "$work/redeploy-partial.log" 2>&1; then exit 1; fi
answering
never_started
[ "$(applied)" -eq $((before + 1)) ]
[ "$(health)" = 503 ]
grep -q '"status": *"upgrade-incomplete"' "$work/body"
[ "$(fetch /)" = 503 ]
grep -q 'Some of the new version' "$work/body"
if grep -q 'No data was changed' "$work/body"; then exit 1; fi
observe 'partly applied redeploy' "health $(health) $(cat "$work/body")"

stage='redeploy once the cause is removed'
sql 'DROP TABLE app.upgrade_check_second'
if ! compose up -d --wait --wait-timeout 240 > "$work/redeploy.log" 2>&1; then exit 1; fi
answering
[ "$(health)" = 200 ]
[ "$(applied)" -eq $((before + 2)) ]
[ "$(docker inspect --format '{{.Config.Image}}' "$(web_container)")" = "$next_image" ]
[ -z "$(notices)" ]
observe 'successful redeploy' "health $(health), migrations $(applied)"
node "$root/scripts/deployment-first-flow.mjs" --resume --origin "https://localhost:$port" \
  --state-file "$work/session.json" --ca-file "$work/root.crt"
old_web=$(web_container)

stage='successful upgrade.sh'
use_images "$later_image" "$base_proxy"
if ! sh "$install/upgrade.sh" --project "$project" > "$work/upgrade.log" 2>&1; then exit 1; fi
grep -q 'Upgrade complete.' "$work/upgrade.log"
[ "$(web_container)" != "$old_web" ]
[ "$(docker inspect --format '{{.Config.Image}}' "$(web_container)")" = "$later_image" ]
ls "$install/backups" | grep -q '^passdown-.*\.tar$'
answering
[ "$(health)" = 200 ]

stage='data after upgrade'
node "$root/scripts/deployment-first-flow.mjs" --resume --origin "https://localhost:$port" \
  --state-file "$work/session.json" --ca-file "$work/root.crt"
printf '%s\n' "Upgrade check passed: a failed redeploy never started the new web, told visitors and /api/health what happened, and the previous versions came back; upgrade.sh kept the old version serving through a failed migration; a partly applied redeploy said so, and redeploying after the fix applied migrations $first and $second and kept setup, session and the private picture; upgrade.sh then backed up and replaced web."
