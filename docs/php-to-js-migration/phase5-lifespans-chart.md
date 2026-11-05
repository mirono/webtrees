# Phase 5 step 34: LifespansChartModule

`/tree/{tree}/lifespans` — served entirely by Node. The SEVENTH chart
route, and the first with a genuinely different shape from everything
ported before it: not rooted at one individual with generations, but
a free-form, user-ACCUMULATED set of individuals, laid out as
overlapping horizontal bars (a Gantt-style timeline) and filterable by
place and date range. Scoped to full parity (place/date search
included), per the user's explicit choice when asked whether to scope
it down.

## Shape: accumulation, not traversal

Every `xref` this chart ever shows comes from one of four sources,
all mergeable in a single request:

1. The `xrefs` query string already on the page (dot-joined - the
   modern, 2.1+ encoding; `xrefs[]=...` arrays are also accepted, the
   legacy 2.0-and-earlier encoding) - `parseLifespansXrefs()`.
2. `addxref` (+ optional `addfam`) - add one individual, optionally
   plus every spouse/child of every one of their own spouse AND parent
   families (`closeFamilyXrefs()`, mirroring
   `LifespansChartModule::closeFamily()` exactly).
3. A place-name search (`resolvePlaceId()` + `findIndividualsByPlace()`).
4. A date-range search (`findIndividualsByDate()`).

