# Phase 5, step 25: `/tree/{tree}/individual-list` (IndividualListModule)

**Status: done (2026-10-16); unit-test-verified and live-verified against the real "ophir" tree.**

## What this is

The sixth **list** route this migration has ported, and the second
`AbstractIndividualListModule`-based one (step 24,
`/tree/{tree}/family-list`, was the first). `IndividualListModule`
(`app/Module/IndividualListModule.php`) is the `showFamilies() === false`
sibling of `FamilyListModule` - same shared base class, same
collation/request-param/page-shell infrastructure, different query
joins and a genuinely bigger per-row rendering (`individuals-table.phtml`:
16 columns vs. families-table's 14, plus a real birth/death-date
ESTIMATION algorithm with no family-list equivalent).

## Reused directly from step 24, unchanged

Collation helpers (`collation.mjs`), `resolveListRequest()`,
`filterSurnamesForAlpha()`/`computeSurnsToShow()`, `needsGivenNameSublist()`,
`loadFamilyListPrefs()` (`SURNAME_LIST_STYLE`/`SUBLIST_TRIGGER_I` - both
tree-wide, not per-module), `loadRelatedFamilyXrefs()`,
`getPrimaryNameIndex()`, `resolveFamilyMember()` (reused here for a
standalone individual row, not a family-member role), `Age`, the module-
gating pattern, and the entire page shell (`renderFamilyListPage()`,
`renderSurnamesTable()`) - the last two generalized in this step via a
`routeSegment` parameter rather than duplicated.

## New pieces

1. **`surnameData()`/`givenNameInitials()` generalized on `fams`**
   (`family-list.mjs`): both hardcoded the `FAMS` join; added an
   explicit `fams` parameter (`whereFamily(bool $fams, ...)`'s own
   parameterization) so individual-list can reuse the same functions
   with no join at all. Existing FamilyListModule call sites updated to
   pass `true` explicitly - no behavior change.
2. **`listUrl()`** (renamed from `familyListUrl()`): takes an explicit
   `routeSegment` (`'family-list'` or `'individual-list'`) - real PHP's
   own `listUrl()` is the SAME method on both module subclasses,
   differing only in each module's own `routeUrl()`.
3. **`getAllBirthDates()`/`getAllDeathDates()`** (`individual.mjs`): the
   "every dated fact of whichever tag has one" shape `family.mjs`'s own
   `getAllMarriageDates()` already established, applied to birth/death.
4. **`getEstimatedBirthDate()`** (`individual-list.mjs`): ports
   `Individual::getEstimatedBirthDate()` EXACTLY, including every
   hardcoded year-offset heuristic - walks this individual's own death
   date, every parent family (marriage date + both parents' birth dates
   + every sibling's birth date), and every spouse family (marriage
   date + spouse's birth date + every child's birth date) to build a
   `[min, max]` Julian-day range, picking the midpoint year. This
   turned out to be the single biggest piece of new complexity in this
   step - a real family-graph-walking algorithm, not a simple query.
5. **`getEstimatedDeathDate()`**: much simpler - a real dated fact wins,
   else `estimatedBirthDate + MAX_ALIVE_AGE years` via `GedcomDate`'s
   own `addYears()` (already built in an earlier phase, per its own doc
   comment, for exactly this use case).
6. **`numberOfChildren()`** (individual-level, `individual-list.mjs`): a
   REAL, confirmed divergence from `Family::numberOfChildren()`
   (already ported) - an explicit `NCHI` fact wins outright here, no
   `max()` with the real count.
7. **`individualRowsForSurnames()`**: ports `individuals()`'s own
   `fams=false` path WITH its `setPrimaryName($n)` behavior (tracks
   which NAME fact matched the query, unlike family-list's
   `familyXrefsForSurnames()` which never needs to - family-list always
   shows every one of a spouse's own names regardless of which one
   matched). Returns one row PER MATCHING NAME FACT, not deduplicated
   by individual - a real (if rare) PHP behavior, since real PHP's own
   `individuals()` never calls `->unique()` (unlike `families()`, which
   does).
8. **`renderIndividualsTable()`** (`individual-list-view.mjs`, new):
   the real 16-column markup. Two confirmed, real differences from
   `families-table`'s husband/wife name cell: `individuals-table` shows
   EVERY one of the individual's own names including every married-name
   variant (no `_MARNM` filtering at all in the real template), and the
   Sosa-number column is always hidden/empty - confirmed by reading the
   source that `handle()` only ever calls this view with `sosa: false`
   (Sosa numbering is a different caller's feature, e.g. an ancestors
   chart, never reachable via this route).
9. **`loadShowEstimatedDatesPref()`**: `SHOW_EST_LIST_DATES` (default
   `'0'`) - whether to DISPLAY an estimated date; the estimation itself
   always runs regardless, since it also drives the sort keys.

## Module gating

`IndividualListModule` has **no `$access_level` override**, same as
`FamilyListModule` - `AbstractModule`'s own default, `Auth::PRIV_PRIVATE`
= 2 ("visitor"), applies. Confirmed live: `module_name = 'individual_list'`
is `enabled`, no `wt_module_privacy` override row.

## Live verification

Against the real "ophir" tree: anonymous access 200s; `?surname=SACKS`
renders a real individual (Solomon Sacks) with a LIVE-COMPUTED estimated
birth date ("about 1869", from the family-graph heuristic, since this
individual has no real dated BIRT fact) and matching filter codes;
`?alpha=@`/`,`/`show_all=yes&show_all_firstnames=yes` (4951 real
individuals, ~16s - correct but slower than family-list's own
692-family/~9s, driven by the estimation algorithm's own per-individual
family-graph walk for every date-less row - the same N+1-per-row
characteristic already accepted for family-list) all 200, no server
errors. Real nonzero child counts confirmed in the full response (e.g.
several individuals with 3 children). Full JS suite: 4961 tests, zero
regressions in any previously-shipped route.

## What's next

`MediaListModule` remains - folder/filter/pagination-based, no
DataTables config at all, a different shape entirely from every route
ported so far (the "list family" otherwise COMPLETE: Repository, Source,
Note, Location, Family, Individual are all done).
