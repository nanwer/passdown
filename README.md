# Passdown

**Keep practical knowledge. Pass it to the next person.**

Knowing how to do something is useful. Leaving clear instructions so someone else can do it is even better. Passdown turns that knowledge into structured, step-by-step guides that people can find, follow and improve.

Build a public library for a repair community, or keep procedures inside a private team workspace. Both use the same editor, content model and reader.

Passdown is in active development. An installation creates its own administrator on first start, invites people by link, and enforces two permissions per workspace. Persistent authoring, publication, a browsable tree of the things guides are about, a shared catalog and step photographs work. Community contribution workflows, approval routing and verified production operation are still ahead.

## What works today

| Capability                         | What you can do                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public and private libraries       | Publish community guides or member-only team procedures, with access enforced on the server. A visitor lands on the public library; somebody signed in gets a tab for each library they can read, and one they cannot open is absent rather than locked.                                                                                                                                                                                                                                                                                                          |
| Visual step editor                 | Write formatted instructions with headings, lists, links, quotes, tables and information, warning, error, success, note and decision panels. Add, duplicate and reorder steps; preview the reader before publishing.                                                                                                                                                                                                                                                                                                                                              |
| Things, and what they hold         | Build the tree of things your guides are about — a product range, a room, a production line. Add one from inside another, give it a picture, and browse it as a gallery rather than a list of folders. One tree, not one per kind of thing.                                                                                                                                                                                                                                                                                                                       |
| Shared catalog                     | Reuse tools, consumable materials and replacement parts with exact specifications, units and manufacturer identifiers. A flat, searchable list — search or create items while writing a guide. Whether a reader may see an item is a property of the item.                                                                                                                                                                                                                                                                                                        |
| Preparation and step requirements  | Set guide quantities, optional items and notes, then identify what each step needs. Distinguish new consumption from reuse and add prerequisites or dependencies on earlier steps.                                                                                                                                                                                                                                                                                                                                                                                |
| Explicit saves and publication     | Save drafts manually with version checks. Published content is a fixed snapshot; later draft or catalog edits do not silently change it.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Everyday navigation                | A library that opens on its search and its guides rather than on a headline about them, search as you type, browse things as pictures, page through a bounded library, use light or dark themes and navigate with a keyboard on responsive layouts.                                                                                                                                                                                                                                                                                                               |
| A cover for a guide                | Choose the picture that stands for a guide wherever it is listed. It is frozen into each release, so changing it on the draft does not change what people are already reading. Without one, a listing falls back to the guide's first step picture, and then to the picture of the thing it is about.                                                                                                                                                                                                                                                             |
| Step photographs                   | Add pictures to a step and point at what matters: numbered marks and arrows, placed with a pointer or the arrow keys, each labelled and repeated as a list so the labels reach a reader who cannot see the overlay. Caption them, put them in order, and use one again on another step rather than uploading it twice. Served at the size the screen needs. Every upload is decoded and re-encoded, which removes camera metadata including location, and is stored outside the web root. A picture is readable only through a guide the reader may already open. |
| Guide families                     | Place a guide beneath a broader one — a product range above its models. Readers step up to the general guide or down to their exact version. A relative they cannot read is absent rather than withheld.                                                                                                                                                                                                                                                                                                                                                          |
| Who can reach a workspace          | Invite somebody by email and choose what they may do: **view** what has been published to members, or **manage** — write, publish, and invite others. The link is shown once and passed on however you like; nothing is emailed. It works once and expires. A workspace can never be left with nobody who can manage it.                                                                                                                                                                                                                                          |
| An installation that starts itself | The first time the app starts against an empty database it creates an administrator and a workspace, prints the password to the console and writes it to a file. No default password ships, and the account can do nothing until that password is replaced.                                                                                                                                                                                                                                                                                                       |
| What kind of work a guide is       | A guide says what it is about — a thing from the tree — and what kind of work it describes: a repair, an inspection, a replacement. The title composes itself from the answers and steps aside as soon as you type over it. Which kinds a workspace offers is configurable.                                                                                                                                                                                                                                                                                       |
| Public and internal sections       | Move a published guide between the two sections of a workspace. Going public is refused, with reasons, when the guide depends on a members-only thing or catalog item.                                                                                                                                                                                                                                                                                                                                                                                            |

Open signup is deliberately off: an account exists because somebody was invited or because the installation created the first one. An installation serves one organisation and has one workspace, which carries both a public library and an internal section. Approval workflows, community contribution and collaborative editing are not implemented. Saves are manual; there is no autosave. Photographs are supported, including marks and arrows drawn onto them, captions, ordering and reuse. Non-image attachments are not. Email is not sent anywhere — invitations are links you pass on yourself.

### A library to look at

`pnpm seed:showcase` replaces the local library with a worked example drawn from
flat-pack furniture: twenty-two public assembly, repair and care guides,
twenty-two members-only production procedures, the things they are about, and
the catalog they draw on. It writes through the application's own API, so
everything in it is something you could have written by hand. It is destructive,
and it refuses to run against anything but the local `guide_app` database.

Nothing in it is branded: the workspaces keep the names your installation gave
them, and catalog items carry part numbers rather than a made-up manufacturer.
A few guides carry photographs from Wikimedia Commons, every one either CC0 or a
work of the United States government, fetched when the seed runs and cached
afterwards rather than committed here. Without a network, or while Wikimedia is
rate limiting, those guides get a drawn diagram and the seed says so.

## Run locally

