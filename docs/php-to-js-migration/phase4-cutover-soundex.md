# Phase 4 — Cutover: `Soundex`

## Context

The 4th of 6 PHP↔Node bridges to be cut over, after
`FactSortService`/`SurnameTradition` (see
[phase4-cutover-fact-sort-surname-tradition.md](phase4-cutover-fact-sort-surname-tradition.md))
and `GedcomService` (see
[phase4-cutover-gedcom-service.md](phase4-cutover-gedcom-service.md)).
The user picked `Soundex` (`russell()`, `compare()`, `daitchMokotoff()`)
as the next module.

`app/Soundex.php` was bigger than `GedcomService.php` (893 lines vs 314)
but the same shape: a `$service_unavailable` circuit breaker,
`callService()`, the 3 bridged methods, plus a large amount of private
native-fallback-only support code — `TRANSFORM_NAMES` and `DM_SOUNDS`
(two lookup tables, ~510 lines combined), `daitchMokotoffWord()` (the
native Daitch-Mokotoff algorithm), and `MAXCHAR`. Confirmed via
`grep -rn "TRANSFORM_NAMES\|DM_SOUNDS\|daitchMokotoffWord\|MAXCHAR" app/ tests/`
that nothing outside `Soundex.php` touches this native-only code before
deleting it. `getAlgorithms()` is a 4th public method but was never
bridged — it just returns I18N labels — and is untouched.

## What changed

- **`app/Soundex.php`** — `TRANSFORM_NAMES`, `DM_SOUNDS`,
  `daitchMokotoffWord()`, and `MAXCHAR` were deleted outright.
  `russell()`'s native fallback was small by contrast (it only called
  PHP's *built-in* `soundex()` function), so there was no separate helper
  to delete for it. Each of `compare()`/`russell()`/`daitchMokotoff()`'s
  native-fallback body was replaced with
  `throw new HttpServiceUnavailableException(I18N::translate(...))`.
  `SERVICE_URL_ENV_VAR`, `$service_unavailable`, `callService()`, and
  `getAlgorithms()` are unchanged. Unlike the previous two cutovers'
  classes, `Soundex` lives directly in the `Fisharebest\Webtrees`
  namespace (same as `I18N`), so no new `use` import was needed for
  `I18N` — only for `HttpServiceUnavailableException`.
- **`tests/Feature/SoundexServiceBridgeTest.php`** — rewritten. Same
  coverage-gap situation as `GedcomService`'s cutover:
  `tests/Unit/SoundexTest.php` is a trivial `assertTrue(class_exists(...))`
  stub, not an exhaustive characterization test, so deleting the old
  "capture native, then compare" test without replacement would have left
  no proof the live bridge computes *correct* values. Fixed the same way:
  hardcoded known-good values, computed from the real native
  implementation before it was deleted (`php -r` with `I18N::init()`
  called first, since `daitchMokotoffWord()` needs it) and cross-checked
  against the already-committed golden fixtures
  (`golden/soundex_russell.json`, `golden/soundex_daitch_mokotoff.json`)
  to confirm the live JS bridge returns the same values:
  `russell('Ashcraft')` → `'A226'`, `daitchMokotoff('Moskowitz')` →
  `'645740'`, `compare('S530', 'S530:X000')` → `true`. The "falls back"
  test became "throws."

## The circuit-breaker trade-off (same as the previous two cutovers)

`$service_unavailable` is kept: once a call fails, every subsequent
`russell()`/`compare()`/`daitchMokotoff()` call in that PHP process
throws immediately rather than retrying. This matters more for `Soundex`
than for most bridges — it's called per-name in bulk contexts (a GEDCOM
import can call it thousands of times in one request), so the
fail-fast-after-first-failure behavior avoids paying a timeout on every
single call. Deliberate, not an oversight.

## Blast-radius check: no repeat of the `GedcomService` surprise

The `GedcomService` cutover found that `TreeService::create()` — not just
`tests/TestCase.php::importTree()` — is a real funnel into a bridged
module, because it seeds every new tree with a default individual via
`GedcomImportService::importRecord()`. The same is true here:
`GedcomImportService::updateNames()` calls `Soundex::russell()`/
`daitchMokotoff()` for every name on every individual record, including
the default individual `TreeService::create()` seeds. This is already
covered — no new `TestCase.php` change was needed — because the previous
cutover moved the `SharedMigrationService::ensureRunning()` guard from
`importTree()` up to `TestCase::setUp()`'s `$uses_database` branch
specifically to be the general-purpose choke point for exactly this kind
of entanglement.

Checked the module's other 3 real call sites for a similar surprise
before assuming coverage was fine: `tests/Unit/PlaceTest.php` and
`tests/Unit/Module/BranchesListModuleTest.php` are both trivial
`assertTrue(class_exists(...))` stubs (`$uses_database` not even set) —
they don't exercise the Soundex-calling code at all.
`tests/Unit/Services/SearchServiceTest.php` already sets
`$uses_database = true`, so it was already covered. Full PHP suite run
confirmed this: 0 new errors, only the pre-existing WSL-mount-specific
failures (PDF snapshots, `chmod`-based permission tests — see
[[environment-wsl-quirks]] equivalent note in
[phase4-cutover-gedcom-service.md](phase4-cutover-gedcom-service.md)).

## What this means operationally

`WEBTREES_SOUNDEX_SERVICE_URL` is no longer an optional performance knob
for: GEDCOM import's name-indexing (`GedcomImportService::updateNames()`),
place-name indexing (`Place.php`), surname-based branch grouping
(`BranchesListModule`), and soundex-based search (`SearchService`). As
with the previous cutovers, there is still no real (non-sandbox)
production deployment of this repo, so this is a statement about what a
future deployment would need.

## Why the other two modules aren't next "by default"

`GedcomExportService::wrapLongLines()` and `GedcomImportService::
reformatRecord()` are unaffected by this pass and remain on native
fallback. Cutting over either is still a separate, future per-module
decision — check each module's own real call graph rather than assuming
its blast radius matches a previous cutover's.
