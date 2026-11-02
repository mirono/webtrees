# Phase 5 step 30: FamilyBookChartModule

`/tree/{tree}/family-book-{book_size}-{generations}-{spouses}/{xref}`
— served entirely by Node. The FOURTH chart route. Unlike Hourglass,
this module defines no `get*Action()` methods at all in real PHP — no
lazy-load arrows, no module-action route needed here. Every ancestor/
descendant box, even an empty placeholder for a missing relative, is
rendered up front in a single response.

## Shape

Two numeric generation tokens instead of one:

- `book_size` (2–5): how many ancestor/descendant generations each
  individual's own "block" radiates out to.
- `generations` (2–63): how many whole descendant generations get
  their own block.

Plus the same boolean `0`/`1` "spouses" token as Hourglass
(`matchFamilyBookChartPagePath()`, `pages-server/routes.mjs`).

## The flattened block structure

Real PHP's `chart.phtml` is recursive in an unusual way: it renders
ONE "family of X" block (descendants fanning left, X + spouses in the
middle, ancestors fanning right — out to `book_size - 1` generations
each), then for every one of X's children, `<hr>` + the WHOLE
`chart.phtml` template again (`generations - 1`, same `book_size`).
This is a flat, pre-order sequence of blocks along the descendant
line, not a tree of charts nested inside each other.

`buildFamilyBookBlocks()` (`pages-server/index.mjs`) mirrors this by
returning a flat array: the individual's own block first, then every
child's own whole sub-sequence appended in order. The view layer
(`renderFamilyBookChart()`, `pages-server/family-book-chart-view.mjs`)
just joins the array with `<hr class="wt-family-separator">` between
consecutive blocks — which lands in exactly the right places, since
real PHP's own `<hr>` sits immediately before each recursive
`chart.phtml` call, i.e. once per block in the flattened array except
the very first.

## No lazy-load arrow — and a real behavioral difference from Hourglass

`parents.phtml` always recurses one level deeper per side while
`radius > 1`, REGARDLESS of whether that side has a box at all —
`$family?->husband()?->childFamilies()->first()` evaluates to `null`
once the real chain runs out, and the next recursive call renders an
empty placeholder box, and the one after that, all the way down to the
configured `book_size`. There is no arrow fallback and no early stop.
This is the opposite of Hourglass's ancestors node, which stops
(`further: null`) the moment there's no further parent family and
offers a lazy-load arrow only when generations (not data) run out.

`buildFamilyBookParentsNode()` ported this literally: it recurses
unconditionally whenever `radiusRemaining > 1`, carrying `null` forward
once the real family chain ends, producing however many empty
placeholder boxes real PHP would. Live-verified: an 18-way repeat of
`<div class="wt-chart-box"></div>` in one ajax body for a subject near
a tree edge.

`children.phtml`/`buildFamilyBookChildrenNode()` has no such
unconditional recursion (grandchildren that don't exist just aren't
shown, same `if (radius > 1 && grandchildren.isNotEmpty())` gate as
every other descendant-direction builder in this migration) and —
confirmed by reading the real template — never shows spouse boxes for
descendants at any depth; only the top-level subject of each block
gets spouse boxes, via `chart.phtml`'s own `if ($spouses)` loop.

## Reused infra, unchanged

`buildChartBoxViewModel()`, `resolveShownFamily()`, `resolveFamilyMember()`,
`spouseEntersChart()`, `loadRelatedFamilyXrefs()` — all reused exactly
as built for Ancestors/Descendancy/Hourglass, no new privacy logic
needed. Root individual access check is the same
`Auth::checkIndividualAccess($individual, false, true)` ($chart=true,
SHOW_PRIVATE_RELATIONSHIPS bypass) as every other chart's own subject.

## Live verification

Against the real "ophir" tree, using the same multi-generation
descendant chain found for the Hourglass step (`I000221` →
`I000265/266/267` → their own children):

- Full page load (200, options form with `book_size`/`generations`/
  `spouses` fields, correct `data-wt-ajax-url`).
- `spouses=0` ajax body: 12 "Family of" blocks, 11 separators —
  correct flattened pre-order traversal across 5 generations.
- `spouses=1` ajax body: spouse boxes present in the center column.
- Empty parent-placeholder boxes rendered down to the configured
  `book_size` near a tree edge (18 in one body).
- `400` for `book_size`/`generations` out of range, `404` for a
  nonexistent individual, `302` for a nonexistent tree, `405` for an
  unsupported method, `302` POST→GET redirect preserving all four
  path segments.

5130 tests passing (up from 5108), zero regressions.

## Next candidates

CompactTree reuses the same chart-box/privacy infra and is the last
small chart. After that, the "charts" bucket is essentially done except
for any SVG/Canvas-heavy ones (if present) and relationship-finding
charts, which are a different shape entirely.
