# Passdown roadmap

Passdown helps communities share practical knowledge and teams maintain reliable procedures. Our goal is to make a guide easy to write, easy to follow, and trustworthy when someone depends on it.

This roadmap describes the next product outcomes in priority order. It is not a release schedule. Planned features are not available until they appear in the [development status](docs/development/status.md) with a testable workflow.

## Available today

Open Alpha 0.1.0-alpha.1 can be installed on one server with Docker Compose:

- Public and members-only guide libraries with search and nested things to browse.
- A visual step editor with rich text, tables, contextual panels, and annotated photographs.
- Shared things and catalog items, guide preparation lists, and per-step requirements.
- Manual draft saves, preview, and published releases that preserve their instructions and item details.
- Invitation links, view/manage permissions, and sortable management tables with server-side paging, combined filters, and column preferences.
- Browser setup for a new installation, protected by a setup code, with the first account and workspace created together.
- Installation with Docker Compose behind Caddy or nginx, verified backups, staged restore, and upgrades that keep the previous version serving until migrations succeed, with an installation guide, configuration reference and troubleshooting guide.
- Withdrawing and reinstating published guides, reset links issued by installation administrators, and changing your own password.

Photo upload progress and retry controls are already implemented. Non-image attachments, cross-guide prerequisites, self-service account recovery, approvals, and community contributions are still upcoming.

See the [README](README.md) to try the app and the [development status](docs/development/status.md) for the full inventory and current limitations.

## Next priorities

### 1. Make authoring and management dependable

**Outcome:** Authors can finish everyday work without losing edits or their place in the interface.

- Improve recovery after a session expires or a save fails, and make conflicting edits easier to resolve.
- Strengthen protection for unsaved work when navigating away or closing a tab.
- Measure and improve management performance on large libraries, including deep trees and large catalogs, while preserving filters, hierarchy and keyboard focus.
- Verify editor controls, dialogs, and tables across keyboard use, narrow screens, themes, and upload failure states.

**Ready when:** An author can recover from a failed save, return from a record to the same list context, and complete the workflow with a keyboard or on a small screen.

### 2. Attach the documents a guide needs

**Outcome:** Instructions and their supporting documents stay together.

- Attach documents such as diagrams, specifications, and reference sheets to a guide or step.
- Provide clear file information, viewing or downloading, upload progress, and recovery from failed uploads.
- Apply the guide's access rules to attachments and preserve the files referenced by a published release.

**Ready when:** An author can attach a document, publish it, and verify that permitted readers can access the correct file while other visitors cannot.

### 3. Connect guides through prerequisites

**Outcome:** Authors can reuse an existing procedure instead of copying its instructions.

- Reference another guide as a prerequisite, pinned to a specific published release.
- Check access and prevent circular dependencies.
- Explain missing or withdrawn references and let authors review newer prerequisite releases before adopting them.

**Ready when:** A reader can follow the referenced procedure, and publishing a newer version does not silently change the prerequisite they were given.

## Following those foundations

### Team review

Help teams control changes:

- Optional review and approval before publication.
- Clear revision history, comparisons, and restoration of earlier content for authorized users.

Direct publication remains useful for teams that do not need an approval process.

### Community contributions

Let readers help improve public knowledge:

- Suggested corrections and improvements.
- Discussion tied to guides and steps.
- Review queues, moderation tools, and contributor attribution.

Contribution workflows depend on a reliable review history and clear publication permissions.

### A better experience while following instructions

Help readers complete longer or more detailed procedures:

- Closer inspection of photographs and their annotations.
- Clear progress through a guide and a way to return to the current step.
- Better discovery of related instructions.
- Broader language support and accessibility coverage.

These are directional improvements; their exact scope will follow testing with readers.

## Before production use

The alpha covers installation, backups, restore, upgrades and a focused security review. Recommending Passdown for unattended production use also needs:

- Monitoring and alerting beyond the health endpoint and logs.
- Storage lifecycle management: removing unused pictures and scheduling backups.
- A full external security audit, including a Content Security Policy.
- Tools for erasing a person's data and handling requests about it.

**Ready when:** An operator can run an installation for months with documented monitoring, storage housekeeping and data-request procedures, after an independent security audit.

## Scope and contribution

Passdown is designed around one workspace per installation, with public and internal libraries sharing the same authoring tools. Creating multiple independent workspaces through the product is outside the current scope.

Across every milestone, we will preserve published content, reuse shared records and controls, and test complete user journeys. Accessibility and permission checks are part of delivery, not separate finishing work.

Have a workflow this roadmap does not address? [Open an issue](https://github.com/nanwer/passdown/issues) describing who needs it and what they need to accomplish. See [Contributing](CONTRIBUTING.md) before starting a substantial change.
