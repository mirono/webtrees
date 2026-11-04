# Phase 5 step 33: the top "genealogy menu" bar

Reported live: on every chart page, the top menu bar row was missing.
Checked before touching anything: it was missing from **every**
Node-rendered page, not just charts - `resources/views/layouts/default.phtml`'s
`<nav class="col wt-primary-navigation"><ul class="nav wt-genealogy-menu">`
(built from `$theme->genealogyMenu($tree)`,
`ModuleThemeTrait.php:412-425`) had never been built at all. The user
chose to fix this site-wide rather than scope it to just chart pages.

## What it is

`genealogyMenu($tree)` enumerates every enabled `ModuleMenuInterface`
module for the tree and calls each one's own `getMenu($tree)`. In a
stock install that's six menus: Family tree(s), Charts, Lists,
Calendar, Reports, Search (plus three optional extras - see "Scope
cut" below). Each renders as either a plain link (`Menu` with no
submenus) or a Bootstrap dropdown (`Menu` with submenus) -
`resources/views/components/menu-item.phtml`'s own two branches,
reproduced exactly by `renderGenealogyMenuNav()`
(`pages-server/genealogy-menu-view.mjs`).

## `pages-server/genealogy-menu.mjs`: `buildGenealogyMenu()`

One function, called once per page render, mirrors all six menu
modules' own `getMenu()`:

- **Family tree(s)** (`TreesMenuModule`): a plain link when there's
  only one tree (true for this migration's whole "ophir" dev
  instance) or `Site::getPreference('ALLOW_CHANGE_GEDCOM') !== '1'`;
  a dropdown of every accessible tree otherwise. Reuses
  `accessibleTrees()` (`pages-server/trees.mjs`) unchanged.
- **Charts** (`ChartsMenuModule`): one submenu item per enabled+accessible
  `ModuleChartInterface` module, each one's own `chartMenu($individual)`
  - i.e. its default-parameter URL for the page's own "significant
    individual". All 13 real chart modules are listed (the 6 already
    ported to Node plus the 7 that aren't - Pedigree/Relationships/
    PedigreeMap/InteractiveTree/Lifespans/Timeline/Statistics), each
    with its own real route/default-parameter URL confirmed directly
    from its PHP class (`ROUTE_URL`/`DEFAULT_PARAMETERS` constants, or
    the generic `/module/{module}/{action}` route for the two modules
    with no `ROUTE_URL` of their own). Clicking an unported chart's
    link just falls through the proxy to PHP - exactly the
    strangler-fig pattern every other already-ported page already
    relies on.
- **Lists** (`ListsMenuModule`): same idea, 9 real `ModuleListInterface`
  modules (the 3 already ported plus Notes/Sources/Repositories/
  Locations/Submitters/Branches), each module's own real `ROUTE_URL`.
