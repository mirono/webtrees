# Task 11 — Port `FrenchDate` + `HijriDate` + `JalaliDate` + `JewishDate`

**Priority:** 11 (follow-on to task 08; completes the `app/Date/*.php`
GEDCOM-wrapper layer now that all 6 `ext-calendar` classes exist —
tasks 7, 9, 10)
**Complexity:** Medium (322+258+275+344 = 1199 lines across 4 files, but
each is thin: month-name tables + a couple of format overrides on top of
the already-ported `AbstractCalendarDate`)
**Status:** Done

---

## Why this task, now

Per the phase-4 verification pass: `app/Factories/CalendarDateFactory.php`
dispatches GEDCOM dates to 7 concrete classes
(`GregorianDate`, `JulianDate`, `JewishDate`, `HijriDate`, `FrenchDate`,
`JalaliDate`, `RomanDate`). Task 08 ported 3 of the 7
(`GregorianDate`/`JulianDate`/`RomanDate`). Before designing any `lib/date`
bridge, the user chose to finish porting the remaining 4 so a bridge would
actually cover every dispatch target instead of silently falling back to
native PHP for 4 of 7 calendars. This task ports the remaining 4; the
bridge itself is still a separate, later step.

## Scope

All 4 classes follow the same shape as `GregorianDate`/`JulianDate`
(task 08): `extends AbstractCalendarDate`, set `this.calendar` via an
explicit constructor parameter (bridging decision #1, unchanged), define
`MONTH_TO_NUMBER`/`NUMBER_TO_MONTH`, and implement the 4
`monthNameXxxCase()` methods + `monthNameAbbreviated()`. No new
`AbstractCalendarDate` changes needed — the abstract base already supports
everything these classes touch, **except** one new capability: `JewishDate`
needs to know the active locale's script code (`I18N::locale()->script()->code()`)
to decide whether to render Hebrew numerals instead of digits. Added
`scriptCode` to the injected i18n object (`lib/date/i18n-defaults.js`'s
`DEFAULT_I18N`), defaulting to `'Latn'` — same DI pattern as
`translate`/`translateContext`/`digits`, extended rather than special-cased.

### Per-class specifics

- **`FrenchDate`** (`@#DFRENCH R@`, `FrenchCalendar`) — 13 months (12 named
  + "jours complementaires" for the 5/6 epagomenal days), a 10-day week
  with its own day names (Primidi..Decidi, no separate abbreviated form —
  `dayNamesAbbreviated()` calls `dayNames()` directly, verified from the
  PHP source, not assumed), and `formatLongYear()` returns
  `"An " + romanNumeral(year)` — needs `RomanNumeralsService`. That
  service isn't part of `app/Date/`, so it's ported as a small standalone
  helper, `lib/date/roman-numerals.js`, rather than folded into
  `french.js` (it's a generically-reusable numeral converter, not
  French-calendar-specific logic). **Note:** This helper was later
  promoted to a full service port at `lib/services/roman-numerals-service.js`
  in task 14 (see
  [task-14-roman-numerals-service.md](task-14-roman-numerals-service.md)).
- **`HijriDate`** (`@#DHIJRI@`, `ArabicCalendar`) — 12 months, no day-name
  or year-format overrides (uses the base class's Monday-Sunday day names
  and plain-digit year formatting). Simplest of the 4.
- **`JalaliDate`** (`@#DJALALI@`, `PersianCalendar`) — 12 months, no
  day-name or year-format overrides, but **does** have its own
  `monthNameAbbreviated()` (3-4 letter abbreviations — "Far", "Ord",
  "Khor", ... — distinct strings, not `monthNameNominativeCase()` reused
  like every other class in this task).
- **`JewishDate`** (`@#DHEBREW@`, `JewishCalendar`, already ported in
  task 10) — the only one with real behavioral branching:
  - `formatDay()`/`formatShortYear()`/`formatLongYear()` each check
    `scriptCode === 'Hebr'` and, if so, delegate to
    `JewishCalendar.numberToHebrewNumerals()` instead of the base class's
    plain-digit formatting.
  - `monthNameNominativeCase()` (and genitive/locative/instrumental) special-case
    month 7 in a leap year to return "Adar II" instead of the table's
    "Adar" — Adar splits into two months (6: Adar I, 7: Adar II) only in
    leap years; verified this is a real branch, not redundant with the
    `MONTH_TO_NUMBER`/`AbstractCalendarDate`'s existing month-6-remapping
    logic (that remapping handles GEDCOM *input* parsing — "which number
    does ADR mean" — this handles *output* formatting — "what do we call
    month 7").
  - `nextMonth()` is overridden: month 6 (Adar I) in a non-leap year jumps
    straight to month 8 (Nissan), skipping the nonexistent Adar II: since
    `AbstractCalendarDate`'s already-ported base implementation calls
    `this.calendar.monthsInYear()` **with no year argument** (a
    pre-existing PHP quirk faithfully kept since task 08 — see
    `nextMonth()`'s default body), which is wrong for a variable-length
    lunar-solar calendar; `JewishDate.nextMonth()` sidesteps that entirely
    with its own logic (`month % 13 + 1`), exactly matching the PHP
    source rather than relying on the (already known to be imprecise)
    base-class fallback.
  - `numberToHebrewNumerals()` is `JewishCalendar`'s method (already
    ported, with its byte-vs-character trap already handled in task 10)
    — `JewishDate` just calls it, no new logic to re-verify there.

### Deliberately excluded

Same reasoning as every prior task in this cluster: nothing new to
exclude here — unlike `JewishCalendar` (task 10), none of these 4
`app/Date/*.php` classes have unreachable/legacy surface. Every public
method that isn't inherited unchanged from `AbstractCalendarDate` is
exercised by GEDCOM date formatting somewhere in webtrees.

## Verified behaviors (not assumed)

- **`FrenchDate::dayNamesAbbreviated()` really does just call
  `dayNames()`** — confirmed by reading the source (`return
  $this->dayNames($day_number);`), not inferred from the 10-day-week
  fact alone.
- **`JalaliDate::monthNameAbbreviated()` has its own translated table**,
  unlike `FrenchDate`/`HijriDate`/`GregorianDate`/`JulianDate` (all of
  which alias `monthNameAbbreviated()` to
  `monthNameNominativeCase()`) — confirmed by reading the source; this is
  the one class in this task where reusing the nominative-case table
  would be wrong.
- **`JewishDate`'s Adar-II special case applies to all 4 grammatical-case
  methods identically** (nominative/genitive/locative/instrumental all
  have the same `if ($month === 7 && $leap_year)` branch before falling
  through to the shared table) — confirmed by reading all 4 methods, not
  assuming symmetry from one.
- **`I18N::locale()->script()->code()` for the `'he'` locale is `'Hebr'`**
  — confirmed via direct PHP execution
  (`I18N::init('he', true); echo I18N::locale()->script()->code();`),
  not assumed from ISO 15924 knowledge alone.
- **Switching `I18N::init()` locale mid-script is safe** for
  characterization purposes — confirmed by reading `I18N::init()`'s
  implementation (`app/I18N.php:263`): it just reassigns static
  properties (`self::$locale`, `self::$translator`, ...), no
  once-only guard. Used to characterize the Hebrew-script-specific
  `JewishDate` formatting cases under `I18N::init('he', true)` while
  everything else in the script runs under `'en-US'`.

## Phase 1 — Characterization approach

`bin/characterize_date_french_hijri_jalali_jewish.php`. No `Registry`/DB
bootstrap needed for construction (same as task 08); `I18N::init()` needed
for `format()`. Covers, per class: construction from GEDCOM y/m/d arrays
(including an epagomenal-days case for French — month 13 — and Adar
I/II cases for Jewish), `format()` across a representative set of format
strings (`%F`, `%f` month names in all 4 grammatical cases via the
`qualifier` parameter, `%D`/`%l` day names for French, `%Y`/`%y` year
formatting), `isLeapYear`/`daysInMonth`/`monthsInYear`/`daysInWeek`. A
dedicated Jewish-only section run under `I18N::init('he', true)` captures
`formatDay()`/`formatShortYear()`/`formatLongYear()` output with Hebrew
numerals, isolated from the rest of the script's `'en-US'`-locale output
(see "Verified behaviors" above for why re-`init()`-ing mid-script is
safe here).

## Definition of done

- [x] `golden/date_french_hijri_jalali_jewish.json` generated from the
      real PHP classes.
- [x] `lib/date/roman-numerals.js`, `lib/date/french.js`,
      `lib/date/hijri.js`, `lib/date/jalali.js`, `lib/date/jewish.js`
      created, each `extends AbstractCalendarDate`.
- [x] `DEFAULT_I18N` (`lib/date/i18n-defaults.js`) extended with
      `scriptCode: 'Latn'`, documented as the DI mechanism for
      `JewishDate`'s Hebrew-script branch.
- [x] Parity tests pass 100%
      (`js-tests/parity_date_french_hijri_jalali_jewish.test.js`).
- [x] `docs/php-to-js-migration/phase4-cutover-tracking.md` updated:
      `lib/date` row moves from 3/7 to 7/7 `app/Date/*.php` classes
      ported — the full `CalendarDateFactory` dispatch surface is now
      covered by ported JS, unblocking (but not yet building) a `lib/date`
      bridge.
