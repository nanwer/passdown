# Configuration reference

Passdown's container installation is configured by one private settings file, normally `.env` beside `compose.yaml`. `init.sh` creates it. Change it only as described here, keep it at mode 0600, and keep a copy in your password manager.

After editing the settings file, apply the change by recreating the affected service, for example `docker compose up -d --force-recreate proxy`. Don't export these variables in your shell: Compose would let them override the file, while `upgrade.sh` and setup-code renewal deliberately ignore them, so the installation would behave differently depending on how it was started.

## `init.sh` options

| Option                        | Purpose                                                                                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `--domain HOST`               | Required. The host name people will open, without `https://`, port or path. `localhost` is for evaluation on your own computer.                 |
| `--acme-email EMAIL`          | Caddy: the certificate authority's contact address. Required for a public domain unless `--internal-tls` is given.                              |
| `--internal-tls`              | Caddy: use a certificate from Caddy's own authority, which browsers don't trust. Automatic for `localhost`.                                     |
| `--proxy caddy\|nginx`        | The HTTPS proxy. Caddy is the default. See [using nginx](nginx.md).                                                                             |
| `--tls-dir DIR`               | nginx: the folder holding `fullchain.pem` and `privkey.pem`. Required with `--proxy nginx`.                                                     |
| `--http-port`, `--https-port` | The host ports to publish, 80 and 443 by default. Public certificates and the HTTP redirect need the defaults.                                  |
| `--output FILE`               | The settings file to write: `.env` (default), `.env.NAME` or `NAME.env`. Pass the same `--output` to renewal, and `--env-file FILE` to Compose. |
| `--project NAME`              | A readable Compose project name. Without it, the name is derived from the settings file's path, so different directories never share data.      |
| `--build`                     | Use images built from this source checkout instead of published images.                                                                         |
| `--renew-setup-code`          | Replace a lost setup code before setup is complete. Accepts only `--output`.                                                                    |

`init.sh` exits 0 on success; 1 when something failed or the settings file already exists (it never overwrites one); 2 for invalid options; 3 for missing prerequisites, such as certificate files; and 4 when it refuses to reuse an existing installation's Docker data, or to renew a code after setup is complete.

## Settings file

| Variable                                                                | Written by `init.sh`          | Used by                | Secret  | Purpose                                                                                                                                                               |
| ----------------------------------------------------------------------- | ----------------------------- | ---------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMPOSE_PROJECT_NAME`                                                  | always                        | Compose                | no      | Identifies this installation's containers and volumes. Never change it for an existing installation.                                                                  |
| `COMPOSE_FILE`                                                          | always                        | Compose                | no      | The Compose files, in order: `compose.yaml`, then `compose.build.yaml` for source builds, then `compose.nginx.yaml` (and `compose.nginx.build.yaml`) for nginx.       |
| `PASSDOWN_PROXY`                                                        | always                        | `upgrade.sh`           | no      | `caddy` or `nginx`; must match `COMPOSE_FILE`.                                                                                                                        |
| `PASSDOWN_DOMAIN`                                                       | always                        | proxy                  | no      | The host name.                                                                                                                                                        |
| `BETTER_AUTH_URL`                                                       | always                        | web, migrate, ops      | no      | The public origin, `https://HOST` with `:PORT` when the HTTPS port isn't 443. Sign-in only accepts requests from this origin.                                         |
| `PASSDOWN_TLS`                                                          | always                        | proxy                  | no      | Caddy: the ACME email address or `internal`. nginx: `files`.                                                                                                          |
| `PASSDOWN_TLS_DIR`                                                      | nginx                         | proxy                  | the key | Absolute path of the certificate folder, mounted read-only.                                                                                                           |
| `PASSDOWN_HSTS_MAX_AGE`                                                 | always                        | proxy                  | no      | Seconds browsers must keep using HTTPS: 31536000 (one year), or 0 for `localhost`.                                                                                    |
| `PASSDOWN_HTTP_PORT`, `PASSDOWN_HTTPS_PORT`                             | always                        | proxy                  | no      | Published host ports.                                                                                                                                                 |
| `GUIDE_DB_OWNER_PASSWORD`                                               | always                        | postgres, migrate, ops | **yes** | The database owner's password. Never given to web.                                                                                                                    |
| `GUIDE_DB_RUNTIME_PASSWORD`                                             | always                        | web, migrate, ops      | **yes** | The restricted role web connects as. To change it, see [secrets](install.md#secrets).                                                                                 |
| `BETTER_AUTH_SECRET`                                                    | always                        | web                    | **yes** | Signs session cookies; at least 32 characters. Changing it signs everyone out.                                                                                        |
| `PASSDOWN_SETUP_CODE_SHA256`                                            | always                        | web                    | no      | The SHA-256 hash of the setup code; the code itself is never stored. Unused once setup is complete.                                                                   |
| `PASSDOWN_IMAGE`, `PASSDOWN_PROXY_IMAGE`                                | source builds                 | Compose                | no      | Image references. Without them, the release images named in `compose.yaml` are used. `upgrade.sh --image` updates them.                                               |
| `PASSDOWN_SIGN_IN_LIMIT`, `PASSDOWN_LINK_LIMIT`, `PASSDOWN_ADMIN_LIMIT` | no; add them to change limits | proxy                  | no      | Requests per minute per client for sign-in, setup/invitation/reset links, and administration. Default 300 each.                                                       |
| `PASSDOWN_SOURCE_URL`                                                   | no                            | web                    | no      | Where each page's **Source code** link points. Set it to your own repository if you run a modified copy. Default: the exact Passdown commit the image was built from. |

When a required variable is missing, Compose stops with `required variable … is missing a value` and the hint `Run init.sh`. Web explains other problems in its log and on every page; see [troubleshooting](troubleshooting.md).

## Secret files

Instead of a value, web and the operator command accept a file holding it: `GUIDE_DB_OWNER_PASSWORD_FILE` and `GUIDE_DB_RUNTIME_PASSWORD_FILE` build `GUIDE_OWNER_DATABASE_URL` and `GUIDE_DATABASE_URL` for the database at `PASSDOWN_DATABASE_HOST` (default `postgres`), `BETTER_AUTH_SECRET_FILE` supplies `BETTER_AUTH_SECRET`, and `PASSDOWN_URL` supplies `BETTER_AUTH_URL`. A file setting can't be combined with the value it produces.

## Set by Compose or the image

Operators don't set these. They are listed so you recognise them in `docker compose config` output:

- `GUIDE_DATABASE_URL` and `GUIDE_OWNER_DATABASE_URL`: connection strings Compose builds from the passwords above, always `postgresql://ROLE:PASSWORD@postgres:5432/guide_app` without options.
- `GUIDE_MEDIA_ROOT`: `/var/lib/passdown/media`, the picture volume.
- `NODE_ENV`, `NEXT_TELEMETRY_DISABLED`, `HOSTNAME`, `PORT`: set in the image.
- `PASSDOWN_REVISION`, `PASSDOWN_VERSION`: build arguments recording the commit and version an image was built from. `upgrade.sh --build` sets the revision from your checkout.
- `GUIDE_NEXT_OUTPUT`, `GUIDE_NEXT_DIST_DIR`: build settings; the image build uses the first to produce a self-contained application, and test builds use the second.

## Local development only

These apply to `pnpm dev` and are ignored by, or unavailable in, the container installation: `GUIDE_DEMO_PREVIEW` (sample identities; production builds refuse it), `GUIDE_LOCAL_OWNER_EMAIL` and `GUIDE_LOCAL_OWNER_PASSWORD`. See [getting started](../getting-started.md).
