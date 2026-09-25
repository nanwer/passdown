# Evaluate the container stack from source

To install Passdown on a server, follow the [installation guide](install.md); the [configuration reference](configuration.md) and [troubleshooting guide](troubleshooting.md) apply to both. This page covers running the same compose file with images built from a source checkout, and the automated checks contributors run.

## Start a separate evaluation

Requirements: a running Docker engine with Compose 2.24 or later, Git, and a current checkout. The image build installs its own pinned Node.js and pnpm dependencies. From the repository root:

```sh
cd deploy
export PASSDOWN_URL=https://localhost:18443 PASSDOWN_PORT=18443
docker compose -p passdown-evaluation -f compose.yaml -f compose.build.yaml up -d --build
```

`compose.build.yaml` builds `passdown:local` and `passdown-caddy:local` (set `PASSDOWN_BUILD_TAG` to use another tag) and makes every service use them. Pass the same `-p` and both `-f` options to every later command. The project name keeps this evaluation's volumes apart from any other installation.

Open `https://localhost:18443` and sign in with `admin@example.com` / `changeme`; Passdown asks you to [finish setting up](install.md#sign-in-and-finish-setting-up). To trust this stack's certificate in a test browser instead of clicking through the warning:

```sh
docker compose -p passdown-evaluation -f compose.yaml -f compose.build.yaml cp proxy:/data/caddy/pki/authorities/local/root.crt passdown-local-ca.crt
curl --cacert passdown-local-ca.crt https://localhost:18443/api/health
```

Remove that trust when the evaluation ends: its signing key lives in this stack's `proxy-data` volume.

## Network addresses and request limits

The proxy applies a broad limit of 300 requests per minute to each of sign-in, invitation/reset/setup links, and administration. These circuit breakers count successful requests too; password-guessing protection remains in the application's failed-attempt limits.

Per-client isolation requires Docker to preserve the connecting address. Use rootful Linux with normal bridge port publishing, then verify the observed addresses before allowing external users: send requests from two separate external networks and compare `request.client_ip` in `docker compose logs proxy`. Docker Desktop, rootless forwarding and a proxy in front all present one address for everyone.

## Upgrade a source-built installation

With the installation running, update the checkout, rebuild, then let `upgrade.sh` migrate before replacing web:

```sh
docker compose -p passdown-evaluation -f compose.yaml -f compose.build.yaml build
sh upgrade.sh --project passdown-evaluation --file compose.yaml --file compose.build.yaml
```

The script refuses if the installation is not running, backs up with the running image, applies the new migrations while the old web keeps serving, and replaces web and the proxy only if they succeed. Each step is recorded in `upgrade.log` beside it. Rebuilding retags `passdown:local`, but the running containers keep the image they started with until they are replaced.

## Check persistence

1. Finish setting up, create a guide and upload a photo. Save the draft.
2. Run `docker compose … down` **without `-v`**, then `docker compose … up -d`.
3. Open the saved guide. Its photo should remain available, the sign-in page should not mention the default login, and a private photo must remain unavailable when signed out.

This stack is separate from `pnpm dev` and its local database.

## Automated verification

From the repository root, after building `passdown:local` and `passdown-caddy:local`:

```sh
sh scripts/check-image.sh passdown:local
sh scripts/check-image.sh passdown-caddy:local proxy
node scripts/check-proxy.mjs --live
PASSDOWN_SKIP_BUILD=1 sh scripts/deployment-boot-check.sh
sh scripts/check-upgrade.sh
```

- `check-proxy.mjs --live` runs the proxy image in disposable containers: any-address HTTPS with its one certificate, no HSTS, upload limits, request throttling per client and per IPv6 /64, and log redaction.
- `deployment-boot-check.sh` deploys `compose.yaml` alone into a disposable project with only `PASSDOWN_URL` and `PASSDOWN_PORT` set, as Portainer would. It checks the generated secrets' permissions, that web holds no owner credentials, that only the proxy publishes a port and nothing mounts a host folder, the default-login warning, idempotent migrations, the first sign-in, Finish setting up (including refusals and a concurrent double submit), that another address is told which address to use, a private picture, and a restart. Without `PASSDOWN_SKIP_BUILD=1` it builds its own images; with `PASSDOWN_IMAGE` and `PASSDOWN_PROXY_IMAGE` it runs those; `PASSDOWN_DEPLOY_DIR` takes `compose.yaml` from rendered release files.
- `check-upgrade.sh` installs `passdown:local` from `compose.yaml`, builds a newer version from your working tree with one extra migration, makes that migration fail, and upgrades twice: by changing the image and running `docker compose up -d`, as Portainer does (the new web must never start, and putting the old image back must restore service), then with `upgrade.sh` (the old web must keep serving). Finally `upgrade.sh` applies the migration and the data survives. New untracked files are not part of the newer build; commit or add them first.

Each check removes only its own disposable project and images. `PASSDOWN_KEEP_LOGS=1` keeps their private evidence folder, which contains test credentials.

The local stack has been exercised on Linux arm64 under Docker Desktop. The CI container job exercises Linux amd64. A clean-host rehearsal of the published images and release approval remain required before a release.
