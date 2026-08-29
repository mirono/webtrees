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

// Port of vendor/fisharebest/ext-calendar/src/JewishCalendar.php.
// See docs/php-to-js-migration/task-10-calendar-jewish.md.
//
// SCOPE: only what app/Date/JewishDate.php actually uses — the full
// CalendarInterface contract plus numberToHebrewNumerals() (UTF-8). The
// ISO-8859-8 numeral variants, jdToHebrew(), hebrewMonthName(s)() are
// confirmed unused anywhere in webtrees (grepped every call site) and are
// deliberately NOT ported — ~250 lines of the PHP source that would be
// speculative to translate now. See the task doc if a future caller needs
// them.
//
// TWO TRAPS, both verified against real PHP output before porting:
// 1. numberToNumerals()'s lookup table is iterated in a specific greedy
//    largest-value-first order (400, 300, ..., 20, 19, 18, 17, 16, 15,
//    10, ...) — note 15-19 are hardcoded ahead of 10 specifically so 15
//    renders as the 9+6 combination instead of 10+5, which would spell
//    part of a divine name. A plain JS object does NOT preserve this
//    order for integer-like keys (confirmed:
//    Object.keys({20:'a',19:'b',15:'c',1:'d'}) returns them sorted
//    ascending, not in declaration order) — HEBREW_NUMERALS_UTF8 below is
//    an array of [key, value] pairs, iterated with for...of, never a
//    plain object.
// 2. numberToHebrewNumerals()'s branching on `strlen($hebrew) === 2` /
//    `> 2` counts UTF-8 BYTES (2 bytes per Hebrew character). JS strings
//    are UTF-16-code-unit indexed and every character here is a single
//    BMP code point, so the character-counting equivalent is
//    `hebrew.length === 1` / `> 1`, with `.slice(0, -1)`/`.slice(-1)`
//    replacing PHP's `substr(..., -2)`-style byte slicing. Verified
//    against real PHP output for 1-, 2-, and 3-character results.

const FIXED_MONTH_LENGTHS = { 1: 30, 4: 29, 5: 30, 7: 29, 8: 30, 9: 29, 10: 30, 11: 29, 12: 30, 13: 29 };

const DEFECTIVE_YEAR = -1;
const REGULAR_YEAR = 0;
const COMPLETE_YEAR = 1;

// First index: 0 (non-leap) | 1 (leap). Second index: year type. Third: month.
const CUMULATIVE_DAYS = {
  0: {
    [DEFECTIVE_YEAR]: { 1: 0, 2: 30, 3: 59, 4: 88, 5: 117, 6: 147, 7: 147, 8: 176, 9: 206, 10: 235, 11: 265, 12: 294, 13: 324 },
    [REGULAR_YEAR]: { 1: 0, 2: 30, 3: 59, 4: 89, 5: 118, 6: 148, 7: 148, 8: 177, 9: 207, 10: 236, 11: 266, 12: 295, 13: 325 },
    [COMPLETE_YEAR]: { 1: 0, 2: 30, 3: 60, 4: 90, 5: 119, 6: 149, 7: 149, 8: 178, 9: 208, 10: 237, 11: 267, 12: 296, 13: 326 },
  },
  1: {
    [DEFECTIVE_YEAR]: { 1: 0, 2: 30, 3: 59, 4: 88, 5: 117, 6: 147, 7: 177, 8: 206, 9: 236, 10: 265, 11: 295, 12: 324, 13: 354 },
    [REGULAR_YEAR]: { 1: 0, 2: 30, 3: 59, 4: 89, 5: 118, 6: 148, 7: 178, 8: 207, 9: 237, 10: 266, 11: 296, 12: 325, 13: 355 },
    [COMPLETE_YEAR]: { 1: 0, 2: 30, 3: 60, 4: 90, 5: 119, 6: 149, 7: 179, 8: 208, 9: 238, 10: 267, 11: 297, 12: 326, 13: 356 },
  },
};

// Rosh Hashanah cannot fall on a Sunday, Wednesday or Friday. Move the year start accordingly.
const ROSH_HASHANAH = [347998, 347997, 347997, 347998, 347997, 347998, 347997];

