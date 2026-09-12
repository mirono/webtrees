# Phase 4 — Cutover: `FactSortService` + `SurnameTradition`

## Context

By task 23, six modules had a live PHP↔Node bridge (Soundex,
SurnameTradition, GedcomService, FactSortService,
`GedcomExportService::wrapLongLines()`,
`GedcomImportService::reformatRecord()`) — see
[phase4-cutover-tracking.md](phase4-cutover-tracking.md). Every one of
them still kept its native PHP implementation as a fallback: the Node
service was only ever tried opportunistically, and any failure (unset env
var, unreachable service, bad response shape) silently degraded to native
PHP. None had ever actually been *cut over* — the real strangler-fig
end-game, where the Node/JS implementation becomes the sole source of
truth and the redundant PHP is deleted.

This doc records the first cutover pass: retiring the native fallback for
two of the six modules. The other four are deliberately deferred — see
"Why only these two" below.

## Why only these two

Before touching any code, the real blast radius of a full 6-module
cutover was investigated (two Explore agents: one for PHPUnit test
coverage, one for Node-service deployment/error-handling conventions).
The finding: `Soundex`, `GedcomService`, and
`GedcomImportService::reformatRecord()` are all called, with no bridge
check, from inside `GedcomImportService::importRecord()` — and that
method is exactly what `tests/TestCase.php::importTree()` calls, in a
loop, for every record of every `.ged` fixture used by roughly 28 test
files across the suite (report-module tests, `ParserGenerateTest`,
`SearchServiceTest`, `ModuleServiceTest`, `UserServiceTest`, and more).
Deleting native code in any of those three modules would break all of
them, plus CI outright — no GitHub Actions workflow starts the Node
service or sets any `WEBTREES_*_SERVICE_URL` today.
`GedcomExportService::wrapLongLines()` is not entangled with
`importTree()`, but does affect `tests/Unit/TreeTest.php`'s byte-for-byte
export round-trip test.

`FactSortService::sort()` and `BridgedSurnameTradition`'s three
computational methods (`newChildNames()`/`newParentNames()`/
`newSpouseNames()`) are the only two of the six with **no** such
entanglement — their only callers are page-rendering request handlers and
their own dedicated test suites. That made them the safe first candidates:
cutting them over needed only per-file test fixes, not a suite-wide answer
to "how does the whole test suite get a live Node service," which is a
bigger, cross-cutting infra question left for when the other four modules
get their own cutover phase.

## What changed

- **`app/Services/FactSortService.php`** — `sort()`'s native fallback
  block (the 5-phase dated/undated sort-and-merge algorithm) and its 4
  private helper methods (`insertFamilyGroup()`, `insertInFamilyContext()`,
  `insertByTypeOrder()`, `isDatedCloseRelativeEvent()`) were deleted
  outright. Where the fallback used to be, `sort()` now throws
  `HttpServiceUnavailableException` (the same exception class already
  used by `LeafletJsService::config()` and `SearchService::rowLimiter()`
  for "this feature has a hard runtime dependency that isn't met").
- **`app/SurnameTradition/BridgedSurnameTradition.php`** — the 3
  `return $this->native->new*Names(...)` fallback lines became the same
  throw. `native()`/`name()`/`description()`/`defaultName()` are
  untouched — they never went through the bridge in the first place. The
  9 concrete native tradition classes are **not** deleted; they're still
  needed by `name()`/`description()`/`defaultName()`, and by the 10
  pre-existing `tests/Unit/SurnameTradition/*Test.php` +
  `SurnameTraditionFactoryTest.php` files, which construct/inspect the
  native classes directly and never call the bridged computational
  methods.
- **`tests/Concerns/UsesMigrationServiceTrait.php`** (new) — the
  `startService()`/teardown/circuit-breaker-reset boilerplate duplicated
  across every `tests/Feature/*ServiceBridgeTest.php` file, extracted into
  one reusable trait. Only adopted by the files touched in this pass (see
  below); the other four bridge test files keep their inline copies for
  now — they can adopt the trait during their own cutover phase later.
- **Three PHPUnit test files retrofitted to run against a live Node
  service instead of native PHP**, all with their actual test-method
  bodies left unchanged (only class-level bootstrap added):
  `tests/Unit/Services/FactSortServiceTest.php` (23 pre-existing test
  methods, 36 executions via one 14-case data provider),
  `tests/Unit/Services/FactSortServiceCharacterizationTest.php` (the task
  18 golden-fixture generator), and the rewritten
  `tests/Feature/FactSortServiceBridgeTest.php` /
  `tests/Feature/SurnameTraditionServiceBridgeTest.php`, whose redundant
  "routes through live service, matches native" tests were deleted (now
  proved elsewhere) and whose "falls back when unreachable" tests became
  "throws when unreachable."
- **Fixed a real pre-existing bug found during this pass**:
  `GedcomServiceBridgeTest` and `SurnameTraditionServiceBridgeTest` both
  hardcoded port `8198` — harmless only because PHPUnit runs sequentially.
  `SurnameTraditionServiceBridgeTest` moved to `8193`.

## The circuit-breaker trade-off (deliberate, not an oversight)

Both classes keep their `private static bool $service_unavailable`
circuit breaker — once one call to the Node service fails, every
subsequent call in that PHP process short-circuits immediately rather
than paying the connection-timeout cost again. Before this cutover, that
just meant "fall back to native PHP a little faster." **After this
cutover, with no fallback left, it means one transient failure makes
every subsequent `sort()` / `newChildNames()` / `newParentNames()` /
`newSpouseNames()` call in that process throw until the process
restarts.** This is the correct behavior for a feature that has become a
genuine mandatory dependency — fail fast and loudly on a known-bad
service rather than retry a losing race on every call — but it is a real
behavior change from "always degrades gracefully," and is recorded here
so it isn't mistaken for a bug later.

## What this means operationally

`WEBTREES_FACT_SORT_SERVICE_URL` and
`WEBTREES_SURNAME_TRADITION_SERVICE_URL` are no longer optional
performance knobs — a deployment that has either of these features
enabled (fact-sorted individual/family pages; the "add family member"
forms) now needs `server/migration-service.mjs` running and reachable.
There is still no real (non-sandbox) production webtrees deployment for
this repo, so this is a statement about what a future deployment would
need, not a decision that's been operationally exercised outside the
local dev sandbox.

## Why the other four modules aren't next "by default"

Don't assume the next cutover phase is simply "pick the next module from
the list." The remaining four (`Soundex`, `GedcomService`,
`GedcomExportService::wrapLongLines()`,
`GedcomImportService::reformatRecord()`) need a real answer to "how does
the test suite get a live Node service for ~28 files that call
`importTree()`" before any of their native code can be deleted safely.
That's a cross-cutting test-infrastructure decision (e.g., a
suite-wide `setUpBeforeClass` in `TestCase` itself, or a CI job that
starts the service once for the whole run), not a per-module task — treat
it as its own planning pass when that phase starts.
