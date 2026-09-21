# Phase 5, step 10: `/tree/{tree}/family/{xref}` (FamilyPage)

**Status: done and verified live (2026-09-21), against a real user-imported GEDCOM tree.**

## What this is

The second route serving real GEDCOM record data, closing the MARR
gap explicitly cut from the previous step (IndividualPage): husband/
wife/children identity cards (each linking to their own now-real
`/tree/{tree}/individual/{xref}` Node route) plus a marriage/divorce
vital-facts table. No full facts-and-events table beyond those tags,
no chart links, no slug canonicalization — same "shell + narrow
slice" precedent as every step so far.

## Key finding: `Family` and `Individual` share the same privacy core in PHP

`Family` and `Individual` both extend `GedcomRecord` and share its
`canShowRecord()` method verbatim — only `canShowByType()` is
overridden per type. `Family::canShowByType()` (`app/Family.php:
118-131`) turned out to be much simpler than `Individual`'s: it just
checks whether every referenced `HUSB`/`WIFE`/`CHIL` individual passes
`Individual::canShow()` — the exact function already built and
verified for IndividualPage — and hides the whole family if any one
of them fails. No new relationship-BFS, no keep-alive logic, no
new privacy primitives at all.

To mirror this shared-code structure rather than duplicating the RESN/
self-record/admin-bypass chain, `pages-server/individual.mjs`'s
`canShowRecord()` was refactored into a shared exported core
(`canShowViaResnChain()`) plus a thin individual-specific wrapper —
`pages-server/family.mjs`'s `familyCanShowRecord()` calls the same
core with its own `canShowByType` delegate. The full `individual.mjs`
test suite was re-run after this refactor to confirm no behavior
changed for the already-shipped IndividualPage route.

## A second privacy primitive needed: `canShowName()`

`Family::husband()`/`wife()`/`children()` (`app/Family.php:86-192`)
gate each member's visibility via `Individual::canShowName()`
(`app/Individual.php:91-96`), not the stricter `canShowRecord()` —
some living individuals can have their *name* shown even when their
full record can't. This method had already been identified as
apparently-dead code while building IndividualPage (its own page's
access gate makes it unreachable there), but it's very much reachable
here. Ported directly: `SHOW_LIVING_NAMES` tree preference (added to
`loadTreePrivacyPrefs()`) permits the name outright at a given access
level; otherwise falls through to the full `canShowRecord()` check.