const GERESH = '׳'; // ׳
const GERSHAYIM = '״'; // ״
const ALAFIM = 'אלפים'; // אלפים

// CRITICAL: array of [key, value] pairs, NOT a plain object — see trap #1
// in the file header. Order is the greedy-largest-first table.
const HEBREW_NUMERALS_UTF8 = [
  [400, 'ת'],
  [300, 'ש'],
  [200, 'ר'],
  [100, 'ק'],
  [90, 'צ'],
  [80, 'פ'],
  [70, 'ע'],
  [60, 'ס'],
  [50, 'נ'],
  [40, 'מ'],
  [30, 'ל'],
  [20, 'כ'],
  [19, 'יט'],
  [18, 'יח'],
  [17, 'יז'],
  [16, 'טז'],
  [15, 'טו'],
  [10, 'י'],
  [9, 'ט'],
  [8, 'ח'],
  [7, 'ז'],
  [6, 'ו'],
  [5, 'ה'],
  [4, 'ד'],
  [3, 'ג'],
  [2, 'ב'],
  [1, 'א'],
];

// Some letters have a different final form, used at the end of a word.
const FINAL_FORMS_UTF8 = {
  'כ': 'ך', // כ -> ך
  'מ': 'ם', // מ -> ם
  'נ': 'ן', // נ -> ן
  'פ': 'ף', // פ -> ף
  'צ': 'ץ', // צ -> ץ
};

export class JewishCalendar {
  /**
   * @param {{EMULATE_BUG_54254?: boolean}} [options]
   */
  constructor(options = {}) {
    this.options = { EMULATE_BUG_54254: false, ...options };
  }

  daysInMonth(year, month) {
    if (year < 1) {
      throw new Error(`Year ${year} is invalid for this calendar`);
    }

    if (month < 1 || month > 13) {
      throw new Error(`Month ${month} is invalid for this calendar`);
    }

    if (month === 2) {
      return this.daysInMonthHeshvan(year);
    }

    if (month === 3) {
      return this.daysInMonthKislev(year);
    }

    if (month === 6) {
      return this.daysInMonthAdarI(year);
    }

    return FIXED_MONTH_LENGTHS[month];
  }

  daysInWeek() {
    return 7;
  }

  gedcomCalendarEscape() {
    return '@#DHEBREW@';
  }

  isLeapYear(year) {
    return (7 * year + 1) % 19 < 7;
  }

  jdEnd() {
    return Number.MAX_SAFE_INTEGER;
  }

  jdStart() {
    return 347998; // 1 Tishri 0001 AM
  }

  /**
   * Convert a Julian day number into a year.
   */
  jdToY(julianDay) {
    // Estimate the year, and underestimate it, it will be refined after
    let year = Math.max(Math.trunc(((julianDay - 347998) * 98496) / 35975351) - 1, 1);

    // Adjust by adding years;
    while (julianDay >= this.yToJd(year + 1)) {
      year++;
    }

    return year;
  }

  jdToYmd(julianDay) {
    // Find the year, by adding one month at a time to use up the remaining days.
    const year = this.jdToY(julianDay);
    let month = 1;
    let day = julianDay - this.yToJd(year) + 1;

    while (day > this.daysInMonth(year, month)) {
      day -= this.daysInMonth(year, month);
      month++;
    }

    // PHP 5.4 and earlier converted non leap-year Adar into month 6, instead of month 7.
    month -= month === 7 && this.options.EMULATE_BUG_54254 && !this.isLeapYear(year) ? 1 : 0;

    return [year, month, day];
  }

  monthsInYear(year = null) {
    if (year !== null && !this.isLeapYear(year)) {
      return 12;
    }

    return 13;
  }

