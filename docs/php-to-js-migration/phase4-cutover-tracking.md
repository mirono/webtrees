# Phase 4 — Cutover Tracking

Per [php-to-js-migration-checklist.md](../php-to-js-migration-checklist.md).
Tracked by module rather than HTTP route where there's no route yet — see
[00-phase0-inventory.md](00-phase0-inventory.md) for why (no Node backend
exists yet; these are library-level ports).

| Route/Feature | Functions migrated | Parity tests passing | Traffic cut over? | Notes |
|---|---|---|---|---|
| `lib/soundex` | `russell`, `compare`, `daitchMokotoff` (+ bridging helpers `strtoupper`, `textScript`) — 5/5 across tasks 1-2 | ✅ 61/61 (`npm test`); ✅ bridge itself covered by `tests/Feature/SoundexServiceBridgeTest.php` | ⚠️ Bridged but not enabled — `app/Soundex.php`'s 4 real callers (`GedcomImportService`, `SearchService`, `BranchesListModule`, `Place`) now route through `server/soundex-service.mjs` *when* `WEBTREES_SOUNDEX_SERVICE_URL` is set, with automatic fallback to native PHP. Unset (0%) in every environment today — see [phase3-soundex-bridge.md](phase3-soundex-bridge.md) | Tasks 1 and 2 (the ports) and the Phase 3 bridge are all complete. Flipping the env var on in a real deployment — i.e. actually cutting traffic — is a separate, later decision; known risk to weigh first: no request batching yet, so bulk GEDCOM import pays one HTTP round-trip per name. |
| `lib/comparators` | `TagComparator.order`, `TagComparator.byOrder` — 1/1 of task 3's scope | ✅ 14/14 (`npm test`) | N/A by design — not bridged | Task 3 complete. Its only current caller (`Fact::sortFactTags()`) is `@deprecated`; the real payoff is unblocking `FactComparator`, which isn't ported yet (blocked on the Date engine). See task-03's "Phase 3 bridging: deliberately not done here" for the reasoning and how to add it later if that call turns out to be wrong. |
| `lib/surname-tradition` | `DefaultSurnameTradition` (`name`, `description`, `defaultName`, `newChildNames`, `newParentNames`, `newSpouseNames`, `buildName`, `extractName`) — 1/9 registered traditions | ✅ 18/18 (`npm test`) | N/A by design — not bridged | Task 4 complete. Real, live callers exist (5 "add family member" HTTP request handlers via `SurnameTraditionFactory`), unlike tasks 2-3, but only 1 of 9 registered tradition implementations is ported — a bridge today would only fire for a minority of trees, and would need an `Individual` → NAME-fact-array conversion at all 5 call sites. See task-04's "Phase 3 bridging: deliberately not done here". `lib/surname-tradition/README.md` documents the reusable patterns for the 8 remaining subclass tasks. |

Review this table weekly. If a row hasn't moved in two weeks, that's the
signal something's blocked — usually a Phase 3 bridging decision — surface
it rather than letting it sit.
