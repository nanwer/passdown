# Install Passdown on your own server

This guide installs Passdown with Docker Compose on one Linux host, then finishes setup in the browser. Passdown is **alpha software**: read the release notes before installing, keep backups, and expect changes between versions.

> **Before the first release:** published images arrive with Passdown 0.1.0-alpha.1. Until then, install from source as described in [Building from source](#building-from-source). Every other step in this guide is the same.

## What you are installing

Four containers run from published images:

| Service    | What it does                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `postgres` | PostgreSQL 17 database. Reachable only by the other containers.                                |
| `migrate`  | Applies database migrations when the stack starts, then exits.                                 |
| `web`      | The Passdown application. It connects to the database with a restricted role.                  |
| `proxy`    | The HTTPS proxy, Caddy by default or [nginx](nginx.md). The only service with published ports. |

A fifth service, `ops`, runs [operator commands](#everyday-operation) on demand. Guides, accounts and pictures live in Docker volumes that survive restarts and upgrades. See [what this alpha does not do](#what-this-alpha-does-not-do) before you invite people.

## Before you start

You need:

- a Linux host (amd64 is tested; arm64 is expected to work) with space for your pictures. A measured minimum host size will be published with the first release;
- Docker Engine with Docker Compose 2.24.4 or later (`docker compose version`);
- a DNS name pointing at the host, with ports 80 and 443 reachable from the internet, so Caddy can obtain a certificate (or your own certificate for [nginx](nginx.md));
- a synchronised clock (for example `systemd-timesyncd` or `chrony`). Sign-in, reset links and certificates depend on it.

## Download

From 0.1.0-alpha.1, each release on GitHub provides `compose.yaml`, `compose.nginx.yaml`, `init.sh`, `upgrade.sh`, `backup.sh` and a `SHA256SUMS` file. Download them into an empty directory that will hold your installation, then check them:

```bash
sha256sum --check SHA256SUMS
```

Every file must report `OK`. The installation directory will also hold your private settings and backups, so keep it readable only by you.

## Create the settings file

```bash
sh init.sh --domain guides.example.org --acme-email you@example.org
```

`--acme-email` is the contact address Caddy gives the certificate authority. To use your own certificates with nginx instead, see [using nginx](nginx.md).

`init.sh` writes a private `.env` (readable only by you) containing generated database passwords, a session-signing secret and your settings, and prints a **setup code** such as `7K2QD-M8XNB-4TRVA-9HJCE`. The code is shown only in your terminal. Only its hash is stored, so write it down now. `init.sh` never overwrites an existing settings file, and it refuses when Docker already holds data for this installation, so lost settings can't silently be replaced by new passwords.

Keep a copy of `.env` in your password manager. It isn't included in backups, and without it you can't reach the database in your volumes. Options such as custom ports, a project name and settings filename are in the [configuration reference](configuration.md#init-sh-options).

## Start

```bash
docker compose up -d
docker compose ps --all
```

Expect `postgres` and `web` to be healthy, `proxy` running and `migrate` exited with code 0. Check health:

```bash
curl https://guides.example.org/api/health
```

The answer includes `"status":"setup-required"`. If it doesn't, see [troubleshooting](troubleshooting.md).

## Finish setup in the browser

Open `https://guides.example.org/setup` promptly. Anyone who reaches the site and holds the code could complete setup, and the code works until setup is complete. Enter the setup code (hyphens and letter case don't matter), your name, email address, a password of at least 12 characters and the name of your first workspace.

Setup creates your account and workspace together and opens the studio. Your account manages the workspace and is the **installation administrator**. Afterwards `/setup` no longer exists.

If you lose the code before finishing, renew it:

```bash
sh init.sh --renew-setup-code
```

Then run the command it prints to recreate `web`. The old code stops working. Renewal refuses once setup is complete. If the setup page says setup may have finished, reload it; when it's gone, sign in with the email address and password you chose.

## Invite colleagues

In the studio, open **Manage → People** and create an invitation link for each person. Passdown sends no email: pass each link on privately. A link works once and expires after 7 days.

## Where your data lives

| Volume                       | Contents                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `database`                   | Guides, catalogs, accounts, password hashes, invitations and audit records.  |
| `media`                      | Uploaded pictures.                                                           |
| `proxy-data`, `proxy-config` | Caddy's certificates and state. nginx reads your certificate folder instead. |

`docker compose down` stops the stack and keeps the volumes. **Never run `docker compose down -v`**: it deletes the volumes and everything in them. Container logs rotate at 10 MB, keeping five files per service. The proxy's access log records visitors' IP addresses, which may be personal data where you operate.

## Secrets

| Secret                      | Where              | If it leaks or you want to change it                                                                                                      |
| --------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GUIDE_DB_OWNER_PASSWORD`   | `.env`             | Used only by `postgres`, `migrate` and `ops`, never by `web`. There is no command to change it yet.                                       |
| `GUIDE_DB_RUNTIME_PASSWORD` | `.env`             | Edit it in `.env`, run `docker compose run --rm -T ops runtime-password`, then `docker compose up -d --force-recreate web`.               |
| `BETTER_AUTH_SECRET`        | `.env`             | Signs session cookies. Replace it with 96 new hexadecimal characters and recreate `web`: everyone is signed out and nothing else is lost. |
| Setup code                  | Your terminal only | Renew it as above while setup is still required.                                                                                          |

Keep `.env` at mode 0600 and out of version control. Backups exclude it on purpose.

## Time

Passdown stores times in UTC and shows them in each reader's browser time zone. Keep the host clock synchronised.

## HTTPS and the proxy

Caddy obtains and renews certificates automatically and needs ports 80 and 443. [nginx](nginx.md) serves certificates you provide. Both redirect HTTP to HTTPS, send HSTS, limit upload sizes, limit request rates on sign-in, setup and invitation links, and administration, and keep secrets out of their access logs. Any other proxy placed in front must do the same.

The request limits are broad circuit breakers of 300 requests per minute per client, grouping IPv6 clients by /64. Password guessing is limited separately by the application. The limits depend on Docker passing each visitor's real address to the proxy, which rootful Docker on Linux with normal port publishing does. Docker Desktop, rootless Docker and IPv6 forwarded through an IPv4-only bridge may present every visitor as one address, so everyone shares one limit. After installing, compare the client addresses in `docker compose logs proxy` (`request.client_ip` for Caddy, `client_ip` for nginx) for visits from two different networks. The limits can be changed in the [configuration](configuration.md).

## Everyday operation

Run these from the installation directory.

- **Logs:** `docker compose logs web` shows one JSON line per event. At each start, `web` writes a `startup` line with the version, schema state, picture storage and whether setup is complete. An unexpected failure is logged with its request ID or page error reference; see [tracing an error](troubleshooting.md#tracing-an-error-someone-reports).
- **Status and version:** `docker compose run --rm -T ops status` and `docker compose run --rm -T ops version`. The other operator commands are listed by `ops help` and described in the [troubleshooting guide](troubleshooting.md).
- **Health:** `/api/health` answers `ready` when everything works. Its possible answers are in the [troubleshooting guide](troubleshooting.md#health-answers).
- **Someone can't sign in:** an installation administrator opens **Administration → Accounts** and creates a single-use reset link that expires after 24 hours. If no administrator can sign in, run `docker compose run --rm -T ops reset-password --email you@example.org` and open the printed link. Add administrators with `ops admin grant <email>`.
- **Backups:** `sh backup.sh` writes a verified archive of the database and pictures. Copy archives off the host. See [backups and restore](backups.md).
- **Upgrades:** always use `sh upgrade.sh`, never a bare `docker compose pull`. It backs up, applies the new version's migrations while the old version keeps serving, and switches over only if they succeed. See [upgrading](development-stack.md#upgrade-a-running-installation).

## What this alpha does not do

- Send email. Invitations and reset links are passed on by hand.
- Let people recover their own accounts. Administrators or the operator issue reset links.
- Take backups automatically. Schedule `backup.sh` yourself.
- Remove pictures that are no longer used.
- Offer more than one workspace per installation, or run on more than one host.
- Provide tools for erasing a person's data or handling takedown requests.

## Building from source

For contributors, and for everyone until the first images are published:

```bash
git clone https://github.com/nanwer/passdown.git
cd passdown/deploy
sh init.sh --domain guides.example.org --acme-email you@example.org --build
docker compose build
docker compose up -d
```

`--build` makes every later `docker compose` command, and `sh upgrade.sh --build`, use images built from this checkout. To try Passdown on your own computer first, use `--domain localhost` as described in [evaluating from source](development-stack.md).
