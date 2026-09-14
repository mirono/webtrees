# Phase 4 — Cutover: `GedcomService`

## Context

The 3rd of 6 PHP↔Node bridges to be cut over, and the 1st of the 4 that
were blocked pending the shared test-infra work (see
[phase4-shared-test-migration-service.md](phase4-shared-test-migration-service.md)).
`FactSortService`/`SurnameTradition` (see
[phase4-cutover-fact-sort-surname-tradition.md](phase4-cutover-fact-sort-surname-tradition.md))
were cut over first because they weren't entangled with
`tests/TestCase.php::importTree()`; that blocker is resolved, so
`GedcomService` (`canonicalTag()`, `readLatitude()`, `readLongitude()`)
went next.

`app/Services/GedcomService.php` was small and self-contained: a
`$service_unavailable` circuit breaker, `callService()` (same shape as
every other bridge), exactly 3 public bridged methods, and private
support code used only by their native fallbacks (`TAG_NAMES`,
`TAG_SYNONYMS`, `readDegrees()`) — confirmed unused anywhere else via
`grep -rn "TAG_NAMES\|TAG_SYNONYMS\|readDegrees" app/ tests/` before
deleting them.

## What changed

- **`app/Services/GedcomService.php`** — `TAG_NAMES`, `TAG_SYNONYMS`,
  `readDegrees()`, and the now-unused `use Fisharebest\Webtrees\Gedcom;`
  import were deleted. Each of the 3 methods' native-fallback body was
  replaced with `throw new HttpServiceUnavailableException(I18N::translate(...))`,
  the same pattern as the previous cutover. `SERVICE_URL_ENV_VAR`,
  `$service_unavailable`, and `callService()` are unchanged.
- **`tests/Feature/GedcomServiceBridgeTest.php`** — rewritten. Unlike the
  previous cutover, there was no exhaustive characterization test to lean
  on for coverage (`tests/Unit/Services/GedcomServiceTest.php` is a
  trivial `assertTrue(class_exists(...))` stub). Deleting the old "capture
  native, then compare" test without replacement would have left no
  PHP-side proof the live bridge computes *correct* values, only that it
  doesn't throw. Fixed by asserting hardcoded known-good values instead —
  the same approach `SurnameTraditionServiceBridgeTest::
  testRoutesThroughLiveServiceAndAppliesLithuanianInflection()` already
  uses for its Lithuanian case (`canonicalTag('birth')` → `'BIRT'`,
  `readLatitude('N52.1234')` → `52.1234`, `readLongitude('W010.5')` →
  `-10.5`, `readLatitude('not a number')` → `null`). The "falls back"
  test became "throws."
- **`tests/Feature/GedcomImportServiceBridgeTest.php`** — comment-only
  addition explaining the cascade (below); no behavior change needed.

## The circuit-breaker trade-off (same as the previous cutover)

`$service_unavailable` is kept: once a call fails, every subsequent
`canonicalTag()`/`readLatitude()`/`readLongitude()` call in that PHP
process throws immediately rather than retrying. Deliberate, not an
oversight — see the prior doc's identical section for the full reasoning.

## The `reformatRecord()` cascade

`GedcomImportService::reformatRecord()` tries its own bridge first
(`WEBTREES_GEDCOM_IMPORT_SERVICE_URL`) and only falls through to native
line-processing — which calls `GedcomService::canonicalTag()` — on
failure. Now that `GedcomService` has no native fallback, if a deployment
had **both** `WEBTREES_GEDCOM_IMPORT_SERVICE_URL` and
`WEBTREES_GEDCOM_SERVICE_URL` unreachable at once, `reformatRecord()`'s
own fallback path would itself throw and hard-fail GEDCOM import — even
though `reformatRecord()` was never itself cut over. This is recorded as
a deliberate, currently-inert consequence, not fixed here: fixing it
would mean deciding `reformatRecord()`'s own cutover, which is separate,
future, per-module work. No dedicated regression test was added for this
combination, since it would be asserting behavior of
`reformatRecord()`'s own (not-yet-cut-over) fallback branch, not a
contract of `GedcomService` — it becomes relevant only if/when
`reformatRecord()` gets its own cutover decision.

## A wider blast radius than expected — and a bugfix along the way

Implementation surfaced two things the plan hadn't anticipated, both
worth recording so a future cutover pass doesn't rediscover them the hard
way:

1. **`TreeService::create()` is a second, more fundamental funnel than
   `importTree()`.** Creating any tree seeds it with a default
   header/individual via `GedcomImportService::importRecord()` — the same
   code path `importTree()` uses, but reachable from far more than the 28
   `importTree()`-calling files: 18 test files construct `TreeService`
   directly (`GedcomRecordTest`, `TreeTest`, several `Http/RequestHandlers`
   tests, etc.), and `importTree()` itself is just a thin wrapper around
   `TreeService::create()` plus bulk record import. Running the full
   PHPUnit suite (not just the files named in the plan) surfaced this
   immediately: `GedcomRecordTest`'s `setUp()` threw
   `HttpServiceUnavailableException` because it calls `TreeService::create()`
   directly, never through `importTree()`, so `SharedMigrationService::
   ensureRunning()` was never triggered for it. Fixed by moving the guard
   from `TestCase::importTree()` up to `TestCase::setUp()`'s
   `$uses_database` branch — any of the 112 database-using test files can
   in principle reach `TreeService::create()`, so that's the real common
   choke point, not `importTree()`. This costs nothing extra for tests
   that don't create a tree (the check is a cheap boolean after the first
   successful start).
2. **A real bug in `tests/Concerns/SharedMigrationService.php`** (from the
   shared-test-infra phase, previously untested against an actually-cold
   port 8090 because every prior verification run happened to find an
   already-running dev-sandbox instance): `proc_open()`'s spawned `node`
   child inherited a duplicate of the *calling* PHP process's own
   stdout/stderr pipe when that process's own output was itself piped
   (e.g. `vendor/bin/phpunit ... | tail`). Since the shared service is
   deliberately long-lived (killed only at process shutdown), that leaked
   descriptor kept the outer pipe open forever, hanging the reader long
   after PHPUnit itself had exited — a silent full deadlock, not a
   PHPUnit failure. Fixed by redirecting the child's stdin/stdout/stderr
   to `/dev/null` via file descriptors instead of unread pipes, which
   avoids the internal pipe-duplication dance that caused the leak.

## What this means operationally

`WEBTREES_GEDCOM_SERVICE_URL` is no longer an optional performance knob
for: GEDCOM import (`GedcomImportService::importLegacyPlacDefn()`, and
indirectly `reformatRecord()`'s fallback path per the cascade above), and
per-fact latitude/longitude display (`Fact::latitude()`/`longitude()`).
As with the previous cutover, there is still no real (non-sandbox)
production deployment of this repo, so this is a statement about what a
future deployment would need.

## Why the other three modules aren't next "by default"

`Soundex`, `GedcomExportService::wrapLongLines()`, and
`GedcomImportService::reformatRecord()` are unaffected by this pass and
remain on native fallback. Cutting over any of them is still a separate,
future per-module decision — this doc's "wider blast radius" finding is a
reason to actually run the full suite before declaring one done, not a
reason to expect a repeat of the same specific surprise (each module's
real call graph needs its own check).
