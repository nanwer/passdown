# Passdown roadmap

Passdown exists so practical knowledge stays useful when it reaches the next person. It gives public communities and private teams one place to write step-by-step guides, with clear instructions, annotated photographs, a reusable catalog of what each step needs, and a dependable record of what was published.

This roadmap describes direction, not a delivery schedule. Priorities can change as people use the app and contribute feedback. Anything under **Next** or **Later** is planned, not available.

## Available now

### Running an installation

- The first start against an empty database creates an administrator and a workspace. The password is generated for that installation, never shipped, and has to be replaced before the account can do anything.
- One installation serves one organisation with one workspace. That workspace holds a public library anyone may read and an internal section only members see.
- Versioned database migrations with a checksummed manifest, and a health check that refuses a database the running version does not match.

### People and access

- Two permissions per workspace, **view** and **manage**, enforced by the database rather than by the interface. A workspace can never be left without somebody who can manage it.
- Invitations by link: shown once, single use, expiring, stored only as a hash, and needing no mail server. Someone with an account already joins by signing in.
- A People screen listing members and pending invitations, with permission changes and removal.

### Writing guides

- A visual step editor with headings, emphasis, links, lists, quotes, six kinds of information panel, and tables with row and column insertion.
- A kind of work on each guide, such as repair, inspection or replacement, kept separate from the thing it is about. The title composes itself from the two until somebody types their own. Which kinds a workspace offers is configurable.
- Preparation lists, per-step requirements, the difference between what a step uses up and what it keeps, preconditions, and dependencies on earlier steps.
- Step photographs with numbered marks and arrows drawn on them, captions, ordering, and reuse across steps. Uploads are re-encoded so camera metadata does not travel with them.
- A cover picture for each guide.
- Manual saves, with conflict detection when the same draft is edited in two places.

### Things and the catalog

- One tree of the things guides are about — a product range, a room, a production line — each able to carry a picture.
- One catalog of the tools, materials and parts guides call for, with exact specifications and identifiers. An item is not classified when it is created; each guide says whether it keeps the item or uses it up.
- Both are managed as tables: every column sorts, the viewer chooses which columns to see, search narrows as you type, and status tabs count what the search matches. A record opens beside the table and closes back to exactly where you were.
- Nothing is deleted. Things and items are deactivated, and a thing still in use says what must move first.

### Publishing and reading

- Publishing creates a fixed release with an explicit content licence. Editing a draft or a catalog item never rewrites a release people are already reading.
- A guide can move between the public library and the internal section, and is told why when it cannot.
- Guide families: a broader guide above its models, with a trail up and a list down. A relative the reader may not open is left out rather than hinted at.
- A front page that opens on the search and the guides, a page for each thing with whatever sits inside it, and a tab for each library a signed-in member can read.
- A shared reader with keyboard navigation, responsive layouts, and light and dark themes checked for contrast.
- Library listings read one bounded page at a time from the database, counted there.

The [README](README.md) explains how to run Passdown and try these features. The [development status](docs/development/status.md) lists them in detail.

## Next: finish the authoring experience

### Uploading that explains itself

Pictures work. What is missing is what shows while they upload: progress on a slow connection, and a clear way back from a file that was refused or failed partway.

### Attachments

Documents a guide needs, such as a wiring diagram or a data sheet, attached to the guide or a step, with viewing and downloading governed by the same access as the guide.

### Connected guides

One guide referring to another as a prerequisite, pinned to the release it was written against, with access checked for each reader. A reference to a guide that was withdrawn, changed or is not readable should make sense to both the author and the reader.

### Editing without losing work

Saving is manual today. Next is protection for unsaved work across a closed tab or an expired session, clearer handling when two people edit the same draft, and faster ways to insert and rearrange content, including richer table editing. Keyboard and narrow-screen editing stay covered throughout.

## Later: knowledge as a shared practice

### Community participation

Readers suggesting improvements to public guides, discussing them, and helping maintain them, with review, moderation and clear attribution so a library can grow without losing trust in what it publishes.

### Review, approval and recovery

Account recovery. Approval before publication for teams that need it. History of what changed in a guide, and restoring an earlier state, for the people allowed to.

### Richer ways to follow a guide

Zooming into photographs, keeping your place through a long procedure, finding related guides, more languages, and wider accessibility coverage as the reader grows.

## Before production use

Starting an installation is supported and documented. Running one unattended is not yet. That needs backup and restore, recovery from a failed migration, background processing, monitoring, operational security, and email — invitations work by link precisely because nothing sends mail yet.

## Not planned

**More than one workspace per installation.** One workspace already carries both audiences. Several would be for keeping separate groups apart inside one installation, which is not what Passdown is for.

## Principles that carry through

- Public and private guides share one content model and one reader.
- Things, tools and materials are real shared records, not free text.
- What a reader relied on is preserved: editing a draft or a catalog item never rewrites a published release.
- Ordinary interactions are intuitive, accessible and recoverable.
- Complete, testable journeys come before controls that only look finished.

Have a concrete need, or want to contribute? Describe the workflow and the problem it would solve, then see [Contributing](CONTRIBUTING.md).