You need **Node.js 22.22.2**, **pnpm 10.33.0**, and a running **Docker** installation with Docker Compose. The Node and pnpm versions are pinned in `.nvmrc` and `package.json`.

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm local:setup
pnpm dev
```

Setup starts local PostgreSQL, applies migrations and creates a local owner with sample public and private workspaces. It generates a private login in the ignored `LOCAL_ACCESS.md` file. There is no shared default password. Repeating setup preserves existing accounts, guides and credentials.

Open [Passdown](http://127.0.0.1:3100/) or go directly to the [studio](http://127.0.0.1:3100/studio) and sign in with those generated credentials.

### Try a complete guide

1. In the studio, choose a workspace and create a guide. Say what it is about — pick an existing thing, or name a new one without leaving the form.
2. Add preparation items from the catalog, write a few steps and assign items or prerequisites to the steps that need them.
3. Save, preview and publish with an explicit content license. Edit and save the draft again: the reader keeps showing the published version until you publish a new one.

The setup includes original sample guides. The separate [team preview](http://127.0.0.1:3100/preview/workshop) is a read-only demonstration using synthetic data; it does not sign you into a private workspace.

### Stop and restart

```sh
pnpm local:down
pnpm local:up
```

The database uses a named Docker volume and listens on `127.0.0.1:55439`. Normal shutdown preserves the data. Removing the volume deletes it. Keep `.env.local`, `apps/web/.env.local` and `LOCAL_ACCESS.md` private; setup creates them locally and Git ignores them.

The app binds to `127.0.0.1:3100`. Without database configuration, the library offers read-only samples. A configured database failure reports an error rather than replacing your data with samples. Local setup is a development workflow, not a production deployment recipe.

## Starting a real installation

Point the app at a migrated database and start it. The first time it comes up against a database with no users, it creates an administrator and a workspace, prints the password to its own console and writes it to a file if you name one. There is nothing to run afterwards.

| Variable                       | What it does                                                                                                                                                                                  |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PASSDOWN_ADMIN_EMAIL`         | Who to create. Defaults to `admin@passdown.local`.                                                                                                                                            |
| `PASSDOWN_ADMIN_PASSWORD`      | Set one yourself instead of being given one. Honoured, and the weaker option: an environment variable is readable from `docker inspect`, from `ps`, and from any crash dump that captures it. |
| `PASSDOWN_ADMIN_PASSWORD_FILE` | Where to also write a generated password. Written `0600`.                                                                                                                                     |
| `PASSDOWN_WORKSPACE_NAME`      | What the first workspace is called. Defaults to `Workspace`.                                                                                                                                  |

No default password ships. A widely known one is below the floor set by [CISA's Secure by Design alert](https://www.cisa.gov/resources-tools/resources/secure-design-alert-how-software-manufacturers-can-shield-customers-eliminating-default-passwords), which also rejects "force a change at first login" as sufficient on its own — so the generated password is per installation _and_ must be replaced before the account can do anything, including over the API.

The emptiness of the user table is the lock. Nothing is written to record that setup happened, so there is no flag to clear and no file that a restore could put back into a state where this runs again.

Applying migrations stays a separate, explicit step. The app refuses to serve a database it does not match and says so on `/api/health`, and it warns when it is older than the schema it is talking to rather than failing on whichever request first needs a missing column.

This is the supported way to start an installation. Backup, restore, observability and the rest of production operation are still ahead — see the [roadmap](ROADMAP.md).

## Checks and tests

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:database
pnpm test:authoring
```

| Command               | Coverage                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`          | Generated design tokens, package boundaries, TypeScript and unit/contract tests.                                    |
| `pnpm build`          | Production build. `pnpm start` runs it locally after building.                                                      |
| `pnpm test:e2e`       | Browser checks against an isolated sample-data server on port 3102.                                                 |
| `pnpm test:database`  | PostgreSQL persistence, authorization, concurrency and migration checks in the dedicated `guide_app_test` database. |
| `pnpm test:authoring` | Sign-in, editing and publication journeys on port 3101, backed by the dedicated `guide_app_e2e` database.           |

Run local setup before the database and persistent authoring suites. Those suites use separate test databases; the database suite resets its test data. Reserve those databases for tests and leave ports 3101 and 3102 available. If Google Chrome is already installed, set `PLAYWRIGHT_CHANNEL=chrome` when running either browser suite.

## Built to share a foundation

Passdown separates its document model, access policy and persistence from the web interface. Shared design tokens, reusable controls and a common guide renderer keep the public library, private workspace and authoring experience consistent.

| Directory                | Responsibility                                                                    |
| ------------------------ | --------------------------------------------------------------------------------- |
| `apps/web`               | Routes, application composition and authoring interfaces.                         |
| `packages/guide-content` | Versioned document schemas and content transformations, independent of rendering. |
| `packages/core`          | Access policy and scoped application reads.                                       |
| `packages/contracts`     | Validated request/response contracts and application errors.                      |
| `packages/database`      | Persistence, migrations and identity integration.                                 |
| `packages/design-tokens` | Shared theme and component tokens.                                                |
| `packages/ui`            | Reusable controls, dialogs and application shell.                                 |
| `packages/guide-ui`      | Shared guide cards and step rendering.                                            |
| `packages/testing`       | Synthetic fixtures for isolated development and tests.                            |

Published snapshots preserve the instructions and item details someone relied on. One shared tree of things, and one shared catalog, make knowledge easier to find and reuse as the library grows.

## Where we are going

Read the [roadmap](ROADMAP.md) for upcoming media authoring, workspace administration and contribution workflows. If you would like to help, start with [Contributing](CONTRIBUTING.md).

## License

Passdown is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0-only)**. See [LICENSE](LICENSE).

Guide content has its own publication license, selected by its author. Third-party dependencies and adapted components retain their respective licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

Copyright Passdown contributors.
