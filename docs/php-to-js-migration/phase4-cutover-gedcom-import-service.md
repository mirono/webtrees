# Cutover: retire native PHP fallback for `GedcomImportService::reformatRecord()`

Supersedes [phase3-bridge-decision-pass-2.md](phase3-bridge-decision-pass-2.md)
for this module. This is the **last** of the 6 PHP↔Node bridges to be cut
over — see [phase4-cutover-gedcom-service.md](phase4-cutover-gedcom-service.md),
[phase4-cutover-soundex.md](phase4-cutover-soundex.md), and
[phase4-cutover-gedcom-export-service.md](phase4-cutover-gedcom-export-service.md)
for the same pattern applied to the three earlier cutovers.

## Context

`reformatRecord()` normalizes every line of every imported GEDCOM
record (tag canonicalization, DATE/PLAC/NAME cleanup, CONC merging,
FILE path handling, "Y" suppression) — the highest real invocation
volume of any module in the whole migration. It's private, called only
from `importRecord()`, which is called once per record during any
GEDCOM import.

Unlike the previous three cutovers, this module's real call graph
**does** run through `TreeService::create()` directly:
`TreeService::create()` calls `$this->gedcom_import_service->importRecord()`
twice (to seed the default header and individual into every new tree),
which calls `reformatRecord()`. This was flagged as a known risk after
the `GedcomService` cutover and confirmed here rather than assumed: the
`TestCase::setUp()` guard (added during that cutover, moved from
`importTree()` up to the `$uses_database` branch specifically so it
covers *any* module reachable through tree creation) already covers
this without further changes — verified by grep, not just recalled from
memory.

## What changed

`app/Services/GedcomImportService.php`:

- `reformatRecord()`'s ~150-line native normalization loop is gone. On
  any unusable service response it now throws
  `HttpServiceUnavailableException` (`I18N::translate('The GEDCOM
  import service is unavailable. Please try again shortly.')`).
- The native fallback's `Registry::container()->get(GedcomService::class)`
  dependency is gone with it — `reformatRecord()` no longer calls
  `GedcomService::canonicalTag()` at all (that only happened inside the
  now-deleted fallback). `GedcomService` is still used elsewhere in this
  file (`importLegacyPlacDefn()`, unrelated to this cutover, already
  cut over itself per [phase4-cutover-gedcom-service.md](phase4-cutover-gedcom-service.md)).
- Removed the now-unused `use function explode;`, `use function round;`,
  `use function strlen;`, `use function substr;`, `use function trim;`
  imports — confirmed via grep that every call to each was inside the
  deleted fallback body specifically (not `mb_strlen`/`mb_substr`, which
  remain heavily used elsewhere and were never explicitly imported
  anyway).
- `SERVICE_URL_ENV_VAR`'s doc comment rewritten to the cutover framing.

`tests/Feature/GedcomImportServiceBridgeTest.php` rewritten the same way
as the three previous bridge tests: `testRoutesThroughLiveService()` now
asserts a hardcoded known-good value — the "lowercase uppercased" DATE
case from `golden/reformat_record.json` (`"0 @I1@ INDI\n1 BIRT\n2 DATE 1
jan 2000"` → `"...\n2 DATE 1 JAN 2000"`), deliberately chosen because it
never touches the `FILE`/`CONC` branches, so the assertion doesn't
depend on the test tree's `GEDCOM_MEDIA_PATH`/`WORD_WRAPPED_NOTES`
preferences. `testFallsBackWhenServiceUnreachable()` →
`testThrowsWhenServiceUnreachable()`, asserts
`HttpServiceUnavailableException`. The doc comment's paragraph about
`GedcomService::canonicalTag()`'s own fallback interacting with this
test is deleted — moot now, since the native fallback (the only place
that ever called `canonicalTag()` from this file) is gone.

**`tests/Unit/Services/ReformatRecordCharacterizationTest.php` deleted**
— this is the one finding worth flagging explicitly, since it's not
just "a trivial stub, leave it": this file was a **fixture generator
disguised as a test**. Its single test method called the (formerly
native) `reformatRecord()` via `ReflectionMethod` for 48 cases and
unconditionally overwrote `golden/reformat_record.json` with whatever
it got back — it never compared against a previous or expected value,
only asserted that the file write succeeded. Before this cutover, that
meant it silently re-captured native PHP's current behavior on every
run (harmless, if occasionally redundant). After this cutover, keeping
it would have been actively harmful: with no native code left, it would
overwrite the golden fixture with the **live bridge's own output**,
making the "golden" file circular (bridge output validating itself) and
silently masking a real bridge regression instead of catching one —
and it had no `SharedMigrationService::ensureRunning()` skip-guard, so
it would hard-fail (throwing `HttpServiceUnavailableException`) instead
of skipping whenever the service was down. Its one-time job — capturing
native behavior for task 21 — is done and permanently recorded in the
already-committed `golden/reformat_record.json`; there is no more
native behavior left to characterize. Confirmed via grep that nothing
else references this class before deleting it.

## The circuit-breaker trade-off (unchanged from prior cutovers)

