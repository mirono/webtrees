# Task 07 — Port `JulianCalendar` / `GregorianCalendar`

**Priority:** 7 (first slice of the calendar engine — see
[task 06](task-06-calendar-engine-phase0.md) for the Phase 0 scoping)
**Complexity:** Medium (pure arithmetic, but one genuine PHP-source bug
needed empirical verification before it could be faithfully ported)
**Status:** Done

---

## Phase 0 — Why this one, first (of the calendar engine cluster)

Per [task 06](task-06-calendar-engine-phase0.md): every `app/Date/*.php`
calendar class depends on its own `fisharebest/ext-calendar` counterpart
for the actual Julian-day math, so the calendar engine has to be ported
before `app/Date/*` can be. `JulianCalendar`/`GregorianCalendar` are the
smallest, most-used pair (`GregorianCalendar extends JulianCalendar`,
mirroring `GregorianDate`/`JulianDate extends AbstractGregorianJulianDate`
in `app/Date/`), zero dependencies (no I18N, no DB — confirmed by reading
every method), and cover the calendars used for the overwhelming majority
of genealogical dates.

**Files:**
`vendor/fisharebest/ext-calendar/src/CalendarInterface.php` (contract),
`vendor/fisharebest/ext-calendar/src/JulianCalendar.php` (219 lines),
`vendor/fisharebest/ext-calendar/src/GregorianCalendar.php` (149 lines,
extends `JulianCalendar`).
**Namespace:** `Fisharebest\ExtCalendar` (a separate Composer package by
the same author, not `Fisharebest\Webtrees` — see task 06 for why porting
it, not substituting a JS library, was the right call).
**Scope of this task:** the full `CalendarInterface` contract
(`daysInMonth`, `daysInWeek`, `gedcomCalendarEscape`, `isLeapYear`,
`jdEnd`, `jdStart`, `jdToYmd`, `monthsInYear`, `ymdToJd`) plus each
class's own `easterDays()` (not part of the interface, but part of the
public class — ported for completeness even though nothing in this
codebase currently calls it, confirmed by grep).

## A genuine bug found in `GregorianCalendar::easterDays()` — preserve it, don't fix it

```php
$lunar = (int) ((int) (($year - 1400) / 100) * 8) / 25;
```

The outer `(int)` wraps `((int) (($year - 1400) / 100) * 8)`, which is
*already* an integer — the cast is a no-op. The `/ 25` happens **outside**
that cast, so `$lunar` ends up a float whenever the division isn't exact
(confirmed: PHP raises "Implicit conversion from float to int loses
precision" deprecation warnings downstream on PHP 8.1+, at the line where
`$lunar` is later used in a `%` operation). This looks like a
misplaced-parenthesis bug — the evident intent was
`(int) (((int) (($year - 1400) / 100) * 8) / 25)`, casting *after* the
division.

**Verified this is not a harmless technicality — it changes real output.**
Swept `easterDays()` for years 1000–3000 comparing the actual (buggy)
computation against the "intended" (correctly-parenthesized) one: **52 of
2000 years produce different results** (e.g. year 1016: buggy → 17, "fixed"
→ 10). Per this project's own porting philosophy ("port faithfully first,
improve later, once parity is proven and tested" — see
`docs/php-to-js-migration-checklist.md`), the JS port must reproduce the
actual buggy computation exactly: compute `lunar` as a genuine
floating-point value (`Math.trunc(...) * 8 / 25`, no truncation until the
`%` step), then truncate the *whole* `pfm` expression to an integer at the
point of the modulo — matching PHP's documented behavior that `%`'s
operand is cast to int only at the point of the operation, not earlier.

`JulianCalendar::easterDays()` has no equivalent bug — it never introduces
a float (no `$lunar`/`$solar` terms at all; it's a simpler, different
algorithm). Verified no divergence there.

## `jdEnd()` returns `PHP_INT_MAX` — adapted, not replicated bit-for-bit

