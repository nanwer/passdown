# Passdown

**Keep practical knowledge. Pass it to the next person.**

Knowing how to do something is useful. Leaving clear instructions so someone else can do it is even better. Passdown turns that knowledge into structured, step-by-step guides that people can find, follow and improve.

Build a public library for a repair community, or keep procedures inside a private team workspace. Both use the same editor, content model and reader.

Passdown is in active development. Persistent authoring, publication, categories, shared tool/material catalogs and step photographs work locally. Community contribution workflows and production deployment support are still ahead.

## What works today

| Capability                        | What you can do                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public and private libraries      | Publish community guides or member-only team procedures, with access enforced on the server.                                                                                                                                                                                                                                                                                                                              |
| Visual step editor                | Write formatted instructions with headings, lists, links, quotes, tables and information, warning, error, success, note and decision panels. Add, duplicate and reorder steps; preview the reader before publishing.                                                                                                                                                                                                      |
| Nested categories                 | Create and manage category trees, including product/model branches. Browse subcategories, follow breadcrumbs and find guides throughout a parent category.                                                                                                                                                                                                                                                                |
| Shared catalogs                   | Reuse tools, consumable materials and replacement parts with exact specifications, units and manufacturer identifiers. Search or create items while writing a guide.                                                                                                                                                                                                                                                      |
| Preparation and step requirements | Set guide quantities, optional items and notes, then identify what each step needs. Distinguish new consumption from reuse and add prerequisites or dependencies on earlier steps.                                                                                                                                                                                                                                        |
| Explicit saves and publication    | Save drafts manually with version checks. Published content is a fixed snapshot; later draft or catalog edits do not silently change it.                                                                                                                                                                                                                                                                                  |
| Everyday navigation               | Search as you type, combine search with categories, use light or dark themes and navigate with a keyboard on responsive layouts.                                                                                                                                                                                                                                                                                          |
| Step photographs                  | Add pictures to a step and point at what matters: numbered marks and arrows, placed with a pointer or the arrow keys, each labelled and repeated as a list so the labels reach a reader who cannot see the overlay. Every upload is decoded and re-encoded, which removes camera metadata including location, and is stored outside the web root. A picture is readable only through a guide the reader may already open. |
| Guide families                    | Place a guide beneath a broader one — a product range above its models. Readers step up to the general guide or down to their exact version. A relative they cannot read is absent rather than withheld.                                                                                                                                                                                                                  |
| Public and internal sections      | Move a published guide between the two sections of a workspace. Going public is refused, with reasons, when the guide depends on a members-only category or catalog item.                                                                                                                                                                                                                                                 |

Current authoring requires a workspace owner account. Public signup, invitations, role-management screens, approval workflows and collaborative editing are not implemented yet. Saves are manual; there is no autosave. Photographs are supported, including marks and arrows drawn onto them. Captions, reordering, reuse of an image already uploaded and non-image attachments are not.

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

1. In the studio, choose a workspace and create a guide. Select an existing category or create one in the picker.
2. Add preparation items from the catalog, write a few steps and assign items or prerequisites to the steps that need them.
3. Save, preview and publish with an explicit content license. Edit and save the draft again: the reader keeps showing the published version until you publish a new one.

The setup includes original sample guides. The separate [team preview](http://127.0.0.1:3100/preview/workshop) is a read-only demonstration using synthetic data; it does not sign you into a private workspace. The [component workshop](http://127.0.0.1:3100/components) displays reusable interface components.

### Stop and restart

```sh
pnpm local:down
pnpm local:up
```

The database uses a named Docker volume and listens on `127.0.0.1:55439`. Normal shutdown preserves the data. Removing the volume deletes it. Keep `.env.local`, `apps/web/.env.local` and `LOCAL_ACCESS.md` private; setup creates them locally and Git ignores them.

The app binds to `127.0.0.1:3100`. Without database configuration, the library offers read-only samples. A configured database failure reports an error rather than replacing your data with samples. Local setup is a development workflow, not a production deployment recipe.

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

Published snapshots preserve the instructions and item details someone relied on. Shared category and catalog identities make knowledge easier to organize and reuse as the library grows.

## Where we are going

Read the [roadmap](ROADMAP.md) for upcoming media authoring, workspace administration and contribution workflows. If you would like to help, start with [Contributing](CONTRIBUTING.md).

## License

Passdown is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0-only)**. See [LICENSE](LICENSE).

Guide content has its own publication license, selected by its author. Third-party dependencies and adapted components retain their respective licenses; see [third-party notices](THIRD_PARTY_NOTICES.md).

Copyright Passdown contributors.
