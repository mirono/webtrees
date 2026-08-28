# Phase 3 — SurnameTradition bridging strategy

Per [php-to-js-migration-checklist.md](php-to-js-migration-checklist.md)'s
Phase 3. Tasks [04](task-04-surname-tradition-default.md)/[05](task-05-surname-tradition-subclasses.md)
deferred bridging because only 1 of 9 registered traditions was ported at
the time — a bridge would only have fired for a minority of trees. That's
no longer true (all 9 are ported), so this doc covers how traffic actually
gets routed to the ported JS, same shape as
[phase3-soundex-bridge.md](phase3-soundex-bridge.md) but with one
additional wrinkle: these classes take `Individual` objects, which aren't
ported and can't be serialized directly.

## Where these functions are actually called

```
app/Http/RequestHandlers/AddChildToIndividualPage.php
app/Http/RequestHandlers/AddSpouseToIndividualPage.php
app/Http/RequestHandlers/AddParentToIndividualPage.php
app/Http/RequestHandlers/AddChildToFamilyPage.php
app/Http/RequestHandlers/AddSpouseToFamilyPage.php
```

All 5 obtain a tradition via `SurnameTraditionFactory::make($key)` and then
call `newChildNames()`/`newParentNames()`/`newSpouseNames()` on it — a
live, interactive "add family member" form pre-fill, not a bulk/hot path
like Soundex's callers. That matters for the bridging strategy: latency
tolerance here is much higher (one form submission, not thousands of
per-name calls in a GEDCOM import), so the "not batched" limitation that's
a real concern for Soundex isn't one here.

## What was chosen: same Node service as Soundex, wrapped with a decorator

- **`server/migration-service.mjs`** — the same service Soundex bridges to
  (renamed from `soundex-service.mjs`, see
  [phase3-soundex-bridge.md](phase3-soundex-bridge.md)'s note), now also
  exposing all 9 ported tradition classes:
  - `POST /surname-tradition/{key}/new-child-names {"father": NameFacts, "mother": NameFacts, "sex": "M"|"F"|"U"}` → `{"names": string[]}`
  - `POST /surname-tradition/{key}/new-parent-names {"child": NameFacts, "sex": "M"|"F"|"U"}` → `{"names": string[]}`
  - `POST /surname-tradition/{key}/new-spouse-names {"spouse": NameFacts, "sex": "M"|"F"|"U"}` → `{"names": string[]}`

  `{key}` is one of `patrilineal`, `paternal`, `matrilineal`, `icelandic`,
  `lithuanian`, `polish`, `portuguese`, `spanish`, `default` — matching
  `SurnameTraditionFactoryInterface`'s PHP constants, except PHP's
  `DEFAULT` is `''` (empty string); an empty URL segment is
  awkward/ambiguous, so `BridgedSurnameTradition` maps `'' → 'default'`
  when building the request path (mirrored on the receiving end).
  `NameFacts` is `Array<{tag: string, type: string, value: string}>` — the
  same shim shape established in task 04, never the `Individual`/`Fact`
  classes themselves (not ported).

- **`app/SurnameTradition/BridgedSurnameTradition.php`** — a decorator
  implementing `SurnameTraditionInterface`, wrapping one native tradition
  instance. `newChildNames()`/`newParentNames()`/`newSpouseNames()` convert
  their `Individual` arguments to the `NameFacts` shape
  (`toNameFacts()` — reads `Fact::attribute('TYPE')`/`Fact::value()` off
  each `NAME` fact, exactly what `extractName()` itself would have read),
  POST to the service, and return its result on success; **any** failure
  falls straight through to the wrapped native tradition's own method,
  unchanged. `name()`/`description()`/`defaultName()` always delegate
  straight to native — never bridged, since `name()`/`description()` are
  pure i18n (the service has no locale to translate correctly even if it
  wanted to) and `defaultName()` is trivial enough that offloading it has
  no value. Same circuit breaker as Soundex's bridge (`$service_unavailable`,
  shared across every `BridgedSurnameTradition` instance since they all
  hit the same service), same 0.5s timeout convention, same
  `WEBTREES_SURNAME_TRADITION_SERVICE_URL` env-var gate (unset = fully
  native, byte-for-byte unchanged — this is a **separate** env var from
  Soundex's, so each bridge can be enabled independently even though they
  typically point at the same running service).

- **`app/Factories/SurnameTraditionFactory.php`** — wraps all 9 built-in
  registrations in `BridgedSurnameTradition` inside its constructor (and
  the `make()` fallback for an unrecognized key). This is the single
  wiring point — none of the 5 request handlers needed to change, same as
  how Soundex's bridge lives inside `app/Soundex.php` itself rather than
  its call sites. Traditions registered later via `register()` (e.g. by a
  module) are **not** wrapped — there's no server-side implementation to
  bridge an arbitrary custom key to.

## Why a decorator, not editing each of the 9 classes directly

Soundex's bridge lives inside `Soundex`'s own static methods because
there's exactly one class. Here there are 9, all implementing the same
interface — adding an identical `callService()`-with-fallback block to
each would be substantial duplication for no benefit, since they all talk
to the same service the same way. Wrapping instead:

- Keeps every ported class in `lib/surname-tradition/*.js` and
  `app/SurnameTradition/*.php` symmetric — neither side needs to know
  about HTTP at all.
- Means `BridgedSurnameTradition::native()` (a small accessor added for
  this reason) lets code — or tests — get back to the unwrapped
  implementation when needed, without weakening the bridge.

## Verification

- **`tests/Feature/SurnameTraditionServiceBridgeTest.php`** — spins up the
  real service as a child process, proves the service-routed path matches
  native for both a plain case (Patrilineal) and the one case that
  actually exercises a real found-and-fixed divergence (Lithuanian's
  `'ytė'` inflection, see task 05), then proves the same for an
  unreachable service (fallback). Skips itself if `node`/`npm` aren't
  available.
- The existing `tests/Unit/SurnameTradition/*Test.php` and
  `tests/Unit/Factories/SurnameTraditionFactoryTest.php` suites needed one
  update: `SurnameTraditionFactoryTest` asserted
  `assertInstanceOf(ConcreteClass::class, $factory->make(...))`, which no
  longer holds now that `make()` returns a `BridgedSurnameTradition`
  wrapping the concrete class rather than being it — updated to check
  through the new `native()` accessor. No other existing test needed to
  change (the `tests/Unit/SurnameTradition/*Test.php` suite instantiates
  the concrete classes directly, bypassing the factory entirely, so it was
  never affected).
- Manual check:
  ```bash
  npm run serve:migration &
  WEBTREES_SURNAME_TRADITION_SERVICE_URL=http://127.0.0.1:8090 php -r '...'   # routes through the service
  unset WEBTREES_SURNAME_TRADITION_SERVICE_URL; php -r '...'                  # native, unchanged
  ```

## Cutover status

Not enabled anywhere by default — `WEBTREES_SURNAME_TRADITION_SERVICE_URL`
is unset in every environment until someone deliberately sets it. Same
posture as Soundex's bridge: exists, tested, not flipped on — see
[phase4-cutover-tracking.md](phase4-cutover-tracking.md).
