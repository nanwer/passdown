#!/bin/sh
# Disposable deployment rehearsal of the Portainer-style install: the compose
# file alone, no settings file, PASSDOWN_URL and PASSDOWN_PORT as the stack's
# only environment. Never uses an existing project or data volume.
#
# Builds from source by default (compose.build.yaml, images tagged
# passdown:check-<pid>). PASSDOWN_IMAGE and PASSDOWN_PROXY_IMAGE run existing
# images instead; PASSDOWN_DEPLOY_DIR takes compose.yaml from a rendered
# release-asset directory rather than deploy/.
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)
port=${PASSDOWN_CHECK_PORT:-18443}
case "$port" in ''|*[!0-9]*|0*) printf '%s\n' 'The check port must be an integer from 1024 to 65535.' >&2; exit 2 ;; esac
[ "${#port}" -le 5 ] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || exit 2
project=passdown-check-$$-$(date +%s)
export PASSDOWN_CHECK_PROJECT=$project
work=$(mktemp -d "${TMPDIR:-/tmp}/passdown-check.XXXXXXXX")
stack=$work/stack
mkdir "$stack"
stage=preflight
started=false
deploy=$root/deploy
[ -z "${PASSDOWN_DEPLOY_DIR:-}" ] || deploy=$(CDPATH= cd -- "$PASSDOWN_DEPLOY_DIR" && pwd -P) || exit 2
# What a person pastes: the compose file, nothing beside it.
cp "$deploy/compose.yaml" "$stack/compose.yaml"
tag=check-$$
if [ -n "${PASSDOWN_IMAGE:-}" ]; then
  : "${PASSDOWN_PROXY_IMAGE:?Set PASSDOWN_PROXY_IMAGE with PASSDOWN_IMAGE.}"
  # Preloaded or published images in place of the release references.
  printf 'services:\n' > "$work/images.yaml"
  for service in init migrate web ops; do
    printf '  %s: { image: "%s", pull_policy: never }\n' "$service" "$PASSDOWN_IMAGE" >> "$work/images.yaml"
  done
  printf '  proxy: { image: "%s", pull_policy: never }\n' "$PASSDOWN_PROXY_IMAGE" >> "$work/images.yaml"
  overlay=$work/images.yaml
  build=false
else
  overlay=$root/deploy/compose.build.yaml
  build=true
fi
# Inherited Compose or Passdown settings must not redirect this check.
unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES
for variable in $(env | awk -F= '/^(PASSDOWN_|GUIDE_|BETTER_AUTH_)/ {print $1}'); do
  case "$variable" in PASSDOWN_CHECK_PROJECT|PASSDOWN_KEEP_LOGS|PASSDOWN_SKIP_BUILD) ;; *) unset "$variable" ;; esac
done
# The stack's environment, as Portainer would pass it.
export PASSDOWN_URL=https://localhost:$port PASSDOWN_PORT=$port PASSDOWN_BUILD_TAG=$tag
compose() {
  docker compose --project-directory "$stack" --project-name "$project" \
    -f "$stack/compose.yaml" -f "$overlay" "$@"
}

cleanup() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ]; then
    printf 'Deployment boot check failed: %s.\n' "$stage" >&2
    [ "$started" = false ] || compose ps --all 2>/dev/null || true
  fi
  if [ "$started" = true ]; then
    if ! compose down -v --remove-orphans >> "$work/docker.log" 2>&1; then
      printf 'Could not remove disposable project %s; remove it before rerunning.\n' "$project" >&2
      result=1
    fi
  fi
  if [ "$build" = true ] && [ "${PASSDOWN_SKIP_BUILD:-0}" != 1 ]; then
    docker image rm "passdown:$tag" "passdown-caddy:$tag" >> "$work/docker.log" 2>&1 || true
  fi
  if [ "${PASSDOWN_KEEP_LOGS:-0}" = 1 ]; then
    printf 'Private check evidence retained in %s (contains test credentials; do not publish).\n' "$work"
  else rm -rf "$work"; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
command -v node >/dev/null
command -v docker >/dev/null
docker info > "$work/docker-info.log" 2>&1
node --input-type=module - "$port" <<'NODE'
import net from 'node:net';
const server = net.createServer();
try {
  await new Promise((resolve, reject) => server.once('error', reject).listen({ host: '0.0.0.0', port: Number(process.argv[2]), exclusive: true }, resolve));
} catch { console.error('The deployment check port is already in use.'); process.exitCode = 1; }
finally { server.close(); }
NODE
if [ "$build" = true ]; then
  if [ "${PASSDOWN_SKIP_BUILD:-0}" = 1 ]; then
    # CI builds the images once as passdown:local and passdown-caddy:local.
    export PASSDOWN_BUILD_TAG=local
    tag=local
  else
    stage='local image build'
    printf '%s\n' 'Building deployment images locally.'
    if ! PASSDOWN_REVISION=$(git -C "$root" rev-parse HEAD 2>/dev/null || echo unknown) compose build > "$work/build.log" 2>&1; then exit 1; fi
  fi
