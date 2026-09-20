# webtrees PHP → JS Migration: Status

**Last updated: 2026-09-20 (`/my-account-delete` ported to Node, phase 5 step 5, fixing a real PHP data-corruption bug). This is the entry point for "where are we" —
read this first, then follow links for detail.** Branch: `js-migration-1`
(a long-lived dev branch off `main`; no branch is literally named
`js-migration`).

## One-paragraph summary

webtrees (a PHP 8.3+ genealogy app) is partway through a disciplined
"strangler-fig" migration from PHP to JavaScript/Node. **The end goal,
stated explicitly by the project owner on 2026-09-17, is full PHP
elimination** — not just porting/bridging self-contained algorithms.
Phases 0-4 (23 ported modules, 6 cut-over bridges, concluded 2026-09-16)
remain necessary groundwork but are not the finish line; full elimination
is a much larger, multi-phase undertaking (webtrees has 1,431 PHP files
under `app/` alone) that's only just beginning. **Phase 4** (the
bridge-cutover phase): all 6 built bridges have their native PHP fallback
deleted entirely — each is a hard runtime dependency on
`server/migration-service.mjs` whenever its own env var is set, and
inert (100% original PHP behavior) when that env var is unset. **Phase 5**
(full-PHP-elimination groundwork) has begun: step 1 is a Node.js CLI
that provisions a PostgreSQL-backed install end-to-end (schema, seed
data, admin user) and writes a new YAML config file, replacing the
browser setup wizard's *provisioning* job for that one path — see
[phase5-postgres-setup-cli.md](phase5-postgres-setup-cli.md). Step 2
ports the first real HTTP route (`/my-account`) to a standalone Node
server sitting behind a new reverse proxy, sharing PHP's own login
session with no PHP-specific parsing needed — see
[phase5-first-node-route.md](phase5-first-node-route.md). Step 3 ports
`/login` — the first route where Node must *write* a session the real
PHP app recognizes, not just read one PHP already wrote, requiring a
small codec for PHP's session serialization format (verified
byte-for-byte against real PHP) — see
[phase5-login-route.md](phase5-login-route.md). Step 4 ports `/logout`,
reusing that same session infrastructure to destroy a session instead
of creating one, and fixes a real bug found along the way: the "Sign
out" link's client-side JS has been silently failing on every
Node-served page since step 2, missing a `<meta name="csrf">` tag its
own `httpPost()` helper requires. Two
unrelated, pre-existing bugs were observed during manual testing in
phase 4 and are recorded but not yet fixed (see "Open issues" below).

## How to verify this yourself

```bash
# PHP suite — redirect to a FILE, not a pipe (see "the proc_open fd-leak" below)
vendor/bin/phpunit -d memory_limit=512M > /tmp/pu_full.txt 2>&1; tail -80 /tmp/pu_full.txt
# Expect: 0 failures except 19 known-environment ones (see below), 3571 tests total.

# JS suite
npx vitest run
# Expect: 4013 tests, all green.

# Static analysis on any file you touch
vendor/bin/phpcs --colors --exclude=Generic.Files.LineLength <file>
vendor/bin/phpstan analyse --memory-limit=1G <file>
```

19 PHP failures are **expected and environment-specific, not
regressions** (WSL/DrvFs mount quirks — see
[[environment-wsl-quirks]] / the WSL section below): 17 are
`ReportRegressionTest::testReportPdfOutputMatchesSnapshot` (byte-level
PDF/font rendering differences on a fresh environment) and 2 are
`MaintenanceModeServiceTest` (`chmod()` doesn't actually restrict access
on this mount).

## The pattern used for every ported module

1. **Characterize** real PHP behavior with a one-off `bin/characterize_*.php`
   script → golden JSON fixtures under `golden/`, committed to git.
2. **Port faithfully** to `lib/*.js` (ES modules) — reproduce found bugs
   exactly, never "improve" on them; document them instead.
