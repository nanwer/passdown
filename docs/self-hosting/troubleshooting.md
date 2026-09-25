# Troubleshooting

Run the commands here from your installation's folder. For a Portainer stack, read the logs in Portainer (**Containers → the container → Logs**), or add `-p STACK -f compose.yaml` as described in [operator commands](install.md#operator-commands). Most problems are named in two places: the answer from `/api/health`, and the web service's log.

```bash
curl -k https://localhost:8443/api/health
docker compose logs web | grep '"level":"error"'
docker compose run --rm -T ops status
```

Log lines are JSON, one per event. They never contain passwords, tokens, cookies, connection strings or guide content.

## Health answers

| `status`            | HTTP | Meaning                                                                                    | What to do                                                     |
| ------------------- | ---- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `ready`             | 200  | Everything works.                                                                          | Nothing.                                                       |
| `setup-required`    | 200  | Running, but nobody has finished setting up: the default login still works.                | [Finish setting up](install.md#sign-in-and-finish-setting-up). |
| `not-configured`    | 503  | A required setting is missing or invalid.                                                  | See [not configured](#not-configured).                         |
| `unavailable`       | 503  | The database can't be reached, has no schema yet, or its runtime role is unsafe.           | See [database unavailable](#database-unavailable).             |
| `schema-behind`     | 503  | The database is missing migrations this version needs, or applied migrations were changed. | See [schema behind](#schema-behind).                           |
| `media-unavailable` | 503  | The picture directory is missing or can't be read and written.                             | See [pictures unavailable](#pictures-unavailable).             |

A `ready` answer with `"schema":"ahead"` means an older version is serving a database that a newer version has already upgraded. Start the newer version.

When web isn't answering at all, the proxy answers instead, always with `503` and no `version`:

| `status`             | Meaning                                                                                                      | What to do                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `starting`           | Web is starting or being replaced, or stopped for another reason.                                            | Wait a minute; then check `docker compose ps`.            |
| `upgrade-failed`     | This version's migrations failed and were rolled back (`"databaseChanged": false`), so web wasn't started.   | See [the site says the upgrade failed](#migrations-fail). |
| `upgrade-incomplete` | This version's migrations failed after some were applied (`"databaseChanged": true`), so web wasn't started. | See [the site says the upgrade failed](#migrations-fail). |

## Not configured

Every page says **This installation is not configured yet. Ask the operator to check its settings.** The log has one `config.invalid` line per problem, naming the variable:

- `PASSDOWN_URL: must be a bare origin and use https:// unless it is a loopback address.` Use `https://` and the address, adding `:PORT` unless it is 443, with no path, for example `https://192.168.1.20:8443`.
- `GUIDE_DB_RUNTIME_PASSWORD_FILE: names a file that cannot be read …` (or the owner or session file): the `app-secrets` or `owner-secrets` volume isn't mounted, or the `init` service didn't complete. Check `docker compose ps --all init` and `docker compose logs init`.
- `… must name a file holding one value on one line.` A secret file was edited or emptied. Restore it from a copy of the volume; a new value would not match the database.
- `… cannot be combined with …` Two settings give the same value, for example `GUIDE_DATABASE_URL` alongside `GUIDE_DB_RUNTIME_PASSWORD_FILE`. Remove one.

After fixing the setting, redeploy (**Update the stack** in Portainer, or `docker compose up -d`).

## Secrets

**`init` exited with an error.** Its log says which: **The secrets volume at … is not mounted.** means the compose file was changed; restore it. **… is not a regular file.** or **… is empty.** means something replaced a secret. `init` never overwrites a secret, because the database was set up with it. Restore the volume from a copy, or, for a new installation with no data, remove the stack's volumes and start again.

**Migrate or web can't sign in to the database after the secrets volumes were lost** (`password authentication failed`, `Runtime role check failed: password`). New secrets were generated for an existing database. If only `app-secrets` was lost, run `docker compose run --rm -T ops runtime-password`, then redeploy: the runtime role takes the new password. Everyone has to sign in again, because the session secret is new too. If `owner-secrets` was lost, the database can't be opened with the new password: restore the volume, or restore a backup into a new installation.

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

## First sign-in

**The sign-in page doesn't mention admin@example.com.** Setup is already finished: sign in with the address and password chosen then. If nobody knows them, use [account recovery](#someone-cant-sign-in).

**admin@example.com and changeme are refused on a new installation.** Check `docker compose logs migrate`: it prints **Created the default login admin@example.com.** the first time. The default login is created only in an empty database; a database that already has an account or a workspace never gets one.

**Every page says "Passdown has no account yet", or health says `setup-required` and nobody can sign in.** The database has no accounts: `migrate` hasn't run, or the database holds a workspace but no accounts, typically from a partial restore. Run `docker compose run --rm -T migrate`, or restore a complete backup. `ops setup-state` answers `no-account` in this state.

**"Use your own email address, not admin@example.com."** Finish setting up needs your real address; the default one is retired.

**"Another account already uses that email address."** Choose another address.

**The connection was lost while finishing.** Reload the page. If it still shows **Finish setting up Passdown**, nothing was changed; send the form again. Otherwise setup finished: sign in with the address and password you chose.

**"This database already contains a workspace."** The database is incomplete. Restore a complete backup or start with empty volumes. Nothing was changed.

**`ops reset-password` refuses admin@example.com.** The default login's password changes only by finishing setting up. Sign in with `changeme` instead.

## Requests refused or sessions lost

**"Passdown is set up for https://…. Open it at that address, or ask the operator to set PASSDOWN_URL to …"** The page was opened at another address than `PASSDOWN_URL`: another host name, an IP address instead of a name, `http://`, or a different port. Open it at the first address, or set `PASSDOWN_URL` to the second (the one you are using) and redeploy. Behind your own proxy, `PASSDOWN_URL` is the proxy's public address.

**Signed out immediately after signing in.** Session cookies are sent only over HTTPS. Use the `https://` address, and make sure no proxy in front of Passdown serves it over plain HTTP.

**A picture won't upload.** The studio accepts JPEG, PNG and WebP up to 20 MB and 40 megapixels, and explains which limit was hit. **That picture could not be added. Try again.** with no other explanation usually means the proxy refused a body over 22 MB.

**Too many requests.** The proxy allows 300 requests a minute per client on sign-in, links and administration. Separately, sign-in allows 10 failed attempts a minute per address (**Too many failed sign-in attempts. Please wait a minute and try again.**) and 500 across the installation. If many people are refused at once, the proxy may be seeing every visitor as one address: always the case behind your own proxy, and also with Docker Desktop or rootless Docker; see [using your own proxy](install.md#using-your-own-proxy-nginx-proxy-manager). Raise `PASSDOWN_SIGN_IN_LIMIT`, `PASSDOWN_LINK_LIMIT` or `PASSDOWN_ADMIN_LIMIT` only after checking that.

## Certificates

**The browser warns that the certificate isn't trusted.** Expected: the bundled proxy makes its own certificate. Continue past the warning, trust the local authority on your computer, or put a proxy with a trusted certificate in front. See [HTTPS](install.md#https).

**The browser refuses to continue (no option to proceed).** The browser has been told to insist on a trusted certificate for that host name, usually because another site on the same name sent HSTS. Open Passdown by IP address or another name and set `PASSDOWN_URL` to match, or put a proxy with a trusted certificate in front.

**Port 8443 is already in use.** Set `PASSDOWN_PORT` to a free port and use it in `PASSDOWN_URL` too.

## Someone can't sign in

An installation administrator opens **Administration → Accounts** (`/admin/accounts`), chooses **Create reset link…** for the account, and passes the link on privately. It works once, for 24 hours, and signs the account out everywhere when used. A used, expired or replaced link shows **This reset link is no longer valid.**

If no administrator can sign in:

```bash
docker compose run --rm -T ops reset-password --email person@example.org
```

It prints the link alone on standard output and its expiry on standard error. To make someone an administrator, run `ops admin grant person@example.org`; `ops admin list` shows them all. The last administrator can't be revoked: **That is the last installation administrator. Grant someone else first.**

## Tracing an error someone reports

A page that fails to load says **If this keeps happening, give the operator of this installation this reference:** followed by a code. When a studio action fails on the server's side (saving or publishing a guide, the things, catalog and people tables, uploading a picture, your account, administration, or Finish setting up), the message ends with **Reference:** and eight characters, such as `7f3a2c1b`. Find it in the log:

```bash
docker compose logs web | grep 'REFERENCE'
```

The matching `render.failed` or `request.failed` line has the time, the route pattern, and the error's name, code and message. A studio reference is the start of the full request ID the line records, so the short form finds it. Messages about something the person can fix themselves, such as a missing field, a permission or a newer draft, don't show a reference and aren't logged. Every API response also carries its request ID in the `X-Request-ID` header.

## Disk filling up

Check with `docker system df -v`. The `database` and `media` volumes grow with your content, and Passdown doesn't remove unused pictures yet. Container logs rotate at 10 MB, keeping five files per service. Backups written by `backup.sh` stay on the host until you move them. Never free space with `docker compose down -v` or `docker volume prune`: they delete your data.

## Migrations fail

`migrate` and `upgrade.sh` stop on the first problem. The migration that failed is rolled back; migrations before it in the same run stay applied.

**After Update the stack or `docker compose up -d`, the site says the upgrade failed.** The new version's migrations failed, so Compose didn't start the new web. The old web was already stopped: Compose replaces it before migrations run. You'll see:

- Update the stack reports `service "migrate" didn't complete successfully: exit 1`, and so does `docker compose up -d`.
- `docker compose ps --all` shows `migrate` as `Exited (1)` and `web` as `Created` (never started); `postgres` and `proxy` keep running.
- `docker compose logs migrate` ends with the failed migration and what to do next.
- `/api/health` answers `503` with `upgrade-failed` or `upgrade-incomplete`, and every page shows the same explanation.

With **No data was changed** (`upgrade-failed`), put the previous version back in the compose file and redeploy: the previous version starts with your data. With **Some of the new version's database changes were applied** (`upgrade-incomplete`), changing the version back isn't enough: fix the cause and redeploy the new version, or restore the backup made before upgrading with the previous version. Report the problem with the log either way. `upgrade.sh` avoids the outage by migrating first.

The notice is cleared the next time `migrate` succeeds. Versions from before the notice existed don't clear it, but their proxy doesn't show it either.

- `Applied migration changed: NAME`: the images don't match the migrations recorded in the database. Use the images of the release this database was last upgraded with.
- `Migration NAME failed and was rolled back: PostgreSQL error CODE`: that migration changed nothing. If earlier migrations were applied in the same run, the log's last line says so. Keep the log and report the problem.
- `Migration NAME could not be confirmed: …`: check `ops status` before retrying.
- From `upgrade.sh`: **Migrations failed; the site is still running the previous version.** Nothing else was changed, and `upgrade.log` records the attempt.

## Migrate exits with code 4

`Runtime role check failed: PROBLEM.` The restricted database role web uses has more rights than it should, or its password doesn't match. For `password`, run `docker compose run --rm -T ops runtime-password`, then `docker compose up -d --force-recreate web`. For other problems, the role was changed outside Passdown; restore it from a backup or ask for help with the exact message.

## Operator command exit codes

`ops` commands exit 0 on success, 1 when the operation failed, 2 for a usage error, 3 for a configuration error and 4 when the operation was refused. Results go to standard output; progress and errors go to standard error. `ops help` lists the commands.