fi
stage='stack startup'
printf '%s\n' 'Starting isolated deployment stack from the compose file alone.'
started=true
if ! compose up -d --wait --wait-timeout 240 > "$work/up.log" 2>&1; then exit 1; fi
stage='internal certificate readiness'
attempt=0
until compose cp proxy:/data/caddy/pki/authorities/local/root.crt "$work/root.crt" > "$work/certificate.log" 2>&1; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 30 ] || exit 1
  sleep 2
done
chmod 600 "$work/root.crt"

stage='generated secrets and their permissions'
# Owner password: PostgreSQL's group and the operator user; app secrets: the
# web user only. Web has no owner password file at all.
[ "$(compose exec -T postgres stat -c '%a %u %g' /run/passdown/owner/database-owner-password)" = '440 10001 70' ]
[ "$(compose exec -T web stat -c '%a %u %g' /run/passdown/app/database-runtime-password)" = '400 10001 10001' ]
[ "$(compose exec -T web stat -c '%a %u %g' /run/passdown/app/session-secret)" = '400 10001 10001' ]
compose exec -T web sh -c 'test ! -e /run/passdown/owner/database-owner-password'
compose exec -T postgres cat /run/passdown/owner/database-owner-password > "$work/owner-secret"
compose exec -T web cat /run/passdown/app/database-runtime-password > "$work/runtime-secret"
compose exec -T web cat /run/passdown/app/session-secret > "$work/session-secret"
compose run --rm -T init > "$work/init-again.log" 2>&1
grep -q 'Secrets already exist; nothing was changed.' "$work/init-again.log"

stage='container isolation'
ids=$(compose ps --all -q)
[ -n "$ids" ]
# Docker IDs are generated identifiers, never host settings or user input.
# shellcheck disable=SC2086
docker inspect $ids > "$work/containers.json"
node --input-type=module - "$work" <<'NODE'
import { readFileSync } from 'node:fs';
const dir = process.argv[2];
const containers = JSON.parse(readFileSync(`${dir}/containers.json`, 'utf8'));
const secrets = ['owner-secret', 'runtime-secret', 'session-secret'].map((name) => readFileSync(`${dir}/${name}`, 'utf8').trim());
if (secrets.some((secret) => !/^[0-9a-f]{64,96}$/.test(secret))) throw new Error('Secrets were not generated.');
for (const container of containers) {
  const service = container.Config.Labels['com.docker.compose.service'];
  const environment = container.Config.Env.join('\n');
  if (secrets.some((secret) => environment.includes(secret))) throw new Error('A secret entered a container environment.');
  const mounts = (container.Mounts || []).map((mount) => mount.Name || '');
  if (service === 'web' && (/OWNER/.test(environment) || mounts.some((name) => name.endsWith('_owner-secrets')))) throw new Error('Web received owner credentials.');
  if (mounts.some((name) => name.endsWith('_owner-secrets')) && !['init', 'postgres', 'migrate', 'ops'].includes(service)) throw new Error('The owner secret reached another service.');
  const bindings = Object.values(container.HostConfig.PortBindings || {}).flat();
  if (service !== 'proxy' && bindings.length) throw new Error('A private service published a port.');
  if (service === 'proxy' && (bindings.length !== 1 || Object.keys(container.HostConfig.PortBindings)[0] !== '443/tcp')) throw new Error('The proxy must publish exactly one HTTPS port.');
  if (container.Mounts?.some((mount) => mount.Type === 'bind')) throw new Error('The stack must use named volumes only.');
}
NODE

stage='default login and startup warning'
compose logs web > "$work/web.log" 2>&1
grep -q '"event":"setup.default-login"' "$work/web.log"
compose logs migrate > "$work/migrate.log" 2>&1
grep -q 'Created the default login admin@example.com' "$work/migrate.log"

stage='idempotent migrations'
if ! compose run --rm -T migrate > "$work/migrate-again.log" 2>&1; then exit 1; fi
# The operator's contract is a concise, secret-free migration summary.
grep -q '0 applied now' "$work/migrate-again.log"
if grep -q 'default login' "$work/migrate-again.log"; then exit 1; fi

stage='first login, finish setting up and private image'
node "$root/scripts/deployment-first-flow.mjs" --origin "https://localhost:$port" --state-file "$work/session.json" --ca-file "$work/root.crt"
stage='single administrator account'
[ "$(compose exec -T postgres psql -U guide_owner -d guide_app -tAc 'select email from auth_user' 2> "$work/account.log")" = 'deployment-check@example.org' ]
[ "$(compose run --rm -T ops setup-state 2> "$work/setup-state.log")" = complete ]
stage='container recreation'
printf '%s\n' 'Recreating containers while preserving the disposable volumes.'
if ! compose down > "$work/recreate.log" 2>&1; then exit 1; fi
if ! compose up -d --wait --wait-timeout 240 >> "$work/recreate.log" 2>&1; then exit 1; fi
[ "$(compose exec -T web cat /run/passdown/app/session-secret)" = "$(cat "$work/session-secret")" ]
node "$root/scripts/deployment-first-flow.mjs" --resume --origin "https://localhost:$port" --state-file "$work/session.json" --ca-file "$work/root.crt"
compose logs web > "$work/web-recreated.log" 2>&1
if grep -q '"event":"setup.default-login"' "$work/web-recreated.log"; then exit 1; fi
printf '%s\n' 'Deployment boot check passed; disposable resources are being removed.'
