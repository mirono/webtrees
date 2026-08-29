/**
 * webtrees: online genealogy
 * Copyright (C) 2026 webtrees development team
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

// Port of vendor/fisharebest/ext-calendar/src/PersianCalendar.php (Jalali).
// See docs/php-to-js-migration/task-09-calendar-french-arabic-persian.md.
//
// Two different truncation styles appear in the PHP source, and mixing
// them up would be a real bug (confirmed distinct behavior for negative
// operands in task 07): `(int) floor(a / b)` rounds toward negative
// infinity -> Math.floor(); plain `(int) (a / b)` truncates toward zero
// -> Math.trunc(). Each occurrence below was ported individually by
// reading the PHP source line, not pattern-matched by eye.
//
// jdToYmd() does NOT correctly support negative years — confirmed
// directly against real PHP output: ymdToJd(-1, 1, 1) followed by
// jdToYmd() of that same day returns year 0, not -1 (doesn't round-trip).
// The PHP source documents this itself: "If we allowed negative years, we
// would deal with them here." This is a known, pre-existing limitation of
// the source, faithfully reproduced here, not fixed.

const LEAP_YEAR_CYCLE = [0, 5, 9, 13, 17, 21, 25, 29, 34, 38, 42, 46, 50, 54, 58, 62, 67, 71, 75, 79, 83, 87, 91, 95, 100, 104, 108, 112, 116, 120, 124];

export class PersianCalendar {
  daysInMonth(year, month) {
    if (month <= 6) {
      return 31;
    }

    if (month <= 11 || this.isLeapYear(year)) {
      return 30;
    }

    return 29;
  }

  daysInWeek() {
    return 7;
  }

  gedcomCalendarEscape() {
    return '@#DJALALI@';
  }

  isLeapYear(year) {
    // Plain % twice, NOT the mod() helper below — confirmed against the
    // PHP source, which doesn't call mod() here at all. PHP's % and JS's
    // % have identical sign semantics (task 08), so this is a direct,
    // faithful translation, not a simplification.
    return LEAP_YEAR_CYCLE.includes(((year + 2346) % 2820) % 128);
  }

  jdEnd() {
    return Number.MAX_SAFE_INTEGER;
  }

  jdStart() {
    return 1948321; // 1 Farvardin 0001 AP, 19 MAR 0622 AD
  }

  jdToYmd(julianDay) {
    const depoch = julianDay - 2121446; // 1 Farvardin 475
    const cycle = Math.floor(depoch / 1029983);
    const cyear = this.mod(depoch, 1029983);
    let ycycle;
    if (cyear === 1029982) {
      ycycle = 2820;
    } else {
      const aux1 = Math.trunc(cyear / 366);
      const aux2 = cyear % 366;
      ycycle = Math.trunc((2134 * aux1 + 2816 * aux2 + 2815) / 1028522) + aux1 + 1;
    }
    const year = ycycle + 2820 * cycle + 474;

    // If we allowed negative years, we would deal with them here.
    const yday = julianDay - this.ymdToJd(year, 1, 1) + 1;
    const month = yday <= 186 ? Math.ceil(yday / 31) : Math.ceil((yday - 6) / 30);
    const day = julianDay - this.ymdToJd(year, month, 1) + 1;

    return [Math.trunc(year), Math.trunc(month), Math.trunc(day)];
  }

  monthsInYear(_year = null) {
    return 12;
  }

  ymdToJd(year, month, day) {
    if (month < 1 || month > this.monthsInYear()) {
      throw new Error(`Month ${month} is invalid for this calendar`);
    }

    const epbase = year - (year >= 0 ? 474 : 473);
    const epyear = 474 + this.mod(epbase, 2820);

    return (
      day +
      (month <= 7 ? (month - 1) * 31 : (month - 1) * 30 + 6) +
      Math.trunc((epyear * 682 - 110) / 2816) +
      (epyear - 1) * 365 +
      Math.floor(epbase / 2820) * 1029983 +
      this.jdStart() -
      1
    );
  }

  /**
   * The PHP modulus function returns a negative modulus for a negative
   * dividend (confirmed identical in JS, task 08). This algorithm
   * requires a "traditional" modulus function where the modulus is
   * always positive.
   *
   * `+ 0` at the end is a real, verified fix, not defensive padding: JS's
   * `%` can produce -0 (e.g. -2820 % 2820 === -0), which PHP's integer %
   * never does (PHP has no negative-zero integer) — and `-0 < 0` is
   * `false` in JS, so the fix-up below never normalizes it. `+ 0` folds
   * -0 back to +0, matching PHP's actual `int(0)` output for this case.
   */
  mod(dividend, divisor) {
    if (divisor === 0) {
      return 0;
    }

    let modulus = dividend % divisor;
    if (modulus < 0) {
      modulus += divisor;
    }

    return modulus + 0;
  }
}
