# Contributing to Passdown

Passdown helps people keep practical knowledge and pass it on through clear instructions. Bug reports, documentation, accessibility feedback, design improvements and focused code changes all help.

Start with the [README](README.md) for working features and local setup, and the [roadmap](ROADMAP.md) for direction. For a substantial new feature or architectural change, open an issue describing the user need and proposed scope before implementation.

## Development setup

Follow the [installation guide](docs/getting-started.md) to install the pinned tools, start the local database, and get your generated login. It is the shared reference for setup, restarting, updates, and troubleshooting.

Enable the repository's commit-message checks and template once in your clone:

```sh
git config core.hooksPath .githooks
git config commit.template .gitmessage
```

Read the ignored `LOCAL_ACCESS.md` for the generated local login, then open [the studio](http://127.0.0.1:3100/studio). Setup preserves existing local content when repeated. Use `pnpm local:down` and `pnpm local:up` to stop and restart PostgreSQL without deleting its volume.

Never commit generated credentials, environment files, database dumps, private guide content or personal data. Use synthetic records in tests and bug reports.

## Make changes easy to understand

Keep each change focused on an observable user outcome or a concrete engineering problem. Describe the behavior before and after the change. Preserve unrelated work, and avoid mixing formatting or dependency upgrades into a feature fix.

For shared interfaces, consider both public and private workspaces, keyboard use, narrow screens and light/dark themes. Search should respond while typing; related controls should preserve input and context; saving and publication should clearly communicate what has happened.

Before adding a field, decide whether it is a reusable shared record, a defined choice or text belonging only to one guide. Shared records need create/select/reuse behavior, permissions, duplicate handling and a clear policy for edits, archiving and published history.

Add comments when they explain an invariant, constraint or non-obvious decision. Keep routine code readable without comments that merely repeat it.

## Work in the owning package

| Area                     | Location and expectation                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Document structure       | `packages/guide-content`: pure versioned schemas and transformations; preserve readable older content.                 |
| Authorization            | `packages/core`: explicit capabilities and scoped reads, independent of the web framework and database implementation. |
| API contracts            | `packages/contracts`: validate request bodies and keep transport types consistent.                                     |
| Persistence and identity | `packages/database`: scoped queries and transactional writes. Add migrations rather than editing applied ones.         |
| Design tokens            | `packages/design-tokens`: edit the token source, then regenerate derived CSS.                                          |
| Shared controls          | `packages/ui`: accessible native and shared controls without database or policy implementation imports.                |
| Guide presentation       | `packages/guide-ui`: a shared renderer for public and private content.                                                 |
| Application interfaces   | `apps/web`: compose the packages through validated, authorized boundaries.                                             |
| Test fixtures            | `packages/testing`: original synthetic content, isolated from real storage and identities.                             |

Use public package exports. Cross-package relative imports, private deep imports and dependency cycles fail the boundary checks. Keep server-only queries out of client bundles. For framework changes, consult the documentation matching the installed version; Next.js documentation is available under `apps/web/node_modules/next/dist/docs/`.

Public reads do not grant draft-write access. Changes to permissions, membership, visibility, metadata or API responses need tests for unauthorized access as well as successful requests. Cover list and detail endpoints, cross-workspace identifiers, suspended or revoked actors and private drafts. Persistence changes must preserve immutable releases and reject stale writes.

## Validate the behavior

For a bug fix, add a focused regression that fails before the fix and checks the observable behavior. Choose tests that exercise real components or services. Documentation-only and purely decorative changes usually need review rather than new tests.

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
pnpm test:database
pnpm test:authoring
pnpm test:setup
git diff --check
```

`pnpm check` covers generated tokens, package boundaries, TypeScript and unit/contract tests. Run the browser and database suites relevant to the change. Database, persistent authoring and setup tests require `pnpm local:setup` first.

| Suite                 | Isolation                                                                   |
| --------------------- | --------------------------------------------------------------------------- |
| `pnpm test:e2e`       | Sample-data app on port 3102, without the application database.             |
| `pnpm test:database`  | Dedicated `guide_app_test` database; resets its test data.                  |
| `pnpm test:authoring` | Dedicated `guide_app_e2e` database and app on port 3101.                    |
| `pnpm test:setup`     | Recreates `guide_app_setup_e2e` for each engine, with the app on port 3106. |

Leave the test ports available and run one instance of each browser or database suite at a time. Browser suites start and own their test server; an occupied port fails the run instead of reusing another run's server, which could disappear during teardown. The fixture suite defaults to two workers so cold route compilation and browser interactions share a predictable amount of CPU. Run the production build and browser suites sequentially when checking timing-sensitive interactions. Use these databases only for tests. Set `PLAYWRIGHT_CHANNEL=chrome` to run browser tests with an installed Google Chrome. Do not point test runners at a database containing content you want to keep.

You can run a focused browser file during development:

```sh
pnpm test:e2e tests/e2e/filter-navigation.spec.ts
```

Run every fixture journey in Firefox and WebKit after the Chromium suite:

```sh
pnpm test:cross-browser
pnpm test:authoring --project=chromium
pnpm test:authoring --project=firefox
pnpm test:authoring --project=webkit
```

On Linux, install browser system dependencies with `pnpm exec playwright install --with-deps chromium firefox webkit`. The cross-browser fixture runner owns port 3105 and a separate build directory. Authoring projects share port 3101 and one disposable database locally, so run them sequentially. A plain `pnpm test:authoring` runs all three projects sequentially. Tests must not assume a pristine database beyond the seed.

CI runs source/database checks, each fixture engine, each authoring engine, and first-run setup in separate jobs. Each authoring job owns its database. The setup job runs all three engines sequentially with a fresh setup database per engine and no captured credentials or browser traces. Every job has a 20-minute cap and retries stay at zero. Monitor setup-inclusive durations in the first five hosted runs: if an engine exceeds 17 minutes twice, split that engine into two isolated shards first, preserving full coverage. A reduced routine `@core` suite requires an explicit documented change; the release gate always requires the full three-engine fixture and authoring runs. Traces and test results are not uploaded as public CI artifacts.

### Writing browser tests

- Find controls by role, label and visible text. Use `ControlOrMeta` shortcuts and the helpers in `tests/support/browser.ts` for selection, synthetic paste, Tab and instant scrolling. Focus a contenteditable before setting its selection. On macOS WebKit, `pressTab` uses Option+Tab to include buttons and links in native traversal. Open a control with the keyboard when testing keyboard traversal. Editor commands such as moving between table cells use plain Tab, not the native focus-traversal helper. Do not access the system clipboard.
- A pointer click does not necessarily focus a button in Safari. Test keyboard focus after keyboard input or explicit application focus restoration; opening and closing a dialog must return focus to its invoker.
- Use request gates and polling instead of fixed sleeps. A bounded wait is appropriate only to prove that an action did not occur during an interval, such as an IME debounce. Geometry comparisons allow at least one pixel; scripted scrolling uses `behavior: 'instant'`.
- Contexts use `en-US` and UTC. Assert machine-readable timestamps rather than localized strings. New contexts created explicitly must use these settings too.
- Supply file buffers through `setInputFiles`. Touch tests use `hasTouch` and `tap`, not `isMobile`, which Firefox does not support. Read cookies with `context.cookies()`.
- Request-only tests have `@api` in their title and open no browser; run these once in Chromium. Core authoring journeys carry `@core` so a measured CI fallback can select them without losing the full release gate.
- An engine-specific skip must cite a named entry in the development status's known browser differences, including the user-visible effect. Fix product defects with a regression in the affected engine.

Format changed files with `pnpm exec prettier --write <paths>`. After editing design tokens, run `pnpm tokens:generate` and include both the source and generated output. Avoid formatting unrelated files.

Include manual checks for interfaces: the page, exact actions and expected result. State what you actually tested and any remaining gaps. A passing build does not demonstrate that an entire user journey works.

## Write meaningful commits

**Every commit needs a descriptive subject and a body.** Use a specific subject between 12 and 100 characters, followed by meaningful `Why:`, `Changes:` and `Validation:` sections. Explain the problem, what changed, how it was validated and any limitations. Use real details rather than messages such as “updates” or “fix stuff.” If a check was not run, say so and explain why.

For example:

```text
Preserve guide edits after cancelling catalog creation

Why: A delayed creation response could select an item after its
dialog closed, replacing newer editing state.

Changes: Ignore callbacks from dismissed forms while still refreshing
the shared catalog after a successful server response.

Validation: Added delayed-response regressions for Back, Close, Escape
and Cancel. Structured component tests, typecheck and boundary checks pass.

Limitations: Closing the form does not undo a record already created
on the server; that record remains available in the catalog.
```

Keep commits coherent enough to review independently. When revising a change, update its explanation to describe the final behavior.

The local hook checks that each required section has a substantive explanation. The repository's Commit notes workflow is configured to post each commit message pushed to `main` as a GitHub commit comment, so write the message for someone reviewing the change without the surrounding conversation.

## Open a pull request

Explain the problem and resulting behavior, link any related issue, and list the checks you ran. For visual changes, include screenshots at useful desktop and mobile sizes. Provide repeatable manual steps and expected outcomes for new features, along with known limits or unfinished behavior.

Avoid including credentials or sensitive content in screenshots, logs or reports. Security-sensitive reports should not expose working exploit details or private data in a public issue; arrange a private report with a maintainer first.

## Releases

Releases are cut only when the project owner says to publish. Maintainers follow [cutting a release](docs/development/releasing.md). The release workflow publishes exact-version images, then leaves a draft release for the owner to review and publish.

## License and attribution

Passdown uses the **GNU Affero General Public License v3.0 (AGPL-3.0-only)**. Contributions to the project are provided under the same license; see [LICENSE](LICENSE). Preserve copyright and license notices, and update [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) when incorporating third-party material that requires attribution.

Only contribute code, text and assets you have permission to contribute. The software license is separate from the content license an author selects when publishing a guide.
