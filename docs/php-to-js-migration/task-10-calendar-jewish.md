# Task 10 — Port `JewishCalendar`

**Priority:** 10 (task 06's sequencing step 3, last of the 6
`ext-calendar` classes — deliberately saved for last given its size)
**Complexity:** High (647 lines; a lunar-solar calendar with real
algorithmic intricacy — molad/Rosh Hashanah postponement rules, variable
month lengths depending on year type; plus a byte-vs-character encoding
trap in the Hebrew-numeral formatting)
**Status:** Done

---

## Scope: NOT the whole 647-line file

Grepped every call site in `app/` first. `app/Date/JewishDate.php` (the
only consumer) uses exactly: the full `CalendarInterface` contract
(`daysInMonth`, `daysInWeek`, `gedcomCalendarEscape`, `isLeapYear`,
`jdEnd`, `jdStart`, `jdToYmd`, `monthsInYear`, `ymdToJd`) plus one extra
public method, `numberToHebrewNumerals()` (the UTF-8 variant, called from
`formatDay()`/`formatShortYear()`/`formatLongYear()` when the active
locale's script is Hebrew).

**Confirmed entirely unused anywhere in `app/`** (grepped for each name
individually, zero hits outside this file itself):
`jdToHebrew()`, `hebrewMonthName()`, `hebrewMonthNames()`,
`numberToHebrewNumeralsIso8859()`, `yearToHebrewNumerals()`,
`addGereshayim()`, and the entire ISO-8859-8 numerals table
(`HEBREW_NUMERALS_ISO8859_8`, `GERESH_ISO8859`, `GERSHAYIM_ISO8859`,
`ALAFIM_ISO8859`). This is roughly 250 lines — a large fraction of the
file — that's genuine dead code from webtrees' own perspective (likely
retained in `fisharebest/ext-calendar` for the package's standalone users,
or as an old PHP `ext/calendar` compatibility surface).

**Deliberately excluded from this port**, same category of decision as
task 08's `calendarUrl()` exclusion: documented here, not silently
dropped. If a future caller needs the ISO-8859-8 variants, port them then
— porting 250 lines of currently-unreachable code now would be pure
speculation.

**Included**, beyond the bare `CalendarInterface` contract: the
constructor's `options` mechanism (`EMULATE_BUG_54254`, default `false`)
— webtrees never passes `true`, but the option *does* affect
`jdToYmd()`'s core behavior (see below), which is in scope, so the
mechanism has to exist even though its non-default value is never
exercised in practice.

## Verified behaviors (not assumed)

- **`jdToYmd(year, month=6)` returns `0` days for month 6 (Adar I) in a
  non-leap year** — confirmed directly: year 5783 (non-leap) month 6 →
  `0`. Month 6 nominally "exists" in the interface (`daysInMonth` doesn't
  throw for it) but is a zero-length placeholder outside leap years —
  don't treat a `0` result as an error case to special-case away.
- **`EMULATE_BUG_54254` genuinely changes `jdToYmd()`'s output** —
  confirmed directly: for a non-leap year, the same Julian day resolves to
  month 7 normally but month 6 with the option enabled (PHP 5.4 and
  earlier's behavior, being deliberately emulatable). Ported faithfully as
  a constructor option, defaulting to `false` (unused by webtrees, but a
  real behavioral switch, not dead code, since it's part of the in-scope
  `jdToYmd()` contract method).
- **Round-trips verified** across several representative Julian days
  (including `jdStart()` itself, and a leap year) — `jdToYmd()` →
  `ymdToJd()` returns the identical input.
- **`isLeapYear()`/`monthsInYear()`** verified across a full 19-year cycle
  (years 5780-5799): leap years fall at the expected 3rd/6th/8th/11th/
  14th/17th/19th positions of the Metonic cycle, `monthsInYear()` correctly
  returns 13 only for leap years.

## The critical trap: `numberToHebrewNumerals()`'s byte-counting logic

```php
$hebrew = $this->numberToNumerals($number, self::$HEBREW_NUMERALS_UTF8);

// Two bytes per UTF8 character
if (strlen($hebrew) === 2) {
    $hebrew .= self::GERESH;
} elseif (strlen($hebrew) > 2) {
    $hebrew = substr($hebrew, 0, -2) . strtr(substr($hebrew, -2), self::$FINAL_FORMS_UTF8);
    $hebrew = substr_replace($hebrew, self::GERSHAYIM, -2, 0);
}
```

PHP's `strlen()` counts **bytes**; every Hebrew letter here is a 2-byte
UTF-8 sequence, so `strlen($hebrew) === 2` means "exactly one Hebrew
character" and the `substr(..., -2)`/`substr_replace(..., -2, 0)` calls
operate on "the last character" via its 2-byte width. JS strings are
UTF-16-code-unit indexed, and every character here is a single BMP
code point (Hebrew is U+05D0-U+05EA, well within the BMP) — so the
**character-counting equivalent** is `hebrew.length === 1` /
`hebrew.length > 1`, and `.slice(0, -1)`/`.slice(-1)` for "all but the
last character"/"the last character". Ported using JS character
semantics throughout, not a byte-counting reimplementation — verified
against real PHP output for numbers spanning 1, 2, and 3-Hebrew-character
results (see golden fixture) to confirm the translation is exact, not
just plausible.

## An even more critical trap: table iteration order

`numberToNumerals()` greedily picks the *largest applicable* value from
an ordered table (400, 300, 200, ..., 20, **19, 18, 17, 16, 15**, 10, 9,
..., 1 — note 15-19 are hardcoded *before* 10, specifically so 15 renders
as "ט״ו" (9+6) instead of the two-letter combination that would spell part
of a divine name in Hebrew tradition, per Jewish convention). **PHP
preserves array declaration order; a plain JS object does NOT** for
integer-like keys — confirmed directly:
`Object.keys({400:'a', 20:'b', 19:'c', 16:'d', 15:'e', 1:'f'})` returns
them sorted **ascending** (`1, 15, 16, 19, 20, 400`), silently destroying
the greedy-largest-first algorithm (16 would decompose as 10+6 instead of
using its dedicated entry). Ported as an **array of `[key, value]` pairs**
(iterated with a plain `for...of`), never a plain object, for both
`HEBREW_NUMERALS_UTF8` and (if ever added later) the ISO-8859-8 table.

## Phase 1 — Characterization approach

No I18N/DB bootstrap needed (same as every other `ext-calendar` class).
`bin/characterize_calendar_jewish.php` covers: `jdToYmd`/`ymdToJd`
round-trips (including `jdStart()`, a leap year, a non-leap year),
`isLeapYear`/`monthsInYear` across a full 19-year Metonic cycle,
`daysInMonth` for every month of both a leap and non-leap year (including
month 6's `0`-days case and the exception paths), the `EMULATE_BUG_54254`
option's effect on `jdToYmd()`, and `numberToHebrewNumerals()` across
numbers chosen to exercise every branch: single-digit (1 char), the
15-19 special range, an exact multiple of 20/100/400, a 3-character
result needing the final-form substitution (613 → "תרי״ג"), a year in the
5000s with `showThousands=true` vs `false` (5784, 5000 exactly, 5001).

## Definition of done

- [x] `golden/calendar_jewish.json` generated from the real PHP class
      (4 `jdToYmd`/`ymdToJd` round-trips, 20 `isLeapYear`/`monthsInYear`
      cases across a full 19-year Metonic cycle, 29 `daysInMonth` cases,
      2 `EMULATE_BUG_54254` cases, 17 `numberToHebrewNumerals` cases).
- [x] `lib/ext-calendar/jewish.js` exports `JewishCalendar` matching the
      full `CalendarInterface` contract, the `options`/`EMULATE_BUG_54254`
      constructor mechanism, and `numberToHebrewNumerals()` — not the
      ISO-8859-8 legacy surface (documented exclusion above).
- [x] The Hebrew-numerals table is an ordered array of pairs, not a plain
      object — verified this matters (not just defensively coded) by
      confirming `Object.keys()` reorders integer-like keys, and
      double-checked every constant (`GERESH`, `GERSHAYIM`, `ALAFIM`, all
      27 numeral entries, all 5 final-form substitutions) byte-for-byte
      against a PHP reflection dump, not eyeballed — visually-similar
      Hebrew punctuation marks are easy to transcribe wrong.
- [x] Byte-counting (`strlen`/`substr`) is translated to JS character
      semantics (`.length`/`.slice`), verified against real PHP output for
      1-, 2-, and 3-character Hebrew numeral results (`golden.byteLength`
      recorded alongside each case specifically to make the trap visible).
- [x] Parity tests pass 100% (98/98 —
      `js-tests/parity_calendar_jewish.test.js`), including the
      `EMULATE_BUG_54254` behavioral difference and the
      month-6-in-non-leap-year zero-days case. All passed on the first
      run — the upfront empirical verification (byte-level constant
      checking, confirming the object-key-reordering risk, tracing the
      `EMULATE_BUG_54254` effect) caught everything before code was
      written, rather than after.
- [x] Recorded in the Phase 4 cutover table — `lib/ext-calendar` now has
      all 6 calendars, completing that cluster. Not bridged — same
      reasoning as tasks 7 and 9.
