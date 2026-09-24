# Install and run Passdown locally

This guide sets up Passdown for evaluation and development on your own machine. Docker runs the database, while Node.js runs the web application. It is not a production deployment guide.

## 1. Prepare your machine

Install Git, Node.js **22.22.2**, and Docker with the Compose plugin. Start Docker before continuing. The commands below use a Unix-style shell, such as macOS, Linux, or WSL; native Windows setup has not been verified.

If you already use nvm, run `nvm install` and `nvm use` from the cloned repository to select the version in `.nvmrc`.

With Node.js available, install the pinned package manager if you do not already have it:

```sh
npm install --global pnpm@10.33.0
```

Check your tools:

```sh
node --version
pnpm --version
docker compose version
docker info
```

The first two should report `v22.22.2` and `10.33.0`. The Docker commands should complete successfully. Allow ports **3100** for the app and **55439** for the local database to remain available.

## 2. Download and install

```sh
git clone https://github.com/nanwer/passdown.git
cd passdown
pnpm install --frozen-lockfile
```

Run the remaining commands from this repository directory. The first installation needs internet access to download dependencies and the database image.

## 3. Set up the database and your login

```sh
pnpm local:setup
```

Setup:

- Generates local database and authentication credentials.
- Starts PostgreSQL in Docker and applies the database migrations.
- Creates a local owner account, sample workspaces, and example guides.
- Writes your login to `LOCAL_ACCESS.md` at the repository root.

Open that file locally to find your email and password. Keep it private, along with `.env.local` and `apps/web/.env.local`; all three are ignored by Git. No manual environment-file editing is needed for this setup.

You can rerun `pnpm local:setup` after an interrupted setup. It preserves existing accounts, credentials, and guides. Do not delete the environment files to reset a login: the database retains its existing credentials.

## 4. Start Passdown

```sh
pnpm dev
```

Leave this terminal running and open:

| Page                      | Address                            |
| ------------------------- | ---------------------------------- |
| Guide library             | <http://127.0.0.1:3100>            |
| Sign in and author guides | <http://127.0.0.1:3100/studio>     |
| Application health        | <http://127.0.0.1:3100/api/health> |

Use the exact `127.0.0.1:3100` address so it matches the generated authentication origin.

Local setup includes **Repair collective** for public examples and **Workshop operations** for private examples. Your generated owner account can access both. These sample workspaces exist for development and testing; creating additional workspaces through the interface is not supported.

