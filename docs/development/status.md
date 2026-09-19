# Passdown development status

Passdown is an early, working application for public community guides and private team procedures. The source is public and development is ongoing. It is currently designed for local evaluation, not unattended production deployment.

## Working now

- Verified local owner sign-in, workspace membership and protected public/private readers.
- Persistent guide creation, rich-text step editing, preview, manual saves and conflict recovery.
- Headings, emphasis, links, lists, quotes, six panel types and editable tables with direct row/column insertion.
- Immutable published releases with explicit content licenses.
- Nested category management, inline creation, product/category pages, breadcrumbs and descendant search.
- Reusable tools, materials and replacement-part catalog with exact specifications, archive/restore and reviewed updates.
- Guide preparation, per-step requirements and consumption/reuse allocations, preconditions and earlier-step dependencies.
- Shared reader, live search, keyboard navigation, responsive layouts and light/dark themes.
- Versioned migrations, scoped repository access, validation, automated tests and public continuous checks.

## Boundaries

Saves are manual. Authoring and catalog administration currently require the owner role. Local setup provisions a verified owner; public registration, invitations and account-recovery delivery are not available. Media uploads, attachments, cross-guide prerequisites, approvals and collaborative editing are not implemented yet. Category nesting has a safety limit of 16 levels.

See the [roadmap](../../ROADMAP.md) for upcoming outcomes and the [manual checklist](manual-test-checklist.md) for testable behavior. The repository license covers code, not a blanket license for user-authored guide content.
