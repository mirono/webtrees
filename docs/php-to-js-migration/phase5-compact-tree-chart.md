# Phase 5 step 31: CompactTreeChartModule

`/tree/{tree}/compact/{xref}` — served entirely by Node. The FIFTH
chart route, and the simplest: no `generations`/`style`/`spouses`
tokens at all. Real PHP calls `ChartService::sosaStradonitzAncestors($individual, 5)`
with a hardcoded `5`, not configurable via the URL.

## Shape: a fixed-position table, not a recursive structure

Every chart ported so far (Ancestors, Descendancy, Hourglass, Family
Book) is recursive — a node refers to its own children/parents nodes.
`resources/views/modules/compact-chart/chart.phtml` is not: it's 14
literal `<tr>` rows with each `<td>` hardcoded to a specific
Sosa-Stradonitz number (1 through 31), reproduced cell-for-cell in
`renderCompactTreeChart()` (`pages-server/compact-tree-chart-view.mjs`).
No recursive view function was needed at all — just a lookup by Sosa
number into a flat `cells` array built once up front.

`buildCompactTreeAncestors()` (`pages-server/index.mjs`) mirrors
`ChartService::sosaStradonitzAncestors()`'s own breadth-first walk
exactly: Sosa 1 = subject, each ancestor's own parent family
contributes Sosa `n*2` (husband) and `n*2+1` (wife), stopping expansion
once a Sosa number reaches `2^(generations-1) = 16` (so Sosa 16-31,
the 5th generation, are recorded but never themselves expanded).

## No lazy-load arrow — not even a chart-box.phtml placeholder

Unlike Hourglass, the "arrow" here is a PLAIN `<a href>` to a
brand-new full page load of this same chart, rooted at that ancestor
(`CompactTreeChartModule::chartUrl()` — just `/tree/{tree}/compact/{xref}`
again, no ajax). No client-side JS is needed at all, not even the
Bootstrap collapse behavior Ancestors/Descendancy got for free — the
simplest chart yet.

A missing ancestor's box also isn't `chart-box.phtml`'s own
`<div class="wt-chart-box"></div>` — `individual.phtml`'s own `else`
branch is `<div class="h-100 wt-chart-box">&nbsp;</div>`, a distinct
bit of markup, ported as its own small branch in
`renderIndividualCell()` rather than reusing `renderChartBox(null)`.

## No access-control asymmetry, despite appearances

`ChartService::sosaStradonitzAncestors()` calls `$family->husband()`/
`wife()` with NO explicit access-level argument at all — unlike every
other chart's traversal code, which explicitly computes and passes
`traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel`.
This looked like it might be a real asymmetry (no SHOW_PRIVATE_RELATIONSHIPS
bypass during traversal). It isn't: `Family::husband()`/`wife()`
(`app/Family.php:86-113`) force `$access_level = Auth::PRIV_HIDE`
internally whenever the tree's SHOW_PRIVATE_RELATIONSHIPS preference is
on, REGARDLESS of what the caller passed (or didn't pass) — the exact
same mechanism already confirmed and ported for Hourglass/Ancestors/
Descendancy. `resolveShownFamily()`/`spouseEntersChart()` were reused
completely unchanged, no special-casing needed.

## Live verification

Against the real "ophir" tree, starting from `I000221`:

- Full page load (200, correct `data-wt-ajax-url`, options form with
  only an `xref` field — no `generations`/`spouses` at all).
- Ajax body: 110 `wt-chart-box` occurrences, 14 real `<a href="/tree/ophir/compact/...">`
  arrow links, 16 empty `h-100 wt-chart-box` placeholders.
- Followed a real arrow link (`/tree/ophir/compact/I000627`) — 200,
  correctly re-rooted.
- `404` for a nonexistent individual, `302` for a nonexistent tree,
  `405` for an unsupported method, `302` POST→GET redirect carrying
  just the one `xref` segment.

5142 tests passing (up from 5130), zero regressions.

## Next candidates

With Ancestors/Descendancy/Hourglass/FamilyBook/CompactTree all done,
the small reusable-chart-box family of charts is complete. Remaining
chart modules (Fan, Lifespans, Timeline, Relationships, Statistics,
PedigreeMap) are visually/structurally different (SVG/Canvas, map
tiles, or graph-search shapes) and each needs its own scoping pass
before porting.