For a short authoring walkthrough, see [Try your first guide](../README.md#try-your-first-guide).

## Stop and return later

To stop the web app, press **Ctrl+C** in its terminal. To also stop the database:

```sh
pnpm local:down
```

To return later:

```sh
pnpm local:up
pnpm dev
```

Normal shutdown preserves the database's named Docker volume. Removing that volume deletes the database. Uploaded pictures are stored separately under `apps/web/.media` by default; deleting that directory removes the picture files. A custom `GUIDE_MEDIA_ROOT` changes the media location.

The app and database bind to loopback addresses. This setup does not expose a service for other machines to use.

## Update an existing checkout

Save your work, stop the web app, and back up any local data you need before updating. Keep the database volume and environment files.

With a clean checkout:

```sh
git pull --ff-only
pnpm install --frozen-lockfile
pnpm local:up
pnpm dev
```

`pnpm dev` applies pending local migrations before starting the app. Applied migrations are checksummed: never edit an applied migration or delete its history entry to bypass an error. See [database operations](development/db-operations.md) for storage and migration details.

If Git reports local changes or divergent history, resolve those before updating; do not discard your work to force these commands through.

## Optional showcase library

The standard setup already includes sample guides. For a larger furniture assembly, repair, and production example, the repository also provides a showcase seed.

> **Destructive:** This replaces local guide content, categories, catalog entries, and other workspace records, including pending invitations. It retains accounts, workspaces, memberships, and guide types. Use it only in a disposable local installation with no content you need to keep.

After completing local setup, keep `pnpm dev` running in one terminal. In a second terminal, from the repository root:

```sh
pnpm seed:showcase
```

The script requires the local `guide_app` database and uses the running app's API to create and publish its examples. Some examples download photographs; if a download fails, the script uses a generated illustration. This command is optional and is not part of normal installation or updating.

## Troubleshooting

| Symptom                                             | What to check                                                                                                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm` is not found                                 | Install the pinned pnpm version in step 1, then open a new terminal if needed.                                                                                                                           |
| Docker cannot connect, or PostgreSQL does not start | Start Docker, confirm `docker info` succeeds, and rerun `pnpm local:setup`. Check that port 55439 is available.                                                                                          |
| “Local database is not configured”                  | Run `pnpm local:setup` from the repository root before `pnpm dev`.                                                                                                                                       |
| Port 3100 is already in use                         | Stop the other app or an older Passdown development server, then start again.                                                                                                                            |
| The app reports an unavailable database             | Run `pnpm local:up`, inspect the development terminal, and open `/api/health`. Restart `pnpm dev` to apply pending migrations.                                                                           |
| The schema does not match this build                | Confirm your checkout and dependencies are up to date. Run `pnpm local:migrate` and restart the app. If a checksum error remains, restore the original applied migration instead of clearing its record. |
| Sign-in does not work                               | Use `http://127.0.0.1:3100/studio` and the credentials in `LOCAL_ACCESS.md`. Check the terminal for database or schema errors. Account recovery is not implemented.                                      |

When reporting a problem, include the command, error message, and tool versions. Remove passwords, connection strings, cookies, and private content from any logs you share.

## Build and test

To check the project and build the app:

```sh
pnpm check
pnpm build
```

To try the compiled app locally, stop the development server first, keep PostgreSQL running, and run `pnpm start`. It uses the same port, 3100. A successful build is not a production deployment setup.

See [Contributing](../CONTRIBUTING.md#validate-the-behavior) for the database and browser test commands, their isolated test databases, and required browser installation.

## First-run browser setup and production status

Local setup still creates development accounts and examples. A configured, migrated database with no accounts instead opens **Set up Passdown** on every page. Startup no longer generates or logs an administrator password.

For this development stage, the operator supplies `PASSDOWN_SETUP_CODE_SHA256` to the web process: the 64-character hexadecimal SHA-256 of a secret setup code. Keep only the hash in environment settings. The browser accepts spaces and hyphens, ignores case, and treats I/L as 1 and O as 0. Hash the code after this normalization. A code remains valid until setup finishes or the operator replaces the hash and restarts the web process. The installer and its code-renewal command are upcoming work.

An operator can generate a fresh 100-bit code and its hash with Node.js:

```sh
node --input-type=module -e 'import {randomBytes,createHash} from "node:crypto"; const alphabet="0123456789ABCDEFGHJKMNPQRSTVWXYZ"; const code=[...randomBytes(20)].map(n=>alphabet[n & 31]).join(""); console.log("Setup code (save privately):",code.match(/.{5}/g).join("-")); console.log("PASSDOWN_SETUP_CODE_SHA256="+createHash("sha256").update(code).digest("hex"));'
```

Run it in a private terminal, put only the hash setting into the web environment, then restart the app. The code is not recoverable from its hash. If lost before setup, generate a new one and replace the hash; the old code stops working after restart.

Open `/setup`, enter the code, your name, email, password twice, and workspace name. The password must contain 12–200 characters. Successful setup creates a verified account and public workspace together, signs you in, and opens Studio. Mixed-case email addresses work at setup and later sign-in. There is no generated password or forced password change for this account.

Only one concurrent submission can complete. After an account exists, `/setup` and setup submissions return not found, including after a database restore containing accounts. A connection failure may leave the outcome uncertain: follow the page's reload/sign-in guidance; never delete the account to repeat setup.

Production builds refuse sample guides and preview identities. Required settings are `GUIDE_DATABASE_URL`, `BETTER_AUTH_SECRET` (at least 32 characters), and `BETTER_AUTH_URL` (a bare HTTPS origin, with HTTP allowed on loopback). The database URL must use `postgresql://guide_runtime:password@host:port/database` without query parameters or fragments. Database TLS is disabled because this connection policy targets a private network; managed PostgreSQL is outside the current scope. Development connections remain loopback-only. Invalid production settings produce an installation page and a 503 `not-configured` health response. An empty configured database reports `setup-required`.

The setup account manages its workspace. The separate installation-administrator capability arrives with the later account-recovery migration and will backfill the first account. No deployment container, installer, proxy, recovery procedure, or production operations certification is delivered by this browser-setup stage. There is currently no supported production deployment recipe.
