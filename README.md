# Passdown

**Practical knowledge, ready to pass on.**

Passdown is open-source software for creating and sharing step-by-step guides. Use it to document a repair, teach a process, or keep a team's procedures in one place—with clear instructions, annotated photos, and a reusable catalog of tools, materials, and parts.

An installation brings together a **public library** and a **members-only library**. Authors use the same editor for both, and readers see the guides they have access to.

[Install with Docker](#install-with-docker) · [Run locally](#run-locally) · [Self-hosting guide](docs/self-hosting/install.md) · [Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md) · [Contribute](CONTRIBUTING.md)

> **Open Alpha (0.1.0-alpha.1):** you can install Passdown on your own server and try it with your team. It is alpha software: it runs on one server, sends no email, and will change between versions. Keep backups, and read [what this alpha does not do](docs/self-hosting/install.md#what-this-alpha-does-not-do) before inviting people.

## What you can do

- **Write visual instructions.** Build and reorder steps with rich text, headings, lists, tables, links, quotes, and information or warning panels.
- **Show the details.** Add step photos, captions, numbered markers and arrows. Reuse pictures and choose a cover for each guide.
- **Organize your knowledge.** Create a nested tree of the things your guides describe, browse by picture, and find guides with search as you type.
- **Reuse tools and materials.** Select catalog items with exact specifications, set quantities, and identify what each step needs or consumes.
- **Separate editing from publishing.** Save drafts, preview the reader, and publish a fixed release. Later draft edits do not replace the published instructions until you publish again.
- **Work with a team.** Share invitation links and assign view or manage access. Keep internal procedures alongside public guides.
- **Take a guide back.** Withdraw a published guide so readers see a short notice instead of its instructions, then reinstate it or publish a new version.
- **Recover accounts without email.** Installation administrators create single-use reset links for people who can't sign in, and everyone can change their own password under **Your account**.
- **Set up in the browser.** A new installation asks for the one-time setup code printed during installation, then creates your account and workspace.

Saves are manual. Open signup, email delivery, self-service password recovery, non-image attachments, approval workflows, and collaborative editing are not available yet. See the [development status](docs/development/status.md) for the detailed feature inventory and the [roadmap](ROADMAP.md) for upcoming work.

## Install with Docker

Passdown runs on a Linux server with Docker Compose. Linux amd64 is tested; arm64 is expected to work. In short:

1. Download `compose.yaml`, `init.sh`, `upgrade.sh`, `backup.sh` and `SHA256SUMS` from the [latest release](https://github.com/nanwer/passdown/releases) into an empty directory, and check them with `sha256sum --check SHA256SUMS`.
2. Create your private settings, which also prints a one-time setup code: `sh init.sh --domain guides.example.org --acme-email you@example.org`
3. Start Passdown: `docker compose up -d`
4. Open `https://guides.example.org/setup`, enter the setup code, and create your account and workspace.

HTTPS comes from Caddy, which obtains certificates automatically, or from nginx with certificates you provide. Backups, restore and upgrades have their own commands. The [self-hosting guide](docs/self-hosting/install.md) covers every step, and the [configuration reference](docs/self-hosting/configuration.md) and [troubleshooting guide](docs/self-hosting/troubleshooting.md) cover the details. Until the release's images are published, the guide's [building from source](docs/self-hosting/install.md#building-from-source) section installs the same way from this repository.

## Run locally

### Requirements

- **Node.js 22.22.2** — the development version recorded in `.nvmrc`.
- **pnpm 10.33.0** — the version pinned in `package.json`.
- **Docker with Docker Compose**, running before setup.
- **Git** to clone the repository.

Docker runs PostgreSQL; the web app runs on your machine. You do not need to install PostgreSQL separately.

### Install and start

```sh
git clone https://github.com/nanwer/passdown.git
cd passdown
pnpm install --frozen-lockfile
pnpm local:setup
pnpm dev
```

Open **[http://127.0.0.1:3100](http://127.0.0.1:3100)**. To create or edit guides, open **[Studio](http://127.0.0.1:3100/studio)** and sign in with the generated credentials in **`LOCAL_ACCESS.md`** at the repository root.

Setup creates the local database, applies migrations, and adds an owner account and sample guides. It generates a unique password; there is no shared default login. Repeating setup preserves existing guides and credentials.

Need help installing the prerequisites, restarting the app, or resolving a setup error? Follow the [installation guide](docs/getting-started.md).

### Try your first guide

1. Sign in to Studio and open the sample public workspace, **Repair collective**.
2. Create a guide, choose what it describes, and select its kind of work.
3. Add instructions and a photo to a step. Choose a tool or material from the catalog and assign it to that step.
4. Save the draft, preview it, and publish with a content license.
5. Open the published guide. Edit and save its draft again—the reader should continue showing the previous release until you republish.

Local setup includes a second sample workspace for trying private content. These are development examples; the product is designed for one workspace per installation with public and internal libraries.

A larger, optional example library is available. Read the [showcase instructions](docs/getting-started.md#optional-showcase-library) before running it: **it replaces existing local content**.

## Development

```sh
pnpm check
pnpm build
```

`pnpm check` validates design tokens, migration manifests, package boundaries, formatting, types, and unit tests. Database and browser suites are described in [Contributing](CONTRIBUTING.md#validate-the-behavior). The [manual test checklist](docs/development/manual-test-checklist.md) covers user journeys.

### Project structure

| Location                 | Responsibility                                        |
| ------------------------ | ----------------------------------------------------- |
| `apps/web`               | Web application, routes, and authoring interface      |
| `packages/guide-content` | Versioned guide documents and content transformations |
| `packages/core`          | Access policy and scoped reads                        |
| `packages/contracts`     | API schemas and shared contracts                      |
| `packages/database`      | Persistence, migrations, and identity                 |
| `packages/design-tokens` | Shared design tokens and themes                       |
| `packages/ui`            | Reusable interface controls                           |
| `packages/guide-ui`      | Guide cards and reader components                     |
| `packages/testing`       | Synthetic fixtures for isolated tests                 |

## Contributing

Bug reports, documentation, accessibility feedback, design improvements, and code contributions are welcome. Start with [Contributing](CONTRIBUTING.md), check the [roadmap](ROADMAP.md), or [open an issue](https://github.com/nanwer/passdown/issues) describing the problem you want to solve. Report security problems privately as described in the [security policy](SECURITY.md), not in a public issue.

You can support ongoing development through [GitHub Sponsors](https://github.com/sponsors/nanwer).

## License

Passdown's source code is licensed under **AGPL-3.0-only**. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).

Guide content is licensed separately: authors choose its license when publishing.
