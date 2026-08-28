# Phase 4 — Cutover Tracking

Per [php-to-js-migration-checklist.md](../php-to-js-migration-checklist.md).
Tracked by module rather than HTTP route where there's no route yet — see
[00-phase0-inventory.md](00-phase0-inventory.md) for why (no Node backend
exists yet; these are library-level ports).

| Route/Feature | Functions migrated | Parity tests passing | Traffic cut over? | Notes |
|---|---|---|---|---|
| `lib/soundex` | `russell`, `compare`, `daitchMokotoff` (+ bridging helpers `strtoupper`, `textScript`) — 5/5 across tasks 1-2 | ✅ 61/61 (`npm test`); ✅ bridge itself covered by `tests/Feature/SoundexServiceBridgeTest.php` | ⚠️ Bridged but not enabled — `app/Soundex.php`'s 4 real callers (`GedcomImportService`, `SearchService`, `BranchesListModule`, `Place`) now route through `server/soundex-service.mjs` *when* `WEBTREES_SOUNDEX_SERVICE_URL` is set, with automatic fallback to native PHP. Unset (0%) in every environment today — see [phase3-soundex-bridge.md](phase3-soundex-bridge.md) | Tasks 1 and 2 (the ports) and the Phase 3 bridge are all complete. Flipping the env var on in a real deployment — i.e. actually cutting traffic — is a separate, later decision; known risk to weigh first: no request batching yet, so bulk GEDCOM import pays one HTTP round-trip per name. |
| `lib/comparators` | `TagComparator.order`, `TagComparator.byOrder` — 1/1 of task 3's scope | ✅ 14/14 (`npm test`) | N/A by design — not bridged | Task 3 complete. Its only current caller (`Fact::sortFactTags()`) is `@deprecated`; the real payoff is unblocking `FactComparator`, which isn't ported yet (blocked on the Date engine). See task-03's "Phase 3 bridging: deliberately not done here" for the reasoning and how to add it later if that call turns out to be wrong. |
| `lib/surname-tradition` | All 9 registered traditions (`Default` + `Patrilineal`, `Paternal`, `Matrilineal`, `Icelandic`, `Lithuanian`, `Polish`, `Portuguese`, `Spanish`) — 9/9, tasks 4-5 | ✅ 146/146 (`npm test`; 18 from task 4 + 128 from task 5) | ⚠️ **Not yet decided** — see below | Tasks 4 and 5 complete — every class `SurnameTraditionFactory` registers is now ported and cross-validated against the pre-existing `tests/Unit/SurnameTradition/*Test.php` suite. |

## `lib/surname-tradition`'s bridging decision needs a call

Task 4 deferred bridging because only 1 of 9 registered traditions was
ported — a bridge would only have fired for a minority of trees. That
condition no longer holds: **all 9 are ported now.** Real, live callers
exist (5 "add family member" HTTP request handlers via
`SurnameTraditionFactory`: `AddChildToIndividualPage`,
`AddSpouseToIndividualPage`, `AddParentToIndividualPage`,
`AddChildToFamilyPage`, `AddSpouseToFamilyPage`), same shape as the
Soundex bridge ([phase3-soundex-bridge.md](phase3-soundex-bridge.md)) but
not yet built: it would need (a) a Node service exposing these 9 classes,
(b) a PHP-side `Individual` → NAME-fact-array conversion (this module's
input shim, see `lib/surname-tradition/README.md`) at the 5 call sites,
and (c) the same short-circuit-with-fallback pattern used in
`app/Soundex.php`. This is a real decision to make deliberately, not a
default to fall into — flagged here rather than built unprompted.

Review this table weekly. If a row hasn't moved in two weeks, that's the
signal something's blocked — usually a Phase 3 bridging decision — surface
it rather than letting it sit.
