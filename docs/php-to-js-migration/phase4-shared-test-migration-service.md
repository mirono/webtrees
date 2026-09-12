# Phase 4 — Shared test infrastructure for the Node migration service

## Context

Two of the six PHP↔Node bridges (`FactSortService`, `SurnameTradition`)
have had their native PHP fallback deleted (see
[phase4-cutover-fact-sort-surname-tradition.md](phase4-cutover-fact-sort-surname-tradition.md)).
The other four (`Soundex`, `GedcomService`,
`GedcomExportService::wrapLongLines()`,
`GedcomImportService::reformatRecord()`) couldn't get the same treatment
yet: three of them are called with no bridge check from inside
`GedcomImportService::importRecord()`, which `tests/TestCase.php`'s
`importTree()` helper calls once per GEDCOM record — and `importTree()`
is used by 28 test files. Deleting those three modules' native fallback
would make every one of those 28 files require a live, reachable Node
service, with no batching (dozens of HTTP round trips per `importTree()`
call). This doc records the test-infrastructure work that removes that
blocker. **It does not itself cut over any of the four remaining
modules** — their native fallback code is untouched.

## The design: one shared, lazily-started service for the whole run

`tests/Concerns/SharedMigrationService.php` is a final, static-only class
(deliberately not a trait — a trait's static members are per-*using-class*
copies, the wrong vehicle for state that must be shared *across* classes)
that starts exactly one `server/migration-service.mjs` process the first
time `ensureRunning()` is called, and reuses it for the rest of the
PHPUnit process. On success it sets **all six** `WEBTREES_*_SERVICE_URL`
env vars (not just the three entangled with import) so that a future
cutover of any of the remaining four needs no new test wiring here at
all — the shared service already covers them. It's torn down via
`register_shutdown_function()` at the very end of the run.

Laziness matters: a plain unit test that never calls `importTree()` or
touches a bridge pays no Node startup cost and doesn't need Node
installed. `tests/TestCase.php::importTree()` calls
`SharedMigrationService::ensureRunning()` as its first line and calls
`self::markTestSkipped(...)` if it returns `false` — the same skip
message already used by every bridge test, just one level shallower.
Calling `markTestSkipped()` from inside a helper invoked mid-test is
legitimate PHPUnit usage: it throws `SkippedTestError`, which aborts the
calling test exactly like any other exception would.

`tests/Unit/TreeTest.php::testExportGedcom()` (the one entanglement for
`wrapLongLines()`) already calls `importTree()` before exporting, so the
shared service is already running by the time export runs — but relying
on that ordering implicitly would be fragile, so it also calls
`SharedMigrationService::ensureRunning()` explicitly (a cheap no-op after
the first call) immediately before the export call.

## Retiring the per-file dedicated-port pattern

Before this change, each `tests/Feature/*ServiceBridgeTest.php` file (and
`FactSortServiceTest.php`/`FactSortServiceCharacterizationTest.php`)
self-managed its own Node child process on its own hand-allocated port
(a table running 8193-8200, plus the dev default 8090). That doesn't
scale to 28+ files and required a new port allocation forever. All six
bridge test files, plus the two class-level bootstraps, now use the one
shared service on port 8090 instead — no file owns a dedicated port or
process any more. `tests/Concerns/UsesMigrationServiceTrait.php` no
longer spawns anything; it only manages temporarily overriding a
bridge's env var (e.g. to an unreachable address) and restoring it
afterward.

## Two env-var bugs fixed by the same mechanism

**Bug 1 (why this needed fixing at all):** the trait's old
`stopMigrationService()` called `putenv(self::migrationServiceEnvVar())`
with no `=value` — which *unsets* the var, not restores a prior value.
That was harmless when each file owned its own dedicated process (nothing
else was relying on that env var), but once a shared default is normally
running with its env vars always set, blanking one in a test's teardown
would break every later test in the same PHPUnit process that needed it.

**Bug 2 (found while fixing bug 1, affects all four not-yet-cut-over
bridge tests):** `GedcomServiceBridgeTest`, `SoundexServiceBridgeTest`,
`GedcomExportServiceBridgeTest`, and `GedcomImportServiceBridgeTest` each
measure a "native" baseline by calling the bridged method *before*
setting their own `putenv(...)`, implicitly assuming the env var starts
unset. Once the shared service may already be running from an earlier
test in the same process, that assumption is false — the "native"
measurement would silently be bridged instead, without the test noticing.

Both are fixed by the same save/restore pair in
`UsesMigrationServiceTrait`:

- `overrideMigrationServiceUrl(string $url)` saves the env var's current
  value (via `getenv()`, `false` if unset) before pointing it at `$url`.
- `restoreMigrationServiceUrl()` puts back exactly what was saved —
  unset if it was genuinely unset, the shared service's URL if that's
  what was there — and is a no-op if this test never called `override`
  in the first place, so it's safe to call unconditionally from
  `tearDown()`.

The four not-yet-cut-over bridge tests now call
`overrideMigrationServiceUrl('')` (an explicit empty value, which the
native `callService()` implementations in `app/Soundex.php`,
`GedcomService.php`, etc. treat identically to "unset") to force a
genuine native baseline, then either `restoreMigrationServiceUrl()` (to
prove the bridge matches) or a direct `putenv(...)` to an unreachable
port (to prove the fallback still works) before asserting.

## CI

`.github/workflows/phpunit.yaml` now installs Node (`actions/setup-node`,
no `npm ci` — `server/migration-service.mjs` has zero npm dependencies,
only `node:http` and local `lib/**/*.js` files) before running
`vendor/bin/phpunit`, so the shared service can actually start there.

There is still no CI workflow running `npx vitest run` — a pre-existing
gap, unrelated to this phase, not addressed here.

## What this unblocks, and what it doesn't

Cutting over `Soundex`, `GedcomService`, `wrapLongLines`, or
`reformatRecord` is still a separate, future, per-module decision — this
work only removes the shared-infrastructure blocker that made all four
look like one large entangled problem. Each module's native fallback can
now be retired independently, following the same pattern as
[phase4-cutover-fact-sort-surname-tradition.md](phase4-cutover-fact-sort-surname-tradition.md),
whenever that's decided.
