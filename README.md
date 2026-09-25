# Passdown

**Practical knowledge, ready to pass on.**

Passdown is open-source software for step-by-step guides. Document a repair, teach a process, or keep your team's procedures in one place, with clear instructions, annotated photos and a reusable catalog of tools, materials and parts. One installation holds a **public library** and a **members-only library**, written with the same editor.

[Install](#install) · [Documentation](docs/README.md) · [Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md) · [Contribute](CONTRIBUTING.md)

> **Open Alpha (0.1.0-alpha.1):** install it on your own server and try it with your team. It runs on one server, sends no email, and will change between versions. Keep backups, and read [what this alpha does not do](docs/self-hosting/install.md#what-this-alpha-does-not-do) before inviting people.

## What you can do

- **Write visual instructions:** steps with rich text, lists, tables, links and information or warning panels.
- **Show the details:** step photos with captions, numbered markers and arrows, and a cover for each guide.
- **Organise your knowledge:** a nested tree of the things your guides describe, browsing by picture, and search as you type.
- **Reuse tools and materials:** catalog items with exact specifications, quantities, and what each step needs or uses up.
- **Publish deliberately:** drafts, preview and fixed releases; editing a draft never changes what readers see until you publish again.
- **Work with a team:** invitation links, view or manage access, and internal procedures beside public guides.
- **Take a guide back:** withdraw a published guide so readers see a short notice, then reinstate it or publish a new version.
- **Recover accounts without email:** administrators create single-use reset links, and everyone can change their own password.

Saves are manual. Open signup, email, self-service password recovery, non-image attachments, approvals and collaborative editing aren't available yet; see the [roadmap](ROADMAP.md).

## Install

Passdown runs from one Docker Compose file on any Linux server with Docker (amd64 is tested, arm64 is expected to work).

1. Save [`compose.yaml`](docs/self-hosting/install.md#the-compose-file) in an empty folder.
2. Set `PASSDOWN_URL` to the address people will use, for example `https://192.168.1.20:8443`, and run `docker compose up -d`. Tools that deploy compose files, such as Portainer, take the same file.
3. Open that address. Your browser warns about the certificate the first time, because Passdown makes its own.
4. Sign in with `admin@example.com` and `changeme`, then choose your own name, email address, password and first workspace. The default login then stops working.

To upgrade, change the version in the file and redeploy. The [installation guide](docs/self-hosting/install.md) covers every step, including a trusted certificate through your own proxy (such as Nginx Proxy Manager), backups and operator commands.

## Develop

To run Passdown from source on your own computer with sample guides, follow [running Passdown locally](docs/getting-started.md). [Contributing](CONTRIBUTING.md) explains the project's structure, checks and commit conventions.

## Contributing

Bug reports, documentation, accessibility feedback, design improvements and code are welcome. Start with [Contributing](CONTRIBUTING.md), or [open an issue](https://github.com/nanwer/passdown/issues) describing the problem you want to solve. Report security problems privately as described in the [security policy](SECURITY.md).

You can support development through [GitHub Sponsors](https://github.com/sponsors/nanwer).

## License

Passdown's source code is licensed under **AGPL-3.0-only**; see [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). Guide content is licensed separately: authors choose its license when they publish.
