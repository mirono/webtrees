# Phase 3 — `lib/date` bridge design (conclusion: don't build one)

Per the phase-4 verification pass and task 11, all 7 `app/Date/*.php`
GEDCOM-wrapper classes now have tested JS ports in `lib/date/`. This
document investigates what an HTTP bridge (matching the Soundex and
SurnameTradition pattern — `docs/php-to-js-migration/phase3-soundex-bridge.md`,
`phase3-surname-tradition-bridge.md`) would look like for `lib/date`, and
concludes: **don't build one**, for reasons specific to this module's
shape — not a blanket statement about the migration.

## Why the Soundex/SurnameTradition pattern doesn't transfer

That pattern works because the bridged operation is a **pure function
call**: a string (or a couple of scalars) goes in, a string/array comes
back, and nothing about the call escapes into unrelated code afterward.
`Date`/`AbstractCalendarDate` don't have that shape.

### 1. The objects escape `Date.php` and get queried unpredictably

`Date::minimumDate()`/`maximumDate()` return the raw
`AbstractCalendarDate` object (app/Date.php:264-277), and callers keep
it and call further methods on it directly — bypassing `Date.php`
entirely:

- `Age::__construct()` (app/Age.php:44-67) calls
  `AbstractCalendarDate::ageDifference()` on the returned objects — the
  sole caller of that method, itself instantiated from 14 places
  (`CensusColumnAge*.php` ×8, `IndividualPage.php`, `fact-date.phtml`,
  `fact-parents-age.phtml`, `individuals-table.phtml` ×3,
  `families-table.phtml` ×3).
- 8 `app/Census/CensusColumn*.php` files call `->format()` directly on
  the returned date object with their own fixed format strings.

A bridge inside `Date`'s own methods (`display()`, `compare()`, ...)
would never see these calls — they happen on the object *after* it's
already left `Date.php`. To cover them, the bridge would have to live
inside `AbstractCalendarDate` itself, at the point where the object is
constructed, before anyone knows what will be called on it later.

### 2. Call volume makes a chatty bridge a non-starter

Surveyed actual call sites (app/ + resources/views/, see investigation
notes below for counts): a 50-row `individuals-table.phtml`/
`families-table.phtml` page constructs **~150+ `Date` objects** and
fires **~400-600 method calls** against them (2× `display()`, ~4×
`julianDay()`/`minimumJulianDay()`, 3× `Age` construction per row). An
individual's fact list adds ~20-40 more `Date` objects and ~100+ calls.

A per-method-call HTTP bridge (the naive translation of "just call the
service instead") would turn one page render into hundreds of HTTP
round-trips. Even a per-*object* bridge (one call per `Date`
construction) is 150+ round-trips on a single page — well into
user-visible latency territory for a feature (date formatting) that's
currently free.

### 3. The one cleanly-bridgeable method doesn't reduce PHP surface area

`Date::display()` (app/Date.php:102-243) is the one method that's
actually shaped like Soundex/SurnameTradition: bounded inputs (a GEDCOM
date string, already parsed into `date1`/`date2`; a locale format
string from a small enumerable set — confirmed by grep, `I18N::dateFormat()`
returns one fixed string per locale, plus a handful of GEDCOM-reformat
and census-column constants; a tree's `CALENDAR_FORMAT` preference for
`convertToCalendar()`), single string output, nothing escapes.

But bridging *only* `display()` doesn't let PHP retire any calendar
code — `Date` still has to construct native `AbstractCalendarDate`
objects for `date1`/`date2` regardless, because `minimumDate()`,
`maximumDate()`, `compare()`, `isOK()`, `julianDay()`, `addYears()`, and
every external caller listed in §1 depend on those native objects
existing. Bridging `display()` alone would add HTTP latency to the
hottest call path (45 call sites) in exchange for zero PHP code
removed — pure downside under this migration's actual goal (eventually
retiring PHP calendar logic), not a stepping stone toward it.

### 4. String parsing isn't ported yet, either

Every real call site does `new Date($gedcomDateString)` — a raw GEDCOM
date string. The regex-based parsing that turns that string into
calendar + qualifier + y/m/d — `CalendarDateFactory::make()`
(app/Factories/CalendarDateFactory.php:42-131) and `Date::__construct()`'s
own qualifier/dual-date regexes (app/Date.php:61-81) — was never ported
to JS. The `lib/date` port only covers pre-parsed y/m/d arrays or a
Julian day number as input (matching what task 08/11's characterization
scripts constructed from directly). A bridge that only accepts
already-parsed input doesn't match any real call site's shape without
first porting this parsing layer too — new scope, not yet started.

## Conclusion

`lib/date` moves into the same bucket as `lib/ext-calendar` and
`lib/comparators`: **ported and fully tested for correctness parity,
deliberately not bridged**. Recorded in
`phase4-cutover-tracking.md`. Unlike Soundex/SurnameTradition, this
isn't "bridged but disabled, pending an activation decision" — it's "no
bridge is being built," a distinct state.

This conclusion is about *this* module's shape under the *current* PHP
architecture (objects escape polymorphically, no DTO boundary), not a
statement that JS calendar logic is useless. If a future need arose
where `AbstractCalendarDate` objects stopped escaping `Date.php` (e.g.
`Date`/`Age`/the census columns were refactored to consume precomputed
value objects instead of live calendar-date instances), or if webtrees
grew a genuinely Node-rendered page rather than a PHP-page-with-bridged-
calls, the calculus would change. Neither is in scope right now — this
document exists so that reasoning doesn't have to be redone from
scratch if the question comes up again.

## Investigation notes (source data for the above)

Gathered via grep across `app/` and `resources/views/`, PHP source
reading (`app/Date.php` in full, `app/Factories/CalendarDateFactory.php`
in full), not assumed:

- `new Date(`: 66 call sites / 27 files.
- `->display(`: 45 call sites.
- `->format(` on date objects (excluding unrelated `Carbon`/`Timestamp`
  formatting): concentrated in 8 `CensusColumn*.php` files (one each),
  `GedcomImportService.php`, `Individual::lifespan()`.
- `->minimumDate(`: 48, `->maximumDate(`: 10, `->minimumJulianDay(`: 68,
  `->maximumJulianDay(`: 49, `->julianDay(`: 44, `->isOK(`: 72,
  `Date::compare(`: 30, `->addYears(`: 2, `->gregorianYear(`: 3.
- Format-string vocabulary: `AbstractCalendarDate::format()` recognizes
  21 fixed tokens; composite format strings come from `I18N::dateFormat()`
  (one per locale), ~9 fixed census-column formats, and a handful of
  GEDCOM-reformat constants (`'%@ %A %O %E'`, `'%Y%m%d'`, `'%j/%n'`) — no
  call site builds an arbitrary/dynamic format string.
- Noted in passing, unrelated to this decision: `resources/views/fact-date.phtml:47`
  re-parses `new Date($match[1])` from raw GEDCOM per fact even though
  `Fact::date()` (app/Fact.php:274) already caches one — a pre-existing
  double-construction inefficiency, not introduced by this
  investigation and not fixed here (out of scope for a bridge-design
  doc).
