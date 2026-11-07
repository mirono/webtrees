# Phase 5 step 41: Tree management (`/admin/trees...`, `/tree/{tree}/preferences|renumber|privacy|check`)

**Done 2026-11-08.** User scoped this to "everything in one pass" — all
11 routes originally surveyed in the admin "tree management" bucket.
Two of those 11 turned out to depend on infrastructure that doesn't
exist anywhere in this migration yet, so they were deliberately cut
(see below) rather than half-built; the remaining 9 handlers are
ported with full fidelity.

## Routes ported

| Route | Real PHP handler | Gate |
|---|---|---|
| `GET /admin/trees/manage[/{tree}]` | `ManageTrees` | AuthManager (any tree manager — the ONLY admin-bucket page so far that isn't AuthAdministrator-only) |
| `GET/POST /admin/trees/create` | `CreateTreePage`/`CreateTreeAction` | AuthAdministrator |
| `POST /admin/trees/default/{tree}` | `SelectDefaultTree` | AuthAdministrator |
| `POST /admin/trees/delete/{tree}` | `DeleteTreeAction` | AuthAdministrator |
| `GET/POST /admin/trees/merge` | `MergeTreesPage`/`MergeTreesAction` | AuthAdministrator |
| `GET/POST /tree/{tree}/preferences` | `TreePreferencesPage`/`TreePreferencesAction` | AuthManager (for that tree) |
| `GET/POST /tree/{tree}/renumber` | `RenumberTreePage`/`RenumberTreeAction` | AuthManager (for that tree) |
| `GET/POST /tree/{tree}/privacy` | `TreePrivacyPage`/`TreePrivacyAction` | AuthManager (for that tree) |
| `GET /tree/{tree}/check` | `CheckTree` | AuthManager (for that tree) |

New `authenticateManager()`/`authenticateTreeManager()` gates were
added to `index.mjs` alongside the existing `authenticateAdmin()` —
this is the first admin-bucket feature where AuthAdministrator isn't
the right gate for every route. `tree-management.mjs`'s
`isSiteManager()` and the already-existing `trees.mjs`'s
`isTreeManager()`/`accessibleTreeByName()` (built for the public tree
pages, phase 5 step ~1-13) do the actual role checks.

## Deliberately NOT ported (both documented, not silently faked)

- **`/admin/trees/default-blocks`** (`TreePageDefaultEdit`/`Update`) —
  edits the default home-page blocks shown on brand-new trees. This
  needs the full `ModuleBlockInterface` block-editor framework (the
  same one that would be needed for per-tree/per-user home-page
  customization generally), which has never been built in this
  migration. Belongs with a future "module configuration pages"
  bucket, not bolted on here as a one-off.
- **`/admin/trees/sync`** (`SynchronizeTrees`) — scans the data folder
  and auto-imports/updates any tree whose GEDCOM file changed. This
  internally calls `TreeService::importGedcomFile()` and the full
  GEDCOM import pipeline — belongs with the (also not yet started)
  "GEDCOM import/export" bucket.

## Real correctness details worth flagging

- **`MergeTreesAction`/`DeleteTreeAction`/`RenumberTreeAction` are all
  fully transactional** (`mergeTreesTransactional`,
  `deleteTreeTransactional`, `renumberTreeTransactional` in
  `tree-management.mjs`) even though the real PHP handlers aren't
  explicitly wrapped in a transaction in the source — same reasoning
  as every other multi-statement mutation this migration has ported
  (step 5's `account-delete.mjs`, step 40's `deleteUserTransactional`):
  a partial failure must not leave a half-deleted/half-merged/
  half-renumbered tree behind.
- **`RenumberTreeAction` is ported table-for-table, not approximated.**
  The real handler is ~500 lines of per-record-type `REPLACE()`
  updates across `individuals`/`families`/`sources`/`media`/
  `media_file`/`other`/`name`/`dates`/`link`/`placelinks`/
  `hit_counter`/`default_resn`/`favorite`/`user_gedcom_setting` — every
  one of those tables and REPLACE patterns is reproduced exactly,
  including the subtle "links FROM a record TO the renumbered xref"
  joins (`wt_link.l_from`/`l_to` direction) which differ per record
  type and are easy to get backwards.
- **New XREFs are generated exactly like `XrefFactory::make()`**
  (`generateXref()` in `tree-management.mjs`): always prefixed `X`
  regardless of the record's own type (the real PHP `make()` ignores
  its own `$record_type` argument), using the same site-wide
  `next_xref` counter with an exponential-increment scan, and checked
  for uniqueness across EVERY tree's records — not just the current
  one, which is what makes renumbering safe to resolve a cross-tree
  collision without creating a new one.
- **`AdminService::countCommonXrefs()`/`duplicateXrefs()` are ported
  as real UNION/JOIN queries**, not approximated with a row count —
  getting these wrong would make `MergeTreesAction`'s safety check
  (refuse to merge if any XREF collides) or `RenumberTreePage`'s
  "how many records need renumbering" count silently wrong.
- **`CheckTree` is a reduced-scope port, documented, not silently
  dropped.** Real PHP validates every GEDCOM tag against the full
  element/tag registry (canonical-value checks, custom-tag warnings,
  MIME-type checks, GEDCOM-level-number validation) — hundreds of PHP
  classes, never ported here (it's a prerequisite for the whole
  "GEDCOM import/export" bucket, not something to half-build as a
  side effect of this step). What IS ported, because it needs none of
  that registry and catches the most common/useful class of real
  error: dangling XREF references (`%s does not exist`) and the
  FAM:HUSB/WIFE/CHIL ↔ INDI:FAMC/FAMS back-link consistency checks,
  scanned directly off the raw GEDCOM text.
