# Phase 5, step 1: Node.js setup CLI + YAML config (PostgreSQL-only)

## Context

The migration's end goal was reframed by the project owner on 2026-09-17:
**get rid of PHP completely**, not just port/bridge self-contained
algorithms. Phase 4 (23 ported modules, 6 cut-over bridges, concluded
2026-09-16 — see [phase4-cutover-tracking.md](phase4-cutover-tracking.md))
remains necessary groundwork, but isn't the finish line. Full PHP
elimination is a much larger, multi-phase undertaking (webtrees has
1,431 PHP files under `app/` alone) — this doc covers only the first
concrete step: replacing the browser-based install flow's *config
writing/DB provisioning* job with a Node CLI, and moving the config file
to a format Node can read natively.

Explicit, deliberate scope for this step:
- New config format: **YAML**, at `data/config.yaml`.
- New setup tool: a **Node.js CLI** (`setup-cli/`), not a PHP CLI command.
- Database support for the new CLI: **PostgreSQL only**.
- The existing browser wizard (`app/Http/RequestHandlers/SetupWizard.php`)
  and `data/config.ini.php` **stay exactly as they are** — retiring the
  UI is a separate decision, for later. MySQL/SQLite/SQL Server remain
  supported there, unchanged.
- No auto-conversion of an existing `config.ini.php` — manual re-run of
  the new CLI is fine.

PHP is still what serves the actual running app today — only the *setup*
step moved to Node here. The PHP app must still be able to read whichever
config file setup produced, so a small, additive PHP-side change was
unavoidably part of this task.

## What already existed (reused, not rebuilt)

- `app/Cli/Commands/ConfigIni.php` — a PHP Console command (`config-ini`)
  that writes `config.ini.php` from flags and tests the DB connection,
  but doesn't create the schema, seed data, or the admin user. Used only
  as a flag-naming reference (`dbhost`/`dbport`/`tblpfx`/`base-url`).
- `app/Http/RequestHandlers/SetupWizard.php::createConfigFile()` is the
  real reference for what "full setup" does: connect → `MigrationService::updateSchema()`
  → `MigrationService::seedDatabase()` → `UserService::create()` + 4
  `setPreference()` calls → write config file.
- `app/Services/MigrationService.php`'s `updateSchema()`/`seedDatabase()`
  run 46 sequential `app/Schema/Migration0.php`..`Migration45.php` files
  via Illuminate's schema builder (`Webtrees::SCHEMA_VERSION = 46`).
  **Porting all of these to JS was explicitly out of scope** — instead
  they were run for real, once, against a throwaway Postgres DB, and the
  result captured as a golden SQL fixture (the same "characterize real
  behavior first" discipline used for every other port in this
  migration, applied to a DB side-effect instead of a function's return
  value).
- `app/Schema/SeedUserTable.php`, `SeedGedcomTable.php`,
  `SeedDefaultResnTable.php`: read directly rather than dumped — together
  they insert exactly 7 fixed, deterministic rows (1 `user` row
  `user_id=-1`/`DEFAULT_USER`, 1 `gedcom` row `gedcom_id=-1`/`DEFAULT_TREE`,
  5 `default_resn` rows for SSN/SOUR/REPO/SUBM/SUBN). Small and static
  enough to hand-write as SQL (`golden/postgres-seed.sql`) rather than
  `pg_dump --data-only` a throwaway DB.
- `app/DB.php`'s `identityInsert()` only special-cases `SQL_SERVER`;
  Postgres accepts an explicit value (e.g. `-1`) into a `serial` PK
  column with no special ceremony — nothing to work around there.
  `POSTGRESQL = 'pgsql'` was already a first-class driver.
