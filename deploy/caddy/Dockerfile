# syntax=docker/dockerfile:1.7
FROM caddy:2.11.4-builder-alpine@sha256:2b9f32cbba6045e79212bb253f595588d20be8f7d1edf61582c519e124e0d2d8 AS build
RUN xcaddy build v2.11.4 --with github.com/mholt/caddy-ratelimit@5625512f24f6f59d6f64fb3aafe5eecff0b286db
FROM caddy:2.11.4-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b
COPY --from=build /usr/bin/caddy /usr/bin/caddy
COPY deploy/caddy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/caddy/pages/ /usr/share/passdown/pages/
COPY deploy/caddy/NOTICE deploy/caddy/LICENSE-APACHE-2.0 LICENSE /usr/share/doc/passdown/
ARG PASSDOWN_REVISION=unknown
ARG PASSDOWN_VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="Passdown proxy (Caddy)" \
      org.opencontainers.image.licenses="AGPL-3.0-only AND Apache-2.0" \
      org.opencontainers.image.source="https://github.com/nanwer/passdown" \
      org.opencontainers.image.revision="${PASSDOWN_REVISION}" \
      org.opencontainers.image.version="${PASSDOWN_VERSION}"
