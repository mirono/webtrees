# Phase 5, step 23: `/tree/{tree}/location-list` (LocationListModule)

**Status: done (2026-10-09); unit-test-verified and gating-verified live; row-rendering not live-verified (the real "ophir" tree has zero `_LOC` records).**

## What this is

The fourth **list** route this migration has ported, following step 20
(`RepositoryListModule`), step 21 (`SourceListModule`), and step 22
(`NoteListModule`). `LocationListModule` (`app/Module/LocationListModule.php`)
is the simplest of the four to port: `Location` (`app/Location.php`) has no
`canShowByType()` override at all - same base-`GedcomRecord` privacy shape as
`Repository` - and its own `$access_level = Auth::PRIV_USER` (member-only),
same default as `RepositoryListModule`, confirmed live (see below).

## Storage, naming, and two linked-record counts

- Locations live in the generic `wt_other` table, `o_type = '_LOC'` - same
  generic-table pattern as Repository (`REPO`) and Note (`NOTE`).
- Naming uses the record's own `NAME` fact (`Location::extractNames()` ->
  `extractNamesFromFacts(1, 'NAME', ...)`), identical mechanism to
  Repository's - reuses `extractNameFromFact()` from `individual.mjs`
  unchanged.
- `resources/views/lists/locations-table.phtml` has two linked-record counts
  (Individuals, Families) via `_LOC`-typed `wt_link` rows - one fewer than
  Repository's one count and Note's four, same deliberately
  privacy-bypassing `COUNT(*) ... GROUP BY l_to` shortcut reused as-is.

## Implementation

- **`location.mjs`** (new): `loadLocation()`/`loadLocationList()` (ordered
  by xref, same "DataTables sorts client-side" reasoning as the other three),
  `locationIndividualCounts()`/`locationFamilyCounts()`, and
  `locationCanShowRecord()` (the same `defaultRecordCanShow()`-shaped RESN
  check as `repositoryCanShowRecord()`, keyed on `'_LOC'`). Imports
  `recordLastChange()`/`loadShowLastChangePref()` from `source.mjs` rather
  than duplicating them - the first list module to reuse a sibling record
  type's own generic helpers instead of re-implementing them.
- **`location-list-view.mjs`** (new): `renderLocationListPage()`, same
  hand-rolled-HTML + array-filter cells/headers convention as
  `note-list-view.mjs` (multiple independent conditional count columns),
  trimmed to two counts instead of four.
- **`pages-server/routes.mjs`** / **`proxy/routing.mjs`**:
  `matchLocationListPagePath()` / `isLocationListPagePath()` - same
  exact-match shape as the prior three list routes, wired into both branches
  of `isNodeRoute()` (plain pathname and `?route=`).
- **`index.mjs`**: `handleLocationListPage()`, module name `location_list`,
  default access level `1` (member) - same shape as
  `handleRepositoryListPage()`.

Built from the start with the conditional column-visibility behavior
(count columns hidden when every row sums to zero; "Last change" hidden when
`SHOW_LAST_CHANGE` is off) rather than needing the retroactive fix steps
20-22 required (step 5.22f) - this is the first list route to get that
behavior correctly on the first pass.

## Verification

**Unit tests**: new `pages_server_location.test.js` (loader/count/privacy
functions) and `pages_server_location_list_view.test.js` (row rendering,
"Never" case, no-time case, title escaping, column-visibility matrix).
Route-matcher tests added to `proxy_routing.test.js`. Full JS suite:
**4798 tests, green** (4773 + 25 new).

**Live verification** - against the real "ophir" tree, after restarting
both `pages` and `proxy` (step 22's own lesson: `proxy`'s routing logic
needs its own restart, not just `pages`'):

1. Anonymous `GET /tree/ophir/location-list` -> **403** (member-only
   default, no `wt_module_privacy` override row) - cross-checked against
   `repository-list` (also member-only, also 403 anonymous) and `note-list`
   (visitor-open, 200 anonymous) in the same request batch, confirming the
   access-level distinction itself works, not just a static result.
2. Full row-rendering NOT live-verified: the real tree has zero `_LOC`
   records (`SELECT o_id FROM wt_other WHERE o_type='_LOC'` returns no
   rows), so there's nothing to render beyond the empty-table case already
   covered by unit tests.

## What's next for the "list" family

`FamilyListModule` and `MediaListModule` remain, but neither matches this
"simple list" shape: `FamilyListModule` extends
`AbstractIndividualListModule` (759-line shared base with surname-index
logic, not yet ported) and `MediaListModule` is folder/filter/pagination-
based with no DataTables config at all - both are their own, larger,
separately-planned undertakings, same as `AbstractIndividualListModule`
itself. `SubmitterListModule` remains disabled in this tree.
