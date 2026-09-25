# Passdown manual test checklist

Start the local app and sign in at [Studio](http://127.0.0.1:3100/studio) using the generated credentials in your private LOCAL_ACCESS.md. Test both Repair collective and Workshop operations. These examples use local test data you create yourself.

## Remove a step with prerequisites

Use **Studio → a guide → step editor**, preferably a test draft with two or more steps.

1. Make step 2 depend on step 1 using its earlier-step prerequisites. Select step 1 and click **Remove**. Expect a compact confirmation showing the step to remove, an explanation that affected steps will stay, visible **Review** buttons, **Cancel** and a red **Remove step** action. No recovery JSON or sign-in controls should appear.
2. Choose **Cancel**, then repeat using Escape. Expect both steps and their links unchanged, with keyboard focus returned to **Remove**.
3. Open the confirmation and choose the affected step's review action. Expect the dialog to close, that step to open and its title field to receive focus. Nothing is deleted.
4. Return to step 1, choose **Remove**, then **Remove step**. Expect the step removed from the draft, its links removed from dependent steps, and focus on the next remaining step's title. Other prerequisites and instructions remain intact.
5. Choose **Save draft**, reload, and confirm the change persists. A previously published release must stay unchanged until you publish again. With one step left, **Remove** is unavailable. A step without dependents uses a simple **Remove step** confirmation.
6. Repeat the confirmation at a narrow phone width. Content and actions should fit without horizontal scrolling; the affected-step list can scroll inside the dialog if necessary.

This fixes step removal, not whole-guide deletion. Draft saving remains manual.

## Upgrading a running installation

Use a separate evaluation installation, never your own data.

1. With the evaluation stack running and setup complete, create a guide with a picture. From `deploy`, run `sh upgrade.sh --build`. Expect a backup in `deploy/backups`, a build, "Applying migrations with the new version…", the new version and status, and **Upgrade complete.** The guide and picture remain, and health is `ready`.
2. Run `docker compose run --rm -T ops version`. Expect the revision of your checkout (`git rev-parse --short=12 HEAD`).
3. Simulate a failing migration: in a copy of the settings file, change `GUIDE_DB_RUNTIME_PASSWORD`, then run `sh upgrade.sh --env-file <that copy> --build --skip-backup`. Expect exit 1 and "Migrations failed; the site is still running the previous version." While it runs, reload the site: it keeps working. Afterwards `docker compose ps` shows the same web container, and `upgrade.log` records the failure.
4. Stop the stack with `docker compose stop web` and run `sh upgrade.sh --build`. Expect a refusal telling you to use `docker compose up -d`, and no backup or build.
5. Automated rehearsal: with `passdown:local` and `passdown-caddy:local` built, run `sh scripts/check-upgrade.sh` from the repository root. Expect `Upgrade check passed: a failed migration kept the old version serving; the upgrade applied migration …` after several minutes, and no leftover `passdown-check-upgrade-*` containers or volumes (`docker ps -a`, `docker volume ls`).
6. `sh upgrade.sh --image REF` uses `REF` without downloading when that exact image is already on the host; otherwise it downloads it first.

## Self-hosting guides

Read [install](../self-hosting/install.md), [configuration](../self-hosting/configuration.md) and [troubleshooting](../self-hosting/troubleshooting.md) as an operator would, on GitHub or locally.

1. Follow **Install Passdown on your own server** from a fresh directory using [Building from source](../self-hosting/install.md#building-from-source) with `--domain localhost --http-port 18080 --https-port 18443`. Every command should work as written, `docker compose ps --all` should match the described states, and health should report `setup-required` before setup and `ready` after.
2. In the configuration reference, check that each variable in your `.env` is described, and that the `init.sh` options table matches `sh init.sh --help`.
3. Add `PASSDOWN_SOURCE_URL=https://example.org/fork` to `.env` and run `docker compose up -d --force-recreate web`. Expect every **Source code** link to point there. Remove it and recreate web: the links return to the Passdown commit.
4. Pick three troubleshooting entries (for example a wrong setup code, a missing settings variable, a lost setup code) and reproduce them. The guide's description should match what you see, and its fix should work.
5. Run `pnpm lint`. It includes the configuration check: temporarily delete one variable's row from the configuration reference and expect lint to name it; restore the row.

## Security review fixes

1. With the app running, open `/_next/image?url=%2Fapi%2Fmedia%2Fanything&w=640&q=75`. Expect a 404 page: pictures are only served by `/api/media`, which checks who may read them. Pictures in guides still display normally.
2. Studio saves keep working normally. A single account that sends more than 120 changes a minute is refused on its own (429) without slowing other people's saves.
3. Staged restore: resuming an interrupted restore with `restore --activate` still continues from where it stopped. The unit test `refuses to activate when the database records steps this restore never took` covers the tampered case.

The review's low-severity findings are listed in the [backlog](../backlog.md#low-severity-findings-from-the-pre-release-security-review).

## Installing behind nginx

Use a separate evaluation installation and the [nginx guide](../self-hosting/nginx.md). You need `openssl` for a test certificate.

1. From `deploy`, make a test certificate: `mkdir tls && openssl req -x509 -newkey rsa:2048 -nodes -days 7 -subj /CN=localhost -addext subjectAltName=DNS:localhost -keyout tls/privkey.pem -out tls/fullchain.pem`.
2. Run `sh init.sh --domain localhost --http-port 18080 --https-port 18443 --proxy nginx --tls-dir tls --build --output nginx.env`. Expect one setup code, and in `nginx.env`: `PASSDOWN_PROXY=nginx`, `PASSDOWN_TLS=files`, `PASSDOWN_TLS_DIR=` the absolute path of `tls`, and `COMPOSE_FILE=compose.yaml:compose.build.yaml:compose.nginx.yaml:compose.nginx.build.yaml`. The printed next command lists all four files.
3. Run the printed command with `build`, then with `up -d`. Trust `tls/fullchain.pem` in a test browser only, open `https://localhost:18443/setup` and complete setup. Expect your workspace to open. `curl -sI http://localhost:18080/` answers 301 with a `Location` on `https://localhost` (the redirect assumes port 443 on both proxies; see the backlog).
4. Run `docker compose --env-file nginx.env logs proxy`. Expect JSON lines; open `https://localhost:18443/setup?code=anything` first and expect that request logged as `/setup?[redacted]`, never with the code. Responses carry no `Server` header.
5. Refusals: repeat step 2 with a folder missing `privkey.pem` (expect exit 3 naming the file), with `--acme-email you@example.org` (exit 2), and without `--tls-dir` (exit 2). No settings file is created.
6. Replace the files with a new certificate and run `docker compose --env-file nginx.env exec proxy nginx -s reload`. Expect the site to keep working with the new certificate.
7. Automated: `PASSDOWN_PROXY=nginx node scripts/check-proxy.mjs --live` and `PASSDOWN_PROXY=nginx PASSDOWN_SKIP_BUILD=1 sh scripts/deployment-boot-check.sh` from the repository root both pass and remove their own resources.

Remove the evaluation with `docker compose --env-file nginx.env down -v` when finished.

## Health and startup summary

1. With the evaluation stack running, request `/api/health` (see the evaluation guide for the certificate). Expect `status`, `mode`, `schema`, `media` and `version`, and no migration names or settings.
2. Run `docker compose logs web | grep '"event":"startup"'`. Expect one line per start with the version, mode `production`, the origin, `schema`, `media`, `setup` and `setupCode: configured`. It must not contain the setup code or a long hexadecimal hash.
3. Recreate web with the picture volume made read-only (for example, add `:ro` to the media volume in a copy of the compose file). Expect health 503 `media-unavailable` and a `media.unavailable` log line. Restore the volume afterwards.

## Tracing a failure by its request ID

1. With the evaluation stack running, stop the database for a moment: `docker compose stop postgres`. In Studio, open **Things**. Expect "The service is unavailable…" with a request ID.
2. Run `docker compose logs web | grep '<that request ID>'`. Expect exactly one JSON line with `"event":"request.failed"`, the route pattern `/api/studio/[workspace]/categories`, `"method":"GET"` and the error name. It must not contain your email address, a cookie, a connection string or the requested address.
3. Start the database again with `docker compose start postgres`, then open a Studio address for a guide that doesn't exist, such as `/studio/<workspace>/00000000-0000-4000-8000-000000000000`. Expect a not-found message and no new `request.failed` line: refusals are not logged.

## Picture checks and backup archives

Use a disposable container evaluation with the operator image rebuilt from the current source. These are operator commands; the Studio does not gain a backup screen.

1. Save a draft with a picture. From `deploy`, run `docker compose run --rm -T ops verify-media --checksums --json`. Expect no missing, damaged or dangling pictures and exit 0. The command must not change the draft or files.
2. Run `sh backup.sh /path/to/private-backups` with a real writable private directory. Expect a final archive path only after the archive passes its offline check. On macOS, run `stat -f '%Lp' <archive>` (Linux: `stat -c '%a' <archive>`): expect `600`.
3. Run `tar -tf <archive>`. Expect exactly `database.dump`, `media.tar`, `manifest.json`, `SHA256SUMS`. Keep all extracted content private.
4. Run `docker compose run --rm --no-deps -T ops restore --check < /path/to/private-backups/passdown-example.tar`. Expect the integrity/compatibility success message explicitly saying no database was restored. Your existing guide must remain unchanged.
5. Run the backup wrapper again. Expect another file; the first file must still exist unchanged. Against this existing installation, run `docker compose run --rm -T ops restore < /path/to/private-backups/passdown-example.tar`: expect refusal with exit 4 and no database or media changes.
6. To exercise damage and missing-file errors, use the focused synthetic tests or a separate disposable copy. Never remove pictures from an installation you want to keep.

## Staged database and picture restore

Use a separate empty project, following [the exact restore commands](../self-hosting/backups.md#restore-into-a-separate-installation). Keep your original installation intact.

1. On the source, publish a guide with a picture, save a private guide, and create a pending invitation. Make a backup. Initialize `restore.env` for the separate `passdown-restore-evaluation` project, then run the offline check. Expect a compatibility success message and no database changes.
2. Run `docker compose --env-file restore.env run --rm -T ops restore < /path/to/private-backups/passdown-example.tar`. Expect verification progress, a snapshot-dated access report, cancellation of pending invitations, and **Restore ready**. No web service starts during restore. Afterwards, run `docker compose --env-file restore.env run --rm --no-deps ops sh -c 'find "$GUIDE_MEDIA_ROOT" -name database.dump'` and expect no output: the received archive was unpacked in the operator container's temporary space and deleted once the database loaded, never written to the shared picture volume.
3. Start the target with `docker compose --env-file restore.env up -d`. Sign in with the backed-up manager account. Expect the guides and their original pictures. Signed out, public guides load and private guides remain inaccessible. The old pending invitation no longer works; `/setup` must not create another initial account.
4. Run `docker compose --env-file restore.env run --rm -T ops verify-media --checksums --json`. Expect zero missing, damaged or dangling files for a complete backup. Compare a guide's text and picture to the untouched source.
5. Run restore again against the now populated target; expect exit 4 with existing data intact. `restore --discard` must also refuse this completed installation. `restore --activate` reports no unfinished restore.
6. Interruption and incorrect-password paths use the disposable PostgreSQL rehearsal (`scripts/check-restore.ts`) and focused restore tests. Do not deliberately damage your original installation. For an interrupted evaluation restore, `restore --activate` resumes completed loading; incomplete loading or failed verification requires `restore --discard` before retrying. Discard must affect only the unfinished target.

No restore screen is added to Studio. Published images, account recovery, upgrade/rollback tooling and the remaining release checks are unfinished. Archive checks alone are not proof of disaster recovery.

## Container isolation and authoring stability

1. **Audience warning — Studio → public workspace → New guide:** select **Internal**, open **What is this about?**, and select a members-only thing (or add one there). Switch to **Public**. Expect a warning beside the picker explaining that the thing is members-only and must be changed before publication. Switch back to **Internal**: the warning clears and the same selection remains. Other guide fields stay intact.
2. **Photo controls — open a saved draft with a portrait photograph:** enable slow network throttling in browser developer tools and reload. The preview reserves its space while the photograph loads; **Add a mark**, **Add an arrow** and **Use one already added** stay in place. Click the reuse button as the picture appears: the chooser opens on that click. Cancel it, add and move an annotation, save, then reload. Marks remain aligned to the photograph. Repeat with square, tall and landscape images. The entire photograph—including its bottom edge—must fit inside the preview. Place a mark near the bottom and select it; it must remain visible and correctly aligned at desktop and phone widths.
3. **Separate settings — from `deploy`, with Docker running:** run `sh init.sh --domain localhost --build --output first.env`, then repeat with `--output second.env`. Each prints its own project name. Run `rg '^COMPOSE_PROJECT_NAME=' first.env second.env`; the two project names differ. Keep these files private. For explicit names, add `--project passdown-evaluation-one`. Reinitializing an existing file refuses to overwrite it; a project with existing containers or volumes also refuses replacement credentials. Do not delete real settings or volumes to test this: `node scripts/check-image-privacy.mjs --context` and the initializer tests use disposable fixtures.
4. **Image privacy — after rebuilding:** run `node scripts/check-image-privacy.mjs`, `node scripts/check-image-privacy.mjs --context`, and `sh scripts/check-image.sh passdown:local`. Expect all checks to pass. The context probe uses synthetic private notes/settings and proves they are excluded; the runtime check rejects source, tests and non-license Markdown while retaining license notices. The image build must also finish without reporting that picture reads trace the whole project; existing display pictures and resized copies must still load.
5. **Proxy — after rebuilding:** run `node scripts/check-proxy.mjs --live`. Expect normal shared-address sign-ins, IPv6 /64 grouping, independent-network access and log privacy checks to pass. It prints the address seen through the host port; verify real external client addresses separately using the [network checklist](../self-hosting/development-stack.md#network-addresses-and-request-limits). A shared Docker gateway is an evaluation limitation, not proof of per-client protection.

6. **Pagination during updates — Studio → Manage → Catalog or Things:** use a list with more than 25 visible records. Enable slow network throttling, click a sortable column heading, and observe **Previous/Next** while the list updates. Both are announced as unavailable until the current response arrives. Focus **Next** with the keyboard and press Enter: focus must stay there while loading and when the last page arrives. Additional Enter/Space presses while unavailable must not start another page request. Then use **Previous** to return. With the pointer, click **Next** once: the next page appears. Open a record and close it; the page and filters remain intact.

7. **Theme contrast — Studio → Manage → Things or Catalog:** switch to dark theme and back to light. The **Columns** button and adjacent actions must remain readable throughout the change, without their background fading through gray while the text has already changed. Repeat at a narrow phone width.

These changes do not publish an alpha release. The earlier intermittent Chromium API connection reset remains under investigation; a passing targeted journey alone does not establish its cause. Full hosted browser validation and the remaining operational/security release checks are still required.

## Creating a guide while options load

1. In a public workspace, open **New guide** with slow network throttling enabled. Expect **Loading guide options…** until the work types arrive; the category picker must not appear early and then jump down when those options load.
2. Once the form is ready, open **What is this about?** with one click. The chooser should open and offer the expected categories.
3. If the options request fails, expect an explanation and **Retry guide types**. Enter a title and summary, then retry while the connection is still unavailable. Expect the entered values to survive and keyboard focus to return to **Retry guide types**. Restore the connection and retry: the available work types should appear without losing those values, and focus should move to **Guide title**.
4. For screen-reader testing, choose a members-only thing on an Internal guide, then switch to Public. The existing status region should announce the visibility warning; switching back clears it without removing the region.

## Guide creation and preparation layout

Use **Studio → a workspace → New guide** (`/studio/{workspace}/new`), then the draft editor’s **Guide details**.

1. Select **Inspection** by clicking anywhere on its card. Expect a small checked indicator, a highlighted card, and the inspection question below the choices. Use Tab and arrow keys to change the selection; the focus indicator must remain visible. A custom workspace type still displays its configured label and description.
2. Enter a title and summary, open **What is this about?**, and choose a thing. Cancel and reopen the picker before choosing; your typed fields must remain intact. Complete the **Guide essentials** section and confirm difficulty and duration remain editable.
3. Under **Tools, materials & parts**, use **Add something you keep** and choose a catalog item. Expect a compact item card with its name/specification, **Amount**, **Unit**, **After this guide**, and **Optional for this guide**. Choose **Exact quantity** to reveal the number field; switch back to **As needed** to remove that field.
4. Expand **Guide-specific notes**, type a note, collapse it and reopen it. Expect the text to remain. Notes already saved on a draft open expanded. Mark the item optional and change **After this guide** to **Used up or fitted**; expect the item to stay in the same position, with its notes open and keyboard focus still on the dropdown. Switch back to **Kept for reuse** and confirm the same behavior, including when several items are present. Removal still requires confirmation.
5. In a public workspace, choose **Internal** under **Section**, then reopen the catalog picker. Member-only items are available. Choose **Public** and reopen it: member-only options are excluded. A private workspace shows the membership notice without offering a public section.
6. Click **Create draft**. Expect the step editor to open; nothing is published. Open **Guide details** and confirm the essentials, selected item, amount and note. Edit them, choose **Save draft**, reload, and confirm the saved values remain.
7. Repeat at 390px and 320px widths and in light/dark themes. Work-type cards become a single column; quantity fields fit the item card; labels, focus and actions remain visible without horizontal scrolling. Desktop-only draft guidance must not push the mobile form down.

The redesign shares its choice cards, section hierarchy and quantity controls with draft editing. It does not add autosave or change catalog records, publication snapshots or permissions. Notes are optional disclosures; required fields and validation remain visible.

## Source readiness checks

1. Open the repository README and follow **GitHub Sponsors**. Expect the `nanwer` sponsorship page. The repository funding configuration points to the same account; GitHub controls whether a Sponsor button appears for that account.
2. From an up-to-date development checkout, run `pnpm migrations:check`, then `pnpm local:verify` against your configured local database. Expect a matching migration manifest and **Database schema is current (30 migrations applied)**. A fresh local setup uses the same SQL as before the comment cleanup. Existing installations must keep their recorded checksums intact; a mismatch needs investigation, not a schema reset.

These changes do not add authoring features or announce an alpha release. Existing software and contribution licensing remain in force.

## First-run setup and production configuration

Use a dedicated empty, migrated evaluation database and the hash-only setup-code instructions in [Getting started](../getting-started.md#first-run-browser-setup-and-production-status). Do not clear an existing installation to try setup. Local sample accounts created by `pnpm local:setup` deliberately bypass this screen.

| Feature                     | Exact steps                                                                                                                                                                                                                                                     | Expected result                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Empty installation          | Configure the empty database and setup-code hash, restart, open `/`, `/studio`, then `/setup`.                                                                                                                                                                  | Every page shows only **Set up Passdown**; `/api/health` reports `setup-required`.                                               |
| Missing or wrong code       | Start without the hash, submit the form; then configure a hash, restart, and submit a different code.                                                                                                                                                           | Missing code gives operator guidance. Wrong code is rejected and focus returns to Setup code; no account is created.             |
| Incorrect-attempt limit     | On an empty evaluation installation, fill the form with valid account details and an incorrect setup code. Submit at least 31 times within one minute until the rate-limit message appears. Immediately replace only the code with the correct code and submit. | Incorrect attempts receive a wait message after the shared limit is reached; the correct code still completes setup immediately. |
| Password validation         | Fill every field, use different Password and Confirm password values, submit.                                                                                                                                                                                   | Inline mismatch error, focus on Confirm password, entered values retained.                                                       |
| Complete setup              | Enter the valid code with hyphens/lowercase, name, `Owner@Example.org`, matching 12–200-character password, and workspace name. Submit once.                                                                                                                    | Studio opens signed in; the chosen workspace appears; no password-change screen.                                                 |
| Later sign-in               | Sign out, open `/sign-in`, enter `Owner@Example.org` and the chosen password. Repeat with lowercase email.                                                                                                                                                      | Both sign-ins work.                                                                                                              |
| Permanent closure           | After setup, open `/setup`; submit another POST to `/api/setup` from the configured origin.                                                                                                                                                                     | Both return 404; no additional account or workspace is created.                                                                  |
| Connection uncertainty      | If the browser reports setup may have finished, reload `/setup`; if unavailable, sign in with the chosen credentials.                                                                                                                                           | Successful setup remains intact; the page explains recovery without deleting accounts or silently retrying.                      |
| Keyboard and small screens  | Before completing setup, Tab through every field and submit with keyboard. Repeat at 320px and 390px in light/dark themes.                                                                                                                                      | Labels, focus and errors are available; no horizontal overflow; submit remains reachable.                                        |
| Production without settings | Start a production build without database/sign-in settings. Open `/` and request `/api/health`.                                                                                                                                                                 | Installation configuration page; no sample guides or studio navigation; health is 503 `not-configured`.                          |
| Production preview guard    | Set `GUIDE_DEMO_PREVIEW=1` on a configured production build and open the preview path.                                                                                                                                                                          | No preview identity or sample library is available.                                                                              |

Automated setup browser checks: `pnpm test:setup` runs Chromium, Firefox and WebKit sequentially, each with a new disposable database and server on port 3106. Setup traces/screenshots are disabled to avoid recording entered credentials. The source-built container and setup-code renewal checks are below. Installation-wide account recovery, backup/restore, upgrade tooling and deployment certification remain unfinished.

## Keeping an unfinished form open

1. In **Studio → Manage → Things**, open a thing, choose **Edit or move**, and change its name without saving.
2. Open **Sits inside**. Use Tab and Shift+Tab to move through the picker controls; focus should reach the picker actions, then wrap from the last control back to the first; Shift+Tab should wrap in the opposite direction. It must never enter the underlying form. On macOS Safari, use Option+Tab when your keyboard settings otherwise skip buttons.
3. Explicitly test Option+Tab from **Close dialog** and Option+Shift+Tab from **Search things** on macOS: focus must wrap to Search things and Close dialog respectively, without entering the parent. Linux CI sends both combinations explicitly as well.
4. Press Escape. Expect only the picker to close, focus to return to **Sits inside**, and your edited name to remain in **Edit thing**.
5. Reopen and dismiss the picker several times, including immediately after opening. Expect the same preserved form every time. Cancel the edit afterward; the unsaved name must not be stored.

## Catalog picker

| Feature                   | Steps                                                                                                                        | Expected result                                                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search while typing       | Open a guide in Studio, select a step, then choose **Add from catalog**. Type part of an item name or specification.         | The dialog is titled **Choose from the catalog**. The list narrows as you type. There are no category or type filters: an item carries no permanent classification.                                      |
| Add an item               | Choose an item from the list.                                                                                                | The dialog closes and the item appears in the step's requirements. Reopening the picker shows it marked **Added**.                                                                                       |
| Create from the picker    | As somebody who manages the workspace, type a name that matches nothing, then choose **Create catalog item**.                | The same dialog switches to **Create catalog item** with the typed text in **Item name**. Saving adds the item to the step and closes the dialog. A reader with view permission does not see the button. |
| Back and dismissal        | Start creating an item, type a specification, then choose **Back to catalog**. Repeat with Escape and with the close button. | **Back to catalog** returns to the list without saving. Escape or close dismisses the whole dialog; reopening starts at the list. No catalog item is created until **Save** is chosen.                   |
| Narrow screens and themes | Repeat at 390px and 320px wide, and in dark mode. Scroll the create form to its actions.                                     | The dialog keeps space from the viewport edges, its actions remain reachable, and nothing overflows horizontally.                                                                                        |

Opening and dismissing the picker never saves anything. Creating a catalog item saves that shared item immediately; publishing the guide still needs its own explicit action.

## Publication and naming

| Feature             | Steps                                                            | Expected result                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product name        | Open the library, a guide and Studio.                            | Headers and browser titles identify Passdown; existing content and workspace names remain unchanged.                                              |
| Public project      | Open the repository README and ROADMAP.md.                       | Purpose, working features, setup and upcoming outcomes are clear; the roadmap distinguishes working and future functionality.                     |
| Commit explanations | Inspect a main-branch commit and its comment.                    | Subject, reason, changes and validation are readable. Future local commits require an explanatory body.                                           |
| Automated checks    | Open the latest main-branch run in the repository's Actions tab. | The checks cover commit explanations, types, unit tests, production build, browser navigation, database behavior and complete authoring journeys. |

## Core authoring and discovery

| Feature                 | Steps                                                                                                                            | Expected result                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live search             | In the library, type part of a guide title without Enter; clear it and choose a chip.                                            | Results follow typing, preserve focus/scroll and stay within the chosen thing.                                                                           |
| Nested things           | In **Studio → Manage → Things**, add a thing, then add several inside it from each row's **+**. Rename/move a branch and reload. | Identity and nesting persist. Cyclic/invalid moves and duplicate sibling names are rejected.                                                             |
| Browsing things         | Open a thing's page in the library, drill down, use breadcrumbs and search.                                                      | A page includes authorised guides filed anywhere inside it; an empty one has a helpful empty state.                                                      |
| Deactivate/reactivate   | Open an unused thing or catalog item, choose **Deactivate**, then find it under **Inactive** and **Reactivate** it.              | Confirmation and recovery are available; nothing is deleted. A thing still in use cannot be deactivated; existing item snapshots remain readable.        |
| Guide creation          | Choose New guide, fill title/summary and choose what it is about. Add a missing thing inline.                                    | Unsaved values survive; the chosen thing and new draft persist. The draft is absent from public readers.                                                 |
| Rich text               | Select step text and apply emphasis, headings, lists, quotes and links. Insert each panel type.                                  | Formatting is immediately editable, with visible active controls and undo/redo.                                                                          |
| Tables                  | Insert a table, type in cells, hover a row/column boundary and use its plus handle. Use the Table menu with a keyboard too.      | Cells insert at the indicated boundary; content, undo/redo and save/reload remain correct. Wide tables scroll locally.                                   |
| Catalog                 | Create an item with an exact size/specification, then search for and select it from a guide.                                     | Items are reusable records. Inline creation preserves guide text and starts from what you searched for.                                                  |
| Preparation and steps   | Prepare one screwdriver and five screws. Reuse the screwdriver in two steps; allocate two new screws then three.                 | One screwdriver remains in preparation. Consumption totals five; lowering the confirmed total blocks publication with an actionable explanation.         |
| Preconditions           | Add a warning and an earlier-step dependency. Reorder the dependent step ahead of its prerequisite, then repair the order.       | References remain stable; invalid order blocks publication and points to the affected step.                                                              |
| Legacy preparation      | Open an older draft with original preparation notes and link each to a catalog item.                                             | Original wording remains in guide-specific notes; unresolved entries block new publication but not draft saves.                                          |
| Safe removal            | Remove the last step usage of an item, then try deleting a prerequisite step.                                                    | Choose whether to keep the preparation entry. Referenced-step deletion explains dependencies instead of leaving broken references.                       |
| Save/reload             | Edit steps, save, reload and inspect preview.                                                                                    | Saved content/order/requirements persist. Later unsaved input is not overwritten by a slow save response.                                                |
| Conflict recovery       | Open the same draft in two tabs; save different edits from each.                                                                 | The stale tab retains its input and offers explicit recovery/reload. It cannot silently overwrite the winner.                                            |
| Publication             | Save, publish with explicit content terms and open the reader. Edit/save again before republishing.                              | The dialog closes on success. The reader remains on the old release until another successful publication.                                                |
| Catalog changes         | Edit an item's specification, then review/apply its update in an existing draft. Save, inspect the reader and republish.         | Guide quantity/notes are retained; only a new release changes the published item details.                                                                |
| Cancellation            | Begin inline creation on a slow connection, dismiss it and continue editing.                                                     | Late responses cannot auto-select canceled results or overwrite newer input. Successfully created shared records still appear in their management lists. |
| Private workspace       | Publish in Workshop operations and open the reader signed out.                                                                   | Members can read it; signed-out pages/APIs return 404 without revealing private names or counts.                                                         |
| Accessibility and theme | Use keyboard navigation, Escape, theme switching and a narrow viewport.                                                          | Controls/focus remain reachable; dialogs restore focus; layout reflows without page-wide horizontal scrolling.                                           |

## Current limitations

Writing needs manage permission; manual saves without browser draft backup; the tree of things is at most 16 deep; tables in a guide are limited to 10 columns and 51 rows. Attachments other than pictures, merged cells, cross-guide prerequisites, approval workflows and simultaneous collaborative editing are unfinished. Demonstration guides are examples, not verified repair instructions. See [development status](status.md) and [roadmap](../../ROADMAP.md).

## Names and places in the studio

1. Open the guides page, a guide in the editor, **Manage**, **Things**, **Catalog** and **People**. Expect the small line above each heading to read `<workspace> / Guides` or `<workspace> / Manage`, each part a link except the page you are on.
2. On **Things**, **Catalog** and **People**, expect the same three tabs — Things, Catalog, People — with the current one underlined.
3. Look for the words "category", "categories", "subcategory", "Tools & materials" and "Workspace library" anywhere in the studio, the library and the reader. Expect none; the tree is called things and the catalog is called the catalog.
4. Check browser tab titles: `Guides · Studio · Passdown`, `Catalog · Studio · Passdown` and so on, and `Sign in · Passdown`.
5. A thing or catalog item is **Deactivated** and **Reactivated**, and its status reads Active or Inactive.

## Things and catalog tables

1. Open **Studio → Manage → Things**. Expect a table with Name, Code, Guides, Published, Visible to and Status. Only the top level shows; **+**/**−** beside a row opens or closes what is inside it without opening the thing.
2. Hover a Guides figure. Expect the split, such as `1 here + 4 inside`; the figure counts each guide once.
3. Type in the search box. Expect matching things with the things they sit inside shown in grey, marked `contains matches`, and the **All / Active / Inactive** counts to follow the search with All equal to Active plus Inactive. A matching thing with more matches inside it opens by itself — search for a top-level thing's name and expect what is inside it listed underneath without pressing **+**. Its **−** still closes it; changing the search opens everything again.
4. Choose any column header, then the same header again. Expect the rows to sort by it and then reverse; siblings sort among themselves and the tree stays a tree. The sort survives changing status or search.
5. Expect short codes such as `GC-0001` in the **Code** column, and the same code under **Code** when a thing is opened. Turn the column off under **Columns**, reload and expect it still off; **Name** cannot be turned off. Rename or move a thing and expect its code unchanged. (A browser that had already saved a column choice before this change keeps that choice; turn **Code** on once.)
6. Choose a thing's name. Expect a panel from the side with its picture, facts and actions; press Escape and expect the same table, still searched, sorted and opened as before, with focus on that row.
7. Open a thing that still holds a guide and choose **Deactivate**. Expect a list naming what still uses it, with links, and the confirm disabled. Move the guide elsewhere, reopen it, and expect deactivation to proceed.
8. With the keyboard only: search for two unused things, open the first, **Deactivate** and confirm. Expect the sheet to close, the row to disappear from **Active**, and focus on the row now in its place (press Enter and expect that thing to open). Deactivate the last one left and expect focus in the search box. Do the same for a catalog item.
9. Search for `zzzz`, choose **Add a thing** and add `New unrelated thing`. Expect the search to clear and the new row to be visible with focus on it. Choose **Inactive**, add another, and expect the table to switch to **Active** with the new row focused. Adding inside a folded branch opens the branch. On a slow connection (developer tools → Network → Slow 3G), add a thing and click into the search straight away: expect the new row not to take focus from the search when it arrives, so typing keeps going into the box.
10. In **Catalog**, choose **Inactive**, then **New catalog item**, create one and press Escape on the record that opens. Expect **Active** selected, the table turned to the page holding the new item, and focus on its row.
11. Open **Catalog**. Expect Name, Specification, Part number, Guides and Status, sorted by name; Manufacturer, Model, Unit and Visible to are available under **Columns**. With more than 25 matching items, expect **Previous** / **Next** and `Showing 1–25 of …`. Open an item from page 2 and close it: expect page 2 again.
12. Repeat at 390px wide and in dark mode. Expect the table to scroll sideways inside its panel, never the page.

## Paged management and combined filters

1. Open **Studio → Manage → Catalog** with more than 25 items. Choose **Next**, open an item and close it. Expect the same page, search, sort and column choices, with focus returned to the item. Sort by a column and expect the entire matching catalog to be sorted, not just the rows already displayed. Names such as `Item 2` precede `Item 10`; equal manufacturer or usage values keep names in alphabetical order in either sort direction.
2. Combine a search, **Visibility → Members only**, and **Guide usage → Used in guides**. Expect only records meeting every condition. Change **Active / Inactive / All** and verify **All = Active + Inactive**; the counts cover every matching page. **Clear filters** resets search and filters while retaining sort and chosen columns.
3. Open **Things** with a branch containing more than 25 children. Expand it, then page forward. Expect the parent repeated as context so each child still has its place in the tree. Context rows may make the displayed table longer than 25 rows. Search for a parent path and expect its matching descendants to be revealed; sorting keeps siblings together.
4. Create a thing or catalog item while an incompatible visibility, usage, status or search filter is active. Expect only the filters hiding it to clear, and its containing page to be selected. The new thing receives focus; the catalog item opens its record and returns focus to its row on close.
5. With a slow network, create a thing, then immediately start a different search. Expect the late response not to change the new search or take focus. Without another action, expect the arriving thing to receive focus. If a list request fails, expect an error and **Try again**, without a permanent loading announcement. If options fail to load in **Add a thing**, restore the connection and choose **Retry loading options**; expect your typed name to remain and saving to become available.
6. Open a thing with guides, then rename or move it so it leaves the current search/page. Expect its record to remain open with accurate guide counts. Change or remove its picture; expect the open record to update immediately and subsequent editing to use the new version.
7. Sign in with **view** permission. Usage counts and the Used/Not used filters must reflect only guides that account may read, with no hints about inaccessible drafts or guides. A signed-out or unrelated account cannot use the studio management endpoints.
8. With access to one workspace, expect the studio header link to say **Studio**. With several accessible workspaces, expect **Workspaces** and a selection screen.

Guide usage includes accessible current drafts and current publications; superseded releases do not keep an item in Used. Test the management controls at phone width and in dark mode, using the keyboard as well as the mouse.

## Fixes from the interface audit

1. **Typing before the library has loaded.** Open the library on a slow connection (browser developer tools → Network → Slow 3G) and type a guide's title into the search box as soon as it appears. Expect the results to narrow to that guide and the address to gain `?q=…` once the page finishes loading, with your words still in the box. Before, the words stayed in the box and nothing searched.
2. **Step title focus border.** In the editor, click into a step's title and leave the pointer over it. Expect the blue focus border to stay; before, hovering replaced it with the grey hover border. A title without focus still shows the grey border on hover.
3. **Enter straight after moving the caret.** In a step's instructions, type `Read the manual.`, select `manual`, make it a link, press → twice and Enter at once. Expect the link kept and a new line after the full stop. On a busy machine the editor used to act on the old selection, so Enter replaced the linked word. The same fix applies to every key command (Backspace, formatting shortcuts) pressed immediately after the caret moves.
4. **Typing across table cells in Firefox.** Insert a table, click a cell, type `Part`, press Tab and type `Quantity`. Expect the words in adjacent cells. Repeat with Shift+Tab, insert a panel inside a cell, save and reload; expect the cell contents and panel to remain. At phone width, moving into a cell off-screen should reveal it. Tab to the table's scroll region from outside the editor and use Left/Right; expect the wide table to scroll without changing its text.
5. **Table insertion at a scrolled edge.** In Safari/WebKit, insert a table with enough columns to scroll horizontally and at least five rows. Scroll sideways, then scroll the page until the last row is near the bottom of the window. Hover that row’s lower edge, including the area covered by the horizontal scrollbar. Expect the row insertion handle to appear; clicking it adds a row after the last row without changing existing cell text. Save and reload to confirm the new row remains.

## Catalog usage

1. Open **Studio → a workspace → Manage → Catalog**. Expect items used by guides to show a total such as `3 guides`, counting each guide once, with the drafts/published split on hover. Unused items show nothing.
2. Use the **All / Active / Inactive** tabs together with the search. Expect All to equal Active plus Inactive for whatever the search matches.

## Newer components are no longer overridden by older styles

1. Open **Studio → a workspace → Manage → People**. Expect **Invite somebody** as a compact card heading, rounded input and select fields, and white text on the blue **Create an invitation** button.
2. Repeat in dark mode and at 390px wide. Expect the same, with nothing overflowing.
3. Open the library, a guide, the studio, a guide in the editor and **Add from catalog**. Expect every one to look exactly as it did before this change; only the People screen was meant to change.

## Step outline

1. Open a guide in the editor whose step titles are long enough to wrap in the left-hand outline (for example the sample _Get to know a bicycle brake_).
2. Expect each step number (`01`, `02` …) on one line beside its title, however many lines the title takes.

## The interface after the move to utilities

Every screen was rebuilt from utility classes without meaning to change how anything looks. Checked element by element in 34 states; these steps are for a person's eye.

1. Open the library, a thing's page, a guide, sign-in, the studio's guide list, a guide in the editor (with its menus, a table, a picture with marks, the catalog picker and the publish dialog), Manage, Things, Catalog and People. Expect each to look as it did before.
2. Repeat at 390px wide and in dark mode.
3. One intended difference: in the editor's reader preview at phone width, a step's title is now 22px, as in the reader itself. It used to stay at 24px.
4. Turn on reduced motion in the operating system and expect no transitions; turn on forced colours and expect buttons, fields and dialogs to keep visible outlines.

## One button everywhere

1. Look at buttons across the library, a guide, the 404 page, sign-in, the studio, the editor and People. Expect one look everywhere: primary blue, secondary with a border, the same height and text size. Hover changes the background; disabled buttons are grey and show a not-allowed cursor.
2. In the editor, look at **Move up**, **Move down**, **Duplicate** and **Remove** above a step. Expect compact, muted buttons; on the first step **Move up** is faded, not grey-filled.
3. At 390px wide, expect the editor header's **Preview**, **Save draft** and **Publish…** to use tighter, even padding, and **New guide** on the guides page to keep space below it.
4. Choose **Add from catalog**, select an item in a step's requirements and look at its **Remove** and quantity buttons. Expect secondary buttons to keep their border.
5. With a forced-colours mode on (Windows High Contrast, or emulated in the browser's rendering tools), expect every button to keep a visible outline.

## Invitations, second time round

1. Invite an address that already has an account in another workspace. Open the link while signed out. Expect it to say the address already has an account and to offer sign-in, not a sign-up form.
2. Sign in as that address, open the link again, and accept. Expect to land in the new workspace, and the session to list both.
3. Invite an address, let the invitation expire, then invite it again. Expect the second invitation to be issued rather than refused.

## A guide keeps what it is

1. Create a guide with a kind of work and a subject. Edit its instructions, save, reload, and publish.
2. Expect the kind of work and subject to be unchanged at every step, including on the published release.

## A guide's cover

1. Open a draft, choose **Guide details**, and find **Cover picture**. Add one, save, and publish.
2. Find the guide in the library. Expect its card to show that picture.
3. Remove the cover, save and publish again. Expect the card to fall back to the guide's first step picture, and then to the picture of the thing it is about.
4. Change the cover on the draft without publishing. Expect the published guide's card to keep the cover it was published with.
5. Publish a guide with no cover, no step pictures, filed under a thing with no picture. Expect its card to show a plain grey panel with a book outline, not a drawing. Before this change it drew a workbench.
6. With the local sample guides loaded (for example _Get to know a bicycle brake_), expect their cards and the first and third steps of each to keep their drawings. Only the sample guides have drawings.

## Pictures on a step

1. Open a draft and find **Pictures**. Expect a dashed control reading **Add a picture / Drop one here, or choose a file** — no `Choose File` widget from the browser.
2. Drop an image onto it, or choose one. Expect the picture itself to appear beside **Describe this picture**, not a broken image.
3. Describe it and choose **Add to step**. Expect a card with the picture, **Description** and **Caption** on full-width fields, and the ordering controls at the top right.
4. Choose **Use one already added**. Expect each picture in the list to be shown, not a grid of broken images.
5. Repeat at 390px wide. Expect the picture and its fields to stack rather than squeeze.

## The front page

1. Open the home page. Expect a heading, a sentence and the search field, then a row of chips for the things guides are about, then the guides — the first guide visible without scrolling on a desktop screen.
2. Type in the search field. Expect the results to narrow as you type, without a page reload.
3. Choose a chip. Expect that thing's own page — its picture, name and description, anything inside it, a search scoped to it, and the chips still there so you can pick another.
4. Confirm the page did not reload and the position did not jump. Then open `/?category=<id>` directly and expect it to send you to the same page.
5. Give a thing a picture under **Studio → Manage → Things**. Expect it on that thing's chip, on its page, and beside it in the Things table.
6. Repeat at 390px wide. Expect the chips to scroll sideways within their row rather than widening the page.

## Libraries, and who sees which

1. Sign in as a member and open the home page. Expect a tab in the header for each library you can read — **Public guides**, and one named for each workspace whose members-only library holds something.
2. Stay on **Public guides**. Expect only publicly published guides; a members-only guide must not appear here even though you can read it.
3. Choose the members-only tab. Expect the members-only releases of that workspace, and the tab marked as the current one.
4. Open the same members-only address in a private window. Expect 404, with no sign-in prompt and no hint that the library exists.
5. As a visitor on the home page, expect a single tab reading **Public guides**, no link to any members-only library, and a **Sign in** button where a member sees **Open studio**.
6. Narrow the window to a phone width. Expect the tabs to wrap rather than push the page sideways.
7. Choose **New guide** in a public workspace. Expect a **Section** choice defaulting to Public, and a note that a guide can move between sections later. Repeat in a private workspace and expect no choice, only the members-only note.

## A library larger than one page

Publish more than 24 guides in one workspace before starting; the page holds 24.

1. Open the public library. Expect the heading total to be every guide that matched, not the number of cards, and 24 cards below it.
2. Read the line under the results. Expect `Showing 1–24 of N guides` and a **Next** control, so nothing is cut off without saying so.
3. Choose **Next**. Expect the following guides, `Showing 25–… of N guides`, a **Previous** control and the page to land on the results rather than the top.
4. With a later page open, type in the search field. Expect the results to return to the first page of the new search, and the address to drop the page number.
5. Choose a category tab, then page through it. Expect the total and every page to stay within that category and its subcategories, and the search term to survive paging.
6. Open a category page and page through it. Expect the same, with **Next** staying on that category's address.
7. Edit the address to a page beyond the end, such as `?page=99`. Expect a plain explanation and a way back, not an empty library.
8. Open a category that has others inside it and compare each card's total under **Inside this thing** with the guides that branch actually holds. Expect them to agree, and a members-only guide never to be counted on the public side.
9. Repeat steps 1–3 at 390px wide and in dark mode. Expect the summary and controls to stay readable and reachable without horizontal scrolling.

## README and installation documentation

- Open the repository README. The product description, current capabilities, early-development status, and local quick start should be readable without consulting implementation files.
- Follow the Installation guide link. Check that prerequisites, generated login location, app URL, stop/restart instructions, and troubleshooting are all present.
- On a disposable fresh installation, follow steps 1–4. Expect PostgreSQL to start, `LOCAL_ACCESS.md` to contain a generated login, and Studio to accept it. Stop with Ctrl+C and `pnpm local:down`, then restart with `pnpm local:up` and `pnpm dev`; saved content should remain.
- Check that the optional showcase instructions clearly state that they replace local content. Do not run the showcase on a database containing work you want to keep.
- Follow the README links to the roadmap, contribution guide, development status, manual tests, license, and third-party notices. Each should resolve to the intended document.

This documentation update changes no application behavior. Commands were checked against the repository scripts and relative links were validated; a new installation and destructive showcase run were not performed for this documentation-only change.

## Roadmap clarity

1. Open `ROADMAP.md`. Expect a short list of available capabilities, followed by ordered upcoming outcomes, later work, and production-readiness requirements.
2. Compare the photo-upload entry with the editor. Progress and retry controls should be described as available, while non-image attachments remain upcoming.
3. Follow the README, development-status, and contribution links. Each should resolve. Upcoming milestones should state a reader or author outcome and a completion criterion without promising release dates.

This is a documentation update. It does not implement the roadmap milestones or resolve application findings from a review.

## Container evaluation and operator tools

Use the [container evaluation guide](../self-hosting/development-stack.md) and a separate installation; never reset an existing database to test these flows.

1. From `deploy`, run `sh init.sh --domain localhost --http-port 18080 --https-port 18443 --build`. Expect a new 0600 `.env` and one printed setup code. Repeat: expect refusal with the original settings preserved.
2. Build/start as documented. Trust the test stack's certificate, open `https://localhost:18443/setup`, and complete the form. Expect your workspace to open and subsequent `/setup` requests to return 404.
3. Run `docker compose run --rm -T ops setup-state`: expect `complete`. Run `ops migrate`: expect no new migrations. Run `ops help`: expect the supported commands. An unknown command should return exit 2; an absent required database setting should return exit 3 without printing secrets.
   Run `ops version`: expect `passdown <version> (revision <commit>)`. Run `ops status`: expect `Database schema is current (N migrations applied).` and `Setup: complete`. Run `ops runtime-password`: expect the confirmation and the recreate-web command; web keeps working after `docker compose up -d --force-recreate web`. None of these may print a password or connection string.
4. Create a guide, upload a photo, save it, stop with `docker compose down` (no `-v`) and start again. Expect the guide/photo to remain and setup to stay closed. Open the private photo signed out: expect no access.
5. In another fresh evaluation, renew the setup code before completing setup and follow the printed web-recreation command. Expect the old code to fail and the new one to work. After setup, renewal must refuse without changing settings.
6. Run `node scripts/check-proxy.mjs --live` and `PASSDOWN_SKIP_BUILD=1 sh scripts/deployment-boot-check.sh` from the repository root. Expect both to pass and remove their own disposable Docker resources. They must not replace or remove the existing local development stack.

No published images are delivered yet; backup, restore, upgrades, account recovery and nginx have their own sections. Public-domain clean-host and physical-browser release checks remain outstanding.

## Release workflow dry run

The workflow and its steps are described in [cutting a release](releasing.md). A dry run publishes nothing.

1. **Locally, from the repository root:** render install files with stand-in digests.

   ```sh
   node scripts/render-release-assets.mjs --version 0.1.0-alpha.1 --output /tmp/passdown-assets \
     --digest passdown=sha256:$(printf 1%.0s $(seq 64)) \
     --digest passdown-caddy=sha256:$(printf 2%.0s $(seq 64)) \
     --digest passdown-nginx=sha256:$(printf 3%.0s $(seq 64))
   ```

   Expect six files: `compose.yaml`, `compose.nginx.yaml`, `init.sh`, `upgrade.sh`, `backup.sh` and `SHA256SUMS`. Every Passdown image reads `ghcr.io/nanwer/<image>:0.1.0-alpha.1@sha256:…`, and postgres keeps its digest. There is no `build:` anywhere. From that directory, `sha256sum --check SHA256SUMS` (or `shasum -a 256 -c SHA256SUMS`) reports every file `OK`. Change one character in `compose.yaml` and run `node scripts/render-release-assets.mjs --check /tmp/passdown-assets --version 0.1.0-alpha.1`. Expect exit 1 naming `compose.yaml`. The script refuses an output directory that already holds files.

2. **Locally, the boot check from rendered files:** build the three images as in CI, render them into an empty directory using `docker image inspect --format '{{.Id}}' <image>` as each digest, then run `PASSDOWN_DEPLOY_DIR=<that directory> PASSDOWN_IMAGE=passdown:local PASSDOWN_PROXY_IMAGE=passdown-caddy:local sh scripts/deployment-boot-check.sh`. Repeat with `PASSDOWN_PROXY=nginx` and `PASSDOWN_PROXY_IMAGE=passdown-nginx:local`. Each run ends with **Deployment boot check passed** and removes its disposable project.

3. **On GitHub (maintainer):** open **Actions → Release → Run workflow** on `main`, leaving **dry_run** ticked. Expect **Check the version**, six **Build** jobs (three images × amd64/arm64) and **Smoke test from the install files** to pass without asking for an environment approval. **Tag the release images** and **Draft the GitHub release** are skipped. Afterwards no new package version appears under the owner's GitHub Packages, no release or tag is created, and the run has no artifacts.

4. **Refusals:** starting the workflow from a branch with **dry_run** cleared fails in **Check the version** with "Only a release tag can publish". A tag whose version differs from `build-info.ts` fails the same job and names the mismatch. Neither run builds anything.

## Source code link

1. Start the app with `PASSDOWN_REVISION` set to a Git commit hash of 7–40 hexadecimal characters. Open `/`, `/sign-in` and `/studio`. In each footer, Tab to **Source code**. Expect a link to that commit under the public repository's `/tree/` path. `docker compose run --rm -T ops version` reports the same revision in a container.
2. Set `PASSDOWN_SOURCE_URL=https://example.org/source` and restart. Expect every source link to use the override.
3. Clear both values and restart. Expect the public repository root. An invalid or non-HTTP(S) override, or a revision that isn't a commit hash, falls back safely.

## Your account

1. Sign in and select your name in the studio header, or open `/account`. Expect **Your account** with current password, new password and confirmation.
2. Change the password twice without reloading. After each success, expect **Password changed. You are still signed in here.**, empty fields and an enabled **Change password** button.
3. Enter an incorrect current password. Expect its error and focus on **Current password**. Mismatching new passwords focus the confirmation field. A busy database says the account is busy and never claims the password is wrong.

## Withdraw and reinstate a published guide

1. Sign in as a workspace manager. Open a published guide in Studio and choose **Withdraw…**. Enter an optional reason, then choose **Withdraw release N**. Expect a withdrawal announcement, a **Reinstate…** button and **See what readers see**. Unsaved draft text stays intact.
2. Open the reader address as a former reader. Expect **This guide has been withdrawn**, no title, instructions or photos, HTTP 200 and noindex metadata. An outsider to a private guide still gets 404.
3. Choose **Reinstate…**, wait for the dependency checks, then **Reinstate release N**. Expect the same release number to become readable again. An inactive or restricted dependency disables confirmation and explains why.
4. Open two editor tabs. Change the publication state or audience in one, then confirm an old action in the other. Expect it to be refused as out of date, with the publication state and audience refreshed, licence consent cleared and unsaved text preserved.
5. A withdrawn guide stays in Studio's **Withdrawn** filter but disappears from the library and from active catalog usage. Moving it between sections is unavailable until it is reinstated or republished. Saving a changed draft and publishing ends the withdrawal with a new release.

## Installation administrators and reset links

1. Complete first-run setup on a fresh evaluation installation. Run `docker compose run --rm -T ops admin list`. Expect the setup account, granted via `setup`.
2. Sign in as that administrator and follow **Administration** to `/admin/accounts`. Search for an account; expect server-filtered results with workspace and status information. A workspace manager who is not an installation administrator gets 404 from this page and its API.
3. For another active account, choose **Create reset link…**, then **Create link**. Expect the one-time link field to take focus, an expiry with a time zone, and Copy and Cancel controls. The account's current password and sessions keep working until the link is used.
4. Choose **Copy link**, then **Cancel this link**. Expect **Link cancelled. It no longer works.** Opening that link shows the invalid-link page.
5. Create another link and open it in a second browser. Set matching passwords of 12–200 characters. Expect to be signed in to Studio, with every previous session for that account signed out. Reusing the link fails. If another account is signed in, the page explains that continuing signs it out.
6. From `deploy`, run `docker compose run --rm -T ops reset-password --email <address>`. Expect the link alone on standard output and its expiry on standard error; an unknown address exits 4. Run `ops admin grant <address>` for a second account, then `ops admin revoke` for each: the last remaining administrator can't be revoked (exit 4). None of these print a password or connection string.

Automated checks cover the database functions in a disposable database (`pnpm test:database:product`), the setup grant (`pnpm test:database`), the operator commands, and the two product journeys in `tests/authoring/release-product.spec.ts` in Chromium, Firefox and WebKit. Still to check before release: concurrent credential races and the complete database denial matrix, wider publication-conflict coverage in the browser, and keyboard, VoiceOver and phone-width passes. A sign-in that verified the old password moments before a reset can still create a session afterwards, because the sign-in library doesn't take the account lock; this is a known limitation.
