# Phase 5, step 20: `/tree/{tree}/repository-list` (RepositoryListModule)

**Status: done and verified live (2026-09-28), against a real user-imported GEDCOM tree.**

## What this is

The first **list** route this migration has ported — every prior
phase-5 route (Individual/Family/Source/Repository/Note/Media/
Submitter/Header) has been a single-record page. `RepositoryListModule`
(`app/Module/RepositoryListModule.php`) is one of a family of similar
Module-based list routes (`FamilyListModule`, `SourceListModule`,
`NoteListModule`, `MediaListModule`, `SubmitterListModule`, and the much
larger `AbstractIndividualListModule`) registered via each module's own
`boot()` at `/tree/{tree}/<type>-list`, not via `WebRoutes.php`'s
`attach()` blocks. Repository was picked as the narrowest, best-scoped
starting point — the smallest of these modules (118 lines), and every
piece of Repository-specific data/privacy logic it needs was already
built for RepositoryPage/SourcePage.

## Two things this route needs that no prior route has: module gating

Every module-based route is gated by two things real PHP checks that
this migration hadn't needed before:

1. **Is the module even enabled?** `RepositoryListModule::boot()` only
   registers its own route while `wt_module.status = 'enabled'` for
   `repository_list` — this migration's proxy is purely path-based, so
   it can't know that ahead of time. The Node handler checks
   `wt_module.status` directly and 404s otherwise, the closest
   available approximation of "this route was never registered." Real
   data check: this tree has `submitter_list` disabled but
   `repository_list` enabled, giving a real contrast to verify against
   (not tested live for `submitter_list`, since that route isn't
   ported — the disabled-module 404 path is exercised only by
   `repository_list`'s own status check succeeding, not by proving the
   negative case for a route this migration doesn't serve).
2. **What access level does the module require?** `AbstractModule::accessLevel()`
   (`app/Module/AbstractModule.php:167-176`) checks a per-tree
   `wt_module_privacy` override for the exact `(module_name, gedcom_id,
   interface)` triple, falling back to the module class's own default
   (`RepositoryListModule`'s own `$access_level = Auth::PRIV_USER` = 1,
   "member"). This tree has no override rows at all, so the default
   applies — live-verified: an anonymous visitor (accessLevel 2) 403s,
   a member-level user (accessLevel 1) sees the list.

New `moduleAccessLevel()` in `index.mjs` implements the second check
generically enough to be reused by any future list route.

## Simplified from a DataTables-powered table to a plain one

Real PHP renders this list via `resources/views/lists/repositories-table.phtml`
— a client-side-sortable/searchable DataTables table with conditional
column visibility (the "Sources" column hidden entirely if no
repository has any linked sources; "Last change" hidden unless the
tree's `SHOW_LAST_CHANGE` preference is set). This route renders a
plain, always-fully-visible server-rendered table instead: no sort/
search interactivity, both columns always shown. This can only show
MORE structure than PHP's own conditional-hiding would in some
configurations, never hide privacy-sensitive information — the
"Sources" count and "Last change" timestamp are both already
deliberately privacy-unaware in real PHP itself (see below), so
showing them unconditionally isn't a privacy regression, just a
visual/interactivity simplification.

**The "Sources" count query deliberately bypasses privacy in real PHP
too** — reproduced as-is, not "fixed": `repositories-table.phtml`'s own
comment reads _"It is not good to bypass privacy, but many servers do
not have the resources to process privacy for every record in the
tree"_. `repositorySourceCounts()` in `source.mjs` is a direct,
unfiltered `COUNT(*) ... GROUP BY l_to` over `wt_link` — matching real
PHP's own acknowledged shortcut exactly, not tightened.

**"Last change" rendering is simplified, not omitted**: real PHP uses
`components/datetime.phtml`'s `isoFormat('LLLL')` (a full
weekday/month-name format, e.g. "Tuesday, June 28, 2016 12:37 PM") with
a relative "time ago" tooltip. This route reuses the same plain
`<span class="date">...</span> – <span class="date">...</span>` shape
every other route's own `CHAN` rendering already uses (via the existing
`displayDate()`), rather than porting a new date-format variant. A
repository with no `CHAN` fact at all shows "Never", matching
`components/datetime.phtml`'s own zero-timestamp case.

## Implementation

- **`source.mjs`** gained `loadRepositoryList()` (every repository in
  the tree, ordered by xref — real PHP applies no explicit `ORDER BY`
  at all, relying on DataTables' own client-side sort, so ordering by
  xref is this migration's own deterministic substitute, not a
  faithful copy of an unspecified row order), `repositorySourceCounts()`,
  and `recordLastChange()` (a small, generically-useful `CHAN`
  date/time extractor over a record's full raw gedcom, not scoped to
  Repository specifically).
- **`repository-list-view.mjs`** (new): `renderRepositoryListPage()`,
  same hand-rolled-HTML convention as every prior view.
- **`pages-server/routes.mjs`** / **`proxy/routing.mjs`**:
  `matchRepositoryListPagePath()` / `isRepositoryListPagePath()` — an
  EXACT path match (no xref/slug), same shape as the existing
  `matchTreePagePath()`/`isTreePagePath()`.
- **`index.mjs`**: `handleRepositoryListPage()` reuses
  `repositoryCanShowRecord()`/`loadDefaultResn()`/`extractNameFromFact()`
  unchanged from RepositoryPage's own privacy/title logic, applied per
  repository in a loop, plus the new module-gating checks above.

## Verification

**Unit tests**: `source.mjs`'s test file gained coverage for
`loadRepositoryList()`, `repositorySourceCounts()`, and
`recordLastChange()` (including the no-CHAN and CHAN-without-TIME
cases). New `pages_server_repository_list_view.test.js` covers the view
layer (row rendering, the "Never" case, the no-time case, escaping).
Route-matcher tests added to `pages_server_routes.test.js` and
`proxy_routing.test.js`. Full JS suite: **4708 tests, green** (4682 +
26 new).

**Live verification** — against the real, user-imported "ophir" tree,
using the established trap-guarded `data/config.yaml` swap script (see
[[feedback-config-yaml-swap-safety]]):
1. All 7 real repositories render correctly for a member-level test
   user: real names (including Hebrew, e.g. "בית לוחמי הגיטאות"), real
   source counts (1/2/12/1/4/3/1 — cross-checked against the raw
   `wt_link` `GROUP BY` query beforehand) matching exactly, real
   `CHAN` dates/times all correctly formatted.
2. **Module access-level gating confirmed both ways**: an anonymous
   visitor correctly 403s (module default access level is
   member-only); the same member-level user gets 200.
3. 302 (nonexistent tree) confirmed live.
4. The disposable test user and its settings/session rows deleted
   afterward; `data/config.yaml` restored via the trap-guarded script,
   confirmed via `grep dbhost` after.

## What's next for the "list" family

`FamilyListModule`/`SourceListModule`/`NoteListModule`/`MediaListModule`
all share this same small, generic shape and reuse infrastructure this
migration has already built for their own single-record pages —
natural next candidates. `SubmitterListModule` is currently disabled in
this tree (real data: `wt_module.status = 'disabled'`), so porting it
wouldn't be exercisable against real data right now.
`AbstractIndividualListModule` (759 lines: alphabetical surname index,
initial-letter tabs, "show families" toggle) is a substantially larger
undertaking, more comparable in scope to the IndividualPage full-page
port (phase 5 step 14) than to this one — worth its own dedicated
planning pass rather than folding into "just another list."
