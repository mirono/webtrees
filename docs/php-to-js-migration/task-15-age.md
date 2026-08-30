# Task 15 — Port `app/Age.php`

**Priority:** 15 (immediate follow-on to calendar engine completion)
**Complexity:** Low (core logic uses already-ported `AbstractCalendarDate`)
**Status:** Done
**Unblocks:** None — this is a leaf module with no downstream dependents in this port wave.

---

## What this port proves

The calendar-date engine ported in tasks 7-11 (`lib/date/*.js`, `lib/ext-calendar/*.js`) now has a real downstream consumer: `Age` calculates the difference between two GEDCOM dates, used for "age at event" display throughout the app.

---

## Scope

**File:** `app/Age.php` (145 lines)
**Namespace:** `Fisharebest\Webtrees`
**Target:** `lib/age.js` (ES6 class, ~220 lines with comments and structure)
**Golden fixture:** `golden/age.json` (8 test cases exercising all branches)
**Parity test:** `js-tests/parity_age.test.js`

### Source methods ported

1. **`__construct(Date $x, Date $y)`** — Constructor, calculates the age difference between two GEDCOM dates
2. **`toString()`** — Renders age as human-readable string ("34 years", "8 months", "20 days", etc.)
3. **`ageDays()`** — Returns total days, or -1 for invalid dates
4. **`ageYears()`** — Returns total years, or -1 for invalid dates
5. **`ageYearsString()`** — Returns formatted years or warning icon for negative ages

---

## Domain shim design (the critical decision)

`app/Date.php` itself is NOT ported (see `phase3-date-bridge-design.md` for why — object polymorphism, call volume, no bridge foothold). However, the `Date` wrapper's two methods ARE accessible for this port:

- `Date::minimumDate()` → returns an `AbstractCalendarDate`
- `Date::maximumDate()` → returns an `AbstractCalendarDate`
- `Date::isOK()` → returns a boolean

So the JS `Age` class accepts shim objects shaped like:

```js
{
  minimumDate: <AbstractCalendarDate instance or compatible>,
  maximumDate: <AbstractCalendarDate instance or compatible>,
  isOK: <boolean>,
}
```

Each calendar date has all methods it needs: `.dayValue()`, `.monthValue()`, `.ageDifference(other)`, `.minimumJulianDay()`.

For non-range dates (the common case), `minimumDate` and `maximumDate` are the same object.

---

## I18N/Warning icon injection

Followed the same DI pattern as `lib/date/*.js` (task 08):

```js
const age = new Age(x, y, {
  i18n: {
    plural(singular, plural, count, formattedCount) { ... },
    number(n) { ... },
    warningIcon() { ... },
  },
  warningIcon: '[icon-html]' | (() => '[icon-html]'),
});
```

- **`i18n.plural(singular, plural, count, formattedCount)`** — PHP's `I18N::plural()` behavior: select form based on `count`, substitute `%s` with `formattedCount`. Default (English, untranslated) uses standard plural rule: `count === 1` → singular, else plural.
- **`i18n.number(n)`** — Locale-aware number rendering. Default: `String(n)`.
- **`warningIcon`** (optional) — Override the warning icon. Can be a string or a `() => string` function. Default uses `i18n.warningIcon()`, which returns a placeholder `'[warning-icon]'` for untranslated mode.

---

## Critical logic notes

### "Valid" vs. "Negative"

- **`is_valid`** (internal state) = both input Date objects have `isOK === true`. If either is false, `ageDays()` and `ageYears()` return **-1**.
- **"Negative age"** (when `years < 0`) = dates are reversed (end before start), but both are valid. The string methods (`toString()`, `ageYearsString()`) display a **warning icon**, but `ageDays()` and `ageYears()` return the actual (negative) computed value, NOT -1.

Example:
- Birth 2020, "death" 1950 → `ageYears()` returns **-71**, not -1.
- Birth empty, death 2020 → `ageDays()` returns **-1** (invalid).

### Precision handling

The Age difference values (`years`, `months`, `days`) come directly from `AbstractCalendarDate::ageDifference()`. PHP then **zeroes out** components based on input date precision:

```php
// Use the same precision as found in the dates.
if ($start->day() === 0 || $end->day() === 0) {
    $this->days = 0;  // ← Force to 0 if either input lacks a day
}
if ($start->month() === 0 || $end->month() === 0) {
    $this->months = 0;  // ← Force to 0 if either input lacks a month
}
```

This ensures "1 JAN 1950 to 1 FEB 1950" (both day-precise) shows "1 month", but "JAN 1950 to FEB 1950" (both month-only) shows "0" (no months component, since precision doesn't justify it).

### String rendering logic

The `toString()` method uses a priority waterfall:

1. If invalid → empty string
2. If years < 0 → warning icon
3. If years > 0 → "X year(s)"
4. Else if months > 0 → "X month(s)"
5. Else if days > 0 OR is_exact → "X day(s)" (note: shows "0 days" for identical exact dates)
6. Else → "0" (no units)

The key: case 5 includes an `is_exact` check. An identical date pair where both are exact (day-precise) displays "0 days", not the bare "0" of case 6.

---

## Test cases (8 total)

| # | Input | Branch | Notes |
|---|-------|--------|-------|
| 0 | Full precision (1 JAN 1950 → 15 MAR 2020) | years > 0 | 70 years, 2 months, 14 days; shows "70 years" |
| 1 | Same year (15 JAN → 20 MAR 2020) | months > 0 | 0 years, 2 months, 5 days; shows "2 months" |
| 2 | Same month (15 JAN → 18 JAN 2020) | days > 0 | 0 years, 0 months, 3 days; shows "3 days" |
| 3 | Identical exact dates (15 JAN 2020 → 15 JAN 2020) | is_exact | 0 years, 0 months, 0 days; shows "0 days" (not bare "0") |
| 4 | Year-only both sides (2020 → 2020) | none (zero fallback) | month/day forced 0; shows bare "0" (no units) |
| 5 | Reversed dates (15 MAR 2020 → 1 JAN 1950) | years < 0 | ageYears = -71 (actual, not -1); string shows warning icon |
| 6 | Invalid date (empty → 15 JAN 2020) | invalid | ageDays/ageYears return -1; string methods return empty string |
| 7 | Month precision both sides (MAR 1950 → MAR 2020) | months forced 0 | 70 years, 0 months (day forced 0, month not); shows "70 years" |

---

## Implementation notes

### Differences from PHP

None. Behavior is identical: the JS port calls the already-ported `AbstractCalendarDate::ageDifference()` and applies the same precision-stripping and string-rendering logic.

### Why no bridge was built

See `phase3-date-bridge-design.md`: `Age` is a leaf consumer of the calendar engine, with no HTTP request handlers; bridging would add latency with no reduction in PHP surface area (the Date wrapper still has to exist for other callers).

---

## Definition of done

- [x] `lib/age.js` exports class `Age` with constructor, `toString()`, `ageDays()`, `ageYears()`, `ageYearsString()`.
- [x] `golden/age.json` generated from PHP `bin/characterize_age.php` — 8 cases covering:
  - All output branches (years > 0, months > 0, days > 0, is_exact fallback, zero fallback)
  - Negative age (both valid & showing warning)
  - Invalid date (isOK = false)
  - Precision handling (year-only, month-only, full)
- [x] `js-tests/parity_age.test.js` — all 8 cases pass (100% parity).
- [x] Full test suite passes: `npm test` → 896/896 ✓
- [x] Recorded in `phase4-cutover-tracking.md` as a new row under `lib/age` (leaf module, no downstream dependents).
- [x] Task doc written (this file).
