# Task 08 — Port `AbstractCalendarDate` + `AbstractGregorianJulianDate` + `GregorianDate`/`JulianDate`/`RomanDate`

**Priority:** 8 (task 06's sequencing step 2 — revised, see below)
**Complexity:** High (785+233+45+114+49 = 1226 lines; real i18n/timestamp
dependencies; one JS-language structural constraint forced a design change)
**Status:** Done

---

## Scope correction from task 06

Task 06 sequenced this as "`AbstractGregorianJulianDate` +
`GregorianDate` + `JulianDate`" on the assumption `AbstractCalendarDate`
(785 lines, the shared base every calendar date class extends) could stay
deferred to its own later task. That's not achievable:
`GregorianDate extends AbstractGregorianJulianDate extends AbstractCalendarDate`
— the inheritance chain is real, and neither PHP nor a faithful JS port
can construct/test a `GregorianDate` without its full ancestor chain
existing. `AbstractCalendarDate` is in scope for this task, not deferred.

`RomanDate.php` (49 lines) is also folded in here — it wasn't accounted
for in task 06's "6 calendars" framing (it has no `ext-calendar`
backing at all; the GEDCOM 5.5.1 spec mentions a Roman calendar but
never defines it, so this class is "just a placeholder so webtrees won't
complain if it receives one" per its own docblock). It trivially
`extends JulianDate`, so it's nearly free once `JulianDate` exists.

## Bridging decisions

### 1. `calendar` must be a constructor parameter, not a pre-`super()` assignment

PHP's `GregorianDate::__construct()`:
```php
public function __construct($date)
{
    $this->calendar = new GregorianCalendar();
    parent::__construct($date);
}
```
sets `$this->calendar` **before** calling the parent constructor — legal
in PHP, since `$this` exists from object instantiation. **JS does not
allow this**: `this` is inaccessible until `super()` returns, and
`AbstractCalendarDate`'s constructor logic needs `this.calendar` on its
very first lines (`this.calendar.jdToYmd(date)` etc.). This forces a real
structural change, not a simplification: `calendar` becomes an explicit
second constructor parameter passed *into* `super()`:
```js
class GregorianDate extends AbstractCalendarDate {
  constructor(date, options) {
    super(date, new GregorianCalendar(), options);
  }
}
```
This changes *how* the calendar gets wired up, not any observable
behavior — confirmed by the characterization plan below testing through
the concrete subclasses exactly as PHP callers would.

### 2. i18n: same injection pattern as tasks 04/05, extended with `digits()`

This class calls `I18N::translate()`, `I18N::translateContext()`, and
`I18N::digits()` (locale-aware digit rendering — e.g. Arabic-Indic
numerals for some locales; delegates to `fisharebest/localization`'s
`Locale::digits()`, confirmed by reading `app/I18N.php:247-250`). Same
constructor-injection approach as `DefaultSurnameTradition`
(`{ translate, translateContext }`), extended with `digits`:
```js
{ translate: (msg, ...args) => ..., translateContext: (ctx, msg, ...args) => ..., digits: (n) => String(n) }
```
`I18N::translate()`'s PHP implementation is
`sprintf(self::$translator->translate($message), ...$args)` — translate
first, then `sprintf`-substitute. The default/test i18n object's
`translate()` needs to support `%s` substitution (the only specifier this
class actually uses — confirmed by grep) to produce meaningful
characterization output, not just echo the raw key.

### 3. "Current date": also injected, not a hidden global

`todayYmd()`/`today()`, and the constructor's "incomplete date → compute
an anniversary in the current year" branch, call
`Registry::timestampFactory()->now()->julianDay()` — confirmed
(`app/Factories/TimestampFactory.php:64`,
`app/Timestamp.php:45-48`) this is just wall-clock `time()` converted to
a Julian day, nothing more. Injected the same way as `i18n`: a `now`
function (`() => julianDayNumber`) passed via the constructor's options,
defaulting to a real "today" if not provided. This is genuinely dynamic,
request-scoped data (unlike the static translation keys), so tests must
inject a **fixed** `now` to get reproducible golden comparisons — never
rely on the default.

### 4. `calendarUrl()` is NOT ported

```php
public function calendarUrl(string $date_format, Tree $tree): string
{
    ...
    return route(CalendarPage::class, [...]);
}
```
Generates a webtrees URL via the PHP router and a `Tree` object — pure
PHP-application plumbing, not calendar logic. Excluded entirely from the
JS port, same category of exclusion as `Fact`/`Individual` in the
SurnameTradition tasks. If a caller ever needs this from JS, it's a
routing-layer bridging decision on its own, not part of this port.

### 5. The `JewishCalendar` special case — string comparison, not `instanceof`

Two places in `AbstractCalendarDate` special-case the Hebrew calendar
even though this is the "generic" base class:
```php
if ($this->month === 6 && $this->calendar instanceof JewishCalendar && !$this->calendar->isLeapYear($this->year)) {
    $this->month = 7;
}
// ...
if ($this->month === 7 && $this->calendar instanceof JewishCalendar && !$this->calendar->isLeapYear($this->year)) {
    return 'ADR';
}
```
`JewishCalendar` isn't ported yet (task 06's step 3). An `instanceof`
check against an unported class isn't available. Ported as
`this.calendar.gedcomCalendarEscape() === '@#DHEBREW@'` instead — a
string comparison against the calendar's own escape sequence (confirmed:
`vendor/fisharebest/ext-calendar/src/JewishCalendar.php:228-231` returns
exactly that string), which doesn't require the class to exist and will
keep working correctly, unchanged, once `JewishDate`/`JewishCalendar` are
ported later. For `GregorianCalendar`/`JulianCalendar` (this task's only
targets), this comparison is always `false` — confirmed these branches
are unreachable for this task's scope, but the structure is preserved so
future calendars inherit it correctly.

