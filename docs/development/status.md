# Passdown development status

Passdown is an early, working application for public community guides and private team procedures. The source is public and development is ongoing. It is currently designed for local evaluation, not unattended production deployment.

## Working now

- Verified local owner sign-in, workspace membership and protected public/private readers.
- Persistent guide creation, rich-text step editing, preview, manual saves and conflict recovery.
- Headings, emphasis, links, lists, quotes, six panel types and editable tables with direct row/column insertion.
- Immutable published releases with explicit content licenses.
- Nested category management with stable short codes, distinct-guide totals per branch, All/Active/Inactive tabs, inline creation, product/category pages, breadcrumbs and descendant search.
- Deactivation that names what still uses a category and offers a route to it, while superseded releases keep their own references without blocking retirement.
- Reusable tools, materials and replacement-part catalog with exact specifications, distinct-guide usage per item, archive/restore and reviewed updates.
- Public and internal sections of one public workspace: members switch between them, visitors and signed-in nonmembers see neither the switch nor the internal route.
- Guide preparation, per-step requirements and consumption/reuse allocations, preconditions and earlier-step dependencies.
- Shared reader, live search, keyboard navigation, responsive layouts and light/dark themes.
- Library listings that read one bounded page from the database, filtered and counted there, and say how large the whole collection is instead of ending silently.
- Versioned migrations, scoped repository access, validation, automated tests and public continuous checks.

Recent interface fixes align catalog filters and distinguish nested category dialogs with a correctly layered backdrop, responsive sizing and shared dialog styling. Dismissing a nested picker preserves the unfinished parent form and returns focus to its trigger.

## Boundaries

Saves are manual. Authoring and catalog administration currently require the owner role. Local setup provisions a verified owner; public registration, invitations and account-recovery delivery are not available. Media uploads, attachments, cross-guide prerequisites, approvals and collaborative editing are not implemented yet. Category nesting has a safety limit of 16 levels.

See the [roadmap](../../ROADMAP.md) for upcoming outcomes and the [manual checklist](manual-test-checklist.md) for testable behavior. The repository license covers code, not a blanket license for user-authored guide content.
