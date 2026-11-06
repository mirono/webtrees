# Phase 5 step 37: StatisticsChartModule

`/module/statistics_chart/{Chart|Individuals|Families|Other|Custom|CustomChart}/{tree}`
— served entirely by Node. The TENTH chart route, the SECOND
(deliberately narrow) use of PHP's generic `/module/{module}/{action}/{tree}`
route shape (see `matchHourglassChartActionPath()`'s doc comment for
the first), and by far the largest single module ported so far: four
tabs (Individuals/Families/Other/Custom), 88 distinct `#tag#`
placeholders backed by ~60 underlying query methods, plus a 13-variant
"build your own chart" form. Scoped to full fidelity, per the user's
explicit choice.

Unlike every earlier chart, this one has no `{xref}` of its own at
all — it's a tree-wide chart, not an individual's.

## Architecture — four files, two different delegation outcomes

1. **`pages-server/statistics-data.mjs`** — raw SQL query functions,
   one per `StatisticsData.php` method the 88 tags need. Initially
   delegated to a subagent (mechanical SQL transcription, the same
   category of work as the relationship-naming service in step 36),
   then substantially rewritten after live verification surfaced real
   bugs — see "What the delegated SQL actually got wrong" below.
2. **`pages-server/statistics.mjs`** — thin wrapper/formatting
   functions, one per `Statistics.php` method (also initially
   delegated, also fixed afterward). Every record/name-returning tag
   returns a raw `{xref, gedcom}` object (or `null`, or an array of
   such) — NOT a formatted HTML string. Privacy/link rendering is
   deliberately NOT done here.
3. **`pages-server/statistics-records.mjs`** (hand-written) — the
   privacy bridge between (2)'s raw records and final HTML, mirroring
   `StatisticsFormat::record()` exactly (`canShow() ? <a>fullName</a> :
   fullName()`, where `fullName()` itself falls back to "Private").
   Reuses `buildChartBoxViewModel()` from `chart-box.mjs` for
   individuals; families get their own small privacy helper (husband +
   wife names joined with " + ", gated on `familyCanShowRecord()`) —
   same "no root individual, resolved fresh per record" shape as
   Lifespans/Timeline, since a tree-wide statistics page has no single
   viewer-relative root to safely share a computed privacy result from.
4. **`pages-server/statistics-custom-chart.mjs`** (hand-written) — the
   "Custom" tab's build-your-own Chart.js bar chart: 13 X-axis
   dimensions × Y-axis (numbers/percent) × Z-axis (none/sex/date-period),
   ported directly from `StatisticsChartModule::postCustomChartAction()`
   and its private `axis*()`/`fillYData()`/`findAxisEntry()`/`myPlot()`
   helpers. Kept out of the delegation entirely — the axis matrix is
   the one genuinely algorithmic piece of this module, same reasoning
   as RelationshipsChartModule's graph search in step 36.
5. **`pages-server/statistics-chart-view.mjs`** (hand-written) — pure
   HTML assembly for the tabbed page shell and all 18 content blocks
   (6 Individuals + 6 Families + 6 Other), matching each real
   `resources/views/modules/statistics-chart/*.phtml` block layout
   exactly (verified by reading all 18 template files directly, not
   guessed from tag names alone — see the "age-difference.phtml" note
   below for why that mattered).

All chart-data tags (`chartSex`, `statsAge`, `chartDistribution`, ...)
render as a `<canvas data-wt-chart-type="...">` element read by the
SAME client-side `resources/js/statistics.js` (Chart.js + a geo-chart
renderer) real PHP already ships — no changes needed there.

## `lib/iso3166.js` — a third delegation, pure reference data

`chartDistribution`'s geo-map feature needs every place name resolved
to its ISO-3166-1 numeric code (`resources/js/statistics.js`'s
`geoFeatureForNumericId()` looks features up by that code, zero-padded
to 3 digits — a place name alone renders nothing). Real PHP's
`StatisticsData::getAllCountries()`/`iso3166Numeric()` are two ~250-entry
hardcoded lookup tables (3-letter code → English name, 3-letter code →
numeric code). Delegated as a third, separate, PURELY MECHANICAL
transcription task (253 + 244 entries), independently spot-checked
afterward against 16 codes spread across the alphabet.

## What the delegated SQL actually got wrong (found via live verification, not code review alone)

Unlike step 36's relationship-naming delegation (one invented regex
branch, caught by a structural diff), this delegation's SQL had enough
distinct failure modes that reading the code first and live-testing
second — rather than the reverse — was the only way to catch all of
them in reasonable time:

- **`wt_dates.d_month` is `CHAR(5)`, not `VARCHAR`** — Postgres pads
  it with trailing spaces on SELECT (unlike `length()`, which ignores
  them), so an un-`TRIM()`med `SELECT d_month` returns `"JAN  "`,
  which never matches the 3-letter month keys used downstream. Every
  month-axis custom chart silently rendered all zeros until this was
  caught live and fixed with `TRIM(d_month)` everywhere it's selected
  or compared.
- **`WHERE` before `JOIN`** (invalid SQL, not just wrong results) in
  all four `chartDistribution` sub-queries (`countIndividualsByCountry`
  et al.) — a straight syntax error.
- **A nonexistent `wt_media.m_type` column** in `countMediaByType()` —
  media type actually lives on `wt_media_file.source_media_type`
  (`wt_media` has no type column of its own at all).
