# Task 17 — Port `CalendarDateFactory::make()` + `Date`'s non-display logic

**Priority:** 17
**Complexity:** Medium (mostly regex translation; all numeric/calendar work already exists)
**Status:** Done
**Unblocks:** None directly — closes a gap flagged when `lib/date` was completed (task 11).

---

## What this port proves

Task 11's `phase3-date-bridge-design.md` flagged an open gap when the `lib/date` calendar-date engine (7 calendar classes, all fully ported) was completed: *"GEDCOM date-string parsing (`CalendarDateFactory::make()`, `Date::__construct()`'s qualifier/dual-date regexes) also isn't ported yet, so no real call site's input shape is even covered today."* This task closes that gap — the calendar engine can now be driven from real GEDCOM date strings, not just hand-built `[year, month, day]` arrays.

---

## Scope

**Files:** `app/Factories/CalendarDateFactory.php` (155 lines) + `app/Date.php`'s constructor and non-display methods (of 415 lines total)
**Target:** `lib/factories/calendar-date-factory.js` (`makeCalendarDate()`), `lib/gedcom-date.js` (`class GedcomDate`)
**Golden fixtures:** `golden/calendar_date_factory_make.json` (48 cases), `golden/gedcom_date_construct.json` (21 cases), `golden/gedcom_date_add_years.json` (4 cases), `golden/gedcom_date_compare.json` (6 cases)
**Characterization script:** `bin/characterize_gedcom_date.php`
**Parity tests:** `js-tests/parity_calendar_date_factory.test.js`, `js-tests/parity_gedcom_date.test.js` — 79 cases total

### Ported

- `CalendarDateFactory::make(string $date): AbstractCalendarDate` — full regex-based parsing: calendar-escape detection (`@#DGREGORIAN@` etc.), DMY/MY/Y pattern matching across all 6 calendars' month abbreviations, a "do the best we can" fallback for malformed input, and the unambiguous-vs-ambiguous calendar-selection rules.
- `Date::__construct()` — parenthetical explanatory-text extraction, `BET...AND`/`FROM...TO` range splitting, single-qualifier (`BEF`/`AFT`/`CAL`/`EST`/`INT`/`ABT`/`TO`/`FROM`) splitting, plain fallback.
- `Date::minimumDate()`, `maximumDate()`, `minimumJulianDay()`, `maximumJulianDay()`, `julianDay()`, `addYears()`, `isOK()`, `gregorianYear()`, `compare()` (static) — every non-display method.

### Not ported (unchanged from earlier decisions)

- `Date::display()`, `renderLink()`, `calendarUrl()` — HTML/I18N/routing, out of scope for the entire migration's calendar work (same reasoning as `phase3-date-bridge-design.md`).
- `CalendarDateFactory::supportedCalendars()` — a thin `I18N::translate()` label list, no computational value.
- `Date::__clone()` — a PHP-specific manual-deep-clone workaround; `addYears()` (the only method that needs a copy) clones inline using `AbstractCalendarDate`'s existing "construct from an equivalent xxxxDate object" branch instead.

---

## Regexes: translated directly, one exact quirk preserved

Every regex in `CalendarDateFactory::make()` and `Date::__construct()` translates essentially 1:1 from PCRE to JS `RegExp` syntax — no behavioral differences found in any of the 48+21 characterized cases. One asymmetry in the PHP source was investigated rather than assumed harmless: the "unambiguous Julian" check,

```php
preg_match('/^\d{1,4}( B\.C\.)|\d\d\d\d\/\d\d$/', $y)
```

has `^` on only the *first* alternative and `$` on only the *second* — not a fully-anchored pair. Reproduced exactly (`UNAMBIGUOUS_JULIAN_RE` in `calendar-date-factory.js`), but verified this asymmetry can't actually change real-world behavior: `$y` only ever contains a " B.C." suffix or a full "nnnn/nn" form when it came from the fully-anchored year-only regex earlier in the same function — the "do the best we can" fallback branch (the only other source of `$y`) only ever captures bare digits via `/(\d{3,4})/`, never a trailing " B.C." or "/nn" suffix. Confirmed with golden cases embedding "100 B.C." and "1234/56" fragments inside otherwise-malformed garbage text (`golden/calendar_date_factory_make.json` cases 46-47) — both correctly fall through to Gregorian, not Julian, matching real PHP output.

Also confirmed with real cases (not assumed): the fallback "day anywhere" regex (`\b(\d\d?)\b`) does no range validation — `"99 red balloons FEB"` parses to `day: 99`, an out-of-range day number, exactly like PHP does (case 44).

---

## `GedcomDate`: named to avoid the JS built-in, not `Date`

