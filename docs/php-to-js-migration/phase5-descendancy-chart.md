# Phase 5 step 28: DescendancyChartModule

`/tree/{tree}/descendants-{style}-{generations}/{xref}` — served
entirely by Node. The SECOND chart route, `AncestorsChartModule`'s
direct sibling: same page shell, same recursive-collapsible-HTML-tree
shape, same `chart-box` reuse, zero new client-side JS (the existing
bundled `data-wt-ajax-url` loader and Bootstrap `data-bs-toggle` already
cover it — see [phase5-ancestors-chart.md](phase5-ancestors-chart.md)
for why).

## What's genuinely different from Ancestors

Ancestors walks ONE parent family per generation (every individual has
at most one father + one mother). Descendancy walks **every spouse
family** an individual ever had — a person can marry more than once,
and every marriage's children all descend from them. Three concrete
consequences, all reflected in `buildDescendancyNode()`
(`pages-server/index.mjs`) and `renderDescendancyTreeNode()`
(`pages-server/descendancy-chart-view.mjs`):

1. **Multiple families per node.** `loadRelatedFamilyXrefs()` already
   returns every `spouseFamilies` xref (plural) — Ancestors only ever
   used the first `parentFamilies` entry. Each is resolved via the same
   `resolveShownFamily()` used by Ancestors's own family-privacy
   resolution, then sorted by marriage date
   (`getMarriageDate()` → julian day, missing/unparseable dates sort
   last).
2. **The other spouse is a terminal box, not a recursion target.**
   Real PHP's `tree.phtml` shows `$family->spouse($individual)` as a
   plain `chart-box` and never descends into THEIR ancestors/spouses/etc.
   — only the individual's own children recurse. Reused
   `spouseEntersChart()` (built for Ancestors, same `canShowNameOnly`
   gate as `Family::spouses()`'s own filter) to decide whether that box
   renders at all or falls back to the private-placeholder box.
3. **d'Aboville numbering, not Sosa.** Real PHP declares `$child_number`
   ONCE, *outside* the `foreach ($individual->spouseFamilies() ...)`
   loop in `tree.phtml` — so children are numbered sequentially across
   ALL of that individual's own families (a first child of a second
   marriage is numbered after every child of the first marriage, not
   reset back to 1). Ported as a single `childCounter` closed over by
   the families loop in `buildDescendancyNode()`.

Children within each family are sorted by birth date
(`getBirthDate()` → julian day, same missing-date-sorts-last rule as
marriage dates) and filtered by `canShowNameOnly` before recursing —
matching `Family::children()`'s own privacy gate, already resolved by
`resolveShownFamily()`'s existing `children` array (no new privacy code
needed here).

`SHOW_PRIVATE_RELATIONSHIPS`'s `traversalAccessLevel` bypass (built for
Ancestors) is reused unchanged — descendancy traversal is exactly as
privileged as ancestor traversal under that preference.

## Styles

Same three: `tree` (the real target, full recursive render),
`individuals`/`families` (secondary AJAX views — same simplification
already made for Ancestors: built by flattening the already-resolved
descendant tree via `flattenDescendancyNodes()` and feeding
`renderIndividualsTable()`/`renderFamiliesTable()`, not a separately
re-queried flat BFS like real PHP's own `ChartService::descendants()`/
`descendantFamilies()`).

## Route / module gating

`matchDescendancyChartPagePath()` / `isDescendancyChartPagePath()` —
identical regex shape to Ancestors's own matchers, `descendants-` in
place of `ancestors-`. Module gating confirmed live: `module_name =
'descendancy_chart'`, status `enabled`, **no** `wt_module_privacy`
override row — same visitor-level (2) default as every other chart/list
module.

## Live verification

Against the real "ophir" tree, individual `I000001` (Miron Ophir):
4-generation descendancy tree rendered correctly — real marriage date
("Marriage August 17, 1995"), real spouse box (Yael Ryvka Koblinsky),
3 real children correctly d'Aboville-numbered `1.1`/`1.2`/`1.3` in
birth order, correct "last child" vertical-line class on the final
child. All 3 layout styles return 200. POST→GET redirect lands on a new
path (`descendants-individuals-5/I000001`, confirmed via `Location`
header). Nonexistent xref → 404. Out-of-range generations → 400.

5059 tests passing, zero regressions.

## Next candidates

Same note as Ancestors's own doc: Hourglass, FamilyBook, and
CompactTree reuse this same `chart-box` + family/children privacy
infra directly (Hourglass is literally Ancestors+Descendancy combined
from one root). Fan/Lifespans/Timeline/Relationships/Statistics/
PedigreeMap are structurally different (canvas/SVG rendering, or no
chart-box at all) and need their own scoping.
