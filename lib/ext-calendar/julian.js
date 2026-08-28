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

// Port of vendor/fisharebest/ext-calendar/src/JulianCalendar.php.
// See docs/php-to-js-migration/task-07-calendar-julian-gregorian.md.
//
// PHP's `(int) (a / b)` always truncates toward zero. JS's Math.trunc()
// matches that exactly; Math.floor() does NOT (it rounds toward negative
// infinity) — verified directly, e.g. (int)(-7/2) === -3 in PHP,
// Math.trunc(-7/2) === -3, but Math.floor(-7/2) === -4. This matters here
// because these methods are routinely called with negative years/Julian
// days (BCE dates), where floor() would silently give wrong answers.
//
// jdEnd() returns PHP_INT_MAX in the source. JS has no native 64-bit
// integer matching that exactly without BigInt, which would be overkill
// for what's just an "effectively unbounded" range-check sentinel (see
// e.g. AbstractCalendarDate::isOK() in app/Date/). Number.MAX_SAFE_INTEGER
// serves the same purpose — deliberate adaptation, not a bug.

export class JulianCalendar {
  daysInMonth(year, month) {
    if (year === 0) {
      throw new Error(`Year ${year} is invalid for this calendar`);
    }

    if (month < 1 || month > 12) {
      throw new Error(`Month ${month} is invalid for this calendar`);
    }

    if (month === 1 || month === 3 || month === 5 || month === 7 || month === 8 || month === 10 || month === 12) {
      return 31;
    }

    if (month === 4 || month === 6 || month === 9 || month === 11) {
      return 30;
    }

    if (this.isLeapYear(year)) {
      return 29;
    }

    return 28;
  }

  daysInWeek() {
    return 7;
  }

  gedcomCalendarEscape() {
    return '@#DJULIAN@';
  }

  isLeapYear(year) {
    if (year < 0) {
      year++;
    }

    return year % 4 === 0;
  }

  jdEnd() {
    return Number.MAX_SAFE_INTEGER;
  }

  jdStart() {
    return 1;
  }

  jdToYmd(julianDay) {
    const c = julianDay + 32082;
    const d = Math.trunc((4 * c + 3) / 1461);
    const e = c - Math.trunc((1461 * d) / 4);
    const m = Math.trunc((5 * e + 2) / 153);

    const day = e - Math.trunc((153 * m + 2) / 5) + 1;
    const month = m + 3 - 12 * Math.trunc(m / 10);
    let year = d - 4800 + Math.trunc(m / 10);

    if (year < 1) {
      // 0 is 1 BCE, -1 is 2 BCE, etc.
      year--;
    }

    return [year, month, day];
  }

  monthsInYear(_year = null) {
    return 12;
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

    return day + Math.trunc((153 * month + 2) / 5) + 365 * year + Math.trunc(year / 4) - 32083;
  }

  /**
   * Get the number of days after March 21 that Easter falls, for a given
   * year. Uses the algorithm found in PHP's ext/calendar/easter.c.
   * No float-precision bug here (unlike GregorianCalendar's version) —
   * verified: this algorithm never introduces a non-integer intermediate.
   */
  easterDays(year) {
    // The "golden" number
    const golden = 1 + (year % 19);

    // The "dominical" number (finding a Sunday)
    let dom = (year + Math.trunc(year / 4) + 5) % 7;
    if (dom < 0) {
      dom += 7;
    }

    // The uncorrected "Paschal full moon" date
    let pfm = (3 - 11 * golden - 7) % 30;
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
