# Configuration reference

Passdown's Docker installation is one file, `compose.yaml`. It needs no settings file: the secrets are generated on first start and kept in private volumes. The few things you may change are environment variables, set either as **stack environment variables** in Portainer or in the compose file itself. On the command line you can also put them in a `.env` file beside `compose.yaml`, which Compose reads automatically (see `deploy/.env.example`).

After changing one, redeploy: **Update the stack** in Portainer, or `docker compose up -d`. Compose recreates only the services whose settings changed.

## What you may set

| Variable                                                                | Default                  | Used by       | Purpose                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PASSDOWN_URL`                                                          | `https://localhost:8443` | web, operator | The address people open, exactly: `https://`, the host name or IP address, and `:PORT` unless it is 443. No path. Sign-in accepts requests only from this address. Behind your own proxy, it is the proxy's public address, for example `https://guides.example.org`.                       |
| `PASSDOWN_PORT`                                                         | `8443`                   | proxy         | The host port the bundled proxy publishes for HTTPS. Change it if 8443 is taken; change `PASSDOWN_URL` to match when people open that port directly.                                                                                                                                        |
| `PASSDOWN_SIGN_IN_LIMIT`, `PASSDOWN_LINK_LIMIT`, `PASSDOWN_ADMIN_LIMIT` | 300 each                 | proxy         | Requests per minute per client network for sign-in, invitation/reset/setup links, and administration. They count successful requests too. Behind your own proxy every request comes from that proxy's address, so these become limits for everyone together; raise them if people hit them. |
| `PASSDOWN_SOURCE_URL`                                                   | the exact commit         | web           | Where each page's **Source code** link points. Set it to your own repository if you run a modified copy.                                                                                                                                                                                    |

Two lines near the top of `compose.yaml` name the versions: `x-passdown-image` (the application) and the proxy's `image:`. Changing them is how you upgrade; see [upgrading](install.md#upgrade).

## Secrets

The one-shot `init` service runs `passdown init-secrets` before anything else starts. It writes three random values once and never replaces them:

| File (volume)                               | Read by                | Purpose                                                      |
| ------------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| `database-owner-password` (`owner-secrets`) | postgres, migrate, ops | The database owner's password. Web never mounts this volume. |
| `database-runtime-password` (`app-secrets`) | web, migrate, ops      | The restricted database role web connects as.                |
| `session-secret` (`app-secrets`)            | web                    | Signs session cookies. Replacing it signs everyone out.      |

The owner password file is readable by the Passdown user and PostgreSQL's group only (mode 0440); the other two by the Passdown user only (0400). They are part of the installation: removing their volumes while keeping the database locks the installation out. `docker compose down -v`, or removing the stack's volumes in Portainer, deletes the database too.

Services name the files through these settings, which the image turns into the connection settings below. A file setting can't be combined with the value it produces:

- `GUIDE_DB_OWNER_PASSWORD_FILE` → `GUIDE_OWNER_DATABASE_URL`
- `GUIDE_DB_RUNTIME_PASSWORD_FILE` → `GUIDE_DATABASE_URL`
- `BETTER_AUTH_SECRET_FILE` → `BETTER_AUTH_SECRET`
- `PASSDOWN_URL` → `BETTER_AUTH_URL`

Database addresses use the host `PASSDOWN_DATABASE_HOST` (default `postgres`), port 5432 and database `guide_app`.

## Set by the compose file or the image

Operators don't set these. They are listed so you recognise them in `docker compose config` output or logs:

- `GUIDE_DATABASE_URL`, `GUIDE_OWNER_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`: built from the files above. When you run Passdown outside this compose file you may set them directly instead: `postgresql://ROLE:PASSWORD@HOST:5432/guide_app` without options, a secret of at least 32 characters, and the exact origin.
- `GUIDE_MEDIA_ROOT`: `/var/lib/passdown/media`, the picture volume.
- `NODE_ENV`, `NEXT_TELEMETRY_DISABLED`, `HOSTNAME`, `PORT`: set in the image.
- `PASSDOWN_REVISION`, `PASSDOWN_VERSION`: build arguments recording the commit and version an image was built from.
- `PASSDOWN_BUILD_TAG`: names the images `compose.build.yaml` builds from a source checkout (default `local`).
- `GUIDE_NEXT_OUTPUT`, `GUIDE_NEXT_DIST_DIR`: build settings; the image build uses the first to produce a self-contained application, and test builds use the second.

## Local development only

These apply to `pnpm dev` and are ignored by, or unavailable in, the Docker installation: `GUIDE_DEMO_PREVIEW` (sample identities; production builds refuse it), `GUIDE_DB_OWNER_PASSWORD` (the local database container's owner password in `.env.local`), `GUIDE_LOCAL_OWNER_EMAIL` and `GUIDE_LOCAL_OWNER_PASSWORD`. See [getting started](../getting-started.md).