`jdStart()`/`jdEnd()` return the valid Julian-day range for a calendar.
Both classes return `1` / `PHP_INT_MAX` (i.e. "unbounded"). JS has no
native 64-bit integer type matching `PHP_INT_MAX` exactly (`9223372036854775807`
on a 64-bit build) without `BigInt`, which would be real overkill for a
sentinel "effectively infinite" upper bound used only in range checks like
`AbstractCalendarDate::isOK()`'s `$maximum_julian_day <= $this->calendar->jdEnd()`.
Ported as `Number.MAX_SAFE_INTEGER` — large enough that no realistic
Julian day number (genealogical dates span at most a few million) will
ever legitimately compare against the boundary, so the *purpose* of the
sentinel is preserved even though the literal numeric value differs from
PHP's.

## Error handling: `InvalidArgumentException` → JS `Error`

`daysInMonth()` throws `InvalidArgumentException` for an out-of-range
month (any calendar) or year `0` (Julian calendar specifically — year 0
doesn't exist in the proleptic Julian calendar's own numbering, unlike
`ymdToJd()`/`jdToYmd()`, which treat year 0 as a valid internal
representation of 1 BCE). `ymdToJd()` throws for an out-of-range month
only (not year 0 — verified directly, no exception). Ported as a thrown
JS `Error` with the same message text (`` `Month ${month} is invalid for
this calendar` `` / `` `Year ${year} is invalid for this calendar` ``),
characterized with an `error` field in the golden JSON (matching the
`error: null` / thrown-error convention used since task 01).

## Source (current PHP)