### 6. `convertToCalendar()` — partial support, loudly, not silently

```php
public function convertToCalendar(string $calendar): AbstractCalendarDate
{
    switch ($calendar) {
        case 'gregorian': return new GregorianDate($this);
        case 'julian': return new JulianDate($this);
        case 'jewish': return new JewishDate($this);
        case 'french': return new FrenchDate($this);
        case 'hijri': return new HijriDate($this);
        case 'jalali': return new JalaliDate($this);
        default: return $this;
    }
}
```
Only `'gregorian'`/`'julian'` are supported by this task (the other 4
date classes don't exist in JS yet). Ported to throw a clear
`Error('convertToCalendar("jewish") is not yet ported — see task 06')`-style
message for the unported targets, rather than silently returning `this`
(which is what PHP's `default:` branch would do for a typo, but is wrong
behavior to replicate for a *known, temporary* gap) or crashing
unhelpfully. Revisit as each remaining calendar is ported — this is
exactly the "no silent caps" principle from the workflow patterns this
migration follows.

## Source

`app/Date/AbstractCalendalDate.php` (785 lines), `app/Date/AbstractGregorianJulianDate.php`
(233 lines), `app/Date/GregorianDate.php` (45 lines), `app/Date/JulianDate.php`
(114 lines), `app/Date/RomanDate.php` (49 lines) — full current source, not
reproduced here for length; read directly before porting. Key
already-verified facts about the source, beyond the bridging decisions
above:

- `MONTH_ABBREVIATIONS` (declared in `AbstractGregorianJulianDate`) is
  dead code — confirmed by grep, referenced nowhere. Ported anyway for
  faithfulness (it's part of the class's declared surface), noted as
  unused.
- `JulianDate::extractYear()` sets a private `$new_old_style` flag as a
  side effect during construction (parsing GEDCOM's "1743/44" old-style/
  new-style year notation), which later affects `formatLongYear()`/
  `formatGedcomYear()` output. This is real instance state that must
  persist correctly through the port, not just a pure function.
- Constructing a date from an `int` (Julian day) or `array` (GEDCOM
  `[year, month, day]` strings) needs **no** I18N/Registry bootstrap at
  all — confirmed directly: `new GregorianDate(2460000)` and
  `new GregorianDate(['2024', 'FEB', '15'])` both work with only
  `vendor/autoload.php` loaded. Only `format()` (and anything that calls
  it) needs the i18n bridge; only the "incomplete date, anniversary in
  current year" constructor branch and `today()`/`todayYmd()` need the
  `now` bridge.

## Phase 1 — Characterization approach

Unlike the SurnameTradition tasks (which needed `Individual` stubs),
`GregorianDate`/`JulianDate` can be constructed and exercised **directly**
— no stubbing needed for the "pure" methods (construction, comparison,
`ageDifference`, `isLeapYear`, `daysInMonth`/`daysInWeek`, `monthsInYear`,
`setJdFromYmd`, `inValidRange`). For `format()` and anything touching
day/month names, bootstrap with `I18N::init('en-US', true)` (same
technique as the Soundex `daitchMokotoff` task) and characterize using a
**fixed** notion of "today" by calling `todayYmd()`/`today()` only after
confirming what `Registry::timestampFactory()->now()->julianDay()`
actually returns at script-run time, recording that value in the golden
file's `input` so the JS side can inject the identical fixed `now`.

Cases to cover (via `bin/characterize_gregorian_julian_date.php`):
- Construction from JD, from GEDCOM `[y,m,d]` arrays (including
  incomplete: month-only, year-only, day+month with year, all-zero), and
  from cross-construction (`new JulianDate($gregorianDateInstance)` and
  vice versa) — this exercises the "construct from another
  `AbstractCalendarDate`" branch, including its BCE/incomplete-date paths.
- `compare()`, `ageDifference()` across a range of date pairs, including
  BCE years and overlapping/incomplete dates.
- `isLeapYear()`, `daysInMonth()` (including the `InvalidArgumentException`
  → `0` fallback for `"DD MMM"`-only dates), `daysInWeek()`,
  `monthsInYear()`, `inValidRange()`.
- `format()` across a representative set of format strings (`%F %j, %Y`,
  `%Y-%m-%d`, `%A %O %E` (GEDCOM round-trip), `%@`) crossed with
  qualifiers (`''`, `'ABT'`, `'BEF'`, `'AFT'`) to exercise all 4
  grammatical cases, and with incomplete dates (day=0, month=0, year=0)
  to exercise the format-stripping branches.
- `JulianDate`-specific: BCE years (`formatLongYear()`'s `%s BCE`
  branch), old-style/new-style year notation (`"1743/44"` → verify
  `new_old_style` state persists into `formatLongYear()`/`formatGedcomYear()`
  output correctly).
- `RomanDate`: `formatGedcomYear()`/`formatLongYear()`'s `AUC` suffix.
- `convertToCalendar('gregorian')`/`convertToCalendar('julian')` between
  the two ported calendars; confirm the unsupported-target error for
  `'jewish'` etc. is a deliberate design choice, not characterized against
  PHP (PHP would successfully construct a `JewishDate` here — this is a
  known, documented, temporary gap, not a divergence to hide).

## Phase 2 — Port prompt

Given the size, port in this order within one LLM session (still "one
cohesive unit," per the checklist's anti-batching rule, since these
classes cannot be independently verified): `AbstractCalendarDate` →
`AbstractGregorianJulianDate` → `GregorianDate` → `JulianDate` →
`RomanDate`. Hand the six bridging decisions above to the LLM explicitly,
the same way task 04's prompt did — do not let it re-derive them.

## Definition of done

- [x] `golden/gregorian_julian_date.json` generated from real
      `GregorianDate`/`JulianDate`/`RomanDate` PHP objects, not
      hand-written — construction (9 cases), construction-from-JD (6),
      cross-calendar construction (3), compare/ageDifference (6), leap
      year/daysInMonth/daysInWeek/monthsInYear/inValidRange (8),
      daysInMonth exception-fallback (2), `format()` (24), `format()` on
      incomplete dates (6), Julian BCE/old-style year formats (3), Roman
      AUC formats, `todayYmd()`/`today()`.
- [x] `lib/date/abstract-calendar-date.js`, `lib/date/abstract-gregorian-julian-date.js`,
      `lib/date/gregorian.js`, `lib/date/julian.js`, `lib/date/roman.js`
      export classes mirroring the real inheritance chain via JS
      `extends`, with `calendar` threaded through the constructor per
      decision #1.
- [x] Parity tests pass 100% (73/73 —
      `js-tests/parity_gregorian_julian_date.test.js`), including BCE
      years, incomplete dates (year/month/day = 0), the old-style/
      new-style Julian year case, and every `format()`
      grammatical-case/qualifier combination characterized. One real bug
      caught and fixed during implementation, not by the golden tests but
      by manual review: `formatIsoWeekday()`/`formatNumericWeekday()`/
      `formatLongWeekday()`/`formatShortWeekday()` were initially ported
      with unnecessary (and PHP-incorrect) modulo-sign normalization —
      verified PHP's `%` and JS's `%` already have identical sign
      semantics (both follow the dividend), unlike the earlier
      division-truncation finding from task 07, and removed the incorrect
      "fix."
- [x] The `JewishCalendar` string-comparison substitution (decision #5) is
      structurally correct (compares against literal calendar-escape
      strings already verified in task 07/06) and confirmed unreachable
      for Gregorian (`@#DGREGORIAN@`) and Julian (`@#DJULIAN@`) — neither
      equals `@#DHEBREW@`.
- [x] `convertToCalendar()`'s partial support is documented with a clear
      error message for unported targets (tested explicitly), not a
      silent fallback — the true PHP `default:` no-op-return behavior
      (unrecognised calendar name) is preserved separately and correctly.
- [x] `calendarUrl()` confirmed absent from the JS port, with a comment
      explaining why.
- [x] Recorded in the Phase 4 cutover table under module `lib/date`,
      noting `FactComparator::byDate()`'s dependency on `Date::compare()`
      (`app/Date.php`) is now one step closer but still blocked (that
      file itself, plus the remaining 4 calendars, aren't ported). Not
      bridged — nothing in `app/Date.php`/`FactComparator` calls this
      port yet.
