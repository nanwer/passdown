# Passdown development status

Passdown is an early, working application for public community guides and private team procedures. The source is public and development is ongoing. It is currently designed for local evaluation, not unattended production deployment.

## Working now

- Browser first-run setup on an empty configured database: a hash-verified setup code, an administrator-chosen password, and one account and workspace created together. Setup closes once an account exists; uncertain commit results direct the person to reload or sign in. The separate installation-administrator capability and installer are upcoming.
- Production builds refuse sample guides and preview identities, validate runtime database and identity settings, and use the same unsafe-role check for transactions and health. Development database connections remain loopback-only.
- A private workspace has no public catalog: an item labelled public inside one is refused on write and unreadable to nonmembers, matching the rule guides have always followed.
- Roster changes are serialised per workspace, so two managers standing down at once cannot both succeed.
- Two permissions per workspace, view and manage, enforced by row-level security rather than by the interface. Every policy asks one function, so the vocabulary lives in one place.
- Invitations by link: single use, expiring, stored only as a hash, and needing no mail server. An address that already has an account joins by signing in as it; an expired invitation is replaced rather than blocking the address. A people screen listing members and pending invitations, with permission changes and removal, and a workspace that cannot be left without a manager.
- Persistent guide creation, rich-text step editing, preview, manual saves and conflict recovery.
- Headings, emphasis, links, lists, quotes, six panel types and editable tables with direct row/column insertion.
- Immutable published releases with explicit content licenses.
- One nested tree of the things guides are about, each able to carry a picture, browsable as a gallery, with inline creation from inside the thing it belongs to.
- A kind of work on each guide, separate from the thing it is about, with a title composed from the answers and a per-workspace catalog of the kinds offered.
- One searchable catalog of items with exact specifications, usage per item, deactivate/reactivate and reviewed updates. An item carries no permanent classification; a guide says whether it keeps it or uses it up.
- Things and the catalog managed as tables: every column sorts, columns can be chosen and are remembered per browser, status tabs count what the search matches, both lists read bounded pages from the server, and a record opens in a sheet that closes back to the same table. Each thing's permanent code is shown in the table and its record. The tree stays a tree — branches open on their own control, and a search opens every branch that holds a match. Visibility and guide-usage filters combine with search and status, and totals describe all matching records rather than just the current page. Things paginate the visible tree while repeating boundary ancestors for context. A new record clears a search or status that would hide it and takes focus, unless the viewer has moved on to something else before it arrives; a record that leaves the table, deactivated or filtered out, hands focus to the row in its place or to the search.
- A cover picture per guide, chosen in the editor, frozen into each release and shown wherever the guide appears in a listing. A guide without one falls back to its first step picture and then to the picture of the thing it is about.
- Step photographs with numbered marks and arrows, captions, ordering and reuse, re-encoded on upload and readable only through a guide the reader may already open — and visible to the author who uploaded them before the draft is saved.
- Public and internal sections of a public workspace, and moving a published guide between them with reasons when it cannot go.
- A front page that opens on the search and the guides: a heading, the search field, one row of category chips carrying each thing's picture, then the library. A category has one address — its own page, carrying its picture, its description, whatever sits inside it, and the same chips so choosing one is not a dead end.
- A front page that branches on who is looking: a visitor reads the public library, somebody signed in gets a tab per library they can read. A library is named for what it is rather than for the workspace behind it, and an empty members-only one waits until it has something in it.
- Guide preparation, per-step requirements and consumption/reuse allocations, preconditions and earlier-step dependencies.
- Shared reader, live search, keyboard navigation, responsive layouts and light/dark themes verified for contrast in both. Nested dialogs keep the unfinished parent form open when Escape closes its picker, and native Option-Tab traversal stays inside the dialog on macOS WebKit.
- Library listings that read one bounded page from the database, filtered and counted there.
- Versioned migrations with a checksummed manifest, a health endpoint that refuses a database this build does not match, and a warning when the running process is older than the schema.

## Authoring interface

Guide creation uses compact, keyboard-operable choice cards, separate essentials/preparation/section panels, and draft guidance beside the form on desktop. The same essentials and preparation components appear in **Guide details**. Preparation cards keep quantity and usage controls visible while optional notes expand on demand; saved notes open expanded. Radios and checkboxes retain their own dimensions rather than inheriting text-input sizing. Internal drafts in public workspaces pass their selected audience to category and catalog pickers.

See [authoring UI patterns](authoring-ui.md) for the reusable components and [manual test steps](manual-test-checklist.md#guide-creation-and-preparation-layout) for the complete create/save journey.

## Boundaries

Saves are manual. Management lists use 25-row pages; Things may additionally show ancestor context at page boundaries. Inline category pickers still load their options when opened. Open signup is deliberately off — an account exists because somebody was invited or because the installation created the first one. Nothing sends email; invitations are links passed on by hand, and account recovery does not exist. Attachments other than pictures, cross-guide prerequisites, approval workflows and collaborative editing are not implemented.

An installation serves one organisation and gets one workspace, which carries a public library and an internal section; creating further workspaces is deliberately out of scope. Every screen is built from Tailwind utilities on the project's design tokens; the only stylesheets left hold element defaults and the typography of rendered guide content and the editor canvas. One vocabulary runs through the studio: things, the catalog, and Active or Inactive.

A showcase library is available for evaluation — `pnpm seed:showcase` — written through the API rather than into tables, so it exercises the same validation and publication rules as hand-written content.

Automated fixture and persistent authoring suites cover Chromium, Firefox and Playwright WebKit, including keyboard dialogs, live search, editing and publishing. These checks do not replace release checks in physical Safari, iPhone or a simulator, with VoiceOver, or with operating-system input methods. Browser commands and the CI timing policy are in [CONTRIBUTING](../../CONTRIBUTING.md).

See the [roadmap](../../ROADMAP.md) for upcoming outcomes and the [manual checklist](manual-test-checklist.md) for testable behavior. The repository license covers code, not a blanket license for user-authored guide content.