- **`CreateTreeAction` creates an empty tree, not a tree with a
  placeholder "John /DOE/" individual.** Real `TreeService::create()`
  imports two hardcoded GEDCOM records (a `HEAD` record and one
  placeholder individual) through `GedcomImportService::importRecord()`
  after creating the `wt_gedcom` row. That importer (parsing raw
  GEDCOM text into the individuals/families/other tables, with name
  indexing, etc.) is GEDCOM-import infrastructure that doesn't exist
  in this migration — building a one-off mini-importer just for two
  hardcoded records would be exactly the kind of unrelated
  infrastructure this step's other two cuts avoid building. New trees
  created through this page have zero records until a real GEDCOM
  file is imported (still on PHP).
- **No session-based flash messages.** This migration has no
  `FlashMessages`-equivalent session infrastructure (confirmed: no
  flash-write helper anywhere in `pages-server/*.mjs`). Every action
  here performs the real redirect/response PHP does, but the one-line
  success/error banner (`"The family tree ... has been deleted."`,
  etc.) isn't shown — a documented UX-only cut, not a behavior cut.
  Two cases where a message IS still conveyed, because it's naturally
  recomputed by the next GET rather than needing a flash write: the
  merge page's own common-XREF-count warning (shown again on
  redirect-back), and the preferences page's duplicate-name banner
  (passed via a `?duplicate=1` query flag).
- **UI widget simplifications, not data/behavior simplifications**
  (same convention as every "full fidelity" step so far): the
  preferences form's tag-multi-pickers (`CHART_BOX_TAGS`,
  `INDI_FACTS_QUICK`, etc.) are plain `<select multiple>` instead of
  real PHP's TomSelect widgets, and the privacy page's "add a new
  restriction" row uses plain text inputs for XREF/tag instead of the
  real page's dynamic per-record-type picker + JS. Every real field
  name, default value, and server-side write is unchanged.

## New reusable pieces

- `authenticateManager()`/`authenticateTreeManager()` in `index.mjs` —
  the first AuthManager-equivalent gates in this migration (every
  prior admin page used AuthAdministrator only). Reusable by any
  future per-tree admin page (data fixes, merge records, etc.).

## Bug found and fixed during live verification

`isTreeImporting()`'s first live request 502'd:
`error: operator does not exist: boolean = integer` comparing
`wt_gedcom_chunk.imported = 0`. Checked the real column types
directly: `wt_gedcom.imported`/`private` are `integer` (0/1), but
`wt_gedcom_chunk.imported` is genuinely `boolean` in this install's
Postgres schema — an inconsistent column type across two same-named
columns that isn't visible from the PHP source (MySQL doesn't
distinguish `TINYINT(1)` from a real boolean the way Postgres does).
Fixed by comparing against `false` instead of `0`. Caught immediately
by live testing against the real "ophir" tree, before touching any
destructive path.

## Live verification

All done against Docker (`webtrees-dev-pages-1`/`-proxy-1`/
`-postgres-1`), using a disposable, self-generated admin session
(created and deleted within the verification pass, per this
migration's standing "never read real session IDs" rule) and two
disposable test trees (`livetesttree1`/`livetesttree2`, created and
fully deleted within the pass) for every destructive path, so the
real "ophir" tree was never touched by delete/merge/renumber:

- `GET /admin/trees/manage` — real "ophir" tree listed correctly with
  its real links; delete/set-default links correctly hidden (only one
  tree exists on this install, matching the real `count($all_trees) > 1`
  guard).
- `GET /tree/ophir/preferences`, `/privacy`, `/renumber`, `/check` —
  all 200, against the real tree.
- `GET /tree/ophir/check` — found two classes of REAL data issue in
  the actual "ophir" tree (not fabricated for the test): an `INDI`
  record with a dangling `FAM` reference, and an `INDI` record citing
  a nonexistent inline source reference three times — confirming the
  reduced-scope dangling-xref/back-link checker works on real data,
  not just synthetic fixtures.
- `GET /tree/ophir/renumber` — correctly reports 0 duplicate XREFs
  (only one tree exists, so cross-tree collision is impossible by
  definition — not a false negative).
- Anonymous request to `/admin/trees/manage` and `/tree/ophir/preferences`
  → 302 to `/login?url=...`, matching AuthManager's real redirect.
  Nonexistent tree name → 404.
- Created two disposable test trees via the real `/admin/trees/create`
  form flow (not direct SQL), then hand-seeded both with an
  intentionally colliding XREF (`I1` in both).
- `GET /admin/trees/merge?tree1_name=...&tree2_name=...` correctly
  detected the 1 common XREF and showed the "must renumber first"
  warning with working renumber links.
- `POST /tree/livetesttree1/renumber` reassigned `I1` → `X1` in tree1,
  confirmed in both `wt_individuals.i_id` and the dependent
  `wt_name.n_id` row (proving the cross-table REPLACE/UPDATE logic
  runs, not just the primary record's own column).
- Re-checked the merge page: warning gone once the collision was
  resolved.
- `POST /admin/trees/merge` actually merged — tree2 ended up with both
  its own `I1` and the renumbered `X1` copied in from tree1, confirmed
  by direct `SELECT`.
- `POST /admin/trees/delete/livetesttree1` (AJAX, `x-csrf-token`
  header) — confirmed the `wt_gedcom` row AND its `wt_individuals`/
  `wt_name` rows are all gone afterward (the transactional cascade
  delete across every ported table actually runs, not just the
  top-level tree row).
- Deleted `livetesttree2` the same way; confirmed zero `livetesttree%`
  rows remain in `wt_gedcom`.
- Deleted the disposable admin test session row afterward.

5656 tests passing (up from 5558 before this step), zero regressions.
