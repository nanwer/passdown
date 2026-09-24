# Evaluate the container stack

This is a source-built development candidate. Published installation images, backup/restore, upgrade tooling and account recovery are not available yet. Keep using disposable evaluation data. The existing local installation instructions remain in [Getting started](../getting-started.md).

The stack runs PostgreSQL, an explicit migration job, the web application and a Caddy HTTPS proxy. Only the proxy publishes host ports. Web receives runtime database credentials; the migration and operator services receive owner credentials. Both the database and uploaded pictures persist in named volumes.

## Start a separate evaluation

Requirements: Docker with Compose, Git, and a current checkout. The image build installs its own pinned Node.js and pnpm dependencies. Run these commands from the repository root:

```sh
cd deploy
sh init.sh --domain localhost --http-port 18080 --https-port 18443 --build
docker compose build web proxy
docker compose up -d
```

The script writes a private `.env` and prints a setup code once. Save the code before closing the terminal. Only its hash is stored. Running the settings command again refuses to replace the existing file.

Open `https://localhost:18443/setup`. For a localhost evaluation, Caddy issues an internal certificate. Export this stack's public root certificate:

```sh
docker compose exec -T proxy cat /data/caddy/pki/authorities/local/root.crt > passdown-local-ca.crt
curl --cacert passdown-local-ca.crt https://localhost:18443/api/health
```

Trust that certificate in your test browser's certificate store before continuing. The health response should report `setup-required`. Enter the code, your name, email, a password and workspace name. Setup opens your new workspace; `/setup` then returns 404. This stage creates a workspace manager; the installation-administrator capability arrives with account recovery.

For a domain you control, use `--domain guides.example.org --acme-email person@example.org`. Caddy requests a public certificate when DNS and ports 80/443 reach the host. Public-domain installation and unattended production use still require the release verification work.

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

For custom settings files, pass the same `--output` to initialization and renewal. Follow the printed Compose commands: they bind the installation directory, settings, project and Compose files explicitly.

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

The local stack has been exercised on Linux arm64 under Docker. The separate CI container job exercises Linux amd64. A clean-host public-certificate rehearsal, nginx, backup/restore, upgrade tooling and release approval remain required before an Open Alpha publication.
