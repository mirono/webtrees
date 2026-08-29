# Task 09 — Port `FrenchCalendar` / `ArabicCalendar` / `PersianCalendar`

**Priority:** 9 (task 06's sequencing step 3)
**Complexity:** Medium (three independent, unrelated classes — no shared
inheritance like task 07's Julian/Gregorian pair — batched together
because each is small and "the same shape": implement `CalendarInterface`,
characterize, port, done)
**Status:** Done

---

## Scope

`vendor/fisharebest/ext-calendar/src/FrenchCalendar.php` (177 lines),
`ArabicCalendar.php` (147 lines), `PersianCalendar.php` (204 lines).
Corresponds to `app/Date/FrenchDate.php`, `HijriDate.php`, `JalaliDate.php`
respectively (confirmed by grep — each `app/Date/*Date.php` instantiates
exactly one of these). `JewishCalendar` (647 lines) is deliberately
excluded — task 06 flagged it as "last" given its size, and that still
holds; it gets its own task.

Unlike task 07, these three don't extend each other or share a base
class — each independently `implements CalendarInterface`. Batched into
one task anyway (matching the SurnameTradition-subclasses precedent) since
they're small, structurally identical in shape, and each was fully
characterized and verified independently below — this isn't skipping
verification for speed, each gets its own golden fixture section.

## Per-calendar notes (verified, not assumed)

### FrenchCalendar (French Republican calendar)

- `daysInMonth()` throws for `year <= 0` — **not** `year === 0` like
  `JulianCalendar`. A different validity rule per calendar; don't
  generalize one calendar's exception condition onto another.
- `jdStart()`/`jdEnd()` are **fixed, real bounds**
  (2375840 / 2380687 — 22 Sep 1792 to 31 Dec 1805), not `PHP_INT_MAX` like
  Julian/Gregorian — the calendar only existed for a specific historical
  period. Ported as literal numbers, no `Number.MAX_SAFE_INTEGER`
  adaptation needed here (unlike task 07).
- No `easterDays()` method on this class at all.
- All divisions are `(int) (a / b)` (truncate-toward-zero) — `Math.trunc()`,
  same convention as task 07's `Julian`/`GregorianCalendar`.

### ArabicCalendar (Hijri calendar)

- `daysInMonth()` has **no validity checks at all** — no
  `InvalidArgumentException` for any year/month, unlike every other
  calendar ported so far. Confirmed by reading the full method body: it's
  pure arithmetic (odd/even month parity + leap-year check), no guard
  clauses. Don't add a check that isn't in the source.
- `jdEnd()` is `PHP_INT_MAX` (→ `Number.MAX_SAFE_INTEGER`, same adaptation
  as task 07).
- No `easterDays()`.

### PersianCalendar (Jalali calendar)

- Has its own **public** `mod($dividend, $divisor)` helper — PHP's `%`
  returns a negative result for a negative dividend (confirmed identical
  in JS in task 08); this method's docblock says as much and works around
  it by adding the divisor back when negative. Ported directly — the same
  fix-up JS needs, so no adaptation required, just a faithful copy.
- **Two different truncation styles appear in the same method
  (`jdToYmd()`/`ymdToJd()`), and mixing them up would be a real bug**:
  `(int) floor($depoch / 1029983)` and `(int) (floor($epbase / 2820)) * 1029983`
  use `floor()` (round toward **negative infinity**) — `Math.floor()`.
  Everywhere else, plain `(int) (a / b)` truncates toward zero —
  `Math.trunc()`, same as every other calendar so far. These are NOT
  interchangeable for negative operands (confirmed in task 07). Verified
  each occurrence individually while porting, not pattern-matched by eye.
- `jdToYmd()`'s `$month` is computed with `ceil()`, which returns a PHP
  float — but `ceil()` always returns a *whole-valued* number, so using it
  in later integer-context arithmetic and comparisons doesn't introduce
  the kind of fractional-precision divergence found in task 07's
  `easterDays()` bug (verified: unlike `(int)(x*8)/25` , which can produce
  a genuinely fractional value, `ceil()`'s output has no fractional part
  to lose). `Math.ceil()` is a direct, safe equivalent.
- **`jdToYmd()` does not correctly support negative years** — confirmed
  directly: `ymdToJd(-1, 1, 1)` computes a Julian day, but `jdToYmd()` of
  that same JD returns year `0`, not `-1` (doesn't round-trip). The source
  itself documents this: `// If we allowed negative years, we would deal
  with them here.` This is a **known, pre-existing limitation of the PHP
  source**, not something to fix or improve — the JS port reproduces the
  exact same non-round-tripping behavior for negative years, faithfully
  broken in the same way. `ymdToJd()` for other negative years (e.g. -100)
  throws `Month -11 is invalid for this calendar` — a confusing error
  message that's a side effect of the same limitation, also reproduced
  as-is.

## Phase 1 — Characterization approach

Same technique as task 07: no I18N/DB bootstrap needed, these are pure
calendar-math classes. One combined `bin/characterize_calendar_french_arabic_persian.php`
producing per-calendar sections in one golden file, covering: `jdToYmd`/
`ymdToJd` round-trips across a representative date range (including each
calendar's own `jdStart()` boundary), `isLeapYear` across enough years to
exercise each calendar's distinct leap-year rule (French: `year % 4 == 3`;
Arabic: the 30-year/11-leap-year cycle; Persian: the 2820-year/128-year
grand cycle), `daysInMonth` (including French's `year <= 0` exception and
Arabic's total absence of one), the `constants`
(`daysInWeek`/`monthsInYear`/`gedcomCalendarEscape`/`jdStart`), and
Persian's `mod()` helper directly (including the negative-dividend case
its docblock exists to handle).

## Phase 2 — Port prompt

Port each calendar as its own file
(`lib/ext-calendar/french.js`/`arabic.js`/`persian.js`), each
`implements`-equivalent to the same shape as `lib/ext-calendar/julian.js`
(task 07) — no shared base class needed, they're independent. Hand the
LLM the three per-calendar notes above explicitly (the `daysInMonth`
validity-check differences, the `floor()`-vs-`(int)` distinction in
Persian specifically, and the negative-year limitation) — do not let it
assume the three calendars share validation rules just because they share
an interface.

## Definition of done

- [x] `golden/calendar_french.json`, `golden/calendar_arabic.json`,
      `golden/calendar_persian.json` generated from the real PHP classes.
- [x] `lib/ext-calendar/french.js`, `arabic.js`, `persian.js` export
      `FrenchCalendar`, `ArabicCalendar`, `PersianCalendar` matching the
      full `CalendarInterface` contract (`daysInMonth`, `daysInWeek`,
      `gedcomCalendarEscape`, `isLeapYear`, `jdEnd`, `jdStart`, `jdToYmd`,
      `monthsInYear`, `ymdToJd`), plus `PersianCalendar.mod()`.
- [x] Parity tests pass 100% (70/70 —
      `js-tests/parity_calendar_french_arabic_persian.test.js`), including
      French's `year <= 0` exception, Arabic's total lack of
      `daysInMonth` validation, and Persian's `floor()` vs `(int)`
      truncation distinction and negative-year non-round-trip behavior.
      One genuine JS-specific artifact found and fixed by the test suite
      itself: `-2820 % 2820` produces `-0` in JS (PHP's integer `%` never
      does), and `-0 < 0` is `false` in JS, so `mod()`'s fix-up branch
      didn't normalize it — fixed with a verified `+ 0` at the return,
      confirmed to fold `-0` back to `+0` without affecting any other
      arithmetic (adding/multiplying `-0` behaves identically to `+0`
      everywhere except this exact direct-comparison case).
      Also caught my own mistake while porting `isLeapYear()`: initially
      routed it through the `mod()` helper, but the PHP source uses two
      plain `%` operations there, not `mod()` at all — fixed to match.
- [x] Recorded in the Phase 4 cutover table, extending the `lib/ext-calendar`
      row (5 of 6 calendars now ported — only `JewishCalendar` remains).
      Not bridged — same reasoning as task 07.
      Not bridged — same reasoning as task 07 (nothing in `app/Date.php`
      calls this port yet).
