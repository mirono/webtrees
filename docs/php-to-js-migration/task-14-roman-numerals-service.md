# Task 14 — Port `RomanNumeralsService` (complete + promote)

**Priority:** 14
**Complexity:** Low
**Status:** Done
**Unblocks (not in this batch):** None — service itself is self-contained. Completes a partial, ad-hoc port started in task 11.

---

## Phase 0 — Why this one, now

Task 11 ported the date-formatting layer (`app/Date/*.php`) but needed `RomanNumeralsService.numberToRomanNumerals()` for `FrenchDate::formatLongYear()`. Since the full service class wasn't in scope (only one method was called), a small standalone helper was ported inline at `lib/date/roman-numerals.js` instead, rather than the full service.

This task completes the work by:
1. **Promoting** the ad-hoc helper to a proper, full service port at `lib/services/roman-numerals-service.js` (matching the real PHP source's directory structure).
2. **Adding** the second method (`romanNumeralsToNumber()`) that was out of scope in task 11.
3. **Updating** the import path in `lib/date/french.js` (the only caller) to point at the new canonical location.
4. **Deleting** the temporary helper at `lib/date/roman-numerals.js` (no backwards-compatibility shims per codebase convention).

**File:** `app/Services/RomanNumeralsService.php`
**Namespace:** `Fisharebest\Webtrees\Services`
**Scope of this task:** both methods — `numberToRomanNumerals()`, `romanNumeralsToNumber()`

## Source (current PHP)

```php
<?php
namespace Fisharebest\Webtrees\Services;
use function str_starts_with;
use function strlen;
use function substr;

class RomanNumeralsService
{
    private const array ROMAN_NUMERALS = [
        1000 => 'M', 900 => 'CM', 500 => 'D', 400 => 'CD', 100 => 'C', 90 => 'XC',
        50 => 'L', 40 => 'XL', 10 => 'X', 9 => 'IX', 5 => 'V', 4 => 'IV', 1 => 'I',
    ];

    public function numberToRomanNumerals(int $number): string
    {
        if ($number < 1) {
            return (string) $number;
        }
        $roman = '';
        foreach (self::ROMAN_NUMERALS as $key => $value) {
            while ($number >= $key) {
                $roman  .= $value;
                $number -= $key;
            }
        }
        return $roman;
    }

    public function romanNumeralsToNumber(string $roman): int
    {
        $num = 0;
        foreach (self::ROMAN_NUMERALS as $key => $value) {
            while (str_starts_with($roman, $value)) {
                $num += $key;
                $roman = substr($roman, strlen($value));
            }
        }
        return $num;
    }
}
```

## Notes

### `numberToRomanNumerals(int $number): string`

- Numbers less than 1 are cast to string and returned as-is (e.g., 0 → `"0"`, -5 → `"'5"`).
- There is no upper bound enforced — the algorithm will represent arbitrarily large numbers by repeating 'M' (e.g., 4000 → `"MMMM"`, 4888 → `"MMMMDCCCLXXXVIII"`). This is not a limitation, just how the greedy algorithm works.
- `numberToRomanNumerals()` is already tested in task 11's parity suite (via `FrenchDate::formatLongYear()` calls). Exposing it as a standalone export in the new service confirms it's identical.

### `romanNumeralsToNumber(string $roman): int`

This method's behavior is deliberately non-validating — **this is not a bug, it's the actual PHP behavior**. Key behaviors:

- **Greedy, case-sensitive:** The algorithm iterates through `ROMAN_NUMERALS` in descending order and greedily strips recognized chunks from the front of the input. `str_starts_with()` is case-sensitive — lowercase `"mcmxciv"` will not match `"MCMXCIV"` and produces 0.
- **Non-canonical input accepted:** `"IIII"` (non-canonical form for 4) is accepted and correctly parsed as 4 (four I's). `"VX"` (syntactically invalid; V cannot precede X in standard Roman numerals) is accepted and parsed as 5 (V is recognized, then X doesn't follow anything it recognizes, so it stops).
- **Trailing garbage ignored:** `"XIVfoo"` is parsed as 14 (XIV matched and consumed, then "foo" doesn't match anything, so iteration stops and returns 14 without error).
- **Empty string:** Returns 0 (no chunks matched, accumulator stays 0).

This non-validating behavior is **not** a flaw — it's a design choice reflected in the PHP source. The method does exactly what it says: greedily consume recognized Roman numeral chunks and return their sum, ignoring anything it doesn't recognize.

## Phase 1 — Characterization test

`bin/characterize_roman_numerals_service.php`:

```php
<?php
require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Services\RomanNumeralsService;

$service = new RomanNumeralsService();

$numberToRoman_cases = [
    0, -5, -1,                        // edge cases
    1, 4, 9, 40, 90, 400, 900,       // key subtraction pairs
    3888,                             // multiple repeated symbols
    3999,                             // traditional max
    4000, 4888,                       // beyond "max" (no upper bound)
];

$romanToNumber_cases = [
    '',                   // empty
    'I', 'III', 'IV', 'IX', 'MCMXCIV',  // well-formed
    'IIII',               // non-canonical (4x I)
    'VX',                 // invalid syntax
    'mcmxciv',            // lowercase (case-sensitive)
    'XIV', 'XIVfoo',      // with trailing garbage
    'XYZ123',             // mostly garbage
];

// Generate golden data with round-trip verification for valid inputs...
```

Verified PHP behaviors (actual, not assumed):
- `numberToRomanNumerals(0)` → `"0"` (string cast, not converted)
- `numberToRomanNumerals(-5)` → `"-5"` (string cast, not converted)
- `numberToRomanNumerals(4000)` → `"MMMM"` (no upper bound, just repeats M)
- `romanNumeralsToNumber("IIII")` → `4` (greedy, accepts non-canonical)
- `romanNumeralsToNumber("VX")` → `5` (stops when unrecognized, V already consumed)
- `romanNumeralsToNumber("mcmxciv")` → `0` (case-sensitive, no match)
- `romanNumeralsToNumber("XIVfoo")` → `14` (ignores trailing "foo")
- Round-trip `numberToRomanNumerals(n)` → `romanNumeralsToNumber(roman)` ✓ 12/12 tested values

## Phase 2 — Parity test

`js-tests/parity_roman_numerals_service.test.js` — three test suites:

1. **`numberToRomanNumerals` parity:** 14 cases (0, negatives, all key values, 3888, 3999, 4000, 4888).
2. **`romanNumeralsToNumber` parity:** 12 cases (empty, valid, non-canonical, case-sensitivity, garbage/trailing, round-trip confirmation).
3. **Round-trip tests:** 12 verified successes (values tested in both directions to confirm symmetry where it should exist).

Run `npx vitest run` — all must pass.

Also verify that `parity_date_french_hijri_jalali_jewish.test.js` still passes (it imports `FrenchDate` which now imports from the new service location) — its existing test cases for `FrenchDate::formatLongYear()` indirectly test the service.

## Definition of done

- [x] `golden/roman_numerals_service.json` generated from the real PHP class — 14 `numberToRomanNumerals` cases, 12 `romanNumeralsToNumber` cases, 12 round-trip cases.
- [x] `lib/services/roman-numerals-service.js` created, exports both `numberToRomanNumerals(number)` and `romanNumeralsToNumber(roman)` as named exports. Array-of-`[key, value]`-pairs table preserved (not converted to a plain object) with documented rationale.
- [x] `lib/date/roman-numerals.js` deleted (no backwards-compatibility shim).
- [x] `lib/date/french.js` import path updated (line 25) to point to `../services/roman-numerals-service.js`.
- [x] `js-tests/parity_roman_numerals_service.test.js` created with 3 test suites (38 total tests for the service).
- [x] `npx vitest run` passes 100% (883/883 tests across the full suite, including existing `parity_date_french_hijri_jalali_jewish.test.js` which indirectly exercises the service).
- [x] `docs/php-to-js-migration/task-11-calendar-french-hijri-jalali-jewish.md` updated with a note that the ad-hoc helper was promoted to this service in task 14.
- [x] `docs/php-to-js-migration/phase4-cutover-tracking.md` updated: added `lib/services` row (or extended existing one, if parallel GedcomService task created it).

## Recorded behaviors (not assumed, verified via real PHP execution)

| Input/Case | Method | PHP Output | Notes |
|---|---|---|---|
| 0 | `numberToRomanNumerals` | `"0"` | String cast of integer < 1 |
| -5 | `numberToRomanNumerals` | `"-5"` | String cast of integer < 1 |
| 4000 | `numberToRomanNumerals` | `"MMMM"` | No upper bound, just repeats M |
| "" | `romanNumeralsToNumber` | `0` | Empty string, no matches |
| "IIII" | `romanNumeralsToNumber` | `4` | Non-canonical form accepted |
| "VX" | `romanNumeralsToNumber` | `5` | Invalid syntax accepted; stops at unrecognized |
| "mcmxciv" | `romanNumeralsToNumber` | `0` | Lowercase case-sensitive, no match |
| "XIVfoo" | `romanNumeralsToNumber` | `14` | Trailing garbage ignored silently |
| 1994 ↔ "MCMXCIV" | Round-trip | Success | All 12 tested values round-trip correctly |
