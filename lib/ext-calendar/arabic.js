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

// Port of vendor/fisharebest/ext-calendar/src/ArabicCalendar.php (Hijri).
// See docs/php-to-js-migration/task-09-calendar-french-arabic-persian.md.
//
// daysInMonth() has NO validity checks at all — confirmed by reading the
// full PHP method body, no InvalidArgumentException for any year/month,
// unlike every other calendar ported so far. Do not add a check that
// isn't in the source. jdEnd() is PHP_INT_MAX -> Number.MAX_SAFE_INTEGER
// (same adaptation as task 07). No easterDays().

export class ArabicCalendar {
  daysInMonth(year, month) {
    if (month === 2) {
      return 28;
    }

    if (month % 2 === 1 || (month === 12 && this.isLeapYear(year))) {
      return 30;
    }

    return 29;
  }

  daysInWeek() {
    return 7;
  }

  gedcomCalendarEscape() {
    return '@#DHIJRI@';
  }

  isLeapYear(year) {
    return (11 * year + 14) % 30 < 11;
  }

  jdEnd() {
    return Number.MAX_SAFE_INTEGER;
  }

  jdStart() {
    return 1948440; // 1 Muharram 1 AH, 16 July 622 AD
  }

  jdToYmd(julianDay) {
    const year = Math.trunc((30 * (julianDay - 1948440) + 10646) / 10631);
    const month = Math.trunc((11 * (julianDay - year * 354 - Math.trunc((3 + 11 * year) / 30) - 1948086) + 330) / 325);
    const day = julianDay - 29 * (month - 1) - Math.trunc((6 * month - 1) / 11) - year * 354 - Math.trunc((3 + 11 * year) / 30) - 1948085;

    return [year, month, day];
  }

  monthsInYear(_year = null) {
    return 12;
  }

  ymdToJd(year, month, day) {
    if (month < 1 || month > this.monthsInYear()) {
      throw new Error(`Month ${month} is invalid for this calendar`);
    }

    return day + 29 * (month - 1) + Math.trunc((6 * month - 1) / 11) + year * 354 + Math.trunc((3 + 11 * year) / 30) + 1948085;
  }
}