- **A nonexistent `wt_dates.d_place` column** in
  `countPlacesForIndividuals()`/`countPlacesForFamilies()` — real PHP
  never queries dates for places either; it regex-scans each record's
  raw GEDCOM text for a `2 PLAC` sub-record under the right `1 EVENT`
  line. Rewritten to do the same.
- **Backward `wt_link` direction assumption** in `parentsQuery()` —
  `wt_link` stores BOTH an individual's own `FAMS`/`FAMC` pointers
  (`l_from` = individual, `l_to` = family) AND a family's `HUSB`/`WIFE`/`CHIL`
  pointers (`l_from` = family, `l_to` = individual) — the delegated
  version assumed the first shape unconditionally for a query that
  actually needed the second, producing an ambiguous-column error and
  a join that could never match any row.
- **Wrong metric entirely** in `ageOfMarriageQuery()` — the name
  suggests "age at marriage" but the real tags here
  (`minAgeOfMarriageFamily`/`topAgeOfMarriageFamily`, shown as
  "Shortest marriage"/"Longest marriage") measure marriage *duration*
  (days until whichever came first of husband's death, wife's death,
  or divorce) — a completely different computation the delegated
  version didn't attempt.
- **Family-level facts silently excluded** from `firstEvent`/`lastEvent`
  (`firstEventRecord()` with an empty fact list) — `wt_dates` rows can
  reference either an individual (BIRT/DEAT) or a family (MARR/DIV);
  the delegated fix for the "any event" case got this right, but the
  specific-facts code path stayed joined to `wt_individuals`
  unconditionally, so `firstMarriage`/`lastMarriage`/`firstDivorce`/
  `lastDivorce` (all family-level facts) always returned nothing.
- **Privacy was never threaded through at all** — every record/name
  function returned either a bare xref string or a hardcoded `'N/A'`,
  discarding the GEDCOM text entirely, with no `canShowRecord()`/
  "Private" fallback anywhere. Required a full second delegation pass
  (change ~25 function return shapes to raw `{xref, gedcom}`) plus the
  hand-written `statistics-records.mjs` bridge described above.
- **Wrong record type for marriage tags** — `oldestMarriageMale()` et
  al. call `marriageQuery('full', ...)`, and that function's `'full'`
  case shows the FAMILY (`family->formatList()`), not the individual —
  unlike `parentsQuery()`'s `'full'` case, which does show the
  individual. Caught only by reading the real PHP source directly
  (the delegated version treated both uniformly as individual
  records); fixed in both the data layer and the `index.mjs` wiring.
- Several tags were left as literal stubs or empty-array placeholders
  (`chartDistribution`, `statsMarrAge`, `statsChildren`,
  `topTenOldestFemaleListAlive`/`MaleListAlive`,
  `ageBetweenSpousesFMList`/`MFList`) — the delegated agent's own
  completion report correctly flagged these as simplified, which is
  what triggered the second delegation pass that implemented them for
  real.

None of this is a case against delegating SQL transcription — it's
the same lesson as step 36 (never trust a subagent's "tests pass"
self-report over independent verification), scaled up because this
delegation covered roughly 4x the surface area in one pass. The fix:
read the real PHP for anything load-bearing before accepting a
delegated SQL rewrite, and live-verify against the real "ophir" tree
(matching displayed totals against direct `SELECT COUNT(*)` queries)
rather than trusting mocked-pool unit tests alone — several of these
bugs (the `CHAR(5)` padding, the `WHERE`-before-`JOIN` syntax error,
the nonexistent columns) only surfaced once real Postgres rejected or
silently mishandled the query.

## `age-difference.phtml`'s label swap

The real template's "Age between husband and wife" card shows
`#ageBetweenSpousesMFList#` (not `FMList`) and "Age between wife and
husband" shows `#ageBetweenSpousesFMList#` — the tag name describes
which spouse's age anchors the sort direction, not the gender order
the surrounding card label leads with. Easy to get backward by pattern-
matching the tag name against the label instead of reading the real
`.phtml` file; caught only because every block in this port was built
by reading all 18 real templates directly rather than inferring their
shape from the tag list alone (`marriage-length.phtml` turned out to
be its own distinct Families-tab block too, not folded into
`lifespan.phtml` as first assumed from the tag names).

## A faithfully-preserved real bug

`Statistics::statsDeath()` has an upstream copy-paste bug: its chart
title reads `'Births by century'` instead of `'Deaths by century'`.
Ported exactly as-is, not silently fixed — same principle as every
other faithfully-preserved quirk in this migration.

## Live-verified

All four tab fragments (`Individuals`/`Families`/`Other` GET fragments
plus the `Chart` tabbed shell) against the real "ophir" tree, with
totals cross-checked directly against the database (`SELECT COUNT(*)
FROM wt_individuals`, sex breakdown, living/dead split, family/marriage/
divorce counts) rather than only against the rendered page — every
number matched exactly. The `Custom` tab's POST endpoint was exercised
across month-of-birth-by-sex, age-at-death, number-of-children, and
world-map distribution variants, all returning real (non-zero,
plausible) data. The "Oldest living individuals" block's
member-only gate was confirmed live for an anonymous visitor (renders
the "cannot be shown" string, not an empty list).
