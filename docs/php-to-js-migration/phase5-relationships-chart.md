# Phase 5 step 36: RelationshipsChartModule

`/tree/{tree}/relationships-{ancestors}-{recursion}/{xref}{/xref2}` —
served entirely by Node. The NINTH chart route, and the first that's a
real graph search BETWEEN two individuals rather than a traversal
from one root. Scoped to full fidelity, per the user's explicit
choice, including the entire ~2,400-line relationship-naming service.

## Three independent pieces

1. **The graph search** (`pages-server/relationship-chart.mjs`) —
   Dijkstra shortest-path (unweighted, so plain BFS) over the tree's
   own `wt_link` FAMC/FAMS rows, plus the iterative path-exclusion
   expansion real PHP uses to surface MULTIPLE distinct paths (not
   just the shortest), and the "ancestors only" search-restriction
   mode. Entirely my own implementation (not delegated) — ported
   `RelationshipsChartModule::calculateRelationships()`,
   `allAncestors()`, `excludeFamilies()`, and
   `oldStyleRelationshipPath()` directly from the PHP source.
2. **The relationship-naming service** (`pages-server/relationship-names.mjs`)
   — a direct, line-by-line port of `RelationshipService::legacyNameAlgorithm()`
   (app/Services/RelationshipService.php:306-2197) plus its own
   `legacyCousinName()`/`legacyCousinName2()` helpers — 326 `case`
   statements, 32 regex-dispatch blocks, verbatim. See "How this got
   built" below.
3. **The grid layout + rendering** (`pages-server/relationship-chart-view.mjs`)
   — the box-and-arrow table `chart()` itself builds, ported exactly
   (same `(x, y)` cursor-movement rules, same diagonal-vs-straight
   connector choice for a corner turn).

## Real PHP's output isn't localized at all in this port — and that's fine

`RelationshipService::nameFromPath()` only uses a per-language
`relationships()` lookup table when one exists for the current
locale; with none ported (this migration has no I18N layer at all),
it always falls through to `legacyNameAlgorithm()` regardless of
locale — porting that one function directly, dropping every
`I18N::translate()`/`translateContext()` call's translation
machinery but keeping its English text verbatim, is a faithful
simplification, not a scope cut.

## How this got built: delegated, then independently verified

The 2,400-line naming service was too large to transcribe by hand
without burning the whole context budget on mechanical copying, so
the **mechanical** 1,891-line `legacyNameAlgorithm()` switch/regex
body was delegated to a fresh subagent with an exact function
signature and explicit instructions to call three already-written,
already-tested small helpers (`spouseRelationshipStatus()`,
`siblingAgeTerm()`, `legacyCousinName()`/`legacyCousinName2()`)
instead of re-deriving their logic. The **graph search** (a different
kind of risk — correctness-critical algorithmic code, not mechanical
transcription) was written and unit-tested directly, not delegated.

**The delegated port had one real bug, caught by comparing its regex
inventory against the real PHP source's own `preg_match()` call
count**: it invented an extra, nonexistent `if (/^((?:bro|sis|sib))/...)`
branch that doesn't exist in real PHP at all, which would have
silently shadowed the correct generic fallback (a loop trying every
3-character split point and keeping whichever produces the shortest
`"X's Y"` combination) for any path starting with `bro`/`sis`/`sib` —
returning only ONE split point's result instead of searching all of
them. Found by counting regex-dispatch blocks: real PHP has exactly
32 `preg_match()` calls in this function (confirmed by grep before
delegating); the ported file had 33. Removed the extra one. Writing
29 of my own representative test cases afterward (direct relations,
all four marital-status branches, twin/elder/younger, grandparent/
great-grandparent chains, first/second cousins, cousins "once
removed", and the generic fallback) caught two more mistakes — both
in MY OWN test expectations, not the port (I'd mis-constructed the
up/down generation counts for "equal-generation cousin" test paths) —
a useful reminder that the cousin-degree formula (shared ancestor
generation count must be EQUAL on both sides for a plain "Nth cousin",
unequal means "removed") is easy to get backwards when hand-writing
path strings.

## Real behavior found reading the PHP source closely

- **A nonexistent `xref` is NOT a 404** — unlike every other chart.
  `Registry::individualFactory()->make($xref, $tree)` simply returns
  `null`, and real PHP's own `if ($individual1 instanceof Individual)`
  guard skips the access check entirely when it's null — the options
  page still renders (200), just with no chart (empty `ajax_url`).
  Confirmed live and ported exactly (`resolveTargetIndividual()`
  returns `null` for either outcome — doesn't-exist or exists-and-
  shown — only throwing/403ing when a record EXISTS but ISN'T
  accessible).
- **The connecting family's own facts are needed for `hus`/`wif`/`spo`
  naming** (married/divorced/engaged/partner) — real PHP re-discovers
  the family by searching `person1->spouseFamilies()`; this port
  passes the family's facts in directly instead (`linkingFamilyFacts`),
  since the caller already knows exactly which family connects the
  two adjacent individuals at that path position — same result, one
  less search.
- **`xref2`'s "removed" link omission** — PHP's own `chartUrl()`
  passes `xref2` through the ROUTE's own token (`route(..., ['xref2' => ...])`),
  landing it in the PATH, not a query string — confirmed and matched
  exactly in both the ajax URL and the genealogy menu's own link
  (unaffected — the menu only ever links to the single-individual
  options page, no `xref2`).

## Scope cut

The "Swap individuals" button's own small bit of client JS (swaps
the `xref`/`xref2` field names, then resubmits) isn't ported — a pure
form-filling convenience, not load-bearing for the chart itself.

## Live verification

Against the real "ophir" tree:

- Direct relationships (`father`, `wife`, `younger sister`) all
  correctly named and correctly drawn (straight vertical/horizontal
  connectors with the right arrow direction).
- A real first-cousin pair (`I000587`/`I000009`, sharing grandparent
  `I000006`/sibling `I000001`) correctly named "first cousin" in both
  normal and ancestors-only search mode.
- Ancestors-only mode correctly returns "No link between the two
  individuals could be found" for a married couple who share no
  ancestor (their own marriage family is explicitly excluded from that
  search mode, matching `excludeFamilies()`).
- The genuine "nonexistent xref doesn't 404" behavior, confirmed live.
- `302` POST→GET redirect carrying `xref`/`xref2` as path segments;
  `405` for an unsupported method; `302` for a nonexistent tree.
- The genealogy menu's own "Relationships" link (built back in step
  33, before this chart existed) already resolves correctly end to
  end with no changes needed.
- No errors in `pages` container logs across all of the above.

5317 tests passing (up from 5269 after the delegated port landed,
5298 once the graph-search layer's own first round of tests were
added), zero regressions.

## Next candidates

Statistics, PedigreeMap - a block-configuration-driven stats renderer
and a map-tile marker-plotting chart, respectively - each needs its
own scoping pass before porting.
