#!/bin/sh
# Disposable deployment rehearsal. Never use an existing project or data volume.
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd -P)
proxy=${PASSDOWN_PROXY:-caddy}
case "$proxy" in caddy|nginx) ;; *) printf '%s\n' 'PASSDOWN_PROXY must be caddy or nginx.' >&2; exit 2 ;; esac
http_port=${PASSDOWN_CHECK_HTTP_PORT:-18080}
https_port=${PASSDOWN_CHECK_HTTPS_PORT:-18443}
for port in "$http_port" "$https_port"; do
  case "$port" in ''|*[!0-9]*|0*) printf '%s\n' 'Check ports must be integers from 1024 to 65535.' >&2; exit 2 ;; esac
  [ "${#port}" -le 5 ] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || exit 2
done
[ "$http_port" != "$https_port" ] || exit 2
project=passdown-check-$$-$(date +%s)
export PASSDOWN_CHECK_PROJECT=$project
work=$(mktemp -d "${TMPDIR:-/tmp}/passdown-check.XXXXXXXX")
stage=preflight
started=false
use_build=true
[ -z "${PASSDOWN_IMAGE:-}" ] || use_build=false
# Inherited Compose inputs must not redirect this check into another project.
unset COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_PROFILES COMPOSE_ENV_FILES
unset GUIDE_DB_OWNER_PASSWORD GUIDE_DB_RUNTIME_PASSWORD BETTER_AUTH_SECRET PASSDOWN_SETUP_CODE_SHA256
unset PASSDOWN_DOMAIN BETTER_AUTH_URL PASSDOWN_TLS PASSDOWN_HTTP_PORT PASSDOWN_HTTPS_PORT PASSDOWN_TLS_DIR PASSDOWN_PROXY
compose() {
  # Later files override earlier ones; prepend in reverse so the order matches
  # the COMPOSE_FILE that init.sh writes.
  if [ "$proxy" = nginx ]; then
    [ "$use_build" = false ] || set -- -f "$root/deploy/compose.nginx.build.yaml" "$@"
    set -- -f "$root/deploy/compose.nginx.yaml" "$@"
  fi
  [ "$use_build" = false ] || set -- -f "$root/deploy/compose.build.yaml" "$@"
  set -- -f "$root/deploy/compose.yaml" "$@"
  docker compose --project-directory "$root/deploy" --env-file "$work/.env" --project-name "$project" "$@"
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
node --input-type=module - "$http_port" "$https_port" <<'NODE'
import net from 'node:net';
const servers = [];
try {
  for (const value of process.argv.slice(2)) {
    const server = net.createServer();
    servers.push(server);
    await new Promise((resolve, reject) => server.once('error', reject).listen({ host: '0.0.0.0', port: Number(value), exclusive: true }, resolve));
  }
} catch { console.error('A deployment check port is already in use.'); process.exitCode = 1; }
finally { for (const server of servers) server.close(); }
NODE
stage='private settings'
set -- --project "$project" --domain localhost --http-port "$http_port" --https-port "$https_port" --output "$work/.env"
[ "$use_build" = false ] || set -- "$@" --build
if [ "$proxy" = nginx ]; then
  # A throwaway certificate stands in for the operator's own; it is trusted
  # below exactly as Caddy's internal root is.
  mkdir "$work/tls"
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=localhost \
    -addext subjectAltName=DNS:localhost \
    -keyout "$work/tls/privkey.pem" -out "$work/tls/fullchain.pem" > "$work/openssl.log" 2>&1
  set -- "$@" --proxy nginx --tls-dir "$work/tls"
fi
sh "$root/deploy/init.sh" "$@" > "$work/init.log" 2>&1
node --input-type=module - "$work" <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs';
const [dir] = process.argv.slice(2);
const output = readFileSync(`${dir}/init.log`, 'utf8');
const code = output.match(/Setup code:\s+([0-9A-HJKMNP-TV-Z]{5}(?:-[0-9A-HJKMNP-TV-Z]{5}){3})/);
if (!code) throw new Error('Initializer did not produce a setup code.');
writeFileSync(`${dir}/setup-code`, code[1], { mode: 0o600, flag: 'wx' });
NODE
if [ "$use_build" = true ] && [ "${PASSDOWN_SKIP_BUILD:-0}" != 1 ]; then
  stage='local image build'
  printf '%s\n' 'Building deployment images locally.'
  if ! compose build > "$work/build.log" 2>&1; then exit 1; fi
fi
stage='stack startup'
printf '%s\n' 'Starting isolated deployment stack.'
started=true
if ! compose up -d --wait --wait-timeout 240 > "$work/up.log" 2>&1; then exit 1; fi
stage='internal certificate readiness'
if [ "$proxy" = nginx ]; then
  cp "$work/tls/fullchain.pem" "$work/root.crt"
else
  attempt=0
  until compose cp proxy:/data/caddy/pki/authorities/local/root.crt "$work/root.crt" > "$work/certificate.log" 2>&1; do
    attempt=$((attempt + 1))
    [ "$attempt" -lt 30 ] || exit 1
    sleep 2
  done
fi
chmod 600 "$work/root.crt"
stage='container isolation and secrets'
ids=$(compose ps --all -q)
[ -n "$ids" ]
# Docker IDs are generated identifiers, never host settings or user input.
# shellcheck disable=SC2086
docker inspect $ids > "$work/containers.json"
node --input-type=module - "$work" <<'NODE'
import { readFileSync } from 'node:fs';
const dir = process.argv[2];
const containers = JSON.parse(readFileSync(`${dir}/containers.json`, 'utf8'));
const code = readFileSync(`${dir}/setup-code`, 'utf8').trim();
for (const container of containers) {
  const service = container.Config.Labels['com.docker.compose.service'];
  const environment = container.Config.Env.join('\n');
  if (environment.includes(code) || environment.includes(code.replaceAll('-', ''))) throw new Error('Setup code entered a container environment.');
  if (service === 'web' && /(?:GUIDE_OWNER_DATABASE_URL|GUIDE_DB_OWNER_PASSWORD)=/.test(environment)) throw new Error('Web received owner credentials.');
  if (service !== 'proxy' && Object.keys(container.HostConfig.PortBindings || {}).length) throw new Error('A private service published a port.');
}
NODE
stage='idempotent migrations'
if ! compose run --rm -T migrate > "$work/migrate-again.log" 2>&1; then exit 1; fi
# The operator's contract is a concise, secret-free migration summary.
grep -q '0 applied now' "$work/migrate-again.log"
stage='first-run setup and private image'
node "$root/scripts/deployment-first-flow.mjs" --origin "https://localhost:$https_port" --code-file "$work/setup-code" --state-file "$work/session.json" --ca-file "$work/root.crt"
stage='single administrator account'
count=$(compose exec -T postgres psql -U guide_owner -d guide_app -tAc 'select count(*) from auth_user' 2> "$work/account-count.log")
[ "$count" = 1 ]
stage='container recreation'
printf '%s\n' 'Recreating containers while preserving the disposable volumes.'
if ! compose down > "$work/recreate.log" 2>&1; then exit 1; fi
if ! compose up -d --wait --wait-timeout 240 >> "$work/recreate.log" 2>&1; then exit 1; fi
node "$root/scripts/deployment-first-flow.mjs" --resume --origin "https://localhost:$https_port" --state-file "$work/session.json" --ca-file "$work/root.crt"
printf '%s\n' 'Deployment boot check passed; disposable resources are being removed.'