```php
interface CalendarInterface
{
    public function daysInMonth($year, $month);
    public function daysInWeek();
    public function gedcomCalendarEscape();
    public function isLeapYear($year);
    public function jdEnd();
    public function jdStart();
    public function jdToYmd($julian_day);
    public function monthsInYear($year = null);
    public function ymdToJd($year, $month, $day);
}

class JulianCalendar implements CalendarInterface
{
    public function daysInMonth($year, $month)
    {
        if ($year === 0) {
            throw new InvalidArgumentException('Year ' . $year . ' is invalid for this calendar');
        }
        if ($month < 1 || $month > 12) {
            throw new InvalidArgumentException('Month ' . $month . ' is invalid for this calendar');
        }
        if ($month === 1 || $month === 3 || $month === 5 || $month === 7 || $month === 8 || $month === 10 || $month === 12) {
            return 31;
        }
        if ($month === 4 || $month === 6 || $month === 9 || $month === 11) {
            return 30;
        }
        if ($this->isLeapYear($year)) {
            return 29;
        }
        return 28;
    }

    public function daysInWeek()
    {
        return 7;
    }

    public function gedcomCalendarEscape()
    {
        return '@#DJULIAN@';
    }

    public function isLeapYear($year)
    {
        if ($year < 0) {
            $year++;
        }
        return $year % 4 == 0;
    }

    public function jdEnd()
    {
        return PHP_INT_MAX;
    }

    public function jdStart()
    {
        return 1;
    }

    public function jdToYmd($julian_day)
    {
        $c = $julian_day + 32082;
        $d = (int) ((4 * $c + 3) / 1461);
        $e = $c - (int) (1461 * $d / 4);
        $m = (int) ((5 * $e + 2) / 153);

        $day   = $e - (int) ((153 * $m + 2) / 5) + 1;
        $month = $m + 3 - 12 * (int) ($m / 10);
        $year  = $d - 4800 + (int) ($m / 10);
        if ($year < 1) {
            $year--;
        }
        return array($year, $month, $day);
    }

    public function monthsInYear($year = null)
    {
        return 12;
    }

    public function ymdToJd($year, $month, $day)
    {
        if ($month < 1 || $month > $this->monthsInYear()) {
            throw new InvalidArgumentException('Month ' . $month . ' is invalid for this calendar');
        }
        if ($year < 0) {
            ++$year;
        }
        $a     = (int) ((14 - $month) / 12);
        $year  = $year + 4800 - $a;
        $month = $month + 12 * $a - 3;
        return $day + (int) ((153 * $month + 2) / 5) + 365 * $year + (int) ($year / 4) - 32083;
    }

    public function easterDays($year)
    {
        $golden = 1 + $year % 19;
        $dom = ($year + (int) ($year / 4) + 5) % 7;
        if ($dom < 0) {
            $dom += 7;
        }
        $pfm = (3 - 11 * $golden - 7) % 30;
        if ($pfm < 0) {
            $pfm += 30;
        }
        if ($pfm === 29 || $pfm === 28 && $golden > 11) {
            $pfm--;
        }
        $tmp = (4 - $pfm - $dom) % 7;
        if ($tmp < 0) {
            $tmp += 7;
        }
        return $pfm + $tmp + 1;
    }
}

class GregorianCalendar extends JulianCalendar implements CalendarInterface
{
    public function gedcomCalendarEscape()
    {
        return '@#DGREGORIAN@';
    }

    public function isLeapYear($year)
    {
        if ($year < 0) {
            $year++;
        }
        return $year % 4 == 0 && $year % 100 != 0 || $year % 400 == 0;
    }

    public function jdToYmd($julian_day)
    {
        $a = $julian_day + 32044;
        $b = (int) ((4 * $a + 3) / 146097);
        $c = $a - (int) ($b * 146097 / 4);
        $d = (int) ((4 * $c + 3) / 1461);
        $e = $c - (int) ((1461 * $d) / 4);
        $m = (int) ((5 * $e + 2) / 153);

        $day   = $e - (int) ((153 * $m + 2) / 5) + 1;
        $month = $m + 3 - 12 * (int) ($m / 10);
        $year  = $b * 100 + $d - 4800 + (int) ($m / 10);
        if ($year < 1) {
            $year--;
        }
        return array($year, $month, $day);
    }

    public function ymdToJd($year, $month, $day)
    {
        if ($month < 1 || $month > $this->monthsInYear()) {
            throw new InvalidArgumentException('Month ' . $month . ' is invalid for this calendar');
        }
        if ($year < 0) {
            ++$year;
        }
        $a     = (int) ((14 - $month) / 12);
        $year  = $year + 4800 - $a;
        $month = $month + 12 * $a - 3;
        return $day + (int) ((153 * $month + 2) / 5) + 365 * $year + (int) ($year / 4) - (int) ($year / 100) + (int) ($year / 400) - 32045;
    }

    public function easterDays($year)
    {
        $golden = $year % 19 + 1;
        $dom = ($year + (int) ($year / 4) - (int) ($year / 100) + (int) ($year / 400)) % 7;
        if ($dom < 0) {
            $dom += 7;
        }
        $solar = (int) (($year - 1600) / 100) - (int) (($year - 1600) / 400);
        $lunar = (int) ((int) (($year - 1400) / 100) * 8) / 25; // see "genuine bug" note above
        $pfm = (3 - 11 * $golden + $solar - $lunar) % 30;
        if ($pfm < 0) {
            $pfm += 30;
        }
        if ($pfm === 29 || $pfm === 28 && $golden > 11) {
            $pfm--;
        }
        $tmp = (4 - $pfm - $dom) % 7;
        if ($tmp < 0) {
            $tmp += 7;
        }
        return $pfm + $tmp + 1;
    }
}
```

Note PHP's use of `int` division via `(int) (a / b)` throughout — this
always truncates toward zero (matching JS's `Math.trunc()`, not
`Math.floor()`, which rounds toward negative infinity and gives a
*different* answer for negative operands — a real risk here since these
functions are explicitly used with negative years/Julian days for BCE
dates). Verified directly (see Phase 1 below) that `Math.trunc` is the
correct choice, not assumed.

## Phase 1 — Characterization test

