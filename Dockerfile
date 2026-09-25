# syntax=docker/dockerfile:1.7
# Web server and operator command. Build locally; publication is a separate step.
# Secrets arrive as files in /run/passdown (see deploy/compose.yaml): the owner
# password for PostgreSQL (group 70) and operator commands, the runtime password
# and session secret for web.
ARG NODE_IMAGE=node:22.22.2-alpine3.22@sha256:b77017c37f430e4466ff497058948a2f16e8b59779600d53711eeb7b999b0f4e
FROM ${NODE_IMAGE} AS toolchain
RUN apk add --no-cache libc6-compat && npm install --global pnpm@10.33.0
ENV CI=1 NEXT_TELEMETRY_DISABLED=1
FROM toolchain AS build
WORKDIR /src
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN --mount=type=cache,id=passdown-pnpm,target=/root/.local/share/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
# Files keep their checkout permissions; the runtime user must be able to read
# them even when the checkout was made with a private umask.
RUN chmod -R a+rX .
# A restored layer cache can skip the fetch above while the store mount starts
# empty, so the install may download what is missing; the licence inventory
# then finds every package's index in the store.
RUN --mount=type=cache,id=passdown-pnpm,target=/root/.local/share/pnpm/store pnpm install --prefer-offline --frozen-lockfile \
 && { pnpm licenses list --prod --json > /src/third-party-licenses.json \
      || { echo 'The licence inventory failed:' >&2; head -c 4000 /src/third-party-licenses.json >&2; exit 1; }; }
RUN --mount=type=cache,id=passdown-pnpm,target=/root/.local/share/pnpm/store pnpm migrations:check \
 && GUIDE_NEXT_OUTPUT=standalone pnpm build \
 && node scripts/check-production-bundle.mjs apps/web/.next \
 && node scripts/check-image-files.mjs apps/web/.next/standalone --prune-metadata

FROM ${NODE_IMAGE} AS runtime
RUN apk add --no-cache postgresql17-client \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /opt/yarn* \
 && addgroup -S -g 10001 passdown \
 && adduser -S -D -H -u 10001 -G passdown -h /nonexistent passdown \
 && install -d -o passdown -g passdown -m 0700 /var/lib/passdown/media \
 && install -d -o passdown -g 70 -m 0750 /run/passdown/owner \
 && install -d -o passdown -g passdown -m 0700 /run/passdown/app
ARG PASSDOWN_REVISION=unknown
ARG PASSDOWN_VERSION=0.0.0-dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 \
    GUIDE_MEDIA_ROOT=/var/lib/passdown/media PASSDOWN_REVISION=${PASSDOWN_REVISION}
WORKDIR /app
COPY --from=build /src/apps/web/.next/standalone ./
COPY --from=build /src/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /src/apps/operator/dist/ ./operator/
COPY --from=build /src/packages/database/migrations/ ./operator/migrations/
COPY --from=build /src/third-party-licenses.json ./third-party-licenses.json
COPY --chmod=0644 LICENSE THIRD_PARTY_NOTICES.md ./
RUN printf '#!/bin/sh\nexec node /app/operator/passdown.mjs "$@"\n' > /usr/local/bin/passdown \
 && chmod 0755 /usr/local/bin/passdown \
 && install -d -o passdown -g passdown -m 0700 /app/apps/web/.next/cache
LABEL org.opencontainers.image.title="Passdown" \
      org.opencontainers.image.description="Step-by-step guides for public communities and private teams." \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.source="https://github.com/nanwer/passdown" \
      org.opencontainers.image.url="https://github.com/nanwer/passdown" \
      org.opencontainers.image.revision="${PASSDOWN_REVISION}" \
      org.opencontainers.image.version="${PASSDOWN_VERSION}"
USER passdown
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