- `app/Services/UserService.php`'s `password_hash($password,
  PASSWORD_DEFAULT)` is currently bcrypt — a Node `bcryptjs` hash is
  cross-language-verifiable by PHP's `password_verify()` since bcrypt is
  a standardized format (verified end-to-end, see "Verification" below).
- `app/Contracts/UserInterface.php`'s `PREF_*` constants (confirmed exact
  strings before hand-writing SQL): `PREF_LANGUAGE = 'language'`,
  `PREF_IS_VISIBLE_ONLINE = 'visibleonline'`, `PREF_IS_ADMINISTRATOR =
  'canadmin'`, `PREF_IS_EMAIL_VERIFIED = 'verified'`,
  `PREF_IS_ACCOUNT_APPROVED = 'verified_by_admin'`.

## Two findings from research, not assumed from the task description

**1. Config values must be normalized to strings — this is a correctness
requirement, not hygiene.** Traced concretely through `Validator.php`:
downstream consumers like `app/Http/Middleware/UseDatabase.php` and
`LoadRoutes.php` call `Validator::attributes($request)->string($key)`
with **no default**. `Validator::string()` sets the value to `null` if
it isn't already a string, then throws `HttpBadRequestException` on
`null`. A real YAML int (`dbport: 5432` unquoted) or real bool passed
through unnormalized would 400 every single request. `Webtrees::readConfig()`
(below) normalizes every scalar to a string, matching `parse_ini_file()`'s
output shape.

**2. `app/Cli/Console.php::bootstrap()` has the identical
`parse_ini_file()` pattern** and is the real bootstrap for every `php
index.php <command>` CLI invocation (`user-list`, `tree-import`,
`site-setting`, etc.) — not just the one file (`ReadConfigIni.php`)
originally in scope. If only the HTTP middleware were patched, a
YAML-configured site would have a working *web* app but every existing
PHP CLI command would silently fail to connect to the DB (masked by a
bare `catch (Throwable)` in `bootstrap()`). Both call sites share one
helper.

## What was built

### 1. `Webtrees::readConfig()` (`app/Webtrees.php`)

```php
public static function readConfig(): array
{
    if (file_exists(self::CONFIG_FILE_YAML)) {
        $raw    = Yaml::parseFile(self::CONFIG_FILE_YAML) ?? [];
        $config = [];
        foreach ($raw as $key => $value) {
            $config[$key] = match (true) {
                is_bool($value) => $value ? '1' : '',
                $value === null => '',
                default         => (string) $value,
            };
        }
        return $config;
    }
    if (file_exists(self::CONFIG_FILE)) {
        return parse_ini_file(self::CONFIG_FILE) ?: [];
    }
    return [];
}
```

Checks `data/config.yaml` first, falls back to `data/config.ini.php`
completely unchanged if the YAML file doesn't exist. **Precedence when
both exist: YAML wins** — a deliberate, stated decision (not a silent
trap): if both a browser-wizard install and a `setup-cli/` run ever
target the same `data/` directory, the YAML one takes over.

Used by both `app/Http/Middleware/ReadConfigIni.php` (the web request
path) and `app/Cli/Console.php::bootstrap()` (the CLI path) — replacing
each's own direct `parse_ini_file()` call. Zero behavior change for
ini-only sites in both cases; purely additive for YAML.

`symfony/yaml` (exact version `7.4.14`, already resolved as a
`packages-dev`-only transitive dependency before this change) was
promoted to a real `composer.json` `require` — confirmed this didn't
perturb any other package's resolved version.

### 2. Golden Postgres artifacts (`golden/postgres-schema.sql`, `golden/postgres-seed.sql`)

Generation procedure (repeat this whenever `Webtrees::SCHEMA_VERSION`
changes — do not hand-edit the SQL):

1. `docker compose up -d postgres` (a new service in `docker-compose.yml`,
   `postgres:16-alpine`, throwaway credentials, its own named volume).
2. `php bin/characterize_postgres_schema.php --host=localhost --port=5432 --user=webtrees --pass=webtrees --dbname=webtrees_golden --prefix=wt_`
   — runs the real `MigrationService::updateSchema()` + `seedDatabase()`
   against that fresh database (exactly what the browser wizard does,
   minus the admin-user/config-file parts).
3. `pg_dump --schema-only --no-owner --no-privileges -h localhost -p 5432 -U webtrees webtrees_golden > golden/postgres-schema.sql`
   — run against the container's published port from the host (or
   `docker compose exec postgres pg_dump ... webtrees_golden`, from
   inside the container, works identically). `--no-owner`/
   `--no-privileges` matter: without them the dump bakes in `ALTER TABLE
   ... OWNER TO webtrees`, which would fail against any real target DB's
   differently-named role. **Also matters: match the `pg_dump` client's
   major version to the server's if at all possible** (see the finding
   below — a version-skewed client can emit both non-SQL meta-commands
   and session settings the server doesn't understand).
4. `golden/postgres-seed.sql` is hand-written directly from the 3
   seeders' source (see above), not dumped.
5. Sanity-checked against a second, independently-created empty database:
   replayed both SQL files (via the real `pg` npm client, not `psql` —
   see the finding below on why that distinction mattered), confirmed
   table count (32) and row counts (1 `wt_user`, 1 `wt_gedcom`, 5
   `wt_default_resn`) exactly match the originally-migrated database.

**Two real problems found by actually running this procedure, not
assumed from reading `pg_dump`'s docs:**

1. **`pg_dump`'s output isn't directly executable SQL as-is.** The raw
   dump included `\restrict <token>` / `\unrestrict <token>` lines (a
   `psql`-only safety meta-command, not real SQL) and a `SET
   transaction_timeout = 0;` line (a PostgreSQL 17+ session parameter —
   the dumping client here was `pg_dump` 18.6 against a PostgreSQL 16.15
   server, and this setting doesn't exist on 16). Both are invisible when
   restoring via `psql -f` (which understands `\restrict` and simply
   ignores unrecognized `SET`s with a warning) but are **hard syntax/
   config errors** when the file is sent as a plain multi-statement query
   over the wire protocol — exactly how `setup-cli/`'s `pg` npm client
   runs it (`client.query(sql)`). Confirmed by reproducing the exact
   failure (`syntax error at or near "\"`, then `unrecognized
   configuration parameter "transaction_timeout"`) before fixing it.
   Fixed by stripping the `\restrict`/`\unrestrict` lines and the entire
   `SET ...`/`SELECT pg_catalog.set_config(...)` preamble block that
   `pg_dump` prepends — none of it is schema DDL, all of it is
   dump/restore session configuration, safe to remove entirely with zero
   effect on the resulting schema. **Lesson for regenerating this file
   later: always test-execute the result via the actual `pg` client
   (`node -e "..."` one-liner, or just run `setup-cli/` against a fresh
   database), never assume a `pg_dump` file is safe just because
   `psql -f` accepts it.**
2. **A required row was missing entirely — found only by testing the
   real running app, not by inspecting the schema.**
   `app/Http/Middleware/UpdateDatabaseSchema.php` calls
   `MigrationService::updateSchema()` on **every request**, which reads
   `WT_SCHEMA_VERSION` from `wt_site_setting` and, if it's missing,
   tries to run every migration from `Migration0` onward again — each of
   which does a plain `Schema::create()` (not "if not exists"), so it
   crashes the very first real request to a CLI-provisioned site with a
   "relation already exists" error. The browser wizard never hits this
   because `MigrationService::updateSchema()` sets this row itself as it
   runs each migration; a schema-only dump has no way to capture that
   runtime side effect. Fixed by adding an explicit
   `INSERT INTO wt_site_setting (setting_name, setting_value) VALUES
   ('WT_SCHEMA_VERSION', '46')` to `golden/postgres-seed.sql` (must be
   kept in sync with `Webtrees::SCHEMA_VERSION` whenever this file is
   regenerated). Verified the fix by calling the real
   `MigrationService::updateSchema()` from PHP against a CLI-provisioned
   database and confirming it returns `false` (no updates needed) instead
   of trying to re-run migrations.

**V1 scope decision: `wt_` is the only supported table prefix.** The
dump bakes `wt_` into every table/index/constraint name; a configurable
prefix would need fragile identifier-boundary text substitution on the
SQL file. `setup-cli/` rejects any other `--tblpfx` value outright with
a clear error, rather than silently producing a broken install.

### 3. The Node CLI (`setup-cli/`)

| File | Role |
|---|---|
| `index.mjs` | Entry point / orchestration — 6 step functions matching `SetupWizard.php`'s own step order |
| `args.mjs` | Flag parsing (`node:util.parseArgs`, no dependency) — deliberately no flag has a `default`, see below |
| `prompt.mjs` | Interactive prompts (`node:readline`, no dependency), including a masked password prompt |
| `pg.mjs` | `ensureDatabase()`, `runSchemaAndSeed()`, `upsertAdminUser()` |
| `config-writer.mjs` | Hand-rolled YAML emitter for the one flat shape this CLI ever writes |

New npm dependencies (scoped to `setup-cli/` only —
`server/migration-service.mjs` stays dependency-free per its existing
design): `pg` (the only realistic native-protocol Postgres client for
Node) and `bcryptjs` (pure JS, no native compile step — matters for
Docker portability — needed to match PHP's bcrypt password format).

**Run with no options at all** (`npm run setup` or `node
setup-cli/index.mjs`) and it walks through the same 6 steps as the
browser wizard, one at a time, prompting for every value — this is the
primary, expected way to run it, not an edge case. `--help` lists every
flag; any flag given skips just that one prompt (for scripted/CI use),
everything else still prompts as normal. `--db-pass`/`--wt-pass` fall
back to `WT_DB_PASSWORD`/`WT_ADMIN_PASSWORD` env vars before prompting —
passwords are never required as plain flags (shell history/`ps`/CI-log
exposure).

**Steps** (mirroring `SetupWizard.php`'s `step1Language()` ..
`step6Install()`):
1. **Language** — a tag for the admin's `language` preference.
2. **Server checks** — `data/` is writable, Node version. (The browser
   wizard's PHP-extension checks don't translate to a Node CLI; this
   step exists for parity of experience, not identical content.)
3. **Database type** — always PostgreSQL (no real choice, displayed for
   parity); table prefix, rejecting anything but `wt_` immediately.
4. **Database connection** — host/port/user/password/name, then
   actually tests the connection (`ensureDatabase()`) before proceeding,
   looping back to re-prompt on failure — capped at 3 attempts when
   stdin isn't a real terminal (see the finding below for why an
   uncapped loop is dangerous there), uncapped for a real interactive
   user (same as the browser wizard, which never limits retries either).
5. **Administrator account & site settings** — name/username/email/
   password, base URL, pretty-URLs toggle.
6. **Install** — runs the golden SQL, creates/updates the admin user
   (idempotent: looked up by email then username, mirroring
   `SetupWizard::createConfigFile()`'s "may already exist" handling),
   upserts the 4 admin preferences, writes `data/config.yaml`.

**A real Node bug found and worked around, not assumed away.**
`node:readline/promises`'s `question()` — the obvious, modern choice for
an `async`/`await` step-by-step prompt flow — only resolves correctly
for the *first* call when stdin is piped/non-TTY (scripted answers,
CI, or this doc's own testing): every later `question()` call on the
same interface hangs forever. Root cause, confirmed by direct
reproduction: when a whole piped input arrives as one chunk, `readline`
synchronously emits a `'line'` event for *every* complete line in that
chunk, back-to-back, in one tight loop — before the `await`-deferred
continuation that would register the *next* `question()`'s one-shot
`'line'` listener ever gets a turn on the microtask queue. By the time
that continuation runs, every line has already been emitted into the
void and consumed, so the newly-registered listener never fires. Proven
with an isolated repro (plain nested callbacks, no `await` between
calls, work fine on the exact same piped input; anything that `await`s
between two `question()` calls doesn't). Fixed by *not* using `readline`
at all for non-TTY input: `promptText()`/`promptPassword()` detect
`process.stdin.isTTY` and, when it's `false`, read the entirety of
stdin synchronously up front (`readFileSync(0, 'utf8')`) and serve
answers from that pre-split queue instead — which is also just the
correct behavior for piped input anyway, since there's no real
back-and-forth to have. Real TTY input still uses a single shared
`readline` interface normally (proven to work correctly there). **Lesson: never assume a "just use `await`" rewrite of a callback-based
Node API is behavior-preserving for non-interactive stdin — test the
exact I/O mode (piped vs. TTY) the code will actually run under.**

### 4. `docker-compose.yml` / `docker/php.Dockerfile`

Added a `postgres` service (`postgres:16-alpine`, its own named volume,
a `pg_isready` healthcheck) — doubles as the target for the golden-artifact
generation procedure above and as a ready local target for `setup-cli/`
itself. Added `pdo_pgsql` (+ `libpq-dev`) to the PHP image alongside the
existing `pdo_sqlite`, so the real app can serve a Postgres-backed
install too.

## Known limits (deliberate, not oversights)

- **PostgreSQL only.** MySQL/SQLite/SQL Server remain available only
  through the unchanged browser wizard.
- **`wt_` table prefix only.**
- **No auto-login.** The browser wizard calls `Auth::login($admin)`
  directly; a CLI has no session to log into. Users log in through the
  web UI after running `setup-cli/`.
- **Fresh-install-oriented.** The schema/seed step is only safe to run
  once against a genuinely empty database — only the admin-user step is
  idempotent.
- **No auto-conversion** of an existing `config.ini.php` to YAML.

## Verification

- `Webtrees::readConfig()` covered by a new PHPUnit test
  (`tests/Unit/WebtreesTest.php::testReadConfig()`): neither file exists
  → `[]`; ini-only → unchanged `parse_ini_file()` shape; YAML-only with
  real int/bool/null values → every value normalized to a string; both
  exist → YAML wins. The test backs up and restores this dev checkout's
  real `data/config.ini.php` around itself, so it never permanently
  disturbs a real local install.
- `renderConfigYaml()`'s escaping (embedded quotes, backslashes, empty
  strings) covered by `js-tests/setup_cli_config_writer.test.js`, and
  independently cross-checked by hand against real
  `Symfony\Component\Yaml\Yaml::parseFile()` parsing on the PHP side —
  confirmed round-trip-correct for `"`, `\`, and combinations of both.