```php
<?php
// bin/characterize_calendar_julian_gregorian.php
require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\ExtCalendar\GregorianCalendar;
use Fisharebest\ExtCalendar\JulianCalendar;

function characterizeCalendar(string $name, $calendar): array
{
    $results = [
        'constants' => [
            'daysInWeek'          => $calendar->daysInWeek(),
            'monthsInYear'        => $calendar->monthsInYear(),
            'gedcomCalendarEscape' => $calendar->gedcomCalendarEscape(),
            'jdStart'             => $calendar->jdStart(),
            // jdEnd (PHP_INT_MAX) deliberately NOT characterized byte-for-byte
            // — see task doc's "adapted, not replicated" note.
        ],
        'jdToYmd' => [],
        'ymdToJd' => [],
        'isLeapYear' => [],
        'daysInMonth' => [],
        'easterDays' => [],
    ];

    // Round-trip a wide range of Julian day numbers, including BCE-era and
    // the classic JD epoch reference points.
    foreach ([0, 1, 328, 366, 1721060, 1721424, 1721426, 2451545, 2460000, 2500000] as $jd) {
        $results['jdToYmd'][] = ['input' => ['jd' => $jd], 'output' => $calendar->jdToYmd($jd)];
    }

    foreach (
        [
            [1, 1, 1], [0, 1, 1], [-1, 1, 1], [-4713, 11, 24], [-4714, 11, 24],
            [2000, 1, 1], [1900, 2, 28], [2024, 2, 29], [100, 3, 1],
        ] as [$y, $m, $d]
    ) {
        $entry = ['input' => ['year' => $y, 'month' => $m, 'day' => $d]];
        try {
            $entry['output'] = $calendar->ymdToJd($y, $m, $d);
            $entry['error'] = null;
        } catch (\Throwable $e) {
            $entry['output'] = null;
            $entry['error'] = $e->getMessage();
        }
        $results['ymdToJd'][] = $entry;
    }
    // Invalid month
    foreach ([0, 13, -1] as $badMonth) {
        $entry = ['input' => ['year' => 2024, 'month' => $badMonth, 'day' => 1]];
        try {
            $entry['output'] = $calendar->ymdToJd(2024, $badMonth, 1);
            $entry['error'] = null;
        } catch (\Throwable $e) {
            $entry['output'] = null;
            $entry['error'] = $e->getMessage();
        }
        $results['ymdToJd'][] = $entry;
    }

    foreach ([1900, 2000, 2024, 2023, -4, -100, -400, 0, 1] as $y) {
        $results['isLeapYear'][] = ['input' => ['year' => $y], 'output' => $calendar->isLeapYear($y)];
    }

    foreach ([[2024, 2], [2023, 2], [1900, 2], [2000, 2], [2024, 4], [2024, 1], [-4, 2]] as [$y, $m]) {
        $entry = ['input' => ['year' => $y, 'month' => $m]];
        try {
            $entry['output'] = $calendar->daysInMonth($y, $m);
            $entry['error'] = null;
        } catch (\Throwable $e) {
            $entry['output'] = null;
            $entry['error'] = $e->getMessage();
        }
        $results['daysInMonth'][] = $entry;
    }
    // Invalid month / year=0 (Julian only throws for year 0; characterize
    // both calendars anyway so the golden file proves the difference)
    foreach ([0, 13, -1] as $badMonth) {
        $entry = ['input' => ['year' => 2024, 'month' => $badMonth]];
        try {
            $entry['output'] = $calendar->daysInMonth(2024, $badMonth);
            $entry['error'] = null;
        } catch (\Throwable $e) {
            $entry['output'] = null;
            $entry['error'] = $e->getMessage();
        }
        $results['daysInMonth'][] = $entry;
    }
    $entry = ['input' => ['year' => 0, 'month' => 1]];
    try {
        $entry['output'] = $calendar->daysInMonth(0, 1);
        $entry['error'] = null;
    } catch (\Throwable $e) {
        $entry['output'] = null;
        $entry['error'] = $e->getMessage();
    }
    $results['daysInMonth'][] = $entry;

    foreach ([2024, 2025, 1900, 2000, 1600, 1700, 2100, 1016, 1019, 1020] as $y) {
        $results['easterDays'][] = ['input' => ['year' => $y], 'output' => $calendar->easterDays($y)];
    }

    return $results;
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

file_put_contents(
    $golden_dir . '/calendar_julian.json',
    json_encode(characterizeCalendar('julian', new JulianCalendar()), JSON_PRETTY_PRINT)
);
file_put_contents(
    $golden_dir . '/calendar_gregorian.json',
    json_encode(characterizeCalendar('gregorian', new GregorianCalendar()), JSON_PRETTY_PRINT)
);
```