Same as every other cut-over bridge: `$service_unavailable` trips on
the first failure and stays tripped for the rest of the process. Given
this module's invocation volume (every line of every imported record),
this is the cutover where that trade-off matters most in practice — a
transient blip partway through a large GEDCOM import now fails the
entire rest of the import fast, rather than degrading to (slow but
working) native PHP for the remaining lines. This is the same accepted,
already-documented trade-off as the whole migration, not a new risk
introduced here.

## A second, unrelated bug found and fixed: the `proc_open` fd leak recurred

Running the full suite piped (`vendor/bin/phpunit ... | tail -60`, a
targeted 4-file run, not the full-suite verification which correctly
used a file redirect per existing practice) reproduced the exact
`tests/Concerns/SharedMigrationService.php` hang documented during the
`GedcomService` cutover — a `proc_open()`-spawned long-lived Node child
inheriting a duplicate of the caller's own stdout pipe, holding it open
forever once the caller (PHPUnit) exits. **This is not the same leak as
before, and the earlier fix (redirecting the child's fds 0/1/2 to
`/dev/null`) was real but incomplete**: traced via `/proc/<node-pid>/fd`
to a *different* file descriptor (fd 4) still holding a write end of
the outer pipe, confirming PHPUnit's own process holds at least one
*other* open descriptor to its own stdout beyond fd 1 itself (most
likely its own printer re-opening `php://stdout` independently) that
`proc_open()`'s descriptorspec — which only maps fds 0/1/2 — never
touches, and PHP does not close automatically.

Fixed by closing every inherited descriptor above 2 in the spawned
shell, before it execs into `node`, rather than trying to name the
specific leaking fd:

```php
$command = 'for fd in $(ls /proc/self/fd 2>/dev/null); do '
    . 'case "$fd" in 0|1|2) ;; *) eval "exec ${fd}>&-" 2>/dev/null ;; esac; '
    . 'done; exec env PORT=' . self::PORT . ' node ' . $script;
```

Verified by (1) reproducing the hang against the pre-fix code, (2)
confirming the fix resolves it — the same piped command that hung for
over two hours before now completes in ~7 seconds — and (3) inspecting
the freshly spawned Node process's `/proc/<pid>/fd` afterward to confirm
only 0/1/2 (all `/dev/null`) and Node's own internal machinery
(libuv eventfd/eventpoll/io_uring, its own thread-pool pipes, its
listening socket) remain — no descriptor traceable to the calling PHP
process. **Lesson for future test-infra work spawning a long-lived
child from inside PHPUnit: don't enumerate/name the specific fd you
found leaking — close everything above 2 unconditionally, since the
leaking descriptor's number isn't stable and depends on unrelated
runtime details (which PHPUnit printer is active, output buffering,
etc.).**

## Blast-radius check: real callers and their test coverage

Checked proactively before writing any code (grep `GedcomImportService`
and `importRecord(` across `app/` and `tests/`, then read every hit in
context):

- Real callers of `importRecord()`: `app/Cli/Commands/TreeImport.php`
  (no dedicated test file — nothing to update), `app/Http/RequestHandlers/GedcomLoad.php`
  (its test, `GedcomLoadTest.php`, is a trivial `assertTrue(class_exists(...))`
  stub — confirmed by reading it in full), `app/Services/TreeService.php::create()`
  (see above — already covered by the `$uses_database` guard), and
  `GedcomImportService::acceptAllChanges()`'s own internal call at line
  ~956 (self-contained, no separate test file needed beyond what
  already exercises `importRecord()`).
- `tests/Unit/Services/TreeServiceTest.php` is a trivial stub — doesn't
  construct a real tree, so it never reaches `importRecord()`.
- Every test file that constructs `GedcomImportService` or `TreeService`
  directly (grepped across all of `tests/`) already has `protected
  static bool $uses_database = true;` set — confirmed one by one, not
  assumed from the pattern holding for the last two cutovers.

## What this means operationally

Any environment that sets `WEBTREES_GEDCOM_IMPORT_SERVICE_URL` now has
a hard dependency on `server/migration-service.mjs` for **all** tree
creation and GEDCOM import — including the one line every new tree's
seed data goes through. If the Node service is down, creating a new
tree or importing a GEDCOM file fails outright with a clear 503 instead
of silently degrading to (slower but working) native PHP. Any
environment that leaves the env var unset is unaffected, as with every
other bridge.

## Migration status: all 6 bridges now cut over

This closes out the phase-4 cutover work: `FactSortService`/
`SurnameTradition`, `GedcomService`, `Soundex`, `GedcomExportService`,
and now `GedcomImportService` all have their native PHP fallback
deleted entirely. `server/migration-service.mjs` is a mandatory runtime
dependency wherever any of the 6 `WEBTREES_*_SERVICE_URL` env vars are
set; leaving them all unset keeps every module's behavior unaffected
(pre-migration native PHP, since `callService()` returns `null`
immediately when its URL is empty, and none of these modules retain
fallback code to reach after that `null` any more — they simply throw).
