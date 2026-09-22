# Passdown manual test checklist

Start the local app and sign in at [Studio](http://127.0.0.1:3100/studio) using the generated credentials in your private LOCAL_ACCESS.md. Test both Repair collective and Workshop operations. These examples use local test data you create yourself.

## Current catalog picker and dialog fixes

| Feature                   | Steps                                                                                                                                                           | Expected result                                                                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aligned catalog filters   | Open a guide in Studio, select a step, then choose **Add from catalog**. Expand **Item category**, select a category with a long name and change **Item type**. | Both filters have visible labels and align at the top. Category names wrap within their control. The category tree stays usable and changing type clears the category filter.                             |
| Distinct nested dialogs   | In that picker choose **Create catalog item**, type an item name, then open **Item category**.                                                                  | The foreground dialog is wider on desktop, has rounded corners and a shadow, and dims/blurs the parent form behind it.                                                                                    |
| Dismissal and recovery    | With the category dialog open, use Tab/Shift+Tab, then Escape. Reopen it and click the dimmed area of the parent form.                                          | Focus stays within the child while open. Each dismissal closes only the child, returns focus to the category control and preserves the item name.                                                         |
| Narrow screens and themes | Repeat at 390px and 320px wide, and in dark mode. Scroll long forms to their actions.                                                                           | Filters stack, dialogs keep space from the viewport edges, controls remain reachable and content does not overflow horizontally. On small screens, backdrop separation takes priority over a wider child. |

These are interface fixes. Saving a catalog entry or publishing a guide still requires its existing explicit action; opening and dismissing a picker does not save the unfinished item form.

## Publication and naming

| Feature             | Steps                                                            | Expected result                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product name        | Open the library, a guide and Studio.                            | Headers and browser titles identify Passdown; existing content and workspace names remain unchanged.                                              |
| Public project      | Open the repository README and ROADMAP.md.                       | Purpose, working features, setup and upcoming outcomes are clear; the roadmap distinguishes working and future functionality.                     |
| Commit explanations | Inspect a main-branch commit and its comment.                    | Subject, reason, changes and validation are readable. Future local commits require an explanatory body.                                           |
| Automated checks    | Open the latest main-branch run in the repository's Actions tab. | The checks cover commit explanations, types, unit tests, production build, browser navigation, database behavior and complete authoring journeys. |

## Core authoring and discovery

| Feature                 | Steps                                                                                                                             | Expected result                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live search             | In the library, type part of a guide title without Enter; clear it and combine a category filter.                                 | Results follow typing, preserve focus/scroll and stay within the selected category.                                                                      |
| Nested categories       | In Studio → Categories, create a root, then several children. Rename/move a branch and reload.                                    | Identity and nesting persist. Cyclic/invalid moves and duplicate sibling names are rejected.                                                             |
| Category browsing       | Open a root category in the library, drill down, use breadcrumbs and search.                                                      | Parent pages include authorized descendant guides; empty categories have a helpful empty state.                                                          |
| Archive/restore         | Archive an unused category or catalog item; include archived entries and restore it.                                              | Confirmation and recovery are available. Referenced categories cannot be archived; existing item snapshots remain readable.                              |
| Guide creation          | Choose New guide, fill title/summary and select a category. Create a missing category inline.                                     | Unsaved values survive; the selected category and new draft persist. The draft is absent from public readers.                                            |
| Rich text               | Select step text and apply emphasis, headings, lists, quotes and links. Insert each panel type.                                   | Formatting is immediately editable, with visible active controls and undo/redo.                                                                          |
| Tables                  | Insert a table, type in cells, hover a row/column boundary and use its plus handle. Use the Table menu with a keyboard too.       | Cells insert at the indicated boundary; content, undo/redo and save/reload remain correct. Wide tables scroll locally.                                   |
| Catalog                 | Create a tool with an exact size/specification and a part/material under nested item categories. Search/select them from a guide. | Items are reusable records. Inline creation preserves guide text and supplies sensible category/type/name defaults.                                      |
| Preparation and steps   | Prepare one screwdriver and five screws. Reuse the screwdriver in two steps; allocate two new screws then three.                  | One screwdriver remains in preparation. Consumption totals five; lowering the confirmed total blocks publication with an actionable explanation.         |
| Preconditions           | Add a warning and an earlier-step dependency. Reorder the dependent step ahead of its prerequisite, then repair the order.        | References remain stable; invalid order blocks publication and points to the affected step.                                                              |
| Legacy preparation      | Open an older draft with original preparation notes and link each to a catalog item.                                              | Original wording remains in guide-specific notes; unresolved entries block new publication but not draft saves.                                          |
| Safe removal            | Remove the last step usage of an item, then try deleting a prerequisite step.                                                     | Choose whether to keep the preparation entry. Referenced-step deletion explains dependencies instead of leaving broken references.                       |
| Save/reload             | Edit steps, save, reload and inspect preview.                                                                                     | Saved content/order/requirements persist. Later unsaved input is not overwritten by a slow save response.                                                |
| Conflict recovery       | Open the same draft in two tabs; save different edits from each.                                                                  | The stale tab retains its input and offers explicit recovery/reload. It cannot silently overwrite the winner.                                            |
| Publication             | Save, publish with explicit content terms and open the reader. Edit/save again before republishing.                               | The dialog closes on success. The reader remains on the old release until another successful publication.                                                |
| Catalog changes         | Edit an item's specification, then review/apply its update in an existing draft. Save, inspect the reader and republish.          | Guide quantity/notes are retained; only a new release changes the published item details.                                                                |
| Cancellation            | Begin inline creation on a slow connection, dismiss it and continue editing.                                                      | Late responses cannot auto-select canceled results or overwrite newer input. Successfully created shared records still appear in their management lists. |
| Private workspace       | Publish in Workshop operations and open the reader signed out.                                                                    | Members can read it; signed-out pages/APIs return 404 without revealing private names or counts.                                                         |
| Accessibility and theme | Use keyboard navigation, Escape, theme switching and a narrow viewport.                                                           | Controls/focus remain reachable; dialogs restore focus; layout reflows without page-wide horizontal scrolling.                                           |

## Current limitations

Owner-only authoring; manual saves without browser draft backup; category depth 16; tables limited to 10 columns and 51 rows. Uploads/PDF attachments, merged cells, cross-guide prerequisites, approval workflows and simultaneous collaborative editing are unfinished. Demonstration guides are examples, not verified repair instructions. See [development status](status.md) and [roadmap](../../ROADMAP.md).

## Category codes, totals and retirement

1. Sign in and open **Studio → a workspace → Categories**. Expect every row to show a short code such as `GC-0001`, and branches holding guides to show a total such as `5 guides`. Hover a total: expect `5 guides: 1 here and 4 in subcategories`.
2. Switch the domain tabs across Guide, Tool and Material categories. Expect codes prefixed `GC-`, `TC-` and `MC-`, each numbering from 0001 independently.
3. Use the **All / Active / Inactive** tabs. Expect All to equal Active plus Inactive, and all three to change as you type in the search box.
4. Select a branch. Expect its code, a `Guides` figure with the direct-plus-nested split, and `Published releases`.
5. Rename a category, or move it under another parent. Expect its code to stay the same.
6. Create a category and enter a code already used in that domain. Expect an error on the code field rather than a generic failure.
7. Select a category that still holds a guide and choose **Archive**. Expect a list naming what still uses it, with a link to those records, and the confirm disabled. Move the guide elsewhere, reopen the dialog, and expect archiving to proceed.

## Catalog usage

1. Open **Studio → a workspace → Tools & materials**. Expect items used by guides to show a total such as `3 guides`, and unused items to show nothing.
2. Use the **All / Active / Inactive** tabs with the search, kind and category filters. Expect All to equal Active plus Inactive under whatever else is filtered.

## Pictures on a step

1. Open a draft and find **Pictures**. Expect a dashed control reading **Add a picture / Drop one here, or choose a file** — no `Choose File` widget from the browser.
2. Drop an image onto it, or choose one. Expect the picture itself to appear beside **Describe this picture**, not a broken image.
3. Describe it and choose **Add to step**. Expect a card with the picture, **Description** and **Caption** on full-width fields, and the ordering controls at the top right.
4. Choose **Use one already added**. Expect each picture in the list to be shown, not a grid of broken images.
5. Repeat at 390px wide. Expect the picture and its fields to stack rather than squeeze.

## The front page

1. Open the home page. Expect a heading, a sentence and the search field, then the category chips, then the guides — the first guide visible without scrolling on a desktop screen.
2. Type in the search field. Expect the results to narrow as you type, without a page reload.
3. Choose a category chip. Expect the guides to narrow, and a row naming that category with an **Open** link to its own page.
4. Follow that link. Expect the category's picture, name and description, anything inside it, and a search scoped to it.
5. Give a thing a picture under **Studio → Manage → Things**. Expect it to appear on that category's chip, on the row in step 3, on the category page, and beside the thing in the Things tree.
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
