# Phase 5 step 38: `/tree/{tree}/pedigree-map-{generations}/{xref}` (PedigreeMapModule)

**Done 2026-11-07.** The ELEVENTH chart route, and the last of the
distinctly-shaped ones in this migration — every remaining chart module
is a variant of a shape already built. Plots the birthplace of every
ancestor (Sosa-Stradonitz numbered) of one individual on a Leaflet map.

## Scope

Unlike every other chart ported so far, this module has **no AJAX
fragment at all**. Real `PedigreeMapModule::handle()` builds the
GeoJSON data inline and embeds it directly in the one GET response's
`<script>` tag — there's no `?ajax=1` action, no lazy-load arrow, no
separate fragment endpoint. This made the whole module small enough
to implement and verify directly by hand, without delegating any part
of it to a subagent — unlike steps 36/37, where a bounded, well-
specified port of real size justified it. See
[[feedback-haiku-delegation]] for that judgment call in general.

New files:

- `pages-server/pedigree-map.mjs` — the Sosa-Stradonitz ancestor walk,
  birth-fact selection, GeoJSON assembly, and the (read-only)
  `place_location` gazetteer fallback.
- `pages-server/pedigree-map-view.mjs` — HTML assembly (the options
  form + the embedded map/script), read directly from
  `resources/views/modules/pedigree-map/{page,chart}.phtml`.
- `pages-server/leaflet-config.mjs` — `LeafletJsService::config()`'s
  port, shared infrastructure any future map-drawing chart could reuse
  (only `OpenStreetMap`'s own tile layers are ported — see "Scope cuts"
  below).

Modified: `pages-server/routes.mjs` (`matchPedigreeMapChartPagePath`),
`proxy/routing.mjs` (`isPedigreeMapChartPagePath`), `pages-server/index.mjs`
(`handlePedigreeMapChartPage`, wired into the dispatch chain). The top
genealogy-menu bar (step 33) already had a `pedigree-map` entry in its
hardcoded `CHART_ENTRIES` list from the start, so no menu-bar change
was needed here.

## The real subtlety: two separate access-level contexts

Every other chart ported so far threads a single `accessLevel` (or its
SHOW_PRIVATE_RELATIONSHIPS-bypassed `traversalAccessLevel` variant)
through both the traversal AND the display logic consistently. This
module genuinely uses **both, for different purposes, in the same
request**:

- **Traversal** (`sosaStradonitzAncestors()`): climbing via
  `Family::husband()`/`wife()`/`Individual::childFamilies()` uses the
  usual bypass (`-1`/`PRIV_HIDE` when SHOW_PRIVATE_RELATIONSHIPS is on,
  else the viewer's own access level) — same pattern as every other
  chart's own relationship traversal. `Family::canShowByType()`
  (app/Family.php:118-131) hides a family if **any** member — husband,
  wife, *or child* — can't show, so a family with one private child
  blocks climbing through that whole family, even past two otherwise-
  showable parents.
- **Display** (`buildPedigreeMapData()`/`getPedigreeMapFacts()`):
  `$person->canShow()` with **no** access-level override decides which
  ancestors actually get a map marker — the viewer's own plain level,
  regardless of SHOW_PRIVATE_RELATIONSHIPS. So that preference can let
  you climb *past* a private ancestor to reach a public one beyond
  them, while the private ancestor's own marker stays hidden — a real,
  if unusual, asymmetry (same flavor as the Hourglass chart's own
  documented asymmetry, step 29).

Both are implemented and tested separately in
`js-tests/pages_server_pedigree_map.test.js`
(`sosaStradonitzAncestors` vs. `getPedigreeMapFacts`).

## Birth-fact selection

Real `getPedigreeMapFacts()` calls `$person->facts(BIRTH_EVENTS, true)
->first(place !== '')` — BIRTH_EVENTS = `[BIRT, CHR, BAPM]`, sorted by
`FactComparator::byType()` then `::byDate()` (a type group first, dated
facts within a group chronologically, undated facts keeping their
original — i.e. type-sorted — position via JS's stable `Array.sort()`,
matching PHP's own "preserve original order" fallback). Ported as: for
each tag in `[BIRT, CHR, BAPM]` in order, filter+sort that tag's own
facts by date, concatenate the three groups, then take the first one
with a non-empty place. Each fact's own `RESN` is checked via the
already-shared `factCanShow()` (per-tag default RESN resolved the same
way `IndividualPage`'s own OBJE-fact filtering already does — fact-
specific, else tree-wide, else none).

## `PlaceLocation` gazetteer fallback — read-only

A fact's own `PLAC:MAP:LATI/LONG` is tried first (reusing the already-
ported `lib/services/gedcom-service.js`'s `readLatitude()`/
`readLongitude()` — the Node microservice real PHP's own
`GedcomService` now calls out to). When absent, real PHP falls back to
`PlaceLocation::id()`/`latitude()`/`longitude()`, a recursive lookup in
the `place_location` table (walking the place name's parts from most-
to least-specific) that **inserts a placeholder row for any place not
yet found**. This port's own `placeLocationCoordinates()` is read-only
— it never writes that row. Confirmed live:
`wt_place_location` is completely empty on this migration's own
"ophir" tree (`SELECT count(*) FROM wt_place_location` → 0), and no
GEDCOM fact in that tree carries a `LATI`/`LONG` tag either — so this
simplification is behavior-invisible for every place this migration
can actually exercise; a tree with its own populated gazetteer would
need the insert-on-miss behavior to see new rows appear in the admin
place-management UI (which this migration hasn't ported), but the
*map's own output* would be identical either way.

## Scope cuts

- **`AuthNotRobot` middleware** (bad-bot blocking on the POST action) —
  an anti-abuse measure with zero effect on a normal user's own output,
  same "doesn't change shown data" flavor already applied to the
  Timeline chart's mouse-drag exploration aids (step 35).
- **`leaflet-config.mjs`** only ports `OpenStreetMap`'s own tile-layer
  config. `EsriMaps`/`GoogleMaps`/`HereMaps`/`MapBox` are all confirmed
  `disabled` on the real "ophir" tree
  (`SELECT module_name, status FROM wt_module WHERE module_name ILIKE
  '%map%'`) — only reachable config is ported, same "only what's
  reachable" scope already applied to the ISO-3166 table in step 37.
- **`Place::fullName(true)`'s own link** (to the place-hierarchy page)
  — that page requires a non-empty `place_location` gazetteer to
  produce anything but `url() === '#'`, which (given the confirmed-
  empty table above) real PHP's own fallback (`<bdi>` plain text, no
  link) is what every reachable case produces anyway — so the port
  never generates the link at all, matching every reachable real
  output exactly.

## Live verification

Against the real "ophir" tree, both `pages-1` and `proxy-1` restarted:

- `GET /tree/ophir/pedigree-map-4/I000001` → `200`, correct title
  ("Pedigree map of Miron Ophir"), `geoJson_data` has `features: []`
  (correctly empty — confirmed via direct DB query: no `LATI`/`LONG`
  in any fact, empty `wt_place_location`).
- Same route for `I000003` (a confirmed-public individual) → `200`,
  menu-bar's own "Pedigree map" link present and pointing at
  `/tree/ophir/pedigree-map-4/I000003`.
- `GET .../pedigree-map-0/I000001` and `.../pedigree-map-999/I000001`
  → `400` (generations out of `[1, 63]`).
- `GET .../pedigree-map-4/NONEXISTENT` → `404`.
- `POST .../pedigree-map-4/I000001` with `xref=I000002&generations=5`
  → `302` to `/tree/ophir/pedigree-map-5/I000002` (pretty-URL redirect).
- Confirmed the chart-bypass asymmetry directly: `GET
  /tree/ophir/individual/I000001` → `403` (a living/private individual,
  no session), while `GET /tree/ophir/pedigree-map-4/I000001` → `200`
  for the SAME xref (SHOW_PRIVATE_RELATIONSHIPS lets the chart's own
  root subject be charted regardless of their own `canShow()` — same
  bypass every other chart's own root-individual check already uses).

No visual marker/polyline verification was possible against the real
tree (confirmed empty gazetteer + no `LATI`/`LONG` facts anywhere), so
that logic is covered by `js-tests/pages_server_pedigree_map.test.js`'s
own `buildPedigreeMapData` tests instead (explicit-coordinate feature,
polyline-between-child-and-already-placed-parent, gazetteer fallback,
and the "no coordinates resolvable at all" omission case) — each
asserting against a small synthetic GEDCOM/fake-pool fixture, not the
live DB.

## Tests

- `js-tests/pages_server_pedigree_map.test.js` (18 tests) —
  `getSosaName` (self/parent/grandparent naming via the already-ported
  `legacyNameAlgorithm()`), `sosaStradonitzAncestors` (simple walk,
  generations limit, confidential-parent-blocks-family, private-child-
  blocks-family), `getPedigreeMapFacts` (place selection, type/date
  ordering, privacy exclusion), `placeLocationCoordinates` (gazetteer
  walk, empty-table fallback), `buildPedigreeMapData` (explicit
  coordinates, polyline direction, gazetteer fallback, no-coordinates
  omission).
- `js-tests/pages_server_pedigree_map_view.test.js` (6 tests) — options
  form rendering, HTML escaping, logged-in vs. anonymous user menu.
- `js-tests/pages_server_leaflet_config.test.js` (3 tests) —
  enabled/disabled/missing-module-row cases.
- `js-tests/pages_server_routes.test.js` /
  `js-tests/proxy_routing.test.js` — new route-matcher cases.

Full suite: 5484 passing (up from 5452), 0 regressions.