`app/Date.php`'s class is named `GedcomDate` in JS — `Date` is already a JS global. Fields `qual1`/`qual2`/`text`/`date2` mirror PHP's public/private properties directly; `date1` is exposed the same way task 15's `Age` shim expects (see below).

---

## Wiring into `Age` needs a one-line adapter, not direct construction

Task 15's `Age` shim contract reads `minimumDate`/`maximumDate`/`isOK` as **plain properties** (`x.minimumDate`, not `x.minimumDate()`) — a simplification made when `Age` was ported standalone against hand-built test shims, before any real `Date`-equivalent wrapper existed. `GedcomDate` instead exposes these as **methods**, matching PHP's actual `Date` class interface exactly (`Date::minimumDate()` is a real method in PHP too). Rather than retrofit already-tested task 15 code to a different calling convention, callers bridge the two with a one-line adapter:

```js
const shim = (gd) => ({ minimumDate: gd.minimumDate(), maximumDate: gd.maximumDate(), isOK: gd.isOK() });
const age = new Age(shim(new GedcomDate('1 JAN 1950')), shim(new GedcomDate('15 MAR 2020')));
// age.ageYears() === 70
```

Verified working end-to-end (not just asserted) — see the smoke test in this task's development notes.

---

## `GedcomDate.compare()` reuses task 12's `compareDates()` unchanged

`compareDates(a, b)` (task 12, `lib/date-compare.js`) takes plain `{ qual1, minimumJulianDay, maximumJulianDay }` objects (numbers, not methods) — a shim shape chosen for `FactComparator`'s needs at the time. `GedcomDate.compare()` adapts to that shape inline rather than changing `compareDates()`'s already-tested signature:

```js
static compare(a, b) {
  return compareDates(
    { qual1: a.qual1, minimumJulianDay: a.minimumJulianDay(), maximumJulianDay: a.maximumJulianDay() },
    { qual1: b.qual1, minimumJulianDay: b.minimumJulianDay(), maximumJulianDay: b.maximumJulianDay() },
  );
}
```

Verified end-to-end against real GEDCOM date strings (not just the pre-existing shim-object tests) — `golden/gedcom_date_compare.json`, including `BEF`/`AFT` nudging and `BET...AND` range overlap cases.

---

## Test cases

- **48 `CalendarDateFactory.make()` cases**: full DMY/MY/Y for Gregorian; all 6 calendar escapes explicit; an escape with no following date; every calendar's month abbreviations triggering unambiguous auto-detection (Jewish, French, Hijri incl. `RABI[AT]`/`JUMA[AT]` variants, Jalali); an unambiguous month overriding a *wrong* explicit escape; the Jewish year-range (3000-5999) heuristic and its boundaries (2999/6000); dual-year (`1750/51`) and B.C. handling; and 10 malformed/garbage-text fallback cases including the unanchored-regex edge cases above.
- **21 `Date`/`GedcomDate` construction cases**: every single-qualifier keyword, `BET...AND`, `FROM...TO`, parenthetical text (alone and combined with a range), invalid/incomplete dates (`isOK() === false`), a calendar escape used *inside* a range, and the "no qualifier keyword matches, falls through to plain parse" case.
- **4 `addYears()` cases**: positive/negative offset, from a range date (date2 correctly dropped), zero-year offset with only the qualifier changing.
- **6 `compare()` cases**: ordering, equality, `BEF`/`AFT` nudging, and range/point overlap — run end-to-end from real GEDCOM strings through `GedcomDate` to `compare()`, not just the pre-existing shim-object coverage from task 12.

All 79 new test cases pass; full suite (`npm test`) is 3,850/3,850.

---

## Why no bridge was built

Same reasoning as `lib/date` itself (`phase3-date-bridge-design.md`): the `AbstractCalendarDate` objects this produces escape into dozens of unrelated call sites (`Age`, 8 `CensusColumn*.php` files, etc.), so there's no clean, bounded call boundary to bridge. This is pure foundation work for the JS side, not a live-traffic cutover candidate.

---

## Definition of done

- [x] `lib/factories/calendar-date-factory.js` exports `makeCalendarDate()`.
- [x] `lib/gedcom-date.js` exports `class GedcomDate` with the full non-display method set.
- [x] `golden/calendar_date_factory_make.json`, `gedcom_date_construct.json`, `gedcom_date_add_years.json`, `gedcom_date_compare.json` generated from the real PHP classes via `bin/characterize_gedcom_date.php`.
- [x] 79/79 new parity test cases pass; full suite 3,850/3,850.
- [x] The one PCRE-anchoring asymmetry found was investigated and confirmed harmless in practice, not silently "fixed."
- [x] Recorded in `phase4-cutover-tracking.md`.
- [x] Task doc written (this file).