3. **Parity-test** in `js-tests/parity_*.test.js`, byte-for-byte against
   the golden fixtures.
4. **Document** in `docs/php-to-js-migration/task-NN-*.md` + update the
   status table in `phase4-cutover-tracking.md`.
5. **Bridge** (optional) — only when architecturally justified (see
   criteria below) — a live PHP↔Node HTTP call, env-var-gated, with an
   automatic-fallback circuit breaker.
6. **Cut over** (optional, and only after bridging) — delete the native
   PHP fallback entirely once the bridge is proven and the module's
   test-infra blast radius is understood. This is the end state; a
   cut-over module is fully retired from PHP.

**Bridge decision criteria** (a bridge is only built when ALL hold):
clean bounded input/output shape (not objects escaping into
polymorphic call sites), tolerable call volume for one HTTP round-trip
per call, and bridging actually lets PHP retire real work rather than
just adding latency.

## Phase-by-phase history

| Phase | What | Status |
|---|---|---|
| 0 | Inventory & sequencing | Done — [00-phase0-inventory.md](00-phase0-inventory.md) |
| 1-2 | Characterize + port, 23 tasks | Done (2026-09-11) — `task-01` through `task-23` docs |
| 3 | Bridge design + build (3 bridges initially, then 3 more after "bridge decision pass 2") | Done — [phase3-bridge-decision-pass-2.md](phase3-bridge-decision-pass-2.md) et al. |
| 4a | Shared test infrastructure (one Node process per PHPUnit run) | Done (2026-09-13) — [phase4-shared-test-migration-service.md](phase4-shared-test-migration-service.md) |
| 4b | Cutover: delete native fallback, module by module | **Done (2026-09-16), all 6 of 6** — see table below |
| 5.1 | Node CLI + YAML config, Postgres-only, replaces the browser wizard's *provisioning* job for that one path | **Done (2026-09-17)** — [phase5-postgres-setup-cli.md](phase5-postgres-setup-cli.md) |
| 5.2 | First real HTTP route (`/my-account`) served entirely by Node, behind a new reverse proxy, sharing PHP's login session | **Done (2026-09-19)** — [phase5-first-node-route.md](phase5-first-node-route.md) |
| 5.3 | `/login` served entirely by Node — the first route where Node *writes* a session (not just reads one PHP wrote), via a small PHP-session-format codec | **Done (2026-09-19)** — [phase5-login-route.md](phase5-login-route.md) |
| 5.4 | `/logout` served entirely by Node — destroys the session, reusing step 3's infrastructure; also fixed a live "Sign out" bug | **Done (2026-09-19)** — see phase5-login-route.md's login/logout pairing |
| 5.5 | `/my-account-delete` served entirely by Node — deliberately diverges from PHP's own non-transactional, data-corrupting delete logic | **Done (2026-09-20)** — see phase5-login-route.md |

## Phase 5: full PHP elimination (in progress)

