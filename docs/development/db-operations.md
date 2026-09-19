# Local development storage

Run `pnpm local:setup` with the container runtime available. Setup creates the local database, applies versioned migrations, provisions a verified owner and seeds example workspaces. Repeat setup preserves existing guides and credentials.

The application database is `guide_app`, bound to loopback port 55439. Use `pnpm local:down` and `pnpm local:up` for normal shutdown/startup. Keep the named volume; removing it deletes the local database. Existing storage identifiers are intentionally stable across product renames.

Credentials are generated in `.env.local`, `apps/web/.env.local` and `LOCAL_ACCESS.md`, written with owner-only permissions and excluded from version control. Never publish these files, database exports, authentication traces or real user content. Open LOCAL_ACCESS.md locally to sign in; there is no shared default password.

The web process uses a constrained runtime role. Owner credentials are used only by setup/migration operations. Each store operation checks current identity/membership and sets explicit workspace scope. Draft saves require expected versions; publication creates an immutable release atomically. Changing a draft or catalog item does not change an existing release.

Applied SQL migrations are checksummed and must not be edited. Add a new migration, back up data before applying it and test preservation. Active legacy drafts are upgraded with their original preparation notes intact; authors explicitly link those notes to catalog records before republishing. Existing release documents remain unchanged.

## Test isolation

- `pnpm test:e2e` uses a fixture server on 3102 and synthetic data.
- `pnpm test:database` uses dedicated test databases and real scoped repositories.
- `pnpm test:authoring` uses `guide_app_e2e` and a server on 3101.

Do not point reset/test helpers at the application database. Automated production backups, recovery drills, email delivery, asset processing and production deployment tooling are future work.
