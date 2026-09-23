# Passdown development status

Passdown is an early, working application for public community guides and private team procedures. The source is public and development is ongoing. It is currently designed for local evaluation, not unattended production deployment.

## Working now

- An installation that creates its own first administrator and workspace on first start, with a password generated per installation and unusable until replaced — over the API as well as in the browser.
- A private workspace has no public catalog: an item labelled public inside one is refused on write and unreadable to nonmembers, matching the rule guides have always followed.
- Roster changes are serialised per workspace, so two managers standing down at once cannot both succeed.
- Two permissions per workspace, view and manage, enforced by row-level security rather than by the interface. Every policy asks one function, so the vocabulary lives in one place.
- Invitations by link: single use, expiring, stored only as a hash, and needing no mail server. An address that already has an account joins by signing in as it; an expired invitation is replaced rather than blocking the address. A people screen listing members and pending invitations, with permission changes and removal, and a workspace that cannot be left without a manager.
- Persistent guide creation, rich-text step editing, preview, manual saves and conflict recovery.
- Headings, emphasis, links, lists, quotes, six panel types and editable tables with direct row/column insertion.
- Immutable published releases with explicit content licenses.
- One nested tree of the things guides are about, each able to carry a picture, browsable as a gallery, with inline creation from inside the thing it belongs to.
- A kind of work on each guide, separate from the thing it is about, with a title composed from the answers and a per-workspace catalog of the kinds offered.
- One searchable catalog of items with exact specifications, usage per item, archive/restore and reviewed updates. An item carries no permanent classification; a guide says whether it keeps it or uses it up.
- A cover picture per guide, chosen in the editor, frozen into each release and shown wherever the guide appears in a listing. A guide without one falls back to its first step picture and then to the picture of the thing it is about.
- Step photographs with numbered marks and arrows, captions, ordering and reuse, re-encoded on upload and readable only through a guide the reader may already open — and visible to the author who uploaded them before the draft is saved.
- Public and internal sections of a public workspace, and moving a published guide between them with reasons when it cannot go.
- A front page that opens on the search and the guides: a heading, the search field, one row of category chips carrying each thing's picture, then the library. A category has one address — its own page, carrying its picture, its description, whatever sits inside it, and the same chips so choosing one is not a dead end.
- A front page that branches on who is looking: a visitor reads the public library, somebody signed in gets a tab per library they can read. A library is named for what it is rather than for the workspace behind it, and an empty members-only one waits until it has something in it.
- Guide preparation, per-step requirements and consumption/reuse allocations, preconditions and earlier-step dependencies.
- Shared reader, live search, keyboard navigation, responsive layouts and light/dark themes verified for contrast in both.
- Library listings that read one bounded page from the database, filtered and counted there.
- Versioned migrations with a checksummed manifest, a health endpoint that refuses a database this build does not match, and a warning when the running process is older than the schema.

## Boundaries

Saves are manual. Open signup is deliberately off — an account exists because somebody was invited or because the installation created the first one. Nothing sends email; invitations are links passed on by hand, and account recovery does not exist. Attachments other than pictures, cross-guide prerequisites, approval workflows and collaborative editing are not implemented.

An installation serves one organisation and gets one workspace, which carries a public library and an internal section; creating further workspaces is deliberately out of scope. The interface is mid-migration onto shadcn components: buttons everywhere, the people screen and the Manage overview use them, and the rest still uses the older stylesheets, now layered beneath the newer utilities so each screen can be converted on its own. The information architecture work is partly done — see [the backlog](../backlog.md).

A showcase library is available for evaluation — `pnpm seed:showcase` — written through the API rather than into tables, so it exercises the same validation and publication rules as hand-written content.

See the [roadmap](../../ROADMAP.md) for upcoming outcomes and the [manual checklist](manual-test-checklist.md) for testable behavior. The repository license covers code, not a blanket license for user-authored guide content.