**A real behavior worth remembering, found reading `handle()` closely**:
a place/date search REPLACES the accumulated xref list outright
(`$xrefs = $this->findIndividualsByDate(...)` - a straight
reassignment, not a merge) rather than adding to it - even an `addxref`
from the SAME request gets discarded if a place/date search also
fires in that request. `resolveLifespansXrefs()` in `pages-server/index.mjs`
reproduces this exactly (the `if/elseif` chain overwrites `xrefs`,
it doesn't concatenate).

## UI simplification: plain text, not TomSelect autocompletes

Real PHP's "Add individuals" field and place filter are both
TomSelect-backed server-searched `<select>`s
(`components/select-individual`/`components/select-place`, hitting
`/tree/{tree}/tom-select-individual`/`/tree/{tree}/tom-select-place`).
This port uses plain text inputs for both - the SAME simplification
already used for every individual-xref field on every other chart's
options form (e.g. CompactTree's/Fan's own `xref` field). The
difference here is that the PLACE filter still needed to be fully
FUNCTIONAL (the user chose full scope, not a cut), so
`resolvePlaceId()` resolves a typed place name string directly against
`wt_places` by walking the parent-child chain from the top level down
(mirrors `Place::id()`'s own recursive algorithm, app/Place.php:100-124) -
no TomSelect/autocomplete endpoint needed at all, since the user just
types the full place name (e.g. "Tel Aviv, Israel") instead of picking
it from a hierarchy dropdown. An unresolvable place name returns 0
(matches real PHP's own "place not found" result), which yields zero
individuals - same as it would for a mistyped place in real PHP too.

## Reused infrastructure (a lot of it)

- **`getEstimatedBirthDate()`/`getEstimatedDeathDate()`**
  (`pages-server/individual-list.mjs`) - already a byte-for-byte port
  of `Individual::getEstimatedBirthDate()`'s full heuristic fallback
  chain (death date, parent/spouse family marriage dates, parents'/
  spouses'/children's own birth dates, all with the same hardcoded
  year-offset guesses as real PHP) from the Individual List work.
  This was the single biggest risk in scoping this chart, and it was
  already done.
- **`GedcomDate`** (`lib/gedcom-date.js`) - already a full port of
  `app/Date.php`, including the exact qualifier/range grammar the
  `start`/`end` form fields need (`GedcomDate.compare()` for sorting
  by estimated birth date, matching `IndividualComparator::byBirthDate()`
  exactly).
- **`buildChartBoxViewModel()`** - reused for every individual's
  `fullNameHtml`/`sex`/`url`/`lifespanText`, with
  `showHighlightImages: false` (this chart never shows thumbnails,
  matching real PHP's own `chart.phtml`) and the privacy-check result
  (`box.canShow`) doing double duty as the "filter duplicates and
  private individuals" step real PHP does explicitly with
  `array_filter($xrefs, fn ($xref) => ... canShow())`.
- `loadRelatedFamilyXrefs()`/`loadFamily()`/`childrenXrefs()` for
  `closeFamilyXrefs()`.

## One real privacy-correctness fix made while writing this

Every single-root chart ported so far (Compact/Fan/...) builds ONE
`viewerBase` object (with one `isSelfRecord` flag) and reuses it for
EVERY box in that chart - a safe simplification there, because
`isSelfRecord` genuinely only matters for the one individual it was
computed against being shown AS one of many ancestors (a rare edge
case). Lifespans has no "root" at all - its individuals are an
arbitrary accumulated set, so reusing one shared `isSelfRecord` value
across all of them would be wrong: it would either never apply the
viewer's own-record privacy bypass, or (worse, if computed as
"truthy whenever the viewer has ANY linked record") apply it to EVERY
individual regardless of whether that's actually the viewer's own
record - a privacy leak. Caught this while implementing (not live-
testing it) and fixed it by computing `isSelfRecord` FRESH per
individual (`ctx.viewerBaseFor(xref)`, comparing that specific `xref`
against the viewer's own linked record).

## Ported, with small documented simplifications

- `ColorGenerator` (`app/ColorGenerator.php`) ported as a small
  stateful JS class - same HSL cycling math, same per-sex hue/range
  constants (M: 240°, F: 0°, U: 120°, each ±120° range).
- `layoutIndividuals()`'s greedy row-packing algorithm ported exactly
  (same "first row whose previous occupant has already died" rule,
  same death-before-birth swap, same "don't show future death dates"
  clamp).
- The collapsible per-individual summary card shows `birthSummaryHtml`/
  `deathSummaryHtml` (chart-box's own "first BIRT/CHR/BAPM fact" and
  "first DEAT/BURI/CREM fact" summaries) instead of real PHP's own
  "every BIRTH_EVENTS/DEATH_EVENTS-tagged fact, however many there
  are" - a card for someone with both a BIRT and a CHR fact shows only
  the first; same category of simplification already established
  elsewhere.
- The chart's own `id` attribute for each lifespan uses the
  individual's plain `xref` (`individual-I123`) instead of real PHP's
  `md5($individual->xref())` - xrefs are already unique and are valid
  HTML id characters, so the hash added nothing but obscurity.
- Always LTR positioning (`left:`, never real PHP's own RTL `right:`
  branch) - the same already-established "this migration doesn't
  port the bidi direction toggle" simplification as every other page.

## Live verification

Against the real "ophir" tree:

- Full page (200) with and without an initial `xrefs` query string;
  genealogy-menu bar present.
- Ajax body for 1, 3, and 7 individuals: correct decade scale, correct
  row-packing (three overlapping lifespans split into 3 rows; a later
  individual reused a row once its first occupant's bar had ended),
  correct per-sex HSL colors (confirmed 3 distinct `hsla()` values for
  M/F/U).
- `addxref` alone (POST → 302 redirect carrying just that one xref);
  `addxref` + `addfam=1` (redirect carrying that individual plus 6
  close-family xrefs).
- A real place+date search (`place=Israel&start=1900&end=2000`) POST →
  302 redirect carrying several hundred matching xrefs - confirmed
  the GET of that redirected URL still renders correctly (200) for a
  handful of them.
- `0 individuals` ajax body for a nonexistent xref (no crash, no
  error - the box's own `canShow`/existence filtering just produces
  an empty set).
- `405` for an unsupported method, `302` for a nonexistent tree.
- No errors in `pages` container logs across all of the above.

5206 tests passing (up from 5174), zero regressions.

## Next candidates

Timeline, Relationships, Statistics, PedigreeMap - each a different
shape again (an SVG event timeline; a relationship-path graph search
between two individuals; a block-configuration-driven stats renderer;
map-tile marker plotting) and each needs its own scoping pass before
porting.
