# Phase 0 — Inventory & Sequencing

Scope: **full PHP → Node migration** of webtrees (per [php-to-js-migration-checklist.md](../php-to-js-migration-checklist.md)).

Read this before opening any individual task file. It records why webtrees is a
harder-than-average target for this checklist, and which candidates were
scouted for the first batch and why they were picked (or deliberately deferred).

## Why this migration is unusually large

webtrees (`fisharebest/webtrees`) is a mature, server-rendered PHP 8.3+
application — not an API backend with a thin view layer. Relevant facts that
should shape sequencing:

- **No existing Node backend.** The `package.json` in the repo root only
  builds front-end assets (Bootstrap, DataTables, Leaflet, Chart.js, jQuery)
  via webpack. There is nothing to "cut traffic over to" yet — Phase 3's
  routing shim is a from-scratch build, not a config change.
- **~2,000+ PHP classes** under `app/`, including a full GEDCOM parser,
  a multi-calendar date engine (Gregorian/Julian/Hebrew/Hijri/French/Jalali),
  a module/plugin system (`modules_v4/`), report generation, a translation
  system backed by `.mo`/`.po` files, and a PDO-based data layer.
  Session state (`$_SESSION`), CSRF, and the ORM-less DB layer touch most
  request-handling code, which the checklist explicitly says to push to
  later phases.
- **External native-code dependencies.** Some "pure-looking" PHP leans on
  C extensions or userland polyfills of them — e.g. `app/Date/*` depends on
  the `fisharebest/ext-calendar` Composer package (a userland reimplementation
  of PHP's `ext/calendar`) for Julian Day conversions, and `Soundex::russell()`
  calls PHP's built-in `soundex()` (a C function with specific, undocumented
  edge-case behavior that has no JS equivalent to import — it must be
  reimplemented and characterized).
- **i18n is load-bearing, not cosmetic.** Almost every "business logic"
  class also calls `I18N::translate()`/`translateContext()`/`strtoupper()`/
  `textScript()` for locale-aware formatting or comparison. These calls are
  a dependency boundary that needs its own bridging decision — don't let
  them block porting the surrounding pure logic (stub or pass through
  during the port, characterize the i18n calls themselves as a later task).

None of this blocks starting — it means Phase 0's "push global/stateful
code to later" rule matters more here than in a typical app. The first
batch below deliberately stays inside pure, zero-I/O logic.

## Candidates surveyed

| Function/Module | File | Dependencies | Global state? | Pure logic? | Est. complexity | Priority |
|---|---|---|---|---|---|---|
| `Soundex::russell()` | `app/Soundex.php:627` | PHP built-in `soundex()` (needs reimplementation, see task) | No | Yes | Low | 1 — [task](task-01-soundex-russell.md) |
| `Soundex::daitchMokotoff()` / `daitchMokotoffWord()` | `app/Soundex.php:655,680` | `I18N::strtoupper()`, `I18N::textScript()` (small, portable helpers — ported inline) | No | Yes | Medium | 2 — [task](task-02-soundex-daitch-mokotoff.md) |
| `TagComparator::order()` / `byOrder()` | `app/Comparators/TagComparator.php` | none | No | Yes | Low | 3 — [task](task-03-tag-comparator.md) |
| `DefaultSurnameTradition` (`buildName`, `extractName`, `newChildNames`, `newParentNames`, `newSpouseNames`) | `app/SurnameTradition/DefaultSurnameTradition.php` | `Individual`/`Fact` (shimmed as plain data), `I18N::translate*` (stubbed for `name()`/`description()`) | No | Mostly (see task) | Medium | 4 — [task](task-04-surname-tradition-default.md) |
| `FactComparator::byDate/byType/typeOrder` | `app/Comparators/FactComparator.php` | `Date::compare()` → full calendar-date engine (`app/Date.php`, `app/Date/*`) | No | Blocked on Date engine | Medium | Deferred — do after the Date/calendar cluster |
| Calendar date engine (`GregorianDate`, `JulianDate`, `AbstractCalendarDate`, `AbstractGregorianJulianDate`) | `app/Date/*.php` | `fisharebest/ext-calendar` (external Composer package — its own port) | No | Yes, but large cluster | High | Deferred — needs its own Phase 0 sub-inventory once `fisharebest/ext-calendar`'s scope is decided |
| Other 8 `*SurnameTradition` subclasses (Icelandic, Lithuanian, Matrilineal, Paternal, Polish, Portuguese, Spanish) | `app/SurnameTradition/*.php` | Same shape as `DefaultSurnameTradition` | No | Yes | Low each, once task 4 lands | Follow-on batch, after task 4 proves the pattern |
| `CountryService::getAllCountries()` | `app/Statistics/Service/CountryService.php` | `I18N::translate()` per country name | No | Yes | Low | Not recommended — class is marked `@deprecated`, "will be removed in webtrees 2.3" |
| `app/Helpers/functions.php` (`asset()`, `route()`, `view()`, `redirect()`, etc.) | `app/Helpers/functions.php` | DI container, session, PSR-7 request/response, filesystem | Yes — framework glue | No | — | Not a migration candidate; this *is* the PHP/Node boundary (Phase 3 routing-shim territory) |

## Sequencing rationale

1. **`Soundex::russell()` first** — zero dependencies, ~15 lines of real
   logic, and its only subtlety (matching PHP's built-in `soundex()`
   byte-for-byte) is exactly the kind of "PHP's loose typing/C-extension
   behavior hides implicit behavior" case the checklist warns about. Good
   forcing function for taking characterization tests seriously before
   trusting an LLM port.
2. **`Soundex::daitchMokotoff()` second** — same file/class, same
   consumers, but meaningfully harder (branching state machine, large
   static lookup table). Kept as a separate LLM session per the "don't
   batch more than one function/module" anti-pattern, even though it lives
   in the same PHP file as task 1.
3. **`TagComparator` third** — trivial (an array + `array_search`), but
   real: it's a dependency of `FactComparator`, which is the thing that
   actually matters for a vertical slice (fact/event display ordering).
   Landing it first unblocks `FactComparator` once the Date engine exists.
4. **`DefaultSurnameTradition` fourth** — introduces the "how do we shim a
   domain object as input" and "how do we bridge `I18N::translate()`"
   questions in their smallest possible form (one base class, two trivial
   methods returning translated strings) before the 8 subclasses that
   depend on the same pattern get ported.

Deliberately **not** in this batch: anything under `app/Http/` (routes,
session, CSRF), the GEDCOM parser, the module system, and the Date engine's
external dependency. Each needs its own Phase 3 bridging decision before a
port is worth starting — porting them now would produce code with no way to
prove parity in isolation.

## Next steps after this batch

- Track these 4 tasks in the Phase 4 cutover table (see checklist) under a
  new pseudo-route `lib/soundex`, `lib/comparators`, `lib/surname-tradition`
  — there's no HTTP route yet, so track by module until a vertical slice
  (e.g. the phonetic-search feature) is ready to cut over.
- Once task 4 lands, spin up a follow-on batch for the other 8
  `*SurnameTradition` subclasses (same shape, low risk, high parallelizable
  — each is its own LLM session).
- Before starting the Date engine cluster, do a dedicated Phase 0 pass on
  `fisharebest/ext-calendar` itself (decide: port it too, or use a JS
  calendar-math library and characterize against it instead of translating
  line-by-line).
