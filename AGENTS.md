# Passdown

Read README.md, ROADMAP.md, CONTRIBUTING.md and docs/development/status.md before extending the application.

## Product and architecture

- Serve public communities and private teams through one content model and shared reader.
- Keep document content independent of rendering, core policy independent of the web framework, and SQL/identity behind scoped repositories. UI components consume typed contracts and scoped APIs.
- Use shared semantic/component tokens and reusable controls. Search while typing, preserve unsaved work and focus, and distinguish draft saves from publication.
- Categories and tools/materials/parts are managed, workspace-scoped records. Do not replace them with free-text fields. Published requirement details are immutable; catalog updates require explicit review in drafts.
- Test complete authoring and reading journeys, including cancellation, late responses, empty/error states, mobile layouts and denied private access.
- Never connect preview identities to real storage. Preserve existing data and applied migration checksums.

## Verification and handoff

Run pnpm check, pnpm build and the browser/database suites relevant to the change. Report actual results and unfinished behavior. Keep docs/development/manual-test-checklist.md current and provide page locations, exact manual steps and expected results after every development session.

## Public changes

The public product name is Passdown. Keep private notes, credentials, personal paths, internal discussions and comparisons out of public files, commit text and repository metadata. Retain required third-party copyright/license notices. Publish only reviewed source branches; never push local archives, unrelated branches or tags.

Every commit needs a clear subject and an explanatory body covering the reason, resulting behavior and validation. Use .gitmessage and install the shared commit hook as described in CONTRIBUTING.md. The public commit-notes workflow adds a readable comment to each commit pushed to main. Keep the roadmap outcome-focused, accurate and free of uncommitted delivery dates.

Code is AGPL-3.0-only unless a retained third-party notice says otherwise. Content authors choose release-specific content terms; publishing source does not change existing guide licenses.
