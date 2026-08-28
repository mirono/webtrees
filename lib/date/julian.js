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

// Port of app/Date/JulianDate.php.
//
// `new_old_style` is PHP instance state, set as a side effect of
// extractYear() during construction, later read by formatLongYear()/
// formatGedcomYear(). NOT declared as a JS class field with a default
// value here — a class field initializer on a subclass runs AFTER
// super() returns, but extractYear() (called via virtual dispatch DURING
// super()'s execution, from AbstractCalendarDate's array-construction
// branch) needs to set it before that. A field default of `false` would
// silently overwrite whatever extractYear() just set. Instead,
// extractYear() below sets `this.newOldStyle` explicitly on every path
// that runs (verified: PHP's extractYear() is likewise only ever called
// once, from the array-construction branch — never on JD-number or
// cross-calendar-conversion construction, where `this.newOldStyle` stays
// `undefined`, which is falsy exactly like PHP's unset default `false`).

import { AbstractGregorianJulianDate } from './abstract-gregorian-julian-date.js';
import { JulianCalendar } from '../ext-calendar/julian.js';

function phpIntCast(value) {
  const match = String(value).match(/^\s*[-+]?\d+/);

  return match ? parseInt(match[0], 10) : 0;
}

export class JulianDate extends AbstractGregorianJulianDate {
  static ESCAPE = '@#DJULIAN@';

  /**
   * @param {number|Array<string>|import('./abstract-calendar-date.js').AbstractCalendarDate} date
   * @param {{i18n?: object, now?: () => number}} [options]
   */
  constructor(date, options = {}) {
    super(date, new JulianCalendar(), options);
  }

  /**
   * Most years are 1 more than the previous, but not always (e.g. 1BC->1AD)
   */
  nextYear(year) {
    if (year === -1) {
      return 1;
    }

    return year + 1;
  }

  /**
   * Process new-style/old-style years and years BC
   */
  extractYear(year) {
    const oldStyleMatch = String(year).match(/^(\d\d\d\d)\/\d{1,4}$/);
    if (oldStyleMatch) {
      // Assume the first year is correct
      this.newOldStyle = true;

      return phpIntCast(oldStyleMatch[1]) + 1;
    }
    this.newOldStyle = false;

    const bcMatch = String(year).match(/^(\d+) B\.C\.$/);
    if (bcMatch) {
      return -phpIntCast(bcMatch[1]);
    }

    return phpIntCast(year);
  }

  /**
   * Generate the %Y format for a date.
   */
  formatLongYear() {
    if (this.year < 0) {
      // I18N: BCE=Before the Common Era, for Julian years < 0. See https://en.wikipedia.org/wiki/Common_Era
      return this.i18n.translate('%s&nbsp;BCE', this.i18n.digits(-this.year));
    }

    if (this.newOldStyle) {
      return this.i18n.translate('%s&nbsp;CE', this.i18n.digits(`${this.year - 1}/${String(this.year % 100).padStart(2, '0')}`));
    }

    // I18N: CE=Common Era, for Julian years > 0. See https://en.wikipedia.org/wiki/Common_Era
    return this.i18n.translate('%s&nbsp;CE', this.i18n.digits(this.year));
  }

  /**
   * Generate the %E format for a date.
   */
  formatGedcomYear() {
    if (this.year < 0) {
      return `${String(-this.year).padStart(4, '0')} B.C.`;
    }

    if (this.newOldStyle) {
      return `${String(this.year - 1).padStart(4, '0')}/${String(this.year % 100).padStart(2, '0')}`;
    }

    return String(this.year).padStart(4, '0');
  }
}
