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

// Port of vendor/fisharebest/ext-calendar/src/FrenchCalendar.php.
// See docs/php-to-js-migration/task-09-calendar-french-arabic-persian.md.
//
// daysInMonth() throws for year <= 0 (not year === 0 like JulianCalendar —
// verified directly, do not generalize). jdStart()/jdEnd() are fixed real
// bounds (the French Republican calendar only existed 1792-1805), not an
// "unbounded" sentinel — no Number.MAX_SAFE_INTEGER adaptation needed
// here. No easterDays() on this class.

export class FrenchCalendar {
  daysInMonth(year, month) {
    if (year <= 0) {
      throw new Error(`Year ${year} is invalid for this calendar`);
    }

    if (month < 1 || month > 13) {
      throw new Error(`Month ${month} is invalid for this calendar`);
    }

    if (month !== 13) {
      return 30;
    }

    if (this.isLeapYear(year)) {
      return 6;
    }

    return 5;
  }

  daysInWeek() {
    return 10;
  }

  gedcomCalendarEscape() {
    return '@#DFRENCH R@';
  }

  /**
   * Leap years were based on astronomical observations. Only years 3, 7
   * and 11 were ever observed. Moves to a gregorian-like (fixed) system
   * were proposed but never implemented.
   */
  isLeapYear(year) {
    return year % 4 === 3;
  }

  jdEnd() {
    return 2380687; // 31 DEC 1805 = 10 NIVO 0014
  }

  jdStart() {
    return 2375840; // 22 SEP 1792 = 01 VEND 0001
  }

  jdToYmd(julianDay) {
    const year = Math.trunc(((julianDay - 2375109) * 4) / 1461) - 1;
    const month = Math.trunc((julianDay - 2375475 - year * 365 - Math.trunc(year / 4)) / 30) + 1;
    const day = julianDay - 2375444 - month * 30 - year * 365 - Math.trunc(year / 4);

    return [year, month, day];
  }

  monthsInYear(_year = null) {
    return 13;
  }

  ymdToJd(year, month, day) {
    if (month < 1 || month > this.monthsInYear()) {
      throw new Error(`Month ${month} is invalid for this calendar`);
    }

    return 2375444 + day + month * 30 + year * 365 + Math.trunc(year / 4);
  }
}