- `phpcs`/`phpstan` clean on every touched PHP file; full PHP suite
  (3572 tests — 1 more than the phase-4 baseline, from the new
  `testReadConfig()` test) shows only the 19 pre-existing WSL-environment
  failures, confirmed identical to the phase-4 baseline set (no new
  failures); full JS suite (4018 tests — 5 more, the new config-writer
  tests) green.
- **Full end-to-end verification, completed**: `docker compose up -d
  postgres`, then (against the container's published port from the host,
  which already had `php`/`pdo_pgsql`/`psql`/`pg_dump` available)
  `node setup-cli/index.mjs` against a genuinely fresh database → real
  `data/config.yaml` written → real `php -S` webtrees instance started
  against it → real HTTP `POST` to `?route=login` with the exact
  username/password entered into the CLI → **302 redirect with a session
  cookie, landing on `/admin/trees/create` (the admin-only "no trees yet"
  page) with a real "Sign out" link in the rendered page** — definitive
  proof of a genuine authenticated admin session, not just "the request
  didn't error." This is the single highest-risk unverified assumption in
  the whole plan (a `bcryptjs` hash being accepted by PHP's
  `password_verify()`) and it's now proven with a real request through
  the real app, not a unit-level `password_verify()` call in isolation
  (though that was also checked directly and returned `true`/`false`
  correctly for right/wrong passwords). All test databases and the
  temporary `config.yaml` were cleaned up afterward; this dev checkout's
  real `config.ini.php`-based install was untouched throughout.
