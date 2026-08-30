# Phase 3 — GedcomService bridging strategy

Per [php-to-js-migration-checklist.md](php-to-js-migration-checklist.md)'s
Phase 3: "Don't migrate a stateful function until its bridging strategy is
decided." `GedcomService::canonicalTag()`/`readLatitude()`/`readLongitude()`
themselves are pure (task [13](task-13-gedcom-service.md)), but task 13
deliberately left this as "N/A — no HTTP route yet," matching the reasoning
already used for `TagComparator`/`lib/ext-calendar`/`lib/date`: no live
JS/Node caller existed at the time, so there was nothing on the other end
of a bridge to justify one. This doc builds that bridge, following the
exact same shape as [phase3-soundex-bridge.md](phase3-soundex-bridge.md).

## Where these functions are actually called

```
app/Fact.php                          — new GedcomService() directly, 2 call sites
app/Services/GedcomImportService.php  — Registry::container()->get(GedcomService::class),
                                         plus one `new GedcomService()` — per-record, during
                                         GEDCOM import
```

`GedcomImportService` can call `canonicalTag()` many times per imported
GEDCOM file (once per non-canonical tag encountered). Same
bulk-import-latency consideration as the Soundex bridge.

## What was chosen: same persistent Node HTTP microservice, extended

- **`server/migration-service.mjs`** — extended with 3 new routes,
  importing `lib/services/gedcom-service.js` (already ported and tested,
  task 13):
  - `POST /gedcom/canonical-tag {"tag": "..."}` → `{"tag": "..."}`
  - `POST /gedcom/read-latitude {"text": "..."}` → `{"value": number|null}`
  - `POST /gedcom/read-longitude {"text": "..."}` → `{"value": number|null}`

  No new npm script or port — this is the same `migration-service.mjs`
  process Soundex and SurnameTradition already bridge to
  (`npm run serve:migration`, port 8090 by default).

- **`app/Services/GedcomService.php`** — `canonicalTag()`, `readLatitude()`,
  and `readLongitude()` each now start with a call to a new private static
  `callService()` helper, copied structurally from `Soundex::callService()`
  (same 0.5s connect+total timeout, same JSON-over-HTTP shape, same
  exception handling). If `WEBTREES_GEDCOM_SERVICE_URL` is unset (the
  default), `callService()` returns `null` immediately and every call
  site's behavior is byte-for-byte identical to before this bridge —
  confirmed by running the existing `GedcomServiceTest` unit test with the
  env var unset (unchanged, still passes). If it's set, the method POSTs to
  the service and returns its result; **any** failure (unreachable,
  timeout, non-200, unparseable body) falls straight through to the
  original native PHP implementation, unchanged, right below the new
  short-circuit.

  One shape difference from Soundex worth noting: `readLatitude()`/
  `readLongitude()` return `float|null`, not a required string. The
  service-result check is therefore `array_key_exists('value', $result)`
  (not `is_string($result['x'] ?? null)`, which would incorrectly treat a
  legitimate `null` "no match" response as "service didn't answer, fall
  back to native") — and the value is explicitly cast with `(float)` on
  the non-null branch, since PHP's `json_decode()` returns whole-number
  JSON values as `int`, not `float`, and this method's return type is
  strictly `float|null`.

- **Circuit breaker**: same `private static bool $service_unavailable`
  pattern as `Soundex`, but explicitly documented as intentionally
  *static* even though `GedcomService`'s public methods are instance
  methods (unlike `Soundex`'s all-static design) — `GedcomImportService`
  and `Fact` both construct fresh `GedcomService` instances at different
  call sites within the same request/process, and the circuit breaker
  needs to latch across all of them, not reset per instantiation.

## Verification

- **`tests/Feature/GedcomServiceBridgeTest.php`** — spins up the real Node
  service as a child process (port 8198, distinct from
  `SoundexServiceBridgeTest`'s 8199 and the dev default 8090), proves the
  service-routed path returns identical results to the native path for
  `canonicalTag()`, `readLatitude()`, `readLongitude()` (including a
  null-returning case), then proves the same for an unreachable service
  (fallback). Skips itself if `node`/`npm` aren't available. Ran end to end
  (not just written and assumed correct): 2 tests, 8 assertions, pass.
- All 3 bridge Feature tests (`Soundex`, `SurnameTradition`, `GedcomService`)
  run together against the same shared `migration-service.mjs` — confirmed
  no cross-module interference (7 tests, 23 assertions, pass).
- `vendor/bin/phpcs`/`phpstan` clean on both new/modified PHP files.

## Cutover status

Not enabled anywhere by default — `WEBTREES_GEDCOM_SERVICE_URL` is unset in
every environment until someone deliberately sets it. Same deliberate
"bridge exists and is tested, flipping it on is a separate later decision"
posture as Soundex and SurnameTradition — see
[phase4-cutover-tracking.md](phase4-cutover-tracking.md).

`RomanNumeralsService` (also in `lib/services/`, task 14) is **not**
bridged by this change — its only caller is internal JS-to-JS
(`lib/date/french.js`), there's no PHP call site to bridge from.
