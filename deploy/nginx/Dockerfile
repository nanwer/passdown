# syntax=docker/dockerfile:1.7
# Passdown reverse proxy (nginx): the same contract as the default Caddy proxy.
FROM alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8
RUN apk add --no-cache \
      nginx=1.28.3-r7 nginx-mod-http-js=1.28.3-r7 nginx-mod-http-headers-more=1.28.3-r7 \
 && mkdir -p /etc/passdown/tls /run/nginx
COPY deploy/nginx/nginx.conf.template /etc/passdown/nginx.conf.template
COPY deploy/nginx/passdown.js /etc/nginx/passdown.js
COPY deploy/nginx/entrypoint.sh /usr/local/bin/passdown-nginx
COPY deploy/nginx/NOTICE deploy/nginx/LICENSE-BSD-2-CLAUSE LICENSE /usr/share/doc/passdown/
ARG PASSDOWN_REVISION=unknown
ARG PASSDOWN_VERSION=0.0.0-dev
LABEL org.opencontainers.image.title="Passdown proxy (nginx)" \
      org.opencontainers.image.licenses="AGPL-3.0-only AND BSD-2-Clause" \
      org.opencontainers.image.source="https://github.com/nanwer/passdown" \
      org.opencontainers.image.revision="${PASSDOWN_REVISION}" \
      org.opencontainers.image.version="${PASSDOWN_VERSION}"
EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/passdown-nginx"]