## Phase 2 — Port prompt (ready to hand to an LLM)

```
Port these PHP calendar-math classes to JavaScript. Match behavior
exactly, including edge cases (BCE years, invalid months, integer
truncation direction) — do not "improve" or refactor the logic yet.

CRITICAL: GregorianCalendar::easterDays() has a genuine bug in the PHP
source — a misplaced parenthesis leaves `$lunar` as a floating-point
value instead of being truncated to an integer, which changes the output
for some years (verified: 52 of 2000 years tested differ from what the
"intended" correctly-parenthesized version would produce). Port the ACTUAL
buggy computation, not the apparently-intended one — compute `lunar` as a
real floating-point value, and only truncate to an integer at the point
where PHP's `%` operator would (the whole `pfm` expression, not `lunar`
itself, in isolation).

All `(int) (a / b)` divisions in the PHP source truncate toward zero —
use Math.trunc(a / b) in JS, NOT Math.floor(), which rounds toward
negative infinity and gives a different (wrong) answer for negative
operands. This matters here because these functions are used with
negative years and Julian days for BCE dates.

jdEnd() returns PHP_INT_MAX in the source — there's no JS equivalent
without BigInt, which is overkill for what's just an "effectively
unbounded" sentinel. Use Number.MAX_SAFE_INTEGER instead and note this as
an intentional adaptation, not a bug.

PHP's InvalidArgumentException should become a thrown JS Error with the
same message text.

PHP source:
<paste CalendarInterface, JulianCalendar, GregorianCalendar from above>

Here are characterization test cases it must pass (input → expected output):
<paste golden/calendar_julian.json and golden/calendar_gregorian.json>

Write JS classes `JulianCalendar` and `GregorianCalendar` (extending
JulianCalendar, same as the PHP source) as named exports from
`lib/ext-calendar/julian.js` and `lib/ext-calendar/gregorian.js`. Include
a short note on any behavior that could not be replicated identically.
```

Then actually run the parity test against the golden file — don't take
the LLM's word for it, and specifically verify the `easterDays()` bug
reproduction and every BCE/negative-year case, since those are the two
places a plausible-looking "clean" port would silently diverge.

## Definition of done

- [x] `golden/calendar_julian.json` and `golden/calendar_gregorian.json`
      generated from the real PHP classes (52 cases each: 10 `jdToYmd`,
      12 `ymdToJd`, 9 `isLeapYear`, 11 `daysInMonth`, 10 `easterDays`,
      plus a `constants` block).
- [x] `lib/ext-calendar/julian.js` and `lib/ext-calendar/gregorian.js`
      export `JulianCalendar`/`GregorianCalendar` with real JS `extends`
      (not flattened), matching the full `CalendarInterface` contract
      plus `easterDays()`.
- [x] Parity tests pass 100% (106/106 — `js-tests/parity_calendar_julian_gregorian.test.js`),
      including the invalid-month/year-0 exception cases and the
      `easterDays()` bug-reproduction cases (years 1016/1019/1020).
- [x] `GregorianCalendar::easterDays()`'s float-`lunar` bug is
      deliberately reproduced (documented inline in `gregorian.js`), not
      silently "fixed" — cross-checked directly against a live PHP call
      (not just the golden file) before writing the test suite.
- [x] `jdEnd()`'s `PHP_INT_MAX` → `Number.MAX_SAFE_INTEGER` adaptation is
      documented in `julian.js`, not silently assumed equivalent.
- [x] Recorded in the Phase 4 cutover table under module
      `lib/ext-calendar`, noting this is the foundation for the
      `app/Date/GregorianDate`/`JulianDate` port that comes next (task 06's
      sequencing step 2). **Not bridged** — nothing in `app/Date/*` calls
      this yet (that's the next task), so there's no live PHP caller to
      bridge to. Same reasoning as task 03's `TagComparator`.
