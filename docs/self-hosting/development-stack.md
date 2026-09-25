# Evaluate the container stack

This is a source-built development candidate. Picture verification, consistent backups, offline archive checks and staged restore are available in the [backup guide](backups.md). Published installation images, upgrade tooling and account recovery are not available yet. Keep using disposable evaluation data. The existing local installation instructions remain in [Getting started](../getting-started.md).

The stack runs PostgreSQL, an explicit migration job, the web application and a Caddy HTTPS proxy. Only the proxy publishes host ports. Web receives runtime database credentials; the migration and operator services receive owner credentials. Both the database and uploaded pictures persist in named volumes.

## Start a separate evaluation

Requirements: a running Docker engine with Compose, Git, and a current checkout. The image build installs its own pinned Node.js and pnpm dependencies. Run these commands from the repository root:

```sh
cd deploy
sh init.sh --domain localhost --http-port 18080 --https-port 18443 --build
docker compose build web proxy
docker compose up -d
```

The script writes a private `.env` and prints a setup code once. Save the code before closing the terminal. Only its hash is stored. Running the settings command again refuses to replace the existing file.

Each settings file gets a project name derived from its absolute path. Separate directories and different settings filenames therefore use separate volumes. To choose a readable name, add `--project passdown-evaluation` when initializing; the name is saved in the settings and reused by renewal. Keep that project name when moving an existing installation.

Before creating settings, the script checks Docker for that project's containers and volumes. If resources already exist—even when the settings file was lost—it refuses to generate replacement credentials. Restore the original settings from your secret store. For a separate installation, choose another settings path or an unused `--project` name. If Docker is unavailable, initialization stops without writing settings. Older evaluations used the shared project name `passdown`. If their `passdown_database` or `passdown_media` volume remains, default initialization also stops. Restore the old settings; use an explicit unused `--project` only when you intend to create a separate installation.

Open `https://localhost:18443/setup`. For a localhost evaluation, Caddy issues an internal certificate. Export this stack's public root certificate:

```sh
docker compose exec -T proxy cat /data/caddy/pki/authorities/local/root.crt > passdown-local-ca.crt
curl --cacert passdown-local-ca.crt https://localhost:18443/api/health
```

Trust that certificate only in your test browser's certificate store before continuing. Remove that trust when the evaluation ends: its signing key lives in this stack's `proxy-data` volume. Delete the exported certificate when it is no longer needed. The health response should report `setup-required`. Enter the code, your name, email, a password and workspace name. Setup opens your new workspace; `/setup` then returns 404. This stage creates a workspace manager; the installation-administrator capability arrives with account recovery.

For a domain you control, use `--domain guides.example.org --acme-email person@example.org`. Caddy requests a public certificate when DNS and ports 80/443 reach the host. Public-domain installation and unattended production use still require the release verification work.

## Network addresses and request limits

The proxy applies a broad limit of 300 requests per minute to each of sign-in, setup/invitation links, and administration. These circuit breakers count successful requests too; password-guessing protection remains in the application's failed-attempt counters. IPv4 addresses get individual buckets. IPv6 addresses in the same /64 share one bucket. Operators can set `PASSDOWN_SIGN_IN_LIMIT`, `PASSDOWN_LINK_LIMIT` and `PASSDOWN_ADMIN_LIMIT` in their private settings, then recreate the proxy.

Per-client isolation requires Docker to preserve the connecting address. Use rootful Linux with normal bridge port publishing and firewall DNAT, then verify the observed addresses before allowing external users. Docker Desktop, rootless forwarding, another proxy, or IPv6 forwarded through an IPv4-only bridge may present every visitor as one gateway address. Higher limits allow normal shared-address traffic; they do not repair lost address information. Those configurations remain suitable for local evaluation but must not be assumed to provide per-client isolation.

Send requests from two genuinely separate external networks, then inspect `request.client_ip` in the proxy's local access logs (`docker compose logs proxy`). Confirm they differ and match the clients. If both are a gateway, correct the network path before deployment. Do not trust client-supplied `X-Forwarded-For` to work around this. A separately managed trusted proxy requires an explicit, narrowly scoped trust configuration and another address-preservation test. See [Docker's port-publishing behavior](https://docs.docker.com/engine/network/port-publishing/).

The automated proxy test reports the peer observed through the host's published port and also checks real, distinct IPv6 container peers: one /64 shares a limit, another stays independent. This does not replace the two-external-client check on the deployment host.

Use the explicit HTTPS URL for nonstandard local ports. Public certificate issuance requires standard reachable ports 80/443; changing the local port mapping does not redirect HTTP to the custom HTTPS port.

## Operator commands

Run these from the same `deploy` directory:

```sh
docker compose run --rm -T ops help
docker compose run --rm -T ops setup-state
docker compose run --rm -T ops migrate
```

`setup-state` prints `required` or `complete`. A second migration run should report `0 applied now`. Missing settings, unsafe runtime roles, changed migrations and failed migrations return nonzero exit codes with an explanation. Command results go to stdout; progress and errors go to stderr. Exit codes are 0 success, 1 operation failure, 2 usage error, 3 configuration error and 4 refused operation.

Applied migrations are immutable. A checksum error means the database and files differ; do not edit migration receipts to make the error disappear. A failed migration is rolled back. If its commit cannot be confirmed, check the database state before retrying.

If a database contains a workspace but no accounts, setup explains the inconsistency and leaves its data untouched. Restore a complete backup using your existing database procedure or choose a new empty evaluation database. Setup does not delete the workspace to make room.

## Renew a lost setup code

Before setup is complete:

```sh
sh init.sh --renew-setup-code
```

The script first checks the installation. It refuses if setup is complete or the state cannot be determined. When renewal succeeds, only the hash changes; other settings stay intact. Follow the printed command to recreate web, then use the newly printed code. Renewal does not recover an existing account.

For custom settings files, use `.env`, `.env.NAME`, or `NAME.env` (for example, `--output evaluation.env`) and pass the same `--output` to initialization and renewal. These names, temporary settings snapshots and renewal locks are excluded from Git and image builds. The public `.env.example` filename and other custom filenames are refused to keep credentials out of source and images. Follow the printed Compose commands: they bind the installation directory, settings, project and Compose files explicitly. Renewal reads the saved project; do not supply a different `--project`. If an interrupted renewal leaves a `.renew-lock` directory, first confirm no renewal process is still running, then remove that empty lock directory and retry.

## Check persistence

1. Complete setup, create a guide and upload a photo. Save the draft.
2. Run `docker compose down` **without `-v`**, then `docker compose up -d`.
3. Open the saved guide. Its photo should remain available and setup should remain closed. A private photo must remain unavailable when signed out.

`down` stops this stack without deleting its volumes. Removing volumes deletes the evaluation's database and pictures. This stack is separate from `pnpm dev` and its local database.

## Automated verification

From the repository root, after building the images:

```sh
sh scripts/check-image.sh passdown:local
node scripts/check-proxy.mjs --live
PASSDOWN_SKIP_BUILD=1 sh scripts/deployment-boot-check.sh
```

The proxy check creates disposable containers and tests certificate trust, headers, upload limits, request throttling and log redaction. The boot check creates a separate project, verifies setup, upload and restart, then removes only its own containers and volumes. It refuses occupied test ports. Failures identify the stage; raw container logs and entered credentials are kept out of console output.

The local stack has been exercised on Linux arm64 under Docker. The separate CI container job exercises Linux amd64. A clean-host public-certificate rehearsal, nginx, upgrade tooling and release approval remain required before an Open Alpha publication.
