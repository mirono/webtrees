# Phase 5 step 29: HourglassChartModule

`/tree/{tree}/hourglass-{generations}-{spouses}/{xref}` — served
entirely by Node. The THIRD chart route, and the first that shows
BOTH directions (ancestors AND descendants) from one subject at once,
plus the first to need genuinely new client-side behavior: a lazy-load
"expand one more generation" arrow, backed by PHP's generic
`/module/{module}/{action}/{tree}` route shape
(`app/Http/Routes/WebRoutes.php:718`, `ModuleAction`), ported here for
the first time but scoped deliberately narrowly — see below.

## Shape, vs. Ancestors/Descendancy

No "style" token (tree/individuals/families) — Hourglass has only one
layout. In its place, a boolean "spouses" token, literally `0` or `1`
in the URL (`Validator::boolean()`'s accepted path-token forms).
`matchHourglassChartPagePath()` (`pages-server/routes.mjs`) parses it
straight to a real `boolean`, not the string `"1"` — same discipline as
every other typed path token in this migration.

The chart itself (`resources/views/modules/hourglass-chart/chart.phtml`)
renders, left to right: the subject's own descendants (fanning out),
the subject + spouses in the middle, the subject's own ancestors
(fanning out). Reused `buildChartBoxViewModel()`/`resolveShownFamily()`/
`resolveFamilyMember()`/`spouseEntersChart()` unchanged from
Ancestors/Descendancy — **but one real finding from re-reading
`Family::husband()`/`wife()`/`spouse()`/`children()` closely**: ALL
FOUR already apply the SAME `canShowName()` gate internally, regardless
of call site (root-level spouse display, recursive parent display,
recursive child display) — there is no "stricter at the root, looser
when recursing" distinction in real PHP at all. `spouseEntersChart()`
(built for Ancestors) is therefore the right gate EVERYWHERE in this
chart, not just during recursion — confirmed by reading
`app/Family.php:86-169,171-195` directly before writing any code, not
assumed from the Ancestors/Descendancy precedent.

## The two recursive builders

`buildHourglassAncestorsNode()` and `buildHourglassDescendantsNode()`
(`pages-server/index.mjs`) mirror `parents.phtml`/`children.phtml`
exactly:

- **Ancestors side** (`buildHourglassAncestorsNode()`): resolves ONE
  family (an individual's own first parent family), builds a box for
  each side that passes `spouseEntersChart()` (null box otherwise,
  rendered as `chart-box`'s own empty-placeholder div), and — only for
  a side that HAS a box AND has its own parent family — either
  recurses (generations remain) or emits a lazy-load arrow pointing at
  that side's own parent FAMILY xref (generations ran out). Re-derives
  the parent family from whatever individual xref it's given, so the
  SAME function serves the chart's own root call, every recursive call,
  AND the lazy-load action's own entry point without any special-casing
  between them.
- **Descendants side** (`buildHourglassDescendantsNode()`): takes an
  already-`canShowName()`-filtered list of children (mirrors
  `Family::children()`'s own internal filter — see
  [phase5-descendancy-chart.md](phase5-descendancy-chart.md), which
  established this exact convention first), builds a box for every one
  unconditionally (never null — only the recursion/arrow decision is
  gated), and recurses into grandchildren the same way: nested call if
  generations remain, a lazy-load arrow pointing at the child's own
  INDIVIDUAL xref otherwise (not a family xref — real PHP's
  `getDescendantsAction()` takes an individual and re-derives THEIR
  spouse families, not a family directly).

Both builders decrement a `generationsRemaining` budget the same way
real PHP's own templates do: the CURRENT level always renders (no
budget consumed just by existing), and the decision to go one level
deeper is `generationsRemaining > 1 ? recurse(generationsRemaining - 1)
: arrow`.

## The lazy-load arrows: a new route shape, and a real access-control asymmetry

`matchHourglassChartActionPath()` matches
`/module/hourglass_chart/(Ancestors|Descendants)/{tree}` — PHP's own
generic `/module/{module}/{action}/{tree}` route
(`ModuleAction::handle()` dispatches to `get{$action}Action()` on
whichever module matches `{module}`). Scoped here to ONLY
`hourglass_chart`'s two actions — every other module's own
`get*Action()` methods (ClippingsCart, InteractiveTree,
RelationshipsChart, StatisticsChart, ...) are still PHP's job.

Reading `getAncestorsAction()`/`getDescendantsAction()` closely turned
up a real, deliberate asymmetry in webtrees itself, reproduced exactly:

- `getAncestorsAction()` calls `Auth::checkFamilyAccess($family)` —
  which has **no** `$chart` bypass parameter at all
  (`app/Auth.php:180-199`, vs. `checkIndividualAccess()`'s own
  `$chart` bool). So the Ancestors arrow is checked at the viewer's
  OWN plain access level, even when the tree's `SHOW_PRIVATE_RELATIONSHIPS`
  preference is on and the main chart itself used the `-1` bypass to
  get this far.
- `getDescendantsAction()` calls `Auth::checkIndividualAccess($individual,
  false, true)` — `$chart = true`, the SAME bypass the main chart's own
  root individual gets.

Ported as: the Ancestors action resolves `resolveShownFamily()` at the
plain `accessLevel` (no bypass); the Descendants action computes
`traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel`,
same as the main chart. A nonexistent/inaccessible family → `403` (one
response code for both "doesn't exist" and "exists but not showable" -
`resolveShownFamily()` can't distinguish them, a known simplification
already accepted elsewhere in this migration); a nonexistent individual
→ `404` (that one IS distinguishable, since `loadIndividual()` returning
null is unambiguous).

## New client-side behavior: the arrow-click handler

Unlike Ancestors/Descendancy chart.phtml, `hourglass-chart/chart.phtml`
ships its OWN inline `<script>` (not covered by the already-bundled
`webtrees.min.js`): a jQuery delegated click handler on
`.wt-chart-hourglass` that `.load()`s an arrow's own
`data-wt-chart-xref` URL into its parent element. Reproduced verbatim
in `renderHourglassChart()` (`pages-server/hourglass-chart-view.mjs`) -
event delegation means it keeps working for arrows added by a PREVIOUS
`.load()` call too, without re-registering anything. The lazy-load
action responses are bare fragments (no page shell, no
`wt-chart-hourglass` wrapper, no script) — exactly what
`parents.phtml`/`children.phtml` themselves render, matching real PHP's
own `getAncestorsAction()`/`getDescendantsAction()` return values.

## Route / module gating

Module gating confirmed live: `module_name = 'hourglass_chart'`,
status `enabled`, no `wt_module_privacy` override row — same
visitor-level (2) default as every other chart/list module.

## Live verification

Against the real "ophir" tree: full page load, ajax=1 body (subject +
ancestors + descendants, `spouses=0` and `spouses=1` both tested — the
spouse box count correctly changes from 10 to 11 boxes for a subject
with exactly one spouse family). Lazy-load arrows exercised directly:
`/module/hourglass_chart/Ancestors/ophir?xref=F000010` returned a real
one-generation-deeper parents fragment (including the Hebrew
alternate-name row and bold "Birth:"/"Burial:" labels fixed in this
session's earlier chart-box work — confirming that fix benefits every
chart, not just the ones it was built against);
`/module/hourglass_chart/Descendants/ophir?xref=I000265&spouses=0`
returned a real grandchildren fragment with correct
first/middle/last connecting-line classes. POST→GET redirect lands on
a new path. Missing/malformed inputs: bad `generations` → 400,
nonexistent individual → 404, nonexistent/inaccessible family on the
Ancestors action → 403, unrecognized action → 404, POST on the action
route → 405.

5108 tests passing, zero regressions.

## Next candidates

FamilyBook and CompactTree are the two remaining chart modules that
reuse this same `chart-box`/family-privacy infra directly (FamilyBook
is structurally close to Hourglass - both directions from one root, no
lazy-load needed since it shows everything up front). Fan/Lifespans/
Timeline/Relationships/Statistics/PedigreeMap are structurally
different (canvas/SVG rendering, or no chart-box at all) and need
their own scoping pass.
