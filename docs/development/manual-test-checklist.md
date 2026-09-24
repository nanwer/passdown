# Passdown manual test checklist

Start the local app and sign in at [Studio](http://127.0.0.1:3100/studio) using the generated credentials in your private LOCAL_ACCESS.md. Test both Repair collective and Workshop operations. These examples use local test data you create yourself.

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
