# Install Passdown on your own server

Passdown installs from one file, `compose.yaml`. Paste it into Portainer, or save it and run `docker compose up -d`. Open `https://your-server:8443`, sign in with the default login, and Passdown asks you to finish setting up. Nothing is built on the server and no settings script runs.

Passdown is **alpha software**: read the release notes before installing, keep backups, and expect changes between versions.

> **Before the first release:** the images this file names (`ghcr.io/nanwer/passdown:0.1.0-alpha.1`) are published with the first release. Until then, [build from source](#build-from-source). Everything else in this guide is the same.

## What you are installing

| Service    | What it does                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------- |
| `init`     | Runs once at each start: creates the database passwords and session secret the first time, then exits.        |
| `postgres` | PostgreSQL 17. Reachable only by the other containers.                                                        |
| `migrate`  | Applies database migrations, creates the default login in a new installation, then exits.                     |
| `web`      | The Passdown application. It connects to the database with a restricted role.                                 |
| `proxy`    | Caddy, serving HTTPS on port 8443 with a certificate it makes itself. The only service with a published port. |

A sixth service, `ops`, runs [operator commands](#operator-commands) on demand. Guides, accounts, pictures and secrets live in Docker volumes that survive restarts and upgrades.

## Before you start

- A Linux server (amd64 is tested; arm64 is expected to work) with Docker Engine and Docker Compose 2.24 or later (`docker compose version`), or Portainer managing it.
- Port 8443 free on the server. If it is taken, pick another port as `PASSDOWN_PORT` below.
- A synchronised clock (for example `systemd-timesyncd` or `chrony`). Sign-in and reset links depend on it.

## Install with Portainer

1. Open **Stacks → Add stack**. Name it, for example `passdown`. The name becomes the Compose project name, which you need for [operator commands](#operator-commands).
2. Choose **Web editor** and paste the [compose file](#the-compose-file).
3. Under **Environment variables**, add `PASSDOWN_URL` with the address people will use, for example `https://192.168.1.20:8443` or `https://nas.home.example:8443`. Leave it out to use `https://localhost:8443`, which works only on the server itself. Add `PASSDOWN_PORT` only if 8443 is taken, and use the same port in `PASSDOWN_URL`.
4. Choose **Deploy the stack**. The first start pulls the images and takes a minute or two.

You can also edit the address directly in the file: replace `${PASSDOWN_URL:-https://localhost:8443}` on the `x-passdown-url` line with your address.

## Install with docker compose

Save the [compose file](#the-compose-file) as `compose.yaml` in an empty folder, for example `~/passdown`. From 0.1.0-alpha.1 each release also attaches it, with `upgrade.sh`, `backup.sh` and `SHA256SUMS`; check a downloaded copy with `sha256sum --check SHA256SUMS`.

Set the address, then start:

```bash
cd ~/passdown
printf 'PASSDOWN_URL=https://192.168.1.20:8443\n' > .env
docker compose up -d
docker compose ps --all
```

Compose reads `.env` from the same folder; it holds only the address and, if you change it, `PASSDOWN_PORT`. Expect `postgres` and `web` to be healthy, `proxy` running, and `init` and `migrate` exited with code 0.

## The compose file

This is `deploy/compose.yaml` from the source repository. A release's copy names that release's images, pinned by digest.

```yaml
# Passdown. Paste this file into Portainer (Stacks > Add stack > Web editor),
# or save it as compose.yaml and run: docker compose up -d
#
# Change PASSDOWN_URL to the address people will use, either here or as a
# stack environment variable. Then open that address and sign in with
# admin@example.com / changeme; Passdown asks you to finish setting up.
# Guide: https://github.com/nanwer/passdown/blob/main/docs/self-hosting/install.md
x-passdown-url: &passdown-url ${PASSDOWN_URL:-https://localhost:8443}
x-passdown-image: &passdown-image ghcr.io/nanwer/passdown:0.1.0-alpha.1
x-logging: &logging
  driver: json-file
  options: { max-size: '10m', max-file: '5' }
# Secrets live in two private volumes, written once by the init service.
# Web never mounts the owner volume, so it never holds the owner password.
x-operator-environment: &operator-environment
  GUIDE_DB_OWNER_PASSWORD_FILE: /run/passdown/owner/database-owner-password
  GUIDE_DB_RUNTIME_PASSWORD_FILE: /run/passdown/app/database-runtime-password
  PASSDOWN_URL: *passdown-url
  GUIDE_MEDIA_ROOT: /var/lib/passdown/media
services:
  init:
    image: *passdown-image
    # Root only to hand the secret files to the users that read them.
    user: '0:0'
    entrypoint: ['passdown']
    command: ['init-secrets']
    restart: 'no'
    network_mode: none
    volumes:
      - owner-secrets:/run/passdown/owner
      - app-secrets:/run/passdown/app
    logging: *logging
  postgres:
    image: postgres:17-alpine@sha256:f02121de6f74d30d8a94cd1d9584125e2178d7e6c377d8130112d4e52d867995
    restart: unless-stopped
    environment:
      POSTGRES_DB: guide_app
      POSTGRES_USER: guide_owner
      POSTGRES_PASSWORD_FILE: /run/passdown/owner/database-owner-password
    volumes:
      - database:/var/lib/postgresql/data
      - owner-secrets:/run/passdown/owner:ro
    networks: [backend]
    depends_on: { init: { condition: service_completed_successfully } }
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U guide_owner -d guide_app']
      interval: 5s
      timeout: 3s
      retries: 30
    stop_grace_period: 30s
    logging: *logging
  migrate:
    image: *passdown-image
    entrypoint: ['passdown']
    command: ['migrate']
    restart: 'no'
    environment: *operator-environment
    volumes:
      - owner-secrets:/run/passdown/owner:ro
      - app-secrets:/run/passdown/app:ro
    networks: [backend]
    depends_on: { postgres: { condition: service_healthy } }
    logging: *logging
  web:
    image: *passdown-image
    restart: unless-stopped
    init: true
    environment:
      GUIDE_DB_RUNTIME_PASSWORD_FILE: /run/passdown/app/database-runtime-password
      BETTER_AUTH_SECRET_FILE: /run/passdown/app/session-secret
      PASSDOWN_URL: *passdown-url
      PASSDOWN_SOURCE_URL: ${PASSDOWN_SOURCE_URL:-}
    volumes:
      - media:/var/lib/passdown/media
      - app-secrets:/run/passdown/app:ro
    networks: [backend, frontend]
    # Web starts only after this version's migrations succeeded.
    depends_on:
      postgres: { condition: service_healthy }
      migrate: { condition: service_completed_successfully }
    healthcheck:
      test:
        [
          'CMD',
          'node',
          '-e',
          "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))",
        ]
      interval: 15s
      timeout: 5s
      start_period: 60s
      retries: 3
    logging: *logging
  proxy:
    image: ghcr.io/nanwer/passdown-caddy:0.1.0-alpha.1
    restart: unless-stopped
    environment:
      PASSDOWN_SIGN_IN_LIMIT: ${PASSDOWN_SIGN_IN_LIMIT:-300}
      PASSDOWN_LINK_LIMIT: ${PASSDOWN_LINK_LIMIT:-300}
      PASSDOWN_ADMIN_LIMIT: ${PASSDOWN_ADMIN_LIMIT:-300}
    # HTTPS with a certificate Caddy makes itself. Nothing on ports 80 or 443.
    ports: ['${PASSDOWN_PORT:-8443}:443']
    volumes:
      - proxy-data:/data
      - proxy-config:/config
    networks: [frontend]
    depends_on: { web: { condition: service_started } }
    logging: *logging
  # Operator commands: docker compose run --rm ops help
  ops:
    image: *passdown-image
    profiles: ['ops']
    entrypoint: ['passdown']
    command: ['help']
    environment: *operator-environment
    volumes:
      - media:/var/lib/passdown/media
      - owner-secrets:/run/passdown/owner:ro
      - app-secrets:/run/passdown/app:ro
    networks: [backend]
    depends_on: { postgres: { condition: service_healthy } }
    logging: *logging
networks:
  backend: { internal: true }
  frontend: {}
volumes:
  database: {}
  media: {}
  owner-secrets: {}
  app-secrets: {}
  proxy-data: {}
  proxy-config: {}
```

## Open Passdown

Open the address you set, for example `https://192.168.1.20:8443`. The first time, the browser warns that the certificate isn't trusted: Caddy made it for this installation, and no public authority vouches for it. This is the same warning Portainer shows. Check that the address is your server's, then continue (in Chrome: **Advanced → Proceed**; in Firefox: **Advanced → Accept the Risk and Continue**; in Safari: **Show Details → visit this website**).

To avoid the warning, put a proxy with a trusted certificate in front, as described in [using your own proxy](#using-your-own-proxy-nginx-proxy-manager).

Passdown answers at any address that reaches port 8443, but you can sign in only at `PASSDOWN_URL`. At another address, the sign-in page says **Passdown is set up for https://…. Open it at that address, or ask the operator to set PASSDOWN_URL to …**, naming both addresses.

## Sign in and finish setting up

A new installation has one account: the **default login**.

- Email: `admin@example.com`
- Password: `changeme`

The sign-in page reminds you of it (**First time? Sign in with admin@example.com and changeme.**) for as long as it works. After signing in, Passdown shows **Finish setting up Passdown** and nothing else; the header offers only sign-out. Enter:

- your name;
- your own email address (not `admin@example.com`);
- a new password, between 12 and 200 characters, twice;
- the name of your first workspace.

Choose **Finish setting up**. In one step, the account takes your name, address and password, your workspace is created, and the studio opens. Your account manages the workspace and is the **installation administrator**. From then on `admin@example.com` and `changeme` no longer work, and the sign-in page stops mentioning them. Sign in with your own address.

Because the default login is published, finish setting up before anyone else can reach the server. Until you do, `/api/health` answers `setup-required` and every start logs a warning (`setup.default-login`). The default login can do nothing except finish setting up: every other page and API refuses it, and its password can't be changed any other way.

An existing database never gets a default login: it is created only when the database has no account and no workspace, so restoring a backup or upgrading never adds one.

## Invite colleagues

In the studio, open **Manage → People** and create an invitation link for each person. Passdown sends no email: pass each link on privately. A link works once and expires after 7 days.

## Using your own proxy (Nginx Proxy Manager)

For a public address with a trusted certificate, keep Passdown's proxy and put yours in front of port 8443. In Nginx Proxy Manager, add a **Proxy Host**:

| Field                 | Value                                                             |
| --------------------- | ----------------------------------------------------------------- |
| Domain Names          | `guides.example.org`                                              |
| Scheme                | `https`                                                           |
| Forward Hostname / IP | the Passdown server's address, for example `192.168.1.20`         |
| Forward Port          | `8443` (or your `PASSDOWN_PORT`)                                  |
| SSL                   | request a certificate; turn on **Force SSL** and **HSTS Enabled** |

Nginx Proxy Manager accepts Passdown's own certificate on the forwarded connection without further setup. Then set `PASSDOWN_URL` to the public address, exactly as people type it, for example `https://guides.example.org`, and redeploy the stack. Sign-in works only at that address from then on.

Notes:

- Let your proxy pass request bodies of at least 22 MB, for pictures. If it limits them, raise the limit (in Nginx Proxy Manager, `client_max_body_size 22m;` under **Advanced → Custom Nginx Configuration**).
- Passdown's proxy sees every visitor as your proxy's address, so its request limits (300 a minute each for sign-in, links and administration) apply to everyone together. Raise `PASSDOWN_SIGN_IN_LIMIT`, `PASSDOWN_LINK_LIMIT` and `PASSDOWN_ADMIN_LIMIT` if people are refused. Password guessing is limited separately by the application.
- If nobody should reach port 8443 directly, block it in the server's firewall for other hosts.

Any other reverse proxy works the same way: forward to `https://server:8443`, don't verify its certificate, and set `PASSDOWN_URL` to the public address.

## Upgrade

Each release's notes name its version. Read them first, and [make a backup](#backups).

**Portainer:** open the stack, choose **Editor**, and change the version on the `x-passdown-image` line and on the proxy's `image:` line (or paste the new release's compose file, keeping your environment variables). Choose **Update the stack**.

**Command line:** make the same change in `compose.yaml`, then run `sh upgrade.sh` from the same folder (from the release's files), or `docker compose up -d`.

What happens when the new version's migrations fail depends on how you upgrade:

- **Update the stack / `docker compose up -d`:** Compose stops the running web container before the new migration job runs, so Passdown is unavailable while migrations run (usually seconds). If they fail, the new web is **not started** (its container stays "Created"), the proxy answers `502 Bad Gateway`, and the database stays as it was: a failed migration is rolled back. To go back, put the previous version back in the file and update the stack again; the previous version starts with your data. Read `docker compose logs migrate` (in Portainer, the `migrate` container's logs) and report the problem before retrying.
- **`sh upgrade.sh`:** backs up with the running version, applies the new migrations while the old version keeps serving, and replaces web and the proxy only if they succeed. On failure it prints **Migrations failed; the site is still running the previous version.** and changes nothing else. Options: `--file FILE` (repeat for overlays), `--project NAME`, `--skip-backup`.

Migrations cannot be undone. If a new version starts but misbehaves, go back by [restoring the backup](backups.md) with the previous version.

## Backups

A backup holds the database and pictures in one verified archive. For a command-line installation, from its folder:

```bash
sh backup.sh /path/to/private-backups
```

For a Portainer stack, from the server's shell, using the stack name and a copy of the stack's compose file (see [operator commands](#operator-commands)):

```bash
sh backup.sh --file compose.yaml --project passdown /path/to/private-backups
```

`backup.sh` makes the archive with `ops backup`, checks it offline, and only then gives it its final name, readable only by you. Without the script: `docker compose -p passdown -f compose.yaml run --rm -T ops backup > passdown-backup.tar`. Copy archives off the server; they contain private guides, account names and password hashes. The secrets volumes are not in the archive and are not needed to restore it. See [backups and restore](backups.md).

## Operator commands

Operator commands run in the `ops` service. They need Compose on the server's command line and the stack's compose file.

- **Command-line installation:** run them from its folder, for example `docker compose run --rm -T ops status`.
- **Portainer stack:** Portainer runs each stack as a Compose project named after the stack. `docker compose ls` on the server lists it (for example `passdown`). Save a copy of the stack's compose file on the server (copy it from Portainer's **Editor**; Portainer keeps its own copy under its data volume, usually `/var/lib/docker/volumes/portainer_data/_data/compose/<stack id>/docker-compose.yml`), then add `-p` and `-f`:

  ```bash
  docker compose -p passdown -f compose.yaml run --rm -T ops status
  ```

  Use only `run` this way, never `up` or `down`: those would replace the stack's containers with ones missing the environment variables you set in Portainer. If a command prints links (`reset-password`), first run `export PASSDOWN_URL=https://your-address` so the links name the right address.

| Command                                      | What it does                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `ops help`                                   | Lists the commands.                                                       |
| `ops version`, `ops status`                  | The version and revision; whether the schema matches and the setup state. |
| `ops setup-state`                            | `default-login` until you finish setting up, then `complete`.             |
| `ops reset-password --email you@example.org` | Prints a single-use reset link when no administrator can sign in.         |
| `ops admin list`, `ops admin grant EMAIL`    | Lists or adds installation administrators.                                |
| `ops verify-media --checksums`               | Checks every stored picture.                                              |
| `ops backup`, `ops restore`                  | See [backups](#backups) and [restore](backups.md).                        |

## Where your data lives

Volume names are prefixed with the project name, for example `passdown_database`.

| Volume                       | Contents                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------ |
| `database`                   | Guides, catalogs, accounts, password hashes, invitations and audit records.                      |
| `media`                      | Uploaded pictures.                                                                               |
| `owner-secrets`              | The database owner's password. Mounted by `init`, `postgres`, `migrate` and `ops`; never by web. |
| `app-secrets`                | The runtime database password and the session secret.                                            |
| `proxy-data`, `proxy-config` | Caddy's certificate authority and certificate.                                                   |

Stopping or removing the stack keeps the volumes. **Never run `docker compose down -v`, and never remove the stack's volumes in Portainer,** unless you mean to delete everything: the secrets and the database belong together. Container logs rotate at 10 MB, keeping five files per service. The proxy's access log records visitors' IP addresses, which may be personal data where you operate. See the [configuration reference](configuration.md#secrets) for how the secrets are made and used.

## HTTPS

Caddy serves HTTPS on one port with one certificate, for `localhost`, made by its own certificate authority in the `proxy-data` volume. It answers every host name and IP address with that certificate, uses no public certificate authority and needs no ports 80 or 443. It limits upload sizes, limits request rates on sign-in, invitation, reset and setup links, and administration, and keeps tokens out of its access log.

It does not send `Strict-Transport-Security`: browsers ignore that header from a certificate they don't trust, nothing listens on plain HTTP for it to protect, and anyone who chooses to trust the local authority would have every port of that host name pinned to HTTPS. A proxy in front with a trusted certificate should send it (**HSTS Enabled** in Nginx Proxy Manager).

To trust the local authority on one computer instead of clicking through the warning, export it with `docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt passdown-local-ca.crt` and add it to that computer's trust store. Its signing key lives in `proxy-data`: anyone with that volume can make certificates your computer trusts.

## Everyday operation

- **Logs:** `docker compose logs web` shows one JSON line per event. At each start, `web` writes a `startup` line with the version, schema state, picture storage and setup state. See [tracing an error](troubleshooting.md#tracing-an-error-someone-reports).
- **Health:** `/api/health` answers `ready` when everything works; see the [troubleshooting guide](troubleshooting.md#health-answers).
- **Someone can't sign in:** an installation administrator opens **Administration → Accounts** and creates a single-use reset link that expires after 24 hours. If no administrator can sign in, use `ops reset-password`.

## What this alpha does not do

- Send email. Invitations and reset links are passed on by hand.
- Let people recover their own accounts. Administrators or the operator issue reset links.
- Take backups automatically. Schedule `backup.sh` yourself.
- Remove pictures that are no longer used.
- Offer more than one workspace per installation, or run on more than one host.
- Provide tools for erasing a person's data or handling takedown requests.

## Build from source

For contributors, and for everyone until the first images are published. From a checkout:

```bash
git clone https://github.com/nanwer/passdown.git
cd passdown/deploy
export PASSDOWN_URL=https://localhost:8443
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

`compose.build.yaml` builds the images from the checkout (named `passdown:local` and `passdown-caddy:local`) instead of pulling them. Pass both `-f` options to every later command, including `sh upgrade.sh --file compose.yaml --file compose.build.yaml` after rebuilding with `docker compose -f compose.yaml -f compose.build.yaml build`. See [evaluating from source](development-stack.md) for checks and a local evaluation.
