# Phase 5 step 39: `/admin` (ControlPanel)

**Done 2026-11-07.** The entry point into the ~85-route admin area —
scoped (user's explicit choice) to the read-only dashboard itself:
every card's real counts/lists, full fidelity on the Modules card's
18-way category breakdown. Every other `/admin/...` link on the page
is a real link to its real PHP path, still served by PHP via the
proxy — same strangler-fig pattern as the genealogy menu (step 33)
linking to not-yet-ported charts/lists.

## Scope

New files:

- `pages-server/control-panel.mjs` — data layer: per-tree counts
  (individuals/families/sources/media/repositories/notes/submitters/
  pending changes), user lists (administrators/managers/moderators/
  unapproved/unverified), the module-category summary, and a read-only
  legacy-file existence check.
- `pages-server/control-panel-view.mjs` — HTML assembly, including the
  admin-specific page shell (no genealogy menu bar — this layout is
  `layouts/administration.phtml`, not the normal site layout).
- `lib/module-categories.js` — generated (see below) module_name →
  category-key table, the data source for the Modules card's 18-way
  breakdown.
- `bin/characterize_control_panel_modules.php` — the one-off generator
  script for the table above.

Modified: `pages-server/routes.mjs` (`matchControlPanelPath`),
`proxy/routing.mjs` (`isControlPanelPath`), `pages-server/index.mjs`
(`handleControlPanelPage`, wired into the dispatch chain, gated the
same way `AuthAdministrator` gates real PHP: not logged in → `302` to
`/login?url=/admin`; logged in but not an admin → `403`).

## The Modules card: generated, not hand-transcribed

The real control panel classifies ~120 core modules into 18 category
sections (analytics/block/chart/data-fix/footer/historic-events/
language/list/map-autocomplete/map-geolocation/map-link/map-provider/
menu/report/share/sidebar/tab/theme), each via `instanceof
SomeInterface`. Rather than hand-transcribing or delegating that
classification — a real risk of a miscopy nobody would notice until a
live badge count looked wrong — `bin/characterize_control_panel_modules.php`
dumps it mechanically via PHP Reflection against
`ModuleService::CORE_MODULES` (the exact authoritative module_name →
class map real PHP itself uses for module registration), checking each
class's own `implementsInterface()` for each category. Same "generate
lookup tables mechanically via reflection" approach already established
for `app/Encodings/*` in task 16 (see [[feedback-haiku-delegation]]).

Verified live: the generated table has exactly 212 entries, matching
`SELECT COUNT(*) FROM wt_module` on the real "ophir" tree exactly
(confirming every DB-seeded module name really does map to a real core
module class, not a stale/renamed one). Live-rendered badge counts
cross-checked by hand against the real enabled-module list for two
categories (Charts: 13/13, all chart modules enabled; Lists: 9/10,
`submitter_list` the one disabled module) — both matched exactly.

## Three services deliberately scope-cut (not silently faked)

- **`ServerCheckService`** (PHP version/extension/opcache checks) —
  these check the PHP *runtime* specifically; meaningless for a
  request this Node server is itself serving, and moot as PHP phases
  out. Always renders with no errors/warnings.
- **`UpgradeService`** (a live HTTP call to webtrees.net for the
  latest released version) — no network dependency exists anywhere
  else in this migration, and "is PHP itself outdated" has no bearing
  on a Node-served page. Always renders the "no upgrade information is
  available" branch.
- **`HousekeepingService::deleteOldWebtreesFiles()`** — real PHP
  actually *deletes* a hardcoded list of ~70 legacy (webtrees 1.x/2.x)
  file/folder names from the install root on **every** page load, and
  reports back whichever ones it couldn't remove. Running a delete
  loop against the application's own checkout on every GET is exactly
  the kind of destructive action this migration's own operating
  principles call for avoiding without real need — ported as a
  **read-only existence check** instead (same list, same banner if any
  are found, but nothing is ever deleted by this port). Confirmed live:
  none of the 70 legacy paths exist in this checkout, so the "Old
  files found" card correctly never renders.

Also scope-cut: `AdminService::gedcomFiles()`/`multipleTreeThreshold()`
(the "Synchronize family trees with GEDCOM files" card, gated on N+
unimported `.ged` files sitting in the data folder) — `show_synchronize`
is always `false`, so that card never renders. Confirmed there are 0
such files on the real data folder anyway, so this is behavior-
invisible for this install.

`custom_updates` (installed custom-module version-check banner) is
always empty — confirmed live that `modules_v4/` has no installed
custom modules at all, and none of the 212 core modules implement
`ModuleCustomInterface` either (that interface is exclusively for
third-party-installed modules).

## Live verification

Against the real "ophir" tree (admin session created directly via a
new `wt_session` row for the existing admin user — no credentials were
read or extracted, only a fresh session created for this test, then
deleted afterward):

- No session → `302` to `/login?url=%2Fadmin`.
- Admin session, `GET /admin` → `200`. Family trees table: individuals
  6,949, families 2,213, sources 573, repositories 7, media 499, notes
  1, submitters 2 (links present for every list whose module is
  enabled; submitters shows a bare number since `submitter_list` is
  disabled on this tree) — every count matches the direct `SELECT
  COUNT(*)` ground truth already established in step 37's own
  verification pass.
- Users card: the one real admin user correctly listed under both
  Administrators and Managers; every other group empty (em-dash).
  Modules card: 145/212 enabled overall; Other section correctly shows
  `custom-css-js`/`sitemap` muted (both disabled in `wt_module`) and
  the other four enabled.
- `POST /admin` → `405` (GET-only).
- No "Old files found" card, no `card-outline-danger` anywhere
  (correct — no pending changes, no unapproved/unverified users, no
  legacy files present).

## Tests

- `js-tests/pages_server_control_panel.test.js` (14 tests) — count
  queries, user-role queries, `recipientTypes()`, `loadListModuleUrls()`
  (enabled-only), `loadModuleSummary()` (category counts, deleted-
  module detection), `findOldWebtreesFiles()` (real temp-directory
  existence checks, not mocked).
- `js-tests/pages_server_control_panel_view.test.js` (8 tests) — tree
  table rendering (zero-count dash, list-module-disabled fallback,
  pending-changes link, merge-link visibility), user groups, module
  badges/Other section, old-files conditional, HTML escaping.
- `js-tests/pages_server_routes.test.js` / `js-tests/proxy_routing.test.js` —
  new route-matcher cases.

Full suite: 5510 passing (up from 5484), 0 regressions.

## Next

Every other `/admin/...` route (user management, tree management,
module configuration pages, site preferences, GEDCOM import/export,
data fixes, record merging, server diagnostics) remains on PHP. Of
those, user management (`/admin/admin-users`, `-create`, `-edit`) is
the most immediately useful self-contained next slice, per the user's
own earlier shortlist.
