# Passdown roadmap

Passdown exists so practical knowledge stays useful when it reaches the next person. We are building a shared foundation for public community guides and private team procedures: clear instructions, reusable resources and a dependable record of what was published.

This roadmap describes direction, not a delivery schedule. Priorities can change as people use the app and contribute feedback. An item here is not a claim that the feature already works.

## Available now

- Local sign-in and persistent public/private workspaces, with owner authoring and server-enforced access.
- Visual step editing with formatted text, tables, links, quotes and contextual panels.
- Nested guide, tool and material categories, shared by management, authoring and browsing.
- Reusable tool, material and replacement-part catalogs with exact specifications and versioned details.
- Guide preparation lists, step requirements, consumption/reuse distinctions and dependencies on earlier steps.
- Manual draft saves, conflict checks and immutable publication snapshots.
- Search as you type, category browsing, responsive interfaces and light/dark themes.

The [README](README.md) explains how to run and try these features. Current authoring is owner-only; publishing is direct, without an approval workflow.

## Next: complete the authoring experience

### Photos and attachments

Add images and documents to steps, with captions, alternative text, ordering and reusable asset selection. Include upload progress, processing failures, recovery, viewing and downloading. Asset permissions and published versions must stay consistent with the guides that use them.

### Connected instructions

Reference other guides as prerequisites while keeping track of the exact published version and checking access. Make missing, withdrawn or changed references understandable to authors and readers.

### Editing and recovery

Improve session-expiry recovery, unsaved-work protection and concurrent-edit handling. Extend practical editor controls where they help authors, including richer table operations and faster content insertion. Continue testing keyboard use and narrow-screen editing throughout.

## Later: make knowledge a shared practice

### Community participation

Allow contributors to suggest improvements, discuss instructions and help maintain public guides. Add review, moderation and clear attribution so communities can grow without losing trust in published information.

### Team administration and approvals

Add invitations, account recovery, workspace management and role administration. Build review and approval workflows for teams that need controlled publication, with history and restoration tools for authorized users.

### Richer ways to follow a guide

Explore image zoom and annotations, clearer progress through long procedures and additional ways to find related knowledge. Expand language support and accessibility coverage as the reader evolves.

## Before production use

Develop and verify deployment instructions, backup and restore procedures, migration recovery, background processing, observability and operational security. Finish the account and email workflows required outside local development.

Local persistence and automated tests are working foundations. Supported production operation still needs this additional work.

## Principles that carry through

- Keep public and private guides on one content model and renderer.
- Reuse categories, tools and materials as real shared records.
- Preserve what a reader relied on: editing a draft or catalog entry must not rewrite a published release.
- Make ordinary interactions intuitive, accessible and recoverable.
- Prefer complete, testable user journeys over controls that only look finished.

Have a concrete need or want to contribute? Describe the workflow and the problem it would solve, then see [Contributing](CONTRIBUTING.md).
