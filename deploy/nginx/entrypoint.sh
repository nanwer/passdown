#!/bin/sh
# Render the nginx configuration from PASSDOWN_* settings, then start nginx.
set -eu
fail() {
  printf 'passdown-nginx: %s\n' "$*" >&2
  exit 3
}
domain=${PASSDOWN_DOMAIN:-}
printf '%s\n' "$domain" | grep -Eq '^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$' ||
  fail 'PASSDOWN_DOMAIN must be a hostname.'
hsts=${PASSDOWN_HSTS_MAX_AGE:-31536000}
case "$hsts" in '' | *[!0-9]*) fail 'PASSDOWN_HSTS_MAX_AGE must be a whole number of seconds.' ;; esac
limit() {
  value=$1
  case "$value" in '' | *[!0-9]* | 0*) fail "$2 must be a positive whole number." ;; esac
  printf '%s' "$value"
}
sign_in=$(limit "${PASSDOWN_SIGN_IN_LIMIT:-300}" PASSDOWN_SIGN_IN_LIMIT)
links=$(limit "${PASSDOWN_LINK_LIMIT:-300}" PASSDOWN_LINK_LIMIT)
admin=$(limit "${PASSDOWN_ADMIN_LIMIT:-300}" PASSDOWN_ADMIN_LIMIT)
for file in /etc/passdown/tls/fullchain.pem /etc/passdown/tls/privkey.pem; do
  [ -r "$file" ] || fail "The certificate file $file is missing. Mount your certificate and key into /etc/passdown/tls; see the proxy guide."
done
# A rate of N per minute with a burst of N-1 admits N requests at once and
# refills at N per minute, matching the Caddy proxy's N-per-minute window.
sed \
  -e "s/@DOMAIN@/$domain/g" \
  -e "s/@HSTS_MAX_AGE@/$hsts/g" \
  -e "s/@SIGN_IN_LIMIT@/$sign_in/g" -e "s/@SIGN_IN_BURST@/$((sign_in - 1))/g" \
  -e "s/@LINK_LIMIT@/$links/g" -e "s/@LINK_BURST@/$((links - 1))/g" \
  -e "s/@ADMIN_LIMIT@/$admin/g" -e "s/@ADMIN_BURST@/$((admin - 1))/g" \
  /etc/passdown/nginx.conf.template > /etc/nginx/nginx.conf
nginx -t -q
exec nginx -g 'daemon off;'
