# Changelog

Each alpha release is listed here. Passdown uses [semantic versioning](https://semver.org/) with alpha pre-release labels; while it is in alpha, any release may change behaviour.

## Unreleased

### Changed

- A redeploy whose database migrations fail no longer leaves a bare connection error: the bundled proxy shows a Passdown page saying the upgrade failed and whether any data was changed, with how to go back, and `/api/health` reports it. The proxy also shows a short "back in a moment" page while Passdown starts. `upgrade.sh` still keeps the previous version serving.
- Studio messages for failures on the server's side end with a short reference, such as "Reference: 7f3a2c1b", that finds the matching line in the web service's log.
- The browser tab icon uses the current blue mark.

### Security

- An installation administrator can no longer create a reset link for another administrator; that is done from the server with `ops reset-password`.
- A suspended account's correct password is refused like a wrong one, and no session is created.
- Page scripts can no longer read the session token: the session endpoint answers 404 and the sign-in response no longer includes the token.

## 0.1.0-alpha.1 (26 September 2026)

The first version you can install on your own server.

### Added

- **Installation from one compose file:** paste it into Portainer or run `docker compose up -d`. It needs no settings file: a one-shot service generates the database passwords and session secret into private volumes on first start, and web never receives the owner password. Release images for the application and its HTTPS proxy, with a digest-pinned `compose.yaml`, `upgrade.sh`, `backup.sh` and a checksum file.
- **First sign-in:** a new installation has one default login, `admin@example.com` / `changeme`, shown on the sign-in page while it works. It can only finish setting up: your name, email address, a new password and the first workspace, in one step, after which the default login stops working. Existing and restored databases never get one.
- **HTTPS on one port:** the bundled Caddy serves HTTPS on port 8443 (`PASSDOWN_PORT`) for any address, with a certificate it makes itself, limits upload sizes and request rates, and keeps invitation and reset links out of its logs. Put your own proxy, such as Nginx Proxy Manager, in front for a trusted certificate.
- **Backups and restore:** verified archives of the database and pictures (`backup.sh`), offline archive checks, and staged restore into an empty installation that opens access only after verification.
- **Upgrades:** change the version in `compose.yaml` and redeploy; web starts only after the new version's migrations succeed. From the command line, `upgrade.sh` also backs up first and keeps the old version serving while the migrations run.
- **Withdrawing a guide:** managers can withdraw a published guide so readers see a short notice, then reinstate it or publish a new release.
- **Account recovery without email:** installation administrators create single-use reset links under **Administration → Accounts**; the account that finishes setting up is the first administrator. Everyone can change their own password under **Your account**.
- **Operator commands:** `status`, `version`, `migrate`, `setup-state`, `init-secrets`, `runtime-password`, `reset-password`, `admin grant|revoke|list`, `verify-media`, `backup` and `restore`.
- **Diagnostics:** a health endpoint reporting version, schema and picture storage; one JSON log line per event, with request IDs and page error references.
- **Source link:** every page links to the exact source revision it was built from, or to a repository the operator sets.
- **Documentation:** an installation guide (Portainer and `docker compose`, Nginx Proxy Manager in front, upgrades, backups and operator commands), configuration reference, troubleshooting guide and backup guide.

### Changed

- Production installations no longer create an administrator from environment settings; the first account is the default login, replaced in the browser.
- Steps with dependants are removed through an in-app confirmation that lists the affected steps.

### Security

- A focused review of first-run setup, accounts, reset links, invitations, permissions, uploads, logging, the proxies, the images and restore was completed before this release. Its findings of medium severity are fixed: picture caching after withdrawal, a shared limit on changes that one account could exhaust, and resuming a staged restore from a tampered backup.
- The web service connects to the database with a restricted role and never receives the owner credentials; the web image runs as a non-root user.

### Known limitations

- One server and one workspace per installation. Linux amd64 is tested; arm64 is expected to work.
- No email: invitations and reset links are passed on by hand, and there is no self-service password recovery.
- No automatic backups, and unused pictures are never removed.
- No tools for erasing a person's data or handling takedown requests. Withdrawing a guide can't recall copies people already saved.
- Studio error messages don't show a request ID yet; only page errors and the Finish setting up form show a reference.
- A redeploy whose migrations fail leaves Passdown stopped until the previous version is put back: Compose stops the old web before migrations run. `upgrade.sh` avoids that outage on the command line.
- Tested in Chromium, Firefox and WebKit engines; checks in Safari on macOS and iOS and with VoiceOver are manual.