  /**
   * Calculate the Julian Day number of the first day in a year.
   */
  yToJd(year) {
    const div19 = Math.trunc((year - 1) / 19);
    const mod19 = (year - 1) % 19;

    const months = 235 * div19 + 12 * mod19 + Math.trunc((7 * mod19 + 1) / 19);
    const parts = 204 + 793 * (months % 1080);
    const hours = 5 + 12 * months + 793 * Math.trunc(months / 1080) + Math.trunc(parts / 1080);
    const conjunction = 1080 * (hours % 24) + (parts % 1080);
    let julianDay = 1 + 29 * months + Math.trunc(hours / 24);

    if (
      conjunction >= 19440 ||
      (julianDay % 7 === 2 && conjunction >= 9924 && !this.isLeapYear(year)) ||
      (julianDay % 7 === 1 && conjunction >= 16789 && this.isLeapYear(year - 1))
    ) {
      julianDay++;
    }

    // The actual year start depends on the day of the week
    return julianDay + ROSH_HASHANAH[julianDay % 7];
  }

  ymdToJd(year, month, day) {
    return this.yToJd(year) + CUMULATIVE_DAYS[this.isLeapYear(year) ? 1 : 0][this.yearType(year)][month] + day - 1;
  }

  /**
   * Determine whether a year is normal, defective or complete.
   *
   * @return {-1|0|1} defective (-1), normal (0) or complete (1)
   */
  yearType(year) {
    const yearLength = this.yToJd(year + 1) - this.yToJd(year);

    if (yearLength === 353 || yearLength === 383) {
      return DEFECTIVE_YEAR;
    }

    if (yearLength === 355 || yearLength === 385) {
      return COMPLETE_YEAR;
    }

    return REGULAR_YEAR;
  }

  /**
   * Calculate the number of days in Heshvan.
   */
  daysInMonthHeshvan(year) {
    if (this.yearType(year) === COMPLETE_YEAR) {
      return 30;
    }

    return 29;
  }

  /**
   * Calculate the number of days in Kislev.
   */
  daysInMonthKislev(year) {
    if (this.yearType(year) === DEFECTIVE_YEAR) {
      return 29;
    }

    return 30;
  }

  /**
   * Calculate the number of days in Adar I.
   */
  daysInMonthAdarI(year) {
    if (this.isLeapYear(year)) {
      return 30;
    }

    return 0;
  }

  /**
   * Convert a number into a string, in the style of roman numerals.
   *
   * @param {number} number
   * @param {Array<[number, string]>} numerals Ordered [value, symbol] pairs, largest first.
   */
  numberToNumerals(number, numerals) {
    let string = '';

    while (number > 0) {
      for (const [n, t] of numerals) {
        if (number >= n) {
          string += t;
          number -= n;
          break;
        }
      }
    }

    return string;
  }

  /**
   * Convert a number into Hebrew numerals using UTF-8.
   *
   * @param {number} number
   * @param {boolean} showThousands
   */
  numberToHebrewNumerals(number, showThousands) {
    // Years (e.g. "5782") may be written without the thousands (e.g. just "782"),
    // but since there is no zero, the number 5000 must be written as "5 thousand"
    let thousands;
    if (showThousands || number % 1000 === 0) {
      thousands = Math.trunc(number / 1000);
    } else {
      thousands = 0;
    }
    number %= 1000;

    let hebrew = this.numberToNumerals(number, HEBREW_NUMERALS_UTF8);

    // One Hebrew character (PHP: "two bytes per UTF8 character" -> strlen === 2)
    if (hebrew.length === 1) {
      // Append a geresh after single-digit
      hebrew += GERESH;
    } else if (hebrew.length > 1) {
      // Some letters have a "final" form, when used at the end of a word.
      const lastChar = hebrew.slice(-1);
      hebrew = hebrew.slice(0, -1) + (FINAL_FORMS_UTF8[lastChar] ?? lastChar);
      // Insert a gershayim before the final letter
      hebrew = hebrew.slice(0, -1) + GERSHAYIM + hebrew.slice(-1);
    }

    if (thousands) {
      if (hebrew) {
        hebrew = this.numberToHebrewNumerals(thousands, showThousands) + hebrew;
      } else {
        hebrew = this.numberToHebrewNumerals(thousands, showThousands) + ' ' + ALAFIM;
      }
    }

    return hebrew;
  }

  // jdToHebrew(), hebrewMonthName(s)(), numberToHebrewNumeralsIso8859(),
  // yearToHebrewNumerals(), addGereshayim(), and the ISO-8859-8 numerals
  // table are deliberately NOT ported — confirmed unused anywhere in
  // webtrees (see the task doc). Port them if a future caller needs them.
}
