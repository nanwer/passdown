# Passdown roadmap

Passdown exists so practical knowledge stays useful when it reaches the next person. We are building a shared foundation for public community guides and private team procedures: clear instructions, reusable resources and a dependable record of what was published.

This roadmap describes direction, not a delivery schedule. Priorities can change as people use the app and contribute feedback. An item here is not a claim that the feature already works.

## Available now

- Local sign-in and persistent public/private workspaces, with owner authoring and server-enforced access.
- Visual step editing with formatted text, tables, links, quotes and contextual panels.
- One nested tree of the things guides are about, each able to carry a picture, browsable as a gallery and shared by management, authoring and reading. Adding one happens from inside the thing it belongs to, and asks only for a name.
- Reusable tool, material and replacement-part catalogs with exact specifications and versioned details.
- Guide preparation lists, step requirements, consumption/reuse distinctions and dependencies on earlier steps.
- Manual draft saves, conflict checks and immutable publication snapshots.
- Step photographs with numbered marks and arrows drawn onto them, captions and ordering, reuse of a picture across steps, and delivery at the size a screen needs. Re-encoded on upload so camera metadata does not travel with them, and readable only through a guide the reader may already open.
- Guide families: a broader guide above its models, with a trail up and a list down, where a relative the reader cannot open is absent rather than withheld.
- Moving a published guide between a workspace's public and internal sections, refused with reasons when it would expose something that is not itself public.
- Search as you type, browsing by picture, a bounded library that pages rather than loading everything, responsive interfaces and light/dark themes.

The [README](README.md) explains how to run and try these features. Current authoring is owner-only; publishing is direct, without an approval workflow.

## Next: complete the authoring experience

### Attachments, and the rest of uploading

Pictures are done: alternative text, captions, ordering, marks and arrows, reuse across steps, and a size suited to the screen. What is left of uploading is the part that shows while it happens — progress on a slow connection, and a clear path back from a file that was refused or failed midway.

Then non-image attachments: documents a guide needs, with viewing and downloading.

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

Explore image zoom, clearer progress through long procedures and additional ways to find related knowledge. Expand language support and accessibility coverage as the reader evolves.

## Before production use

Develop and verify deployment instructions, backup and restore procedures, migration recovery, background processing, observability and operational security. Finish the account and email workflows required outside local development.

Local persistence and automated tests are working foundations. Supported production operation still needs this additional work.

## Principles that carry through

- Keep public and private guides on one content model and renderer.
- Reuse things, tools and materials as real shared records.
- Preserve what a reader relied on: editing a draft or catalog entry must not rewrite a published release.
- Make ordinary interactions intuitive, accessible and recoverable.
- Prefer complete, testable user journeys over controls that only look finished.

Have a concrete need or want to contribute? Describe the workflow and the problem it would solve, then see [Contributing](CONTRIBUTING.md).
