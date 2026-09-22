# Passdown roadmap

Passdown exists so practical knowledge stays useful when it reaches the next person. We are building a shared foundation for public community guides and private team procedures: clear instructions, reusable resources and a dependable record of what was published.

This roadmap describes direction, not a delivery schedule. Priorities can change as people use the app and contribute feedback. An item here is not a claim that the feature already works.

## Available now

- An installation that starts itself: the first run against an empty database creates an administrator and a workspace, with a password generated per installation rather than shipped, which cannot be used for anything until it is replaced.
- Two permissions per workspace — view and manage — enforced by the database rather than by the interface, and a workspace that can never be left with nobody who can manage it.
- Invitations by link: shown once, single use, expiring, and needing no mail server. A screen listing who is in a workspace and who has been asked.
- Persistent public/private workspaces with server-enforced access.
- Visual step editing with formatted text, tables, links, quotes and contextual panels.
- One nested tree of the things guides are about, each able to carry a picture, browsable as a gallery and shared by management, authoring and reading. Adding one happens from inside the thing it belongs to, and asks only for a name.
- One searchable catalog of the things a guide needs, with exact specifications and versioned details. An item is not classified when it is created; a guide says whether it keeps it or uses it up.
- A kind of work on each guide — repair, inspection, replacement — separate from the thing it is about, with a title that composes itself from the answers. Which kinds a workspace offers is configurable.
- Guide preparation lists, step requirements, consumption/reuse distinctions and dependencies on earlier steps.
- Manual draft saves, conflict checks and immutable publication snapshots.
- Step photographs with numbered marks and arrows drawn onto them, captions and ordering, reuse of a picture across steps, and delivery at the size a screen needs. Re-encoded on upload so camera metadata does not travel with them, and readable only through a guide the reader may already open.
- Guide families: a broader guide above its models, with a trail up and a list down, where a relative the reader cannot open is absent rather than withheld.
- Moving a published guide between a workspace's public and internal sections, refused with reasons when it would expose something that is not itself public.
- Search as you type, browsing by picture, a bounded library that pages rather than loading everything, responsive interfaces and light/dark themes.

The [README](README.md) explains how to run and try these features, and how to start a real installation. Publishing is direct, without an approval workflow. Open signup is deliberately off: an account exists because somebody was invited, or because the installation created the first one.

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

Invitations and permissions are done. What is left is account recovery, and review and approval workflows for teams that need controlled publication, with history and restoration tools for authorized users.

An installation serves one organisation and gets one workspace, which carries both audiences: a public library anyone may read and an internal section only members see. Creating further workspaces is deliberately not planned — that would be for keeping separate groups apart in one installation, which is not what Passdown is for.

### Richer ways to follow a guide

Explore image zoom, clearer progress through long procedures and additional ways to find related knowledge. Expand language support and accessibility coverage as the reader evolves.

### Information architecture

Navigation problems have been surfacing one screen at a time. The header is now one shape across both surfaces, with a workspace's own sections beneath the installation's, and a guide is edited from the page you read it on. What remains is where a draft belongs — published guides and drafts still live on separate surfaces — and a landing page that shows your work rather than a list of workspaces. See [docs/backlog.md](docs/backlog.md).

## Before production use

Starting an installation is supported and documented. What is left is backup and restore, migration recovery, background processing, observability and operational security, and the email workflows — invitations work by link precisely because nothing sends mail yet.

Local persistence and automated tests are working foundations. Supported production operation still needs this additional work.

## Principles that carry through

- Keep public and private guides on one content model and renderer.
- Reuse things, tools and materials as real shared records.
- Preserve what a reader relied on: editing a draft or catalog entry must not rewrite a published release.
- Make ordinary interactions intuitive, accessible and recoverable.
- Prefer complete, testable user journeys over controls that only look finished.

Have a concrete need or want to contribute? Describe the workflow and the problem it would solve, then see [Contributing](CONTRIBUTING.md).