This is a different kind of phase than 0-4 — infrastructure/tooling work
toward removing PHP entirely, not algorithm porting. It's just beginning;
expect many more steps here before anything resembling "PHP is gone" is
true. Step 1, `setup-cli/` (a Node CLI provisioning a fresh
PostgreSQL-backed install: schema, seed data, admin user, then a new
`data/config.yaml`), is **done and fully verified end-to-end**: a real
login through the real running PHP app, using credentials created
entirely by the Node CLI, produced a genuine authenticated admin session
— see the doc above for the full run and the two real bugs it caught
(a non-executable `pg_dump` artifact, and a missing `WT_SCHEMA_VERSION`
row that would have crashed every CLI-provisioned site's first request).
The existing browser wizard, `config.ini.php`, and MySQL/SQLite/SQL
Server support are all completely unaffected by this step.

**Step 2**, [phase5-first-node-route.md](phase5-first-node-route.md), is
also **done and fully verified end-to-end**: the first real HTTP route
(`/my-account`) is now served entirely by a new Node server
(`pages-server/`), sitting behind a new reverse proxy (`proxy/`) that
sends that one path to Node and everything else to PHP unchanged. The
key finding: webtrees already stores sessions in the database with
`user_id` as its own column, so identifying the logged-in user needed
no PHP-specific session parsing at all — just a plain SQL lookup on the
session cookie. Verified twice: directly on the host, then through the
real `docker compose up --build` stack, both times with a real login
through PHP, a real account update through Node, and real resulting
database rows.

**Step 3**, [phase5-login-route.md](phase5-login-route.md), is also
**done and fully verified end-to-end**: `/login` is now served
entirely by Node — the first route where Node must *write* a session
the real PHP app recognizes, not just read one PHP already wrote,
since `Auth::id()` on every PHP page reads `$_SESSION['wt_user']` from
the PHP-serialized `session_data` blob, not the denormalized
`wt_session.user_id` column step 2 got away with reading directly. New
`pages-server/php-serialize.mjs` implements exactly the 4 value kinds
(int/bool/string/null) this app's own `$_SESSION` ever stores —
verified byte-for-byte against real PHP's `session_encode()`, and
confirmed real PHP's `session_decode()` correctly reads a Node-encoded
session back. The end-to-end proof: a Node-issued login session
cookie, handed directly to the real PHP app (not `pages-server`),
correctly redirected to the "already logged in" destination instead of
showing the login form.

**Step 4** ports `/logout`, the natural complement to step 3: reuses
`session-store.mjs`'s new `destroySession()` (mirrors
`SessionDatabaseHandler::destroy()`) rather than building new session
infrastructure. Faithfully replicates a detail easy to miss reading
`Logout.php` too quickly: hitting `/logout` while already anonymous is
a **complete no-op** on the PHP side — no log write, no session
touched at all — `doLogout()` replicates that precisely. Also fixed a
real, currently-live bug found while tracing the "Sign out" link's
actual behavior: `resources/js/webtrees/init.js`'s click handler calls
`httpPost()`, which unconditionally reads `<meta name="csrf">` from the
page `<head>` and throws *synchronously* (before ever sending a
request) if that tag is missing. Neither `account-view.mjs` nor
`login-view.mjs` rendered it, so clicking "Sign out" on the live
`/my-account` page had been silently doing nothing since step 2
landed. Both views now include the tag. Verified end-to-end against
the real Postgres database, including confirming the anonymous-logout
no-op behavior and that both views now render the CSRF meta tag.

**Step 5** ports `/my-account-delete`, completing the `/my-account`
family (GET, update, delete). This one deliberately does **not**
faithfully port PHP's `UserService::delete()` — confirmed live with a
disposable test user that it has a real, currently-shipped bug: it
deletes across ~8 tables with no transaction, and its "reassign
pending changes" step is a no-op for the only real caller (self-
deletion), so any user with a pending edit or even just a default
dashboard widget gets a `500` that leaves their account
**half-deleted**. Surfaced this to the user before writing code
(`AskUserQuestion`) — chose to fix it: `account-delete.mjs` wraps
every step in one Postgres transaction. Also fixed a second bug found
while wiring this up: `csrf.mjs`'s cookie was scoped
`Path=/my-account`, which RFC 6265 cookie-path matching would not send
for `/my-account-delete` (no `/` immediately following `/my-account`
in that path) — broadened to `Path=/`. Verified end-to-end reproducing
the exact scenario that crashes PHP (pending change + dashboard widget
+ message): Node deletes everything atomically with no error. Full JS
suite: 4115 tests, green.

## The 6 bridges: final state

All 6 are now **cut over** — no native PHP code remains in any of them;
each throws `HttpServiceUnavailableException` if
`server/migration-service.mjs` is unreachable while its env var is set,
and is completely inert if the env var is unset.

