# Phase 5, step 22 follow-up: conditional column visibility for all three list routes

**Status: done and verified live (2026-10-08).**

## What this is

A retroactive fix, found via a user-provided screenshot comparison
(real PHP vs. Node, `/tree/{tree}/note-list`), applied to all three
"list" routes shipped so far (steps 20-22: RepositoryListModule/
SourceListModule/NoteListModule). All three were documented as
deliberately rendering "a plain, always-fully-visible table - no
conditional column hiding" (steps 20-22's own write-ups). That
simplification turned out to produce a visibly different page from
real PHP whenever the underlying data happens to make several columns
trivially empty - exactly the case for this tree's own data (see
below) - so it's now ported properly rather than left as a documented
gap.

## Real PHP's actual rule, read directly from each `*-table.phtml`'s own `data-columns` config

Two independent conditions, not one:

1. **Each linked-record COUNT column** (Sources on the repository list;
   Individuals/Families/Media objects/Shared notes on the source list;
   Individuals/Families/Media objects/Sources on the note list) is
   hidden entirely when `array_sum($count_xxx) === 0` across **every**
   row on the page - i.e. a per-column, whole-table check, not per-row.
   `Abbreviation`/`Author`/`Publication` on the source list are the one
   exception: real PHP's own `data-columns` array has `null` (always
   visible) for these three, confirmed by reading the array directly
   rather than assuming every non-Title column is conditional.
2. **"Last change"** is hidden whenever `(bool)
   $tree->getPreference('SHOW_LAST_CHANGE')` is false - a tree-wide
   preference, not derived from the rows at all. Confirmed by grepping
   every `setPreference('SHOW_LAST_CHANGE', ...)` call site in `app/`:
   only the admin tree-preferences form writes it, never seeded with a
   default at tree-creation time - so an ordinary imported tree (like
   this one) has NO `wt_gedcom_setting` row for it at all, and
   `getPreference()`'s own `''` fallback is falsy. **This is why the
   real "ophir" tree's own screenshot never shows "Last change" on any
   of the three list pages** - not a bug, just this tree's own
   preference never having been turned on.

Confirmed against this tree's own real data: the one real shared note
(`N3`) has `individualCount = 8` but `familyCount`/`mediaCount`/
`sourceCount` all `0` - so real PHP shows ONLY "Title" and
"Individuals", exactly matching the user's screenshot, and exactly
what the fix now reproduces.

## Implementation

- **`source.mjs`** gained `loadShowLastChangePref()` - the one new
  piece of shared infrastructure, a single `wt_gedcom_setting` query
  with the same `'' `/`'0'` falsy-string semantics already established
  for `loadTreePrivacyPrefs()`'s own `HIDE_LIVE_PEOPLE`/
  `USE_SILHOUETTE` (default OFF this time, unlike those two's own `'1'`
  default - confirmed from the grep above, not assumed symmetric).
- **`repository-list-view.mjs`/`source-list-view.mjs`/
  `note-list-view.mjs`**: each gained a `showLastChange` parameter
  (resolved by the caller from `loadShowLastChangePref()`) and now
  compute each count column's own visibility internally from the rows
  array itself (`rows.some((row) => row.xxxCount > 0)`) - no separate
  parameter needed for those, since the data to decide is already
  being passed in. Header `<th>` and body `<td>` cells for a hidden
  column are omitted from the generated HTML entirely (not just
  CSS-hidden), matching what DataTables' own `visible: false` produces
  once rendered - any reader of the raw HTML (or a future test) sees
  the same shape real PHP's own rendered-and-decorated table has.
- **`index.mjs`**: each of the three handlers now calls
  `loadShowLastChangePref()` alongside its existing per-type count
  queries and passes `showLastChange` through to its own render call.

## Verification

**Unit tests**: `source.mjs`'s test file gained coverage for
`loadShowLastChangePref()` (no row -> false, `'0'` -> false, `'1'` ->
true, confirms the query target). Each of the three view test files
gained a "column visibility" describe block: every count column hidden
when all-zero, shown when at least one row is nonzero (tested
independently per column on the source/note lists, which have more
than one), Abbreviation/Author/Publication confirmed to stay visible
on the source list even when every count is zero, and "Last change"
confirmed hidden when `showLastChange: false` even with real
non-null data present. Full JS suite: **4773 tests, green** (4759 + 14
new).

**Live verification** - against the real "ophir" tree, via
`docker compose` (restarting both `pages` AND `proxy`, per step 22's
own lesson):

1. `/tree/{tree}/note-list` now renders exactly "Title" + "Individuals"
   for the one real note - byte-for-byte the same two columns as the
   user's own `notes-php.png` screenshot of the real PHP page.
2. `/tree/{tree}/repository-list` (via a disposable member-level test
   user, since this module is member-gated): "Last change" now
   correctly omitted (tree has no `SHOW_LAST_CHANGE` override);
   "Sources" correctly still shown (every real repository has a
   nonzero source count).
3. `/tree/{tree}/source-list` (same disposable user): "Last change"
   and "Shared notes" both correctly omitted (confirmed: this tree's
   573 real sources collectively cite zero shared notes);
   "Individuals"/"Families"/"Media objects" all correctly still shown;
   Abbreviation/Author/Publication confirmed to stay visible
   unconditionally, matching real PHP's own exception for those three.

Also fixed in the same pass, found by the SAME screenshot comparison
(unrelated to column visibility but caught at the same time): the
note-list page's title was "Shared notes" (copied from
`NoteListModule::title()`, the module's own menu label) instead of
"Notes" (the actual string real PHP's `handle()` passes to the view,
`I18N::translate('Notes')` - a different string from the module's own
`title()`, confirmed by reading `NoteListModule.php` directly). Fixed
in both `index.mjs` and the corresponding view test's expectations.
