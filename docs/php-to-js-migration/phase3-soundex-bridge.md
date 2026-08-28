# Phase 3 — Soundex bridging strategy

Per [php-to-js-migration-checklist.md](php-to-js-migration-checklist.md)'s
Phase 3: "Don't migrate a stateful function until its bridging strategy is
decided." `Soundex::russell()`/`compare()`/`daitchMokotoff()` themselves
are pure (tasks [01](task-01-soundex-russell.md)/[02](task-02-soundex-daitch-mokotoff.md)),
but their *callers* are not — they're embedded in synchronous, sometimes
bulk PHP request/import code. This doc covers how traffic actually gets
routed to the ported JS, which the task docs deliberately left as "N/A —
no HTTP route yet."

## Where these functions are actually called

```
app/Services/GedcomImportService.php  — once per name, per individual, during GEDCOM import
app/Services/SearchService.php        — 6 call sites, inside live synchronous search requests
app/Module/BranchesListModule.php     — per-request surname comparison
app/Place.php                         — per-request place-name indexing
```

`GedcomImportService` in particular can call these thousands of times in a
single import of a large tree. Any bridging strategy has to survive that
without degrading import time to something unusable.

## What was chosen: persistent Node HTTP microservice, with automatic fallback

- **`server/soundex-service.mjs`** — a small `node:http` server (no
  framework dependency) exposing the ported functions:
  - `GET /health` → `{"status":"ok"}`
  - `POST /russell {"text": "..."}` → `{"code": "..."}`
  - `POST /compare {"a": "...", "b": "..."}` → `{"match": true|false}`
  - `POST /daitch-mokotoff {"text": "..."}` → `{"code": "..."}`

  Run with `npm run serve:soundex` (listens on `PORT`, default 8090).

- **`app/Soundex.php`** — `russell()`, `compare()`, and `daitchMokotoff()`
  each now start with a call to a new private `callService()` helper. If
  `WEBTREES_SOUNDEX_SERVICE_URL` is unset (the default), `callService()`
  returns `null` immediately and every call site's behavior is
  byte-for-byte identical to before this migration — confirmed by running
  the original golden-fixture-backed tests with the env var unset. If it's
  set, the method POSTs to the service (0.5s connect + total timeout,
  matching this codebase's existing external-HTTP-call convention in
  `ModuleMapAutocompleteTrait`) and returns its result; **any** failure
  (unreachable, timeout, non-200, unparseable body) falls straight through
  to the original native PHP implementation, which is still there,
  unchanged, right below the new short-circuit. The service is never a
  single point of failure.

- **Circuit breaker**: a private static `$service_unavailable` flag latches
  `true` after the first failure and is checked before every subsequent
  `callService()` call in the same PHP process. Without this, a downed
  service would add its full timeout cost to *every* call in a bulk
  import — with it, only the first call pays that cost. Verified directly:
  5 calls against a genuinely unreachable (black-hole) address took 0.51s
  total (one timeout), not ~2.5s (five timeouts).

## Known limitation: not batched

Each call is still one HTTP round-trip. For `GedcomImportService`
importing a large GEDCOM, that's thousands of round-trips even with the
service healthy — real, but currently unmeasured, latency added to import
time versus the in-process native call. This was flagged as a tradeoff of
choosing the HTTP-microservice approach (versus a coprocess or staying
PHP-only) and accepted for now. If import-time overhead turns out to
matter in practice, the natural next step is a `POST /russell/batch`-style
endpoint and updating `GedcomImportService` to collect names and call it
once per batch rather than once per name — not implemented here, since
`GedcomImportService` isn't part of this migration's scope, and adding a
batch API without a real caller to prove it against would be speculative.

## Verification

- **`tests/Feature/SoundexServiceBridgeTest.php`** — spins up the real
  Node service as a child process, proves the service-routed path returns
  identical results to the native path, then proves the same for an
  unreachable service (fallback). Skips itself if `node`/`npm` aren't
  available rather than failing CI on a Node-less machine.
- Manual check:
  ```bash
  npm run serve:soundex &
  WEBTREES_SOUNDEX_SERVICE_URL=http://127.0.0.1:8090 php -r '...'   # routes through the service
  unset WEBTREES_SOUNDEX_SERVICE_URL; php -r '...'                  # native, unchanged
  ```

## Cutover status

Not enabled anywhere by default — `WEBTREES_SOUNDEX_SERVICE_URL` is unset
in every environment until someone deliberately sets it (e.g. in
`data/config.ini.php`-adjacent deployment config, not yet wired up there).
This is deliberate: the bridge exists and is tested, but flipping it on in
a real deployment is a separate, later decision — see
[phase4-cutover-tracking.md](phase4-cutover-tracking.md).
