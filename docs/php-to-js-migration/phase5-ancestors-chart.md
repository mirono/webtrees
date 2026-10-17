# Phase 5, step 27: `/tree/{tree}/ancestors-{style}-{generations}/{xref}` (AncestorsChartModule)

**Status: done (2026-10-17); unit-test-verified and live-verified against the real "ophir" tree.**

## What this is

The first **chart** route this migration has ported - a new category
entirely, after the "list" family's completion (steps 20-26). Picked
as the first chart over the more visually iconic Pedigree chart
specifically because it builds the reusable `chart-box` component
(resources/views/chart-box.phtml - the individual-summary card EVERY
chart module shares) as a plain, Bootstrap-collapsible recursive HTML
tree, with no SVG/Canvas and no new client-side JS at all.

## Why no new JS was needed

Real PHP's `ancestors-chart/page.phtml` embeds a `data-wt-ajax-url`
content div; `ancestors-chart/tree.phtml` uses plain
`data-bs-toggle="collapse"` buttons. Both mechanisms are ALREADY
present in the bundled `webtrees.min.js`:
`resources/js/webtrees/init.js`'s own `DOMContentLoaded` hook already
auto-loads any `[data-wt-ajax-url]` element (used elsewhere in this
migration already, e.g. IndividualPage's photo box), and Bootstrap's
own JS already handles `data-bs-toggle="collapse"`. This chart needed
zero new client-side code - only matching server-rendered HTML.

## Implementation

Landed as 6 commits:

1. **`chart-box.mjs`** (new): `buildChartBoxViewModel()` - name/sex,
   lifespan, birth/death fact summaries, a highlight-image thumbnail
   (reusing `media.mjs`'s already-shipped `loadFactsMedia()`/
   `mediaThumbnailUrl()`/`needsWatermark()`), privacy-gated the same
   way every individual-resolving route already is. Introduces
   `traversalAccessLevel` as a parameter DISTINCT from the viewer's own
   real access level - see the SHOW_PRIVATE_RELATIONSHIPS section below.
   Also: `loadShowHighlightImagesPref()`, `loadShowPrivateRelationshipsPref()`.
2. **`chart-box-view.mjs`** (new): `renderChartBox()` - the box's HTML,
   including the real "no individual" empty placeholder.
3. **`ancestors-chart-view.mjs`** (new): `renderAncestorsTreeNode()` -
   the recursive tree structure (box + Sosa number, then a collapsible
   "Parents - marriage summary - N children" toggle per resolved parent
   family, each parent recursing into their own); `renderAncestorsChartPage()` -
   the options-form + ajax-content-div page shell.
4. **Routing**: `matchAncestorsChartPagePath()`/`isAncestorsChartPagePath()` -
   unlike every list-page matcher, this route carries 3 further PATH
   tokens (not query params): style, generations, xref.
5. **`loadShowPrivateRelationshipsPref()`** (`chart-box.mjs`).
6. **`index.mjs`**: `handleAncestorsChartPage()` ties everything
   together - module gating, the POST→GET redirect (to a NEW PATH, not
   just a new query string, since style/generations/xref are path
   segments), the subject individual's own chart-access check, and
   `buildAncestorsNode()` (the recursive resolver, reusing the
   already-built `resolveShownFamily()`/`resolveFamilyMember()`).

## A real, confirmed-live divergence this step had to fix: SHOW_PRIVATE_RELATIONSHIPS

`Family::husband()`/`wife()`/`children()` force `Auth::PRIV_HIDE` (`-1`,
bypasses everything, even `RESN=hidden`) whenever the tree's
`SHOW_PRIVATE_RELATIONSHIPS` preference is on. Its default is `'1'`
(**on**) - and this tree's own real, unoverridden value is also `'1'`
(confirmed via the DB). Without replicating this, chart traversal would
be MORE restrictive than real PHP for this tree specifically, not just
differently simplified - a real correctness bug, not a cosmetic gap.
Every chart's own ancestor/descendant-walking code needs to compute
this `traversalAccessLevel` (`showPrivateRelationships ? -1 : accessLevel`)
and pass it through, not the viewer's plain `accessLevel`.

## Another real, confirmed PHP behavior replicated exactly

`Family::spouses()` (via `husband($access_level)`/`wife($access_level)`,
each gated by `canShowName()`) OMITS a spouse that exists but fails
`canShowName()` from the family's own spouse list ENTIRELY - no box at
all for that side, not a "Private" placeholder. This is distinct from
`chart-box.mjs`'s own "canShow false → render a Private box" behavior,
which only applies once a spouse has already cleared this earlier,
coarser gate. `spouseEntersChart()` in `index.mjs` replicates this
exactly.

## Deliberate, documented simplifications

- The box's own dropdown menus (fact zoom-in list, cross-links to
  spouse/children/family pages) and `SHOW_PARENTS_AGE`'s extra
  age-at-birth annotation are not ported - secondary UI conveniences on
  top of the box's core genealogical content, not required for a first
  working chart.
- `CHART_BOX_TAGS` (extra configurable fact tags beyond birth/death) is
  not wired to a live preference lookup - this tree's own real value is
  already the default (`''`, nothing to show either way).
- The `individuals`/`families` AJAX layout styles reuse
  `renderIndividualsTable()`/`renderFamiliesTable()` unchanged, built
  from the SAME resolved ancestor set as the `tree` style, but with
  plain real dates only (no estimated-date heuristic) and no DataTables
  filter-button codes. The `tree` style is this step's real
  deliverable and carries none of these simplifications.

## Live verification

Against the real "ophir" tree, starting from a real individual (Miron
Ophir): a real 4-generation ancestors tree renders correctly - real
highlight-image thumbnails, correct Sosa numbers (1 through 15, exactly
matching 2⁴-1), real marriage dates/places tracing back to 1800s
Poland (Tomaszow Mazowiecki, Czestochowa, Lodz) and Israel, correct
singular/plural child-count wording ("1 child" vs. "N children"),
proper nested collapsible structure matching the real recursive shape.
All 3 layout styles return 200 with no server errors; the POST search
form redirects correctly to a genuinely different PATH (not just a new
query string); a nonexistent xref 404s; an out-of-range `generations`
value 400s. Full JS suite: 5039 tests, zero regressions in any
previously-shipped route.

## What's next

The reusable `chart-box`/`chart-box-view` infrastructure built here is
directly reusable by every remaining chart module (Pedigree,
Descendancy, Hourglass, FamilyBook, CompactTree - all share the same
box). `traversalAccessLevel`/`spouseEntersChart()` are the two
SHOW_PRIVATE_RELATIONSHIPS-aware patterns every future chart's own
relationship-walking code needs to reuse, not re-derive. Fan chart,
Lifespans, Timeline, Relationships, Statistics, and PedigreeMap are
visually/structurally different (SVG/Canvas-based or otherwise) and
would each need their own scoping pass.
