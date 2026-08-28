# Task 06 — Phase 0: the calendar/Date engine

Per [00-phase0-inventory.md](00-phase0-inventory.md)'s "Next steps": *"Before
starting the Date engine cluster, do a dedicated Phase 0 pass on
`fisharebest/ext-calendar` itself (decide: port it too, or use a JS
calendar-math library and characterize against it instead of translating
line-by-line)."* This doc is that pass.

## What's actually in the "Date engine"

Two layers, cleanly separated in the source:

```
vendor/fisharebest/ext-calendar/src/   — pure calendar MATH (Julian day <-> y/m/d, leap years, etc.)
  CalendarInterface.php                — the contract (8 methods)
  JulianCalendar.php        (219 lines) — Julian calendar
  GregorianCalendar.php     (149 lines) — extends JulianCalendar
  FrenchCalendar.php        (177 lines) — French Republican calendar
  ArabicCalendar.php        (147 lines) — Hijri calendar
  PersianCalendar.php       (204 lines) — Jalali calendar
  JewishCalendar.php        (647 lines) — Hebrew calendar (by far the most complex)
  Shim.php / shims.php      (905+248)   — PHP ext/calendar polyfill glue, NOT genealogy-specific

app/Date/                              — GEDCOM-format parsing/formatting, wraps the above
  AbstractCalendarDate.php  (785 lines) — base class: julian-day storage, comparison, formatting
  AbstractGregorianJulianDate.php (233) — shared month-name logic for Gregorian/Julian
  GregorianDate.php, JulianDate.php, FrenchDate.php, HijriDate.php, JalaliDate.php, JewishDate.php, RomanDate.php
```

**Every one of the 6 real calendar classes in `app/Date/` depends on its
own `fisharebest/ext-calendar` counterpart for the actual math** —
confirmed by grep: `GregorianDate` needs `GregorianCalendar`, `JulianDate`
needs `JulianCalendar`, `HijriDate` needs `ArabicCalendar`, `JewishDate`
needs `JewishCalendar`, `JalaliDate` needs `PersianCalendar`, `FrenchDate`
needs `FrenchCalendar`. There is no meaningful way to port `app/Date/*`
without also porting (or otherwise bridging to) the calendar math it
delegates to.

## Decision: port `fisharebest/ext-calendar`, don't substitute a JS library

- **Same author, same license.** `fisharebest/ext-calendar` is by Greg
  Roach — the same person/organization as webtrees itself — GPL-3.0-or-later,
  same as this repo. No licensing friction porting it.
- **No existing JS library matches its exact behavior.** It's a
  from-scratch reimplementation of PHP's `ext/calendar` C extension (plus
  extra calendars ext/calendar doesn't have — French, Persian). A generic
  npm calendar-conversion package would need its own characterization pass
  to prove equivalence anyway, and any mismatch becomes webtrees' problem
  either way (dates silently shifting). Porting the actual algorithm this
  codebase already ships and has already tuned for GEDCOM's conventions
  (BCE year handling, proleptic calendars, etc.) is lower-risk than
  trusting a third party to happen to match it.
- **It's genuinely portable.** `CalendarInterface`'s 8 methods
  (`daysInMonth`, `daysInWeek`, `gedcomCalendarEscape`, `isLeapYear`,
  `jdEnd`, `jdStart`, `jdToYmd`, `monthsInYear`, plus `ymdToJd`) are all
  pure integer arithmetic — confirmed by reading every implementation file
  — no I18N, no DB, no GEDCOM parsing. This is exactly the kind of
  "pure/self-contained" candidate the checklist says to prioritize.

`Shim.php`/`shims.php` are **not** in scope — they're PHP's own
`ext/calendar` function polyfills (`cal_days_in_month()` etc.), infrastructure
for PHP environments missing the real extension, not something a JS port
needs at all.

## Sequencing

1. **Julian + Gregorian calendars first** (this batch's actual next task).
   `GregorianCalendar extends JulianCalendar` — same inheritance relationship
   as `GregorianDate`/`JulianDate` extending `AbstractGregorianJulianDate`
   in `app/Date/`. These are the calendars used for the overwhelming
   majority of genealogical dates (anything not explicitly marked with a
   different GEDCOM calendar escape defaults to Gregorian/Julian).
   Smallest combined surface (368 lines), zero dependencies, immediately
   useful on its own terms (Julian-day arithmetic is directly useful even
   before `app/Date/GregorianDate.php`/`JulianDate.php` themselves are
   ported).
2. **`app/Date/AbstractGregorianJulianDate.php` + `GregorianDate.php` +
   `JulianDate.php`** — once the calendar math above exists, this is the
   natural next slice: GEDCOM date parsing/formatting for the two calendars
   just ported. This layer does touch `I18N::translateContext()` for
   month names (nominative/genitive/locative/instrumental/abbreviated
   cases) — a bridging decision in the same shape as
   [task 04](task-04-surname-tradition-default.md)'s i18n injection, not
   yet made.
3. **The other 4 calendar classes** (`FrenchCalendar`, `ArabicCalendar`,
   `PersianCalendar`, then `JewishCalendar` last — it's 647 lines, more
   than the other three combined, and almost certainly has its own
   PHP-specific quirks worth budgeting real characterization time for).
   Each is independent of the others; any order works once Julian/Gregorian
   proves the pattern.
4. **`app/Date/AbstractCalendarDate.php`** (785 lines) — the shared base
   class every calendar's `app/Date/*.php` extends. Comparison, formatting,
   `isOK()` validity checks, ambiguous-date range handling. Deliberately
   last: it's the largest single file in this cluster and depends on
   *all* the calendar classes existing (its `convertToCalendar()` method
   converts between any two supported calendars), so porting it before
   the calendars it converts between would leave large parts
   uncharacterizable.

## Not in this task

`FactComparator::byDate()` (`app/Comparators/FactComparator.php`) calls
`Date::compare()`, which is why [task 03](task-03-tag-comparator.md)
stopped short of porting it. `Date::compare()` (`app/Date.php`, not to be
confused with `app/Date/AbstractCalendarDate.php`) itself depends on the
full calendar engine above — it stays blocked until step 4 lands, not
this task.

## This task's actual scope

`fisharebest/ext-calendar`'s `CalendarInterface` contract, `JulianCalendar`,
and `GregorianCalendar` only — see
[task-07-calendar-julian-gregorian.md](task-07-calendar-julian-gregorian.md).
