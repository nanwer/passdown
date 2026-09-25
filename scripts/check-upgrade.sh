#!/bin/sh
# Disposable upgrade rehearsal: install this version from its release files,
# then upgrade it to a newer build that adds one migration. The first attempt
# is made to fail and must leave the site running the old version; the second
# must succeed and keep the data. Never touches an existing project.
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)
http_port=${PASSDOWN_CHECK_HTTP_PORT:-18180}
https_port=${PASSDOWN_CHECK_HTTPS_PORT:-18543}
base_image=${PASSDOWN_IMAGE:-passdown:local}
proxy_image=${PASSDOWN_PROXY_IMAGE:-passdown-caddy:local}
next_image=passdown:upgrade-check-$$
project=passdown-check-upgrade-$$-$(date +%s)
work=$(mktemp -d "${TMPDIR:-/tmp}/passdown-upgrade-check.XXXXXXXX")
install=$work/installation
stage=preflight
started=false
unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES
keep_logs=${PASSDOWN_KEEP_LOGS:-0}
for variable in $(env | awk -F= '/^(PASSDOWN_|GUIDE_|BETTER_AUTH_)/ {print $1}'); do unset "$variable"; done
# The first-run helper refuses any project that is not a disposable check.
export PASSDOWN_CHECK_PROJECT=$project
# The settings name compose.yaml relatively; Compose resolves it from the working directory.
compose() { (cd "$install" && docker compose --project-directory "$install" --env-file "$install/.env" "$@"); }
setting() { awk -v key="$1" 'index($0,key "=")==1 {print substr($0,length(key)+2)}' "$install/.env"; }
web_container() { compose ps -q web; }
health() { curl -s --cacert "$work/root.crt" "https://localhost:$https_port/api/health"; }

cleanup() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ]; then
    printf 'Upgrade check failed: %s.\n' "$stage" >&2
    [ "$started" = false ] || compose ps --all 2>/dev/null || true
  fi
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

stage='installation from release files'
mkdir "$install"
for file in compose.yaml init.sh upgrade.sh backup.sh; do cp "$root/deploy/$file" "$install/"; done
if ! sh "$install/init.sh" --project "$project" --domain localhost --http-port "$http_port" --https-port "$https_port" \
  --output "$install/.env" > "$work/init.log" 2>&1; then exit 1; fi
printf 'PASSDOWN_IMAGE=%s\nPASSDOWN_PROXY_IMAGE=%s\n' "$base_image" "$proxy_image" >> "$install/.env"
node --input-type=module - "$work" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const [dir] = process.argv.slice(2);
const code = readFileSync(`${dir}/init.log`, 'utf8').match(/Setup code:\s+([0-9A-HJKMNP-TV-Z]{5}(?:-[0-9A-HJKMNP-TV-Z]{5}){3})/);
if (!code) throw new Error('Initializer did not produce a setup code.');
writeFileSync(`${dir}/setup-code`, code[1], { mode: 0o600, flag: 'wx' });
NODE
started=true
if ! compose up -d --wait --wait-timeout 240 > "$work/up.log" 2>&1; then exit 1; fi
attempt=0
until compose cp proxy:/data/caddy/pki/authorities/local/root.crt "$work/root.crt" > /dev/null 2>&1; do
  attempt=$((attempt + 1)); [ "$attempt" -lt 30 ] || exit 1; sleep 2
done
node "$root/scripts/deployment-first-flow.mjs" --origin "https://localhost:$https_port" \
  --code-file "$work/setup-code" --state-file "$work/session.json" --ca-file "$work/root.crt"
before=$(compose run --rm -T ops status 2> /dev/null | awk '/migrations applied/ {gsub(/[^0-9]/, "", $0); print}')
[ -n "$before" ]

stage='failed upgrade keeps the old version'
# A table the new migration creates already exists, so its migration fails.
compose exec -T postgres psql -q -U guide_owner -d guide_app -c 'CREATE TABLE app.upgrade_check (id integer)' > /dev/null
old_web=$(web_container)
if sh "$install/upgrade.sh" --image "$next_image" --skip-backup > "$work/upgrade-failed.log" 2>&1; then exit 1; fi
grep -q 'still running the previous version' "$work/upgrade-failed.log"
[ "$(web_container)" = "$old_web" ]
[ "$(setting PASSDOWN_IMAGE)" = "$base_image" ]
health | grep -q '"status":"ready"'
compose exec -T postgres psql -q -U guide_owner -d guide_app -c 'DROP TABLE app.upgrade_check' > /dev/null

stage='successful upgrade'
if ! sh "$install/upgrade.sh" --image "$next_image" > "$work/upgrade.log" 2>&1; then exit 1; fi
grep -q 'Upgrade complete.' "$work/upgrade.log"
[ "$(web_container)" != "$old_web" ]
[ "$(setting PASSDOWN_IMAGE)" = "$next_image" ]
after=$(compose run --rm -T ops status 2> /dev/null | awk '/migrations applied/ {gsub(/[^0-9]/, "", $0); print}')
[ "$after" -eq $((before + 1)) ]
ls "$install/backups" | grep -q .
health | grep -q '"status":"ready"'

stage='data after upgrade'
node "$root/scripts/deployment-first-flow.mjs" --resume --origin "https://localhost:$https_port" \
  --state-file "$work/session.json" --ca-file "$work/root.crt"
printf '%s\n' "Upgrade check passed: a failed migration kept the old version serving; the upgrade applied migration $number and kept setup, session and the private picture."