In practice, `canShowName()`'s extra leniency turns out to never
matter for rendering *this specific page*: since the family-level
gate (`familyCanShowRecord()`) already requires every referenced
member to pass the *stricter* `canShowRecord()` before the family is
shown at all, by the time member cards are rendered every member is
already known to be fully showable. `canShowName()` is still ported
faithfully (documented, not skipped) since it's the real mechanism
PHP uses and a future step reusing family members' names from a
*different* page (e.g. a "spouse" reference on someone else's page)
would need it.

## Scope cuts

- **`SHOW_PRIVATE_RELATIONSHIPS` not ported.** When this tree
  preference is on (`'1'`, the default), PHP's `husband()`/`wife()`/
  `children()` bypass privacy entirely for the relationship structure
  itself (treating access level as `PRIV_HIDE`), showing who's related
  to whom even when the individuals' own records are private. Not
  porting this is a safe, conservative divergence — omitting the
  bypass can only *hide* a member Node would otherwise show due to
  this override, never show one PHP would hide. It only affects the
  member-card *display* helpers, not the family-level access gate
  itself (`canShowByType()` always uses the real access level).
- **`getMarriage()`'s exact tag scope not replicated as a separate
  method.** PHP's `Family::getMarriage()` checks only the literal
  `MARR` tag; the vital-facts *table* shown here is a different,
  broader concept (mirrors `family-page.phtml`'s "Facts and events"
  table filter, which shows every matching fact, not a first-match
  pick) — scoped to `MARR`/`DIV`/`ANUL`/`_SEPR`.
- **No slug canonicalization/301 redirect**, same reasoning as
  IndividualPage.
- **No full facts table** (only marriage/divorce tags) — a family
  record can carry arbitrary custom facts; only the ones distinctive
  to a family relationship are shown in this v1.

## Implementation

- **`pages-server/individual.mjs`**: `canShowRecord()` refactored into
  `canShowViaResnChain()` (exported, the shared RESN/self-record/
  admin-bypass chain) + the existing individual-specific wrapper. New
  `canShowName()` export. `loadTreePrivacyPrefs()` gained
  `showLivingNames`.
- **`pages-server/family.mjs`** (new): `loadFamily()` (reads
  `wt_families.f_husb`/`f_wife` — confirmed live these denormalized
  columns match the `1 HUSB`/`1 WIFE` GEDCOM lines exactly, no need to
  regex-parse them from `f_gedcom`), `childrenXrefs()` (CHIL fact
  extraction), `vitalFamilyFacts()` (MARR/DIV/ANUL/_SEPR filter),
  `familyCanShowRecord()` as described above.
- **`pages-server/family-view.mjs`** (new): `renderFamilyPage()`,
  same hand-rolled-HTML convention as every prior view. Husband/wife/
  child cards each link to `/tree/{tree}/individual/{xref}` — a real
  Node route now, closing the loop between the two record-page steps.
  A missing or not-shown husband/wife renders an "unknown name"
  placeholder rather than a broken link.
- **`pages-server/routes.mjs`** / **`proxy/routing.mjs`**:
  `matchFamilyPagePath()` / `isFamilyPagePath()`, same exact-shape
  convention as the individual-page matchers (an extra required
  segment beyond `/tree/{tree}`, optional trailing slug ignored,
  confirmed via grep that no other PHP action route lives literally
  under `/family/{xref}/...`).
- **`pages-server/index.mjs`**: `handleFamilyPage()` resolves the
  family, then each referenced husband/wife/child via a shared
  `resolveFamilyMember()` helper (loads the individual, computes
  `isDead()`/privacy inputs, calls `canShowRecord()` — reusing every
  primitive already built for IndividualPage), collects the
  per-member `canShow` results, and calls `familyCanShowRecord()` for
  the overall page gate. 404 for a nonexistent family xref (distinct
  from a nonexistent tree's 302), 403 if the gate denies.

## Verification

**Unit tests**: `pages_server_family.test.js` (13 tests) covers
`loadFamily()`, `childrenXrefs()`, `vitalFamilyFacts()`, and
`familyCanShowRecord()`'s full branch set (including the shared RESN
chain still applying to a family record's own inline `RESN`, and the
"any one hidden member hides the whole family" rule). `pages_server_family_view.test.js`
(9 tests) covers the view layer, including the missing-spouse
placeholder. `pages_server_individual.test.js` gained tests for the
new `canShowViaResnChain()`/`canShowName()` exports (5 tests) plus a
fixed default-value assertion for the new `showLivingNames` field.
Route-matcher tests added to both `pages_server_routes.test.js` and
`proxy_routing.test.js`, including fixing one now-stale assertion from
the *previous* step (a test had used `/tree/ophir/family/F1` as a
"not a Node route" negative example — true before this step, false
after). Full JS suite: **4320 tests, green** (4282 + 38 new).

**Live verification** — this is the first step verified against a
**real, user-imported GEDCOM tree** rather than synthetic/seeded test
data (the user imported their real family tree in the previous
session, after the PHP upload-size fix). Using the established
`data/config.yaml` localhost-swap-then-restore pattern:
1. A family with living members (the tree owner's own immediate
   family, `F000002`) correctly 403s for an anonymous visitor.
2. A family with only deceased/historical members (`F000003`, married
   1933 in Łódź) renders correctly for an anonymous visitor: husband
   "Arie Leib Gutgold" (1907–1967), wife "Chana Librach" (1910–1975),
   one child, and the marriage fact (24 JAN 1933, Łódź, Poland) — all
   independently cross-checked against the raw `f_gedcom`/`i_gedcom`
   rows via `psql`.
3. Followed the husband's card link to his own `/tree/{tree}/individual/{xref}`
   page and confirmed it renders correctly — the FamilyPage → IndividualPage
   cross-link round-trip works.
4. A disposable test admin user (`nodetest`, not the real `mirono`
   account) confirmed manager-level access correctly reveals the
   previously-403'd living family, including the real tree owner's own
   record — proving the "any one hidden member hides the whole family"
   gate is working as designed, not just coincidentally denying.
5. 404 (nonexistent family xref) vs. 302 (nonexistent tree) confirmed.
6. Cross-checked the slug-less redirect target against a locally-run
   `php -S` instance sharing the same database: `301` → the correctly
   PHP-generated slug (`Arie-Leib-Gutgold-Chana-Librach`), reaching
   `wt-route-FamilyPage` (PHP's own content render is still blocked by
   the same pre-existing, unrelated "fact-sorting service" dependency
   gap noted in the prior two steps).
7. All disposable fixtures (test admin user, session row, preference
   row) deleted afterward; `data/config.yaml` restored; both local
   test server processes killed.

## Docker note

Same as every prior `pages-server` step: **needs `docker compose
restart pages`** to pick up these changes in the live stack.
