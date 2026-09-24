#!/bin/sh
# Inspect a locally built image without starting the application.
set -eu
image=${1:-passdown:local}
kind=${2:-app}
check() { "$@" || { printf '%s\n' 'Image verification failed.' >&2; exit 1; }; }
check docker image inspect "$image" >/dev/null
for label in source revision licenses version; do
  value=$(docker image inspect --format "{{index .Config.Labels \"org.opencontainers.image.$label\"}}" "$image")
  test -n "$value" && test "$value" != '<no value>' || exit 1
done
if [ "$kind" = proxy ]; then
  check docker run --rm --entrypoint sh "$image" -c 'test -s /usr/share/doc/passdown/LICENSE && test -s /usr/share/doc/passdown/NOTICE'
else
  check docker run --rm --entrypoint sh "$image" -eu -c '
    test "$(id -u)" = 10001
    test "$(id -un)" = passdown
    test -s /app/LICENSE && test -s /app/THIRD_PARTY_NOTICES.md && test -s /app/third-party-licenses.json
    test -n "$(find /app/operator/migrations -name "*.sql" -print -quit)"
    test -z "$(find /app \( -name ".env*" -o -name ".media*" -o -name ".private" -o -name "LOCAL_ACCESS.md" -o -name "*.dump" \) -print -quit)"
    pg_dump --version | grep -q "(PostgreSQL) 17\."
    passdown help >/dev/null
    test -w /var/lib/passdown/media && test -w /app/apps/web/.next/cache
  '
  check docker run --rm -i --entrypoint node "$image" --input-type=module - /app < "$(dirname "$0")/check-image-files.mjs"
  test "$(docker image inspect --format '{{index .Config.Labels "org.opencontainers.image.licenses"}}' "$image")" = AGPL-3.0-only
fi
printf '%s\n' 'Image verification passed.'
