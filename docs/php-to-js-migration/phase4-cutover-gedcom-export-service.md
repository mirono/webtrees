# Cutover: retire native PHP fallback for `GedcomExportService::wrapLongLines()`

Supersedes [phase3-bridge-decision-pass-2.md](phase3-bridge-decision-pass-2.md)
for this module. See [phase4-cutover-gedcom-service.md](phase4-cutover-gedcom-service.md)
and [phase4-cutover-soundex.md](phase4-cutover-soundex.md) for the same
pattern applied to the two earlier cutovers.

## Context

This is the 5th of 6 PHP↔Node bridges to be cut over (after
`FactSortService`/`SurnameTradition`, `GedcomService`, and `Soundex`).
`GedcomExportService::wrapLongLines()` splits every over-length GEDCOM
line into `CONC`/`CONT` continuations during export — it runs on every
line of every exported record, the highest real invocation volume of any
bridge cut over so far (higher than `Soundex`, comparable to
`GedcomService`'s `canonicalTag()`).

Unlike the `Soundex`/`GedcomService` cutovers, there was no large
lookup-table or private-helper code to delete: the entire native
implementation was inline in `wrapLongLines()` itself (no other method
called it). Deleting it was a straight replacement of the fallback body,
not an archaeology exercise.

## What changed

`app/Services/GedcomExportService.php`:

- `wrapLongLines()`'s native line-splitting loop is gone. On any
  unusable service response it now throws
  `HttpServiceUnavailableException` (`I18N::translate('The GEDCOM export
  service is unavailable. Please try again shortly.')`), same shape as
  every other cut-over bridge.
- Removed the now-unused `use function explode;` and `use function
  strpos;` imports (both were only reachable from the deleted loop —
  confirmed via grep that nothing else in the file calls either).
  `mb_strlen`/`mb_substr` were never explicitly imported (global
  functions don't require a `use function` line) so there was nothing to
  remove for those.
- `SERVICE_URL_ENV_VAR`'s doc comment rewritten to the cutover framing.
  `callService()` itself needed no cleanup — its docblock/comment never
  referenced the native fallback in the first place (already clean going
  into this cutover).

`tests/Feature/GedcomExportServiceBridgeTest.php` rewritten the same way
as `GedcomServiceBridgeTest`/`SoundexServiceBridgeTest`:
`testRoutesThroughLiveService()` now asserts a hardcoded known-good
value (`wrapLongLines('1 NOTE ' . str_repeat('A', 15), 20)` →
`"1 NOTE AAAAAAAAAAAAA\n2 CONC AA"`), matching the "one char over a small
max_line_length, single split" case already committed in
`golden/wrap_long_lines.json`. `testFallsBackWhenServiceUnreachable()` →
renamed `testThrowsWhenServiceUnreachable()`, asserts
`HttpServiceUnavailableException` instead of a native-vs-bridge
comparison.

`tests/Unit/Services/GedcomExportServiceTest.php` is (and remains) a
trivial `assertTrue(class_exists(...))` stub — no change needed.

## The circuit-breaker trade-off (unchanged from prior cutovers)

Same as `GedcomService`/`Soundex`: `$service_unavailable` still trips on
the *first* failure and stays tripped for the rest of the process, so a
transient blip during a large export makes every remaining line of that
export (and every other bridged call in the same request) fail fast
rather than retrying per line. This is the accepted, documented trade-off
for the whole strangler-fig migration, not a new risk introduced here —
see the earlier cutover docs for the full rationale.

## Blast-radius check: no repeat of the `GedcomService`/`TreeService::create()` surprise

Checked proactively before writing any code (grep `GedcomExportService`
across `app/` and `tests/`, then read every hit in context):

- Real callers: `app/Http/RequestHandlers/ExportGedcomClient.php`,
  `ExportGedcomServer.php`, `UpgradeWizardStep.php`,
  `app/Module/ClippingsCartModule.php`, `app/Cli/Commands/TreeExport.php`
  (all reach `export()` → `wrapLongLines()` per record), plus
  `AbstractGedcomRecordFactory.php` (a cache-caution *comment* only, no
  real call) and `GedcomImportService.php` (a circuit-breaker-pattern
  *comment* only, no real call).
- `tests/Unit/Http/RequestHandlers/UpgradeWizardStepTest.php` already
  sets `protected static bool $uses_database = true;` — already covered
  by the shared-service guard moved into `TestCase::setUp()` during the
  `GedcomService` cutover.
- `tests/Unit/Module/ClippingsCartModuleTest.php`,
  `tests/Unit/Http/RequestHandlers/ExportGedcomClientTest.php`, and
  `ExportGedcomServerTest.php` are all trivial `assertTrue(class_exists(...))`
  stubs — confirmed by reading each in full — so they don't exercise
  `wrapLongLines()` at all and need no changes.
- `tests/Unit/TreeTest.php::testExportGedcom()` already had an explicit
  `SharedMigrationService::ensureRunning()` call ahead of constructing
  `GedcomExportService` (added during the phase-3 bridge work, with a
  comment noting it can't just rely on `importTree()`'s side effect) —
  still correct, no change needed.

No new `TreeService::create()`-style surprise this time: nothing in this
module's call graph is reachable from tree *creation* itself (unlike
`GedcomService::canonicalTag()` via `reformatRecord()`, or `Soundex` via
`updateNames()`) — `wrapLongLines()` only runs on the *export* path.

## What this means operationally

Any environment that sets `WEBTREES_GEDCOM_EXPORT_SERVICE_URL` now has a
hard dependency on `server/migration-service.mjs` for every GEDCOM
export (download, clippings cart, upgrade-wizard backup, CLI export) —
if the Node service is down, exports fail outright with a clear 503
instead of silently degrading. Any environment that leaves the env var
unset is unaffected either way, since `callService()` already returns
`null` immediately when the URL is empty — the only behavior change is
what happens *after* that `null`, and only when the var is actually set.

## Why the last remaining bridge isn't next by default

One bridge remains: `GedcomImportService::reformatRecord()`. It's a
private method with the highest invocation volume in the whole
migration (every line of every imported record) and, per
[phase3-bridge-decision-pass-2.md](phase3-bridge-decision-pass-2.md) /
[task-21-reformat-record.md](task-21-reformat-record.md), was the site
of two real bugs found and faithfully reproduced during porting — worth
extra care (and a fresh blast-radius check, since `GedcomImportService`
sits upstream of `TreeService::create()` itself) before cutting it over,
rather than assuming the same shape as this one.
