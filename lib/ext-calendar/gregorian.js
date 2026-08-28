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

// Port of vendor/fisharebest/ext-calendar/src/GregorianCalendar.php.
// See docs/php-to-js-migration/task-07-calendar-julian-gregorian.md and
// julian.js's header for the Math.trunc()/jdEnd() notes (both apply here
// too, since GregorianCalendar extends JulianCalendar in the PHP source
// and this class mirrors that with real JS `extends`).

import { JulianCalendar } from './julian.js';

export class GregorianCalendar extends JulianCalendar {
  gedcomCalendarEscape() {
    return '@#DGREGORIAN@';
  }

  isLeapYear(year) {
    if (year < 0) {
      year++;
    }

    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  jdToYmd(julianDay) {
    const a = julianDay + 32044;
    const b = Math.trunc((4 * a + 3) / 146097);
    const c = a - Math.trunc((b * 146097) / 4);
    const d = Math.trunc((4 * c + 3) / 1461);
    const e = c - Math.trunc((1461 * d) / 4);
    const m = Math.trunc((5 * e + 2) / 153);

    const day = e - Math.trunc((153 * m + 2) / 5) + 1;
    const month = m + 3 - 12 * Math.trunc(m / 10);
    let year = b * 100 + d - 4800 + Math.trunc(m / 10);

    if (year < 1) {
      // 0 is 1 BCE, -1 is 2 BCE, etc.
      year--;
    }

    return [year, month, day];
  }

  ymdToJd(year, month, day) {
    if (month < 1 || month > this.monthsInYear()) {
      throw new Error(`Month ${month} is invalid for this calendar`);
    }

    if (year < 0) {
      // 1 BCE is 0, 2 BCE is -1, etc.
      ++year;
    }

    const a = Math.trunc((14 - month) / 12);
    year = year + 4800 - a;
    month = month + 12 * a - 3;

    return (
      day +
      Math.trunc((153 * month + 2) / 5) +
      365 * year +
      Math.trunc(year / 4) -
      Math.trunc(year / 100) +
      Math.trunc(year / 400) -
      32045
    );
  }

  /**
   * Get the number of days after March 21 that Easter falls, for a given
   * year. Uses the algorithm found in PHP's ext/calendar/easter.c.
   *
   * DELIBERATE BUG REPRODUCTION, not a mistake: the PHP source has a
   * misplaced parenthesis — `(int) ((int) ((year-1400)/100) * 8) / 25` —
   * where the outer `(int)` cast wraps an expression that's already an
   * integer, and the `/ 25` division happens OUTSIDE any cast, leaving
   * `lunar` as a genuine floating-point value whenever the division isn't
   * exact. This is not a harmless technicality: swept easterDays() for
   * years 1000-3000 and found 52 of 2000 years produce a DIFFERENT result
   * than a "correctly" parenthesized version would (e.g. year 1016: buggy
   * → 11, "fixed" → would differ). Per this migration's "port faithfully,
   * don't improve" rule, `lunar` below is a genuine float, and — matching
   * PHP's documented behavior that %'s operand is cast to int only at the
   * point of the operation — only the whole `pfm` expression is truncated
   * (via Math.trunc), not `lunar` in isolation. Golden cases for 1016,
   * 1019, 1020 specifically exercise this.
   */
  easterDays(year) {
    // The "golden" number
    const golden = (year % 19) + 1;

    // The "dominical" number (finding a Sunday)
    let dom = (year + Math.trunc(year / 4) - Math.trunc(year / 100) + Math.trunc(year / 400)) % 7;
    if (dom < 0) {
      dom += 7;
    }

    // The solar correction
    const solar = Math.trunc((year - 1600) / 100) - Math.trunc((year - 1600) / 400);

    // The lunar correction — see the bug-reproduction note above; this
    // MUST stay a float, not Math.trunc()'d here.
    const lunar = (Math.trunc((year - 1400) / 100) * 8) / 25;

    // The uncorrected "Paschal full moon" date — PHP casts the whole
    // expression to int at the point of `%`, which is what Math.trunc()
    // here replicates (applied to the float-containing expression, not
    // to `lunar` beforehand).
    let pfm = Math.trunc(3 - 11 * golden + solar - lunar) % 30;
    if (pfm < 0) {
      pfm += 30;
    }

    // The corrected "Paschal full moon" date
    if (pfm === 29 || (pfm === 28 && golden > 11)) {
      pfm--;
    }

    let tmp = (4 - pfm - dom) % 7;
    if (tmp < 0) {
      tmp += 7;
    }

    return pfm + tmp + 1;
  }
}