- **Calendar** (`CalendarMenuModule`): 3 fixed submenu items (Day/
  Month/Year, NOT alphabetically sorted, matching real PHP) linking to
  `/tree/{tree}/calendar/{view}` (confirmed from `app/Http/Routes/WebRoutes.php:689`
  - this route isn't ported, PHP handles it).
- **Reports** (`ReportsMenuModule`): one submenu item per enabled+accessible
  `ModuleReportInterface` module (16 real report modules, confirmed
  titles/module-names against the live DB's `wt_module` rows), each
  linking to `/tree/{tree}/report/{report}?xref={xref}`
  (`ModuleReportTrait::getReportMenu()`, `app/Module/ModuleReportTrait.php:49-60`)
  - none of this is ported (reports need PDF infra, not started), so
    every link falls through to PHP.
- **Search** (`SearchMenuModule`): 4 fixed submenu items (General/
  Phonetic/Advanced search, NOT alphabetically sorted; Search and
  replace only for signed-in members - see "Known simplification"
  below).

"Charts"/"Lists"/"Reports" submenus ARE alphabetically sorted
(`I18N::compare`, reproduced as `localeCompare`), matching real PHP's
own `->sort()` call in each of those three menu modules' `getMenu()`.

### Enabled/accessible check: one batched query, not ~35

Every module here needs the same two checks every other ported
handler already does per-module (`wt_module.status = 'enabled'`, and
`wt_module_privacy`'s override or the module class's own
`$access_level` default) - but this menu touches roughly 35 modules on
EVERY single page load, so `loadModuleLevels()` batches both tables
into two `= ANY($1)` queries instead of looping one query per module.
Each module class's own `$access_level` default (`AbstractModule`'s own default
is `Auth::PRIV_PRIVATE` = 2, visible to visitors) was read directly off
the real PHP class - `MODULE_DEFAULT_LEVEL` in `genealogy-menu.mjs`
lists only the modules that override it (`SourceListModule`/
`LocationListModule` = 1, `SubmitterListModule` = 0,
`CalendarMenuModule` = 1, four report modules = 1).

### The "significant individual" for Charts/Reports links

Real PHP builds these links around `$tree->significantIndividual(Auth::user(), $xref)`
- the page's own `xref` query param when it resolves to a real
individual (existence check only, no privacy check - matching real PHP
exactly), else the same "signed-in user's rootid/gedcomid pref, else
the tree's PEDIGREE_ROOT_ID, else the lowest xref in the tree" chain
already built for the tree-page welcome block
(`significantIndividualXref()`, `pages-server/welcome-block.mjs`).
Ported as `significantIndividual()` in `genealogy-menu.mjs`, reusing
that function unchanged. The Family-record fallback branch (an
explicit `xref` that names a FAMILY, not an individual) is not
ported - no call site here can ever supply one, since every page's own
`xref` already names whatever kind of record that page is about.

## Wiring: one new `genealogyMenuHtml` param, 21 render functions

Every already-ported full-page render function
(`individual-view.mjs`, `family-view.mjs`, ... all 6 chart-view files)
had the exact same copy-pasted header markup - confirmed identical
indentation/text across all 21 files before touching any of them, which
is what made a single scripted edit safe. Each now takes
`genealogyMenuHtml` (defaulted to `''` so a caller/test that omits it
gets nothing extra, not a literal `"undefined"` in the HTML) and
splices it in right after the `wt-secondary-navigation` div, exactly
where `resources/views/layouts/default.phtml` puts its own
`<nav class="col wt-primary-navigation">`.

Each of the ~20 call sites in `pages-server/index.mjs` computes it
fresh, right before its own render call:

```js
const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
const genealogyMenuHtml = renderGenealogyMenuNav(
  await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: xref }),
);
```

Deliberately a FRESH `viewerAccessLevel()` call at every site, rather
than reusing whatever access-level variable each handler happens to
already have in scope (some are scoped inside a `try` block and aren't
visible at the render call at all) - one extra tiny query per page load
in exchange for zero risk of silently reusing an out-of-scope or
differently-named variable across 20 different call sites.
`xrefParam` is the page's own individual `xref` for the Individual
page and all 6 chart pages (where one is always on hand already), and
`null` everywhere else (record pages for non-individual record types,
every list page, the tree page) - `significantIndividual()`'s own
fallback chain handles a `null`/invalid xref correctly either way, so
this only affects which individual Charts/Reports links default to,
never correctness.

## Scope cuts

- **Three menu modules not ported**: `ClippingsCartModule`,
  `FrequentlyAskedQuestionsModule`, `StoriesModule` (the other three
  real `ModuleMenuInterface` modules) - each needs its own
  feature-specific data (cart contents, FAQ articles, stories) that
  nothing ported so far has touched. If a real install has any of
  these enabled, its menu bar will have 3 fewer items than real PHP's
  until one of them gets its own scoping pass.
- **Search and replace's own gate is simplified**: real PHP checks
  `Auth::isEditor($tree)`; this port checks `accessLevel <= 1` (signed
  in as at least a "member") - close in the common case, but real
  PHP's own `canedit` values can include a read-only "access" tier
  that this port's `viewerAccessLevel()` already folds into the same
  level-1 bucket (a pre-existing simplification from earlier steps, not
  new here).
- **List modules' own `listIsEmpty($tree)` check is not ported** -
  real PHP hides e.g. the Media objects link entirely if the tree has
  zero media objects. This port always shows an enabled+accessible
  list module's link regardless of whether the list itself would be
  empty.

## Live verification

Against the real "ophir" tree, anonymous visitor:

- Confirmed the bar now renders on every page type touched: tree page,
  individual/family/note/family-list/note-list pages (200s), all 6
  chart pages, individual-list and media-list pages.
- Family tree/Charts/Lists/Search menus present with correct
  module-driven content; Calendar and "Search and replace" correctly
  absent for an anonymous visitor (both require signed-in access,
  confirmed by the access-level unit tests rather than a live
  logged-in session - no test credentials were available in this
  environment).
- Lists submenu alphabetically sorted (Branches, Families,
  Individuals, Media objects, Repositories, Shared notes); Sources/
  Places/Submitters correctly absent for a visitor (level-1/0 modules).
- Reports submenu populated with all enabled+accessible report
  modules, each linking to its own PHP report-setup page with the
  page's own individual's xref.
- Pre-existing 403s on some record pages (`/family/F000001`, `/media/M1`,
  `/source/DOC000001`, `/repository/R1`, and `/individual/I1` itself)
  are unrelated to this change - each handler's own record-level
  privacy check runs BEFORE the new genealogy-menu code even executes
  (confirmed structurally: the inserted code sits immediately before
  the final `render...Page()` call in every handler, after every
  existing access check).
- No errors in `pages` container logs across all of the above.

5174 tests passing (up from 5157), zero regressions.