| Module | Env var | Cutover doc | Cut over on |
|---|---|---|---|
| `FactSortService::sort()` | `WEBTREES_FACT_SORT_SERVICE_URL` | [phase4-cutover-fact-sort-surname-tradition.md](phase4-cutover-fact-sort-surname-tradition.md) | 2026-09-12 |
| `BridgedSurnameTradition` (3 methods) | `WEBTREES_SURNAME_TRADITION_SERVICE_URL` | [phase4-cutover-fact-sort-surname-tradition.md](phase4-cutover-fact-sort-surname-tradition.md) | 2026-09-12 |
| `GedcomService` (`canonicalTag`/`readLatitude`/`readLongitude`) | `WEBTREES_GEDCOM_SERVICE_URL` | [phase4-cutover-gedcom-service.md](phase4-cutover-gedcom-service.md) | 2026-09-15 |
| `Soundex` (`russell`/`compare`/`daitchMokotoff`) | `WEBTREES_SOUNDEX_SERVICE_URL` | [phase4-cutover-soundex.md](phase4-cutover-soundex.md) | 2026-09-15 |
| `GedcomExportService::wrapLongLines()` | `WEBTREES_GEDCOM_EXPORT_SERVICE_URL` | [phase4-cutover-gedcom-export-service.md](phase4-cutover-gedcom-export-service.md) | 2026-09-16 |
| `GedcomImportService::reformatRecord()` | `WEBTREES_GEDCOM_IMPORT_SERVICE_URL` | [phase4-cutover-gedcom-import-service.md](phase4-cutover-gedcom-import-service.md) | 2026-09-16 |

The full per-module table (including the ~15 ported-but-not-bridged
modules, and why each of those wasn't bridged) is
[phase4-cutover-tracking.md](phase4-cutover-tracking.md) — treat that
file, not this summary, as authoritative for any single module's exact
history; it's updated every task/cutover.

**A single Node process** (`server/migration-service.mjs`) serves all 6
bridges, keyed by route, not 6 separate services.

## Known deliberate trade-off: the circuit breaker

Every bridge shares one pattern: a `private static bool
$service_unavailable` flag trips on the *first* failed call and stays
tripped for the rest of the PHP process's lifetime — no per-call retry.
This means a transient blip mid-request (or mid-import, for the two
highest-volume modules) fails every remaining call in that process
fast, rather than degrading gracefully. This is an accepted,
consistently-applied trade-off across the whole migration, not an
oversight in any one module.

## Environments where this actually runs

There is **no real production webtrees deployment** for this repo —
only the local dev sandbox used throughout the migration
(`php -S localhost:8000` + `node server/migration-service.mjs` on port
8090). "Bridge activation" (2026-09-11,
[phase4-cutover-tracking.md](phase4-cutover-tracking.md)'s
"Bridge-activation status" section) means exactly that: both processes
running locally with all 6 env vars set, verified live. Whether any
real deployment should ever set these env vars remains an unmade,
separate decision — see "Open decisions" below.

## What's NOT done / open decisions

- **Production cutover decision**: no real deployment exists to make
  this decision for. If one is ever stood up, each `WEBTREES_*_SERVICE_URL`
  is independently toggleable — enabling all 6 requires
  `server/migration-service.mjs` running and reachable, or every
  bridged operation (tree creation, GEDCOM import/export, Soundex
  search, surname-tradition name generation, fact-list sorting) starts
  throwing 503s.
- **No request batching**: every bridge pays one HTTP round-trip per
  call (per name, per GEDCOM line/record, per fact-list). Accepted for
  all 6; would need real profiling data before it's worth revisiting.
- **CI** (`.github/workflows/phpunit.yaml`) installs Node so the shared
  test-migration-service can start, but nothing in CI actually sets the
  `WEBTREES_*_SERVICE_URL` env vars for a "real" run — CI runs with
  bridges available-but-unset except where a test explicitly points at
  the shared service.
- **Two unrelated bugs found during manual browser testing** (not
  migration regressions — see next section) are still open.

## Fixed bugs (found during manual testing)

- **Setup wizard crashed selecting Postgres/SQLite/SQL Server**
  (2026-09-19): `SetupWizard::step4DatabaseConnection()` and
  `step5Administrator()`'s catch block both called
  `PhpService::pdoMysqlDefaultSocket()` unconditionally for every
  `dbtype`, even though only `step-4-database-mysql.phtml` uses the
  result. On our Docker image (`pdo_sqlite`/`pdo_pgsql` only, no
  `pdo_mysql`), this crashed with `Fatal error: Uncaught
  RuntimeException: Cannot read PHP configuration:
  pdo_mysql.default_socket` — reported live by the user selecting
  Postgres in the browser wizard. Fixed by guarding both call sites on
  `dbtype === DB::MYSQL`, and added `pdo_mysql` to
  `docker/php.Dockerfile` so the browser wizard's MySQL option (which
  legitimately needs the extension) still works. Regression test:
  `tests/Unit/Http/RequestHandlers/SetupWizardTest.php`. Full suite
  re-verified afterward: still exactly the same 19 known-baseline
  failures, zero new regressions. **Requires `docker compose up
  --build`** to pick up the Dockerfile's new `pdo_mysql` extension in a
  running `app` container — the PHP code fix itself is bind-mounted and
  live without a rebuild.

