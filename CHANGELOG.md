# Changelog

Each alpha release is listed here. Passdown uses [semantic versioning](https://semver.org/) with alpha pre-release labels; while it is in alpha, any release may change behaviour.

## 0.1.0-alpha.1 (unreleased)

The first version you can install on your own server.

### Added

- **Installation with Docker Compose:** release images for the application and two HTTPS proxies, install files with pinned image digests and a checksum file, and a settings step (`init.sh`) that creates private settings and prints a one-time setup code.
- **Browser setup:** a new installation asks for the setup code, then creates the first account and workspace together. The code can be renewed while setup is still required.
- **HTTPS proxies:** Caddy, which obtains certificates automatically, or nginx with certificates you provide. Both send HSTS, limit upload sizes and request rates, and keep invitation links, reset links and setup codes out of their logs.
- **Backups and restore:** verified archives of the database and pictures (`backup.sh`), offline archive checks, and staged restore into an empty installation that opens access only after verification.
- **Upgrades:** `upgrade.sh` takes a backup, applies the new version's migrations while the old version keeps serving, and switches over only if they succeed.
- **Withdrawing a guide:** managers can withdraw a published guide so readers see a short notice, then reinstate it or publish a new release.
- **Account recovery without email:** installation administrators create single-use reset links under **Administration → Accounts**; the setup account is the first administrator. Everyone can change their own password under **Your account**.
- **Operator commands:** `status`, `version`, `migrate`, `setup-state`, `runtime-password`, `reset-password`, `admin grant|revoke|list`, `verify-media`, `backup` and `restore`.
- **Diagnostics:** a health endpoint reporting version, schema and picture storage; one JSON log line per event, with request IDs and page error references.
- **Source link:** every page links to the exact source revision it was built from, or to a repository the operator sets.
- **Documentation:** an installation guide, configuration reference, troubleshooting guide, backup guide and nginx guide.

### Changed

- Production installations no longer create an administrator from environment settings; the first account is created in the browser.
- Steps with dependants are removed through an in-app confirmation that lists the affected steps.

### Security

- A focused review of setup, accounts, reset links, invitations, permissions, uploads, logging, the proxies, the images and restore was completed before this release. Its findings of medium severity are fixed: picture caching after withdrawal, a shared limit on changes that one account could exhaust, and resuming a staged restore from a tampered backup.
- The web service connects to the database with a restricted role and never receives the owner credentials; the web image runs as a non-root user.

### Known limitations

- One server and one workspace per installation. Linux amd64 is tested; arm64 is expected to work.
- No email: invitations and reset links are passed on by hand, and there is no self-service password recovery.
- No automatic backups, and unused pictures are never removed.
- No tools for erasing a person's data or handling takedown requests. Withdrawing a guide can't recall copies people already saved.
- Studio error messages don't show a request ID yet; only page errors and the setup page show a reference.
- Tested in Chromium, Firefox and WebKit engines; checks in Safari on macOS and iOS and with VoiceOver are manual.
