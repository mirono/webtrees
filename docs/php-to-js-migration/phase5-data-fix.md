# Phase 5 step 46: Data fixes (`/tree/{tree}/data-fix...`)

**Done 2026-11-13.** The admin "run a bulk search-and-fix over every
record of a type" wizard, ported with FULL FIDELITY - all 8 real
built-in fix modules, per the user's explicit choice (not a subset).

## Routes ported

| Route | Real PHP handler |
|---|---|
| `GET /tree/{tree}/data-fix` | `DataFixChoose` |
| `POST /tree/{tree}/data-fix` | `DataFixSelect` |
| `GET /tree/{tree}/data-fix/{data_fix}` | `DataFixPage` |
| `POST /tree/{tree}/data-fix/{data_fix}/data` | `DataFixData` |
| `GET /tree/{tree}/data-fix/{data_fix}/preview` | `DataFixPreview` |
| `POST /tree/{tree}/data-fix/{data_fix}/update` | `DataFixUpdate` |
| `POST /tree/{tree}/data-fix/{data_fix}/update-all` | `DataFixUpdateAll` |

AuthManager-gated for the specific tree, same as tree management,
GEDCOM import/export, and record merge - `authenticateTreeManager()`.
Out of scope (a separate real-PHP feature, not this one): the generic
module-enable/disable admin page (`ModulesDataFixesPage`/`Action`) -
that belongs to the still-unported "module configuration" bucket.

## Scope, per the user's explicit choice

**Full fidelity, all 8 real fix modules** (not the "framework + a
simpler subset" alternative that was also offered):

| Module name | Title |
|---|---|
| `fix-add-death` | Add missing death records |
| `fix-ceme-tag` | Convert `INDI:BURI:CEME` tags to GEDCOM 5.5.1 |
| `fix-duplicate-links` | Remove duplicate links |
| `fix-name-slashes-spaces` | Fix name slashes and spaces |
| `fix-name-tags` | Convert `INDI:NAME:_XXX` tags to GEDCOM 5.5.1 |
| `fix-place-names` | Update place names |
| `fix-prim-tag` | Convert `OBJE:_PRIM` tags to GEDCOM 5.5.1 |
| `fix-search-and-replace` | Search and replace |
| `fix-wt-obje-sort` | Convert `INDI:_WT_OBJE_SORT` tags to GEDCOM 5.5.1 |

## Architecture

`pages-server/data-fix.mjs` is the data/logic layer (the registry of
all 8 modules plus the shared `recordsToFix()`/`gedcomDiff()`
machinery); `pages-server/data-fix-view.mjs` renders the three
non-AJAX pages (module choice, per-module options+table page, preview
fragment).

Like record merging (step 45), every fix writes through the real
per-record pending-changes path via record-merge.mjs's
`applyRecordUpdate()`/`getRecordByXref()`, fully honoring
`auto_accept_edits` - one difference from merge: real PHP's data-fix
modules call `$record->updateRecord($gedcom, false)` (note the
`false`) so, unlike merge, **a data fix never touches CHAN**.

### Deliberate scope cuts/simplifications (see `data-fix.mjs`'s own doc
comment for the full reasoning)

- A module whose real PHP calls `updateFact()`/`updateRecord()`
  multiple times in a loop (once per fact for `fix-ceme-tag`/
  `fix-name-tags`, once per linked individual for `fix-prim-tag`) is
  ported as ONE combined write per record instead of N separate
  `wt_change` rows - same final content, fewer (but equivalent)
  pending changes to review.
- `DataFixService::gedcomDiff()`'s real-PHP step of turning `@XREF@`
  substrings in a diff into clickable links is cut - cosmetic only,
  the diff text itself is unchanged.
- No per-record access-control filtering on `fix-prim-tag`'s
  linked-individuals lookup - admin-only bulk tool, same "admin sees
  everything" simplification already used throughout this bucket.
- **UI simplification, not a functional cut**: the per-module page's
  client-side table is a small hand-rolled fetch-based pager instead
  of a true jQuery DataTables instance (real PHP's own version here is
  genuinely bespoke JS, not the generic `datatables`-class auto-init
  this migration already reuses elsewhere) - same list/preview/update/
  update-all behavior, simpler client code.

### Real correctness details worth flagging (confirmed by reading real PHP directly)

- `recordsToFix()`'s SQL candidate search is DELIBERATELY allowed to
  return records that don't actually need fixing - `doesRecordNeedUpdate()`
  is the real test, applied per row and again before any write.
- The pending-changes union (mirroring `ModuleDataFixTrait::mergePendingRecords()`)
  adds any xref with an uncommitted pending `wt_change` whose old/new
  gedcom contains the literal substring `"@ TYPE\n"` (the tail of that
  type's `"0 @X@ TYPE"` header line) - catches records newly becoming
  that type via a pending edit too. Only unioned for the record types a
  given module actually declares.
- `fix-duplicate-links` deliberately does NOT cover `_LOC` (location)
  records - matches real PHP, which never overrides `locationsToFix()`
  for this module.
- `fix-wt-obje-sort`'s real-PHP SQL candidate search has a copy-paste
  bug (checks `_WT_OBJE_SORT` twice, never `_PGV_OBJE_SORT`, even
  though `doesRecordNeedUpdate()` checks both) - this port's SQL search
  checks both tags, a narrow, strictly-more-complete correction.
- `fix-wt-obje-sort`'s real-PHP record-rebuild has a SEPARATE, actually
  dead filter clause meant to also strip `_PGV_OBJE_SORT` facts that
  can never match anything real - so real PHP leaves old
  `_PGV_OBJE_SORT` lines behind after "fixing" a record. Replicated
  exactly (bug-for-bug), not fixed, per this migration's convention of
  reproducing real-PHP quirks rather than silently improving on them.

## Live verification

Validated directly against Postgres + real HTTP (proxy on port 8000,
disposable test tree, disposable session) for a representative cross
section of the 8 modules, covering both `auto_accept_edits` states:

- `fix-add-death` (auto_accept off): correctly listed a candidate
  individual with a dated 1850 `BIRT` and no death facts as needing
  the fix; update produced exactly one
  pending `wt_change` row (`new_gedcom` ending `1 DEAT Y`), live table
  untouched; a second individual with no death facts but no old-enough
  birth date was listed as a candidate (matching real PHP's
  intentionally-imprecise SQL pre-filter) but correctly reported "no
  fix needed".
- `fix-duplicate-links` (auto_accept on): a family with a duplicated
  `CHIL` link was correctly flagged, and the update immediately
  collapsed to one `CHIL` line in the live row, with the `wt_change`
  row ending up `status='accepted'`.
- `fix-ceme-tag` (auto_accept on): verified the options form renders
  both `ADDR`/`PLAC` choices; converting with `convert=PLAC` correctly
  replaced `2 CEME Old Yard` with `2 PLAC Old Yard` in the live row.
- `fix-search-and-replace`: verified the choose-page POST redirects to
  the right per-module page; verified the full `update-all` two-phase
  flow (the first call returns a chunk-plan JSON array, the
  continuation call actually applies the fix) correctly renamed a
  `NAME` surname across the matched individual's live row.

Comprehensive new unit coverage for all 8 modules plus the view/route
layer was delegated to a subagent and independently re-verified by
re-running `npx vitest run` before trusting the reported count: 6280
tests passing (up from 6096), zero regressions.
