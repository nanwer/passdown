# Troubleshooting

Run the commands here from your installation directory. Most problems are named in two places: the answer from `/api/health`, and the web service's log.

```bash
curl https://guides.example.org/api/health
docker compose logs web | grep '"level":"error"'
docker compose run --rm -T ops status
```

Log lines are JSON, one per event. They never contain passwords, setup codes, tokens, cookies, connection strings or guide content.

## Health answers

| `status`            | HTTP | Meaning                                                                                    | What to do                                              |
| ------------------- | ---- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| `ready`             | 200  | Everything works.                                                                          | Nothing.                                                |
| `setup-required`    | 200  | Running, but nobody has completed setup.                                                   | [Finish setup](install.md#finish-setup-in-the-browser). |
| `not-configured`    | 503  | A required setting is missing or invalid.                                                  | See [not configured](#not-configured).                  |
| `unavailable`       | 503  | The database can't be reached, has no schema yet, or its runtime role is unsafe.           | See [database unavailable](#database-unavailable).      |
| `schema-behind`     | 503  | The database is missing migrations this version needs, or applied migrations were changed. | See [schema behind](#schema-behind).                    |
| `media-unavailable` | 503  | The picture directory is missing or can't be read and written.                             | See [pictures unavailable](#pictures-unavailable).      |

A `ready` answer with `"schema":"ahead"` means an older version is serving a database that a newer version has already upgraded. Start the newer version.

## Not configured

Every page says **This installation is not configured yet. Ask the operator to check its settings.** The log has one `config.invalid` line per problem, naming the variable:

- `BETTER_AUTH_URL: must be a bare origin and use https:// unless it is a loopback address.` Use `https://your.domain`, adding `:PORT` only for a non-standard HTTPS port, with no path or trailing text.
- `BETTER_AUTH_SECRET: Identity secret must be at least 32 characters.` Restore the value from your password manager, or generate a new one (everyone is signed out).
- `GUIDE_DATABASE_URL: …` Compose builds this from `GUIDE_DB_RUNTIME_PASSWORD`; check that the password line in `.env` is intact.

After fixing `.env`, run `docker compose up -d --force-recreate web`.

## Compose says a variable is missing

`required variable COMPOSE_PROJECT_NAME is missing a value: Run init.sh to choose an installation project`, or the same message for another variable ending in `Run init.sh`, means Compose couldn't find your settings. Run Compose from the installation directory. If your settings file isn't called `.env`, pass `--env-file FILE`, or use the full command `init.sh` printed. If the file is lost, restore it from your password manager. Don't run `init.sh` again for an existing installation: new passwords can't open your existing database, and `init.sh` refuses when it finds the installation's data.

For nginx, `PASSDOWN_TLS_DIR` missing means the settings weren't created with `--proxy nginx --tls-dir DIR`.

## Database unavailable

Check the database container, then the log:

```bash
docker compose ps --all postgres migrate
docker compose logs migrate
docker compose logs web | grep database.unreachable
```

- `postgres` not healthy: read `docker compose logs postgres`. A full disk is a common cause.
- `migrate` exited with an error: see [migrations fail](#migrations-fail).
- The log says `This database has no schema yet. Run docker compose run --rm migrate to create it.`: run that command, then `docker compose up -d`.
- `Runtime role check failed: …`: see [migrate exits with code 4](#migrate-exits-with-code-4).

## Schema behind

The log line `schema.behind` says which case applies:

- `This database is missing N migration(s) (…). Run ./upgrade.sh, then start again.` A newer version's images are needed, or `migrate` didn't run. Upgrade with `sh upgrade.sh`; never start an older version against a newer database.
- `These migrations were edited after they were applied: … The database and this build have diverged; restore the original files or rebuild the database from a backup.` Your images don't match the database. Use the images from the release this database was upgraded with. Never edit migration records to make the message disappear.

## Pictures unavailable

`The picture directory is missing or cannot be read and written.` The `media` volume must be mounted at `/var/lib/passdown/media` and writable by the web container. Check that `docker compose config` still lists the volume for `web`, and that the host has free disk space.

## Setup

**Every page shows setup, or health says `setup-required`.** Nobody has finished setup. Open `/setup` and complete it.

**"That setup code isn't right."** Hyphens, spaces and letter case don't matter, and `I`, `L` and `O` are read as `1`, `1` and `0`. The code isn't stored, so a lost code can't be looked up: renew it. After 30 wrong attempts in a minute across the installation, setup answers **Too many attempts. Wait a minute and try again.**

**Lost setup code.** Before setup is complete, run `sh init.sh --renew-setup-code`, then the `docker compose … up -d --no-deps --force-recreate web` command it prints. The old code stops working when web is recreated. After setup, renewal refuses with **Setup is already complete; there is nothing to renew.** Use [account recovery](#someone-cant-sign-in) instead.

**"Setup may have finished. Reload this page."** The connection dropped while setup was saving. Reload `/setup`. If it's gone, sign in with the email address and password you chose. Otherwise, try again: setup never creates a second account.

**"This installation has no setup code yet."** `PASSDOWN_SETUP_CODE_SHA256` is missing from `.env`, or it's malformed (the log says `The setup code hash is invalid, so browser setup is unavailable.`), or web wasn't recreated after renewal. The `startup` log line shows `"setupCode":"missing"`. Renew the code.

**"This database contains a workspace but no accounts."** The database is incomplete, typically from a partial restore. Restore a complete backup or start with empty volumes. Setup doesn't delete the existing data.

## Requests refused or sessions lost

**"This request came from an untrusted origin. Reload this page and try again."** The page was opened at an address other than `BETTER_AUTH_URL`: another host name, `http://`, or a different port. Open the site at exactly that address, or correct `BETTER_AUTH_URL` and recreate web.

**Signed out immediately after signing in.** Session cookies are sent only over HTTPS. Use the `https://` address, and make sure no other proxy in front of Passdown serves it over plain HTTP.

**A picture won't upload.** The studio accepts JPEG, PNG and WebP up to 20 MB and 40 megapixels, and explains which limit was hit. **That picture could not be added. Try again.** with no other explanation usually means the proxy refused a body over 22 MB.

**Too many requests.** The proxy allows 300 requests a minute per client on sign-in, links and administration. Separately, sign-in allows 10 failed attempts a minute per address (**Too many failed sign-in attempts. Please wait a minute and try again.**) and 500 across the installation. If many people are refused at once, the proxy may be seeing every visitor as one address; see [HTTPS and the proxy](install.md#https-and-the-proxy). Raise `PASSDOWN_SIGN_IN_LIMIT`, `PASSDOWN_LINK_LIMIT` or `PASSDOWN_ADMIN_LIMIT` only after checking that.

## Certificates

**Caddy doesn't obtain a certificate.** DNS for your domain must point at this host, ports 80 and 443 must be reachable from the internet, and `PASSDOWN_TLS` must be your email address. Read `docker compose logs proxy`. Certificate authorities limit repeated failures, so fix the cause before restarting repeatedly.

**nginx doesn't start.** Its log names the problem, for example `The certificate file /etc/passdown/tls/privkey.pem is missing.` Check that `PASSDOWN_TLS_DIR` holds `fullchain.pem` and `privkey.pem`. After replacing certificates, run `docker compose exec proxy nginx -s reload`. See [using nginx](nginx.md) for renewal with certbot.

## Someone can't sign in

An installation administrator opens **Administration → Accounts** (`/admin/accounts`), chooses **Create reset link…** for the account, and passes the link on privately. It works once, for 24 hours, and signs the account out everywhere when used. A used, expired or replaced link shows **This reset link is no longer valid.**

If no administrator can sign in:

```bash
docker compose run --rm -T ops reset-password --email person@example.org
```

It prints the link alone on standard output and its expiry on standard error. To make someone an administrator, run `ops admin grant person@example.org`; `ops admin list` shows them all. The last administrator can't be revoked: **That is the last installation administrator. Grant someone else first.**

## Tracing an error someone reports

A page that fails to load says **If this keeps happening, give the operator of this installation this reference:** followed by a code. The setup page shows **Reference:** with a request ID. Find it in the log:

```bash
docker compose logs web | grep 'REFERENCE'
```

The matching `render.failed` or `request.failed` line has the time, the route pattern, and the error's name, code and message. Other studio messages don't show a request ID yet. Every API response carries one in its `X-Request-ID` header, so a failure can still be found by time and route.

## Disk filling up

Check with `docker system df -v`. The `database` and `media` volumes grow with your content, and Passdown doesn't remove unused pictures yet. Container logs rotate at 10 MB, keeping five files per service. Backups written by `backup.sh` stay on the host until you move them. Never free space with `docker compose down -v` or `docker volume prune`: they delete your data.

## Migrations fail

`migrate` and `upgrade.sh` stop on the first problem, and a failed migration is rolled back.

- `Applied migration changed: NAME`: the images don't match the migrations recorded in the database. Use the images of the release this database was last upgraded with.
- `Migration NAME failed and was rolled back: PostgreSQL error CODE`: nothing was changed. Keep the log and report the problem.
- `Migration NAME could not be confirmed: …`: check `ops status` before retrying.
- From `upgrade.sh`: **Migrations failed; the site is still running the previous version.** Nothing else was changed, and `upgrade.log` records the attempt.

## Migrate exits with code 4

`Runtime role check failed: PROBLEM.` The restricted database role web uses has more rights than it should, or its password doesn't match. For `password`, run `docker compose run --rm -T ops runtime-password`, then `docker compose up -d --force-recreate web`. For other problems, the role was changed outside Passdown; restore it from a backup or ask for help with the exact message.

## Operator command exit codes

`ops` commands exit 0 on success, 1 when the operation failed, 2 for a usage error, 3 for a configuration error and 4 when the operation was refused. Results go to standard output; progress and errors go to standard error. `ops help` lists the commands.