- **`setup-cli/` died silently after the password prompt** (2026-09-19):
  `promptPassword()` opened its own raw-mode `data` listener directly on
  `stdin` while the shared `readline` interface (used by every other
  prompt) was still attached to the same stream — doubled every
  keystroke's echo (`w*e*b*t*r*e*e*s*` instead of `*********`) and left
  the shared interface desynced afterward, so the very next prompt
  ("Database name") had nothing listening to keep the event loop alive
  and Node exited silently — reported live by the user hitting exactly
  this at step 4. Fixed in `setup-cli/prompt.mjs` by fully closing the
  shared interface before reading raw keystrokes and letting the next
  prompt lazily recreate one. Verified with a pty-based harness (piped
  stdin can't exercise the TTY code path) — see
  `[[migration-php-to-js]]` for the harness approach if this class of
  bug needs reproducing again. Full JS suite: 4038 tests, green.

- **`setup-cli/` crashed re-running against a database from an earlier
  install** (2026-09-19): step 6 blindly ran the golden schema SQL,
  crashing with a raw `relation "wt_block" already exists` instead of
  asking. Step 4 now checks for existing `wt_`-prefixed tables right
  after connecting and asks whether to overwrite (drops just those
  tables, CASCADE, then proceeds) or keep them (loops back to connect
  to a different database) — see `setup-cli/pg.mjs`'s
  `findExistingWebtreesTables()`/`dropTables()`. Verified live against
  a real leftover 32-table Postgres database both ways.

- **`setup-cli/` now warns about `localhost` dbhost against Docker**
  (2026-09-19): the third recurrence of the host-vs-container `dbhost`
  mismatch — this time the user actually hit it live in the browser
  (`RuntimeException ... connection to server at "localhost" ...
  Connection refused`) after a clean CLI run. `stepDatabaseConnection()`
  now prints a non-blocking warning whenever the resolved host is
  `localhost`/`127.0.0.1`/`::1`, pointing at the fix: either edit
  `dbhost` in `data/config.yaml` afterward, or run the CLI itself
  inside the Docker network (`docker compose exec migration node
  setup-cli/index.mjs`), where `postgres` is correct throughout — see
  `phase5-postgres-setup-cli.md`'s new "Running this against the
  docker-compose.yml stack" section.

- **"My account" 404'd for any logged-in user with a tree** (2026-09-19):
  PHP's real route is `/my-account{/tree}` — the "My account" link
  always includes the current tree's name — but `pages-server/index.mjs`
  did an exact `/my-account` pathname match, 404ing the actual link
  every tree-browsing user clicks. This step's scope was always
  "no-tree variant only" (skip the 2 tree-scoped display fields), never
  "reject a URL with a tree segment". Fixed with a new
  `pages-server/routes.mjs::isMyAccountPath()` (accepts `/my-account`
  and `/my-account/<anything>`, still rejects `/my-account-delete`),
  unit-tested in `js-tests/pages_server_routes.test.js`. **Needs
  `docker compose restart pages`** to take effect — it's a long-running
  process, bind-mounted source edits don't restart it.

- **"My account" looked unstyled once it finally rendered** (2026-09-19):
  no visible field labels, no spacing between rows, raw browser-default
  input boxes — despite both stylesheets loading with a clean 200 and
  correct bytes (confirmed via DevTools, ruling out a loading bug).
  Root cause: `vendor.min.css` (Bootstrap 5.3's RTL-aware CSS) and
  `webtrees.min.css` both scope large numbers of rules — including
  `.row`'s own gutter margins/padding and
  `.wt-page-options-label`'s background color — behind a `[dir]`
  ancestor attribute selector. PHP's real layout always sets
  `<html dir="...">`; `pages-server/account-view.mjs`'s `<html
  lang="en">` had no `dir` attribute at all, so those rules never
  matched. Fixed by hardcoding `dir="ltr"` (matching the page's
  already-hardcoded English-only copy). New
  `js-tests/pages_server_account_view.test.js`. **Needs `docker
  compose restart pages`** to take effect live.

- **`proxy` crashed the entire site on a late backend parse error**
  (2026-09-19): PHP's `php -S` dev server can send trailing bytes past
  its own declared `Connection: close`, which Node's http client
  surfaces as a LATE `'error'` event on the proxy's outgoing request —
  *after* the real response had already been sent to the client
  successfully. `proxy/index.mjs`'s error handler called
  `clientRes.writeHead()`/`.end()` unconditionally, throwing
  `ERR_HTTP_HEADERS_SENT` — an uncaught exception from an `'error'`
  handler is fatal in Node, so this took down the whole `proxy`
  container, not just the one request. Fixed by checking
  `clientRes.headersSent` first. Reproduced deterministically with a
  fake backend that sends the exact same trailing-garbage-after-close
  bytes; confirmed the crash on the old code and its absence after the
  fix, both via a live repro and a new permanent regression test
  (`js-tests/proxy_handler_crash_regression.test.js`). Request-handling
  logic was split out of `proxy/index.mjs` into a new
  `proxy/handler.mjs` (`createProxyHandler()`) to make this testable
  without spawning a real child process. **Needs `docker compose
  restart proxy`** to take effect.

## Open issues (found during manual testing, not yet fixed)

Both surfaced when the user manually exercised the app in a browser
after the `GedcomService`/`Soundex` cutovers. Neither was root-caused to
completion; both were explicitly deferred by the user ("we can continue
and handle this later").

1. **Setup-wizard redirect crash**: completing the setup wizard can
   throw `HttpBadRequestException: The parameter "route" is missing` at
   `app/Validator.php:348`, surfaced via
   `HandleExceptions.php`'s `viewResponse('components/alert-danger', ...)`
   path trying to read `Validator::attributes($request)->route()->name`
   on a request that never matched a route (no `'route'` attribute set).
   Confirmed via `git log` that none of the files in this call path were
   touched by any migration commit — very likely pre-existing, not a
   regression. Reproduction attempts with a bare `php -S` server on
   plain 404s did NOT reproduce it; the exact trigger (what URL
   `SetupWizard.php`'s `redirect($data['baseurl'])` produces in the
   user's environment) was never pinned down. **Next step if resumed**:
   get the exact URL from the browser's address bar at the moment of the
   crash.
2. **Oversized broken-image placeholder**: an unfound/broken image now
   renders as a "500 image" that fills the entire individual box, rather
   than staying confined to the thumbnail area as before. Checked
   `app/Factories/ImageFactory.php` and `app/Exceptions/ImageException.php`
   for any reference to the 4 modules cut over so far
   (`GedcomService`/`Soundex`/`FactSortService`/`SurnameTradition`) —
   **zero matches**, and `HandleExceptions.php` has a dedicated
   `ImageException` handling branch entirely separate from the generic
   `HttpException` path. Very likely unrelated to the migration (a
   pre-existing layout/CSS issue, possibly specific to running under a
   bare `php -S` dev server without full static-asset handling) but not
   fully investigated (`imageExceptionResponse()`'s implementation was
   never read). **Next step if resumed**: read
   `HandleExceptions::imageExceptionResponse()` and check what CSS class
   normally constrains the thumbnail box.

## Environment quirks (WSL/DrvFs at `/mnt/f/Dev/webtrees`)

Full detail in memory ([[environment-wsl-quirks]]); short version:

- Executable-bit noise makes `git status` show thousands of false
  "modified" files — fixed via `git config core.fileMode false`.
- `chmod()` doesn't actually restrict access on this mount — 2 known
  test failures are permanently environment-specific, not bugs.
- PDF-snapshot byte-comparison tests can diverge on a fresh
  environment's font rendering — 17 known failures, same category.
- No toolchain is pre-installed in a fresh container for this repo —
  install via Homebrew (`brew install php composer node`), and the user
  runs the install commands themselves rather than delegating that to
  the agent.
- `git push`/`pull` needs an `ssh-agent` started fresh **in the same
  Bash call** as the push/pull (`eval $(ssh-agent -s) && ssh-add
  ~/.ssh/mirono-github && git push ...`) — it does not persist across
  separate tool calls.

## The `proc_open` fd-leak (test infra only, fixed twice)

`tests/Concerns/SharedMigrationService.php` spawns one long-lived Node
process, shared by the whole PHPUnit run. Twice now, running PHPUnit
piped through another command (`vendor/bin/phpunit ... | tail`) has
hung indefinitely — the spawned Node child inherits a duplicate of the
*calling* PHP process's own stdout pipe, and since the Node process
outlives the PHPUnit run, that duplicate keeps the pipe open forever
even after PHPUnit itself exits cleanly. First fix (`GedcomService`
cutover) redirected the child's fds 0/1/2 to `/dev/null`; this was
real but incomplete — recurred (`GedcomImportService` cutover) via a
*different*, unnamed fd (PHPUnit's own process apparently holds another
duplicate of its stdout beyond fd 1 itself). Now fixed by closing
**every** inherited fd above 2 unconditionally in a shell wrapper before
exec'ing node, rather than naming specific fd numbers — see
`SharedMigrationService::start()`. **Always redirect full-suite PHPUnit
runs to a file, never a pipe**, regardless of this fix, since the fix
is believed complete but was only proven against the two fd numbers
actually observed.

## Git workflow (standing convention)

Branch off `js-migration-1` per task/cutover
(`git checkout -b cutover/<name>`), commit there, verify (lint + full
suite), then `git checkout js-migration-1 && git merge --ff-only <branch>
&& git push origin js-migration-1`, delete the local branch. No PR gate
— `gh` CLI isn't available in this environment. See
[[feedback-git-workflow]].

## Where to look for more detail

- **Per-module exact status**: [phase4-cutover-tracking.md](phase4-cutover-tracking.md) (the single most up-to-date file, updated every task)
- **Individual port write-ups**: `task-01-*.md` through `task-23-*.md`
- **Individual cutover write-ups**: `phase4-cutover-*.md`
- **Phase 5 (full PHP elimination) write-ups**: `phase5-*.md`
- **Methodology/templates** (generic, reusable): `../php-to-js-migration-checklist.md`
- **Long-term project memory** (this agent's cross-session notes): `[[migration-php-to-js]]`, `[[environment-wsl-quirks]]`, `[[feedback-git-workflow]]`, `[[feedback-haiku-delegation]]`, `[[project-open-issues]]`
