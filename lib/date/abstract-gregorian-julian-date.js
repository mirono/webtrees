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

// Port of app/Date/AbstractGregorianJulianDate.php.
// See docs/php-to-js-migration/task-08-gregorian-julian-date.md.
//
// Under the default (untranslated, en-US-sourced) i18n, all 5 grammatical
// cases produce the SAME text for a given month (e.g. 'February' for
// NOMINATIVE/GENITIVE/LOCATIVE/INSTRUMENTAL alike) — English's source
// strings don't distinguish case. This does NOT mean the case-selection
// logic in AbstractCalendarDate.format() is unverified: it's exercised
// and produces the right *translateContext call*, just with visually
// identical output under this locale. Confirmed directly against real
// PHP output (I18N::init('en-US', true)), not assumed.

import { AbstractCalendarDate } from './abstract-calendar-date.js';

const MONTH_ABBREVIATIONS = {
  '': 0,
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const MONTH_TO_NUMBER = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
};

const NUMBER_TO_MONTH = {
  1: 'JAN',
  2: 'FEB',
  3: 'MAR',
  4: 'APR',
  5: 'MAY',
  6: 'JUN',
  7: 'JUL',
  8: 'AUG',
  9: 'SEP',
  10: 'OCT',
  11: 'NOV',
  12: 'DEC',
};

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ABBR_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export class AbstractGregorianJulianDate extends AbstractCalendarDate {
  // Declared for parity with the PHP source — confirmed unused there too
  // (grep found no references anywhere in app/Date/), kept only because
  // it's part of the class's declared surface.
  static MONTH_ABBREVIATIONS = MONTH_ABBREVIATIONS;

  static MONTH_TO_NUMBER = MONTH_TO_NUMBER;

  static NUMBER_TO_MONTH = NUMBER_TO_MONTH;

  /**
   * Full month name in nominative case.
   *
   * We put these in the base class, to save duplicating it in the Julian and Gregorian calendars.
   */
  // eslint-disable-next-line no-unused-vars
  monthNameNominativeCase(month, leapYear) {
    if (month === 0) {
      return '';
    }

    return this.i18n.translateContext('NOMINATIVE', MONTH_NAMES[month]);
  }

  /**
   * Full month name in genitive case.
   */
  // eslint-disable-next-line no-unused-vars
  monthNameGenitiveCase(month, leapYear) {
    if (month === 0) {
      return '';
    }

    return this.i18n.translateContext('GENITIVE', MONTH_NAMES[month]);
  }

  /**
   * Full month name in locative case.
   */
  // eslint-disable-next-line no-unused-vars
  monthNameLocativeCase(month, leapYear) {
    if (month === 0) {
      return '';
    }

    return this.i18n.translateContext('LOCATIVE', MONTH_NAMES[month]);
  }

  /**
   * Full month name in instrumental case.
   */
  // eslint-disable-next-line no-unused-vars
  monthNameInstrumentalCase(month, leapYear) {
    if (month === 0) {
      return '';
    }

    return this.i18n.translateContext('INSTRUMENTAL', MONTH_NAMES[month]);
  }

  /**
   * Abbreviated month name
   */
  // eslint-disable-next-line no-unused-vars
  monthNameAbbreviated(month, leapYear) {
    if (month === 0) {
      return '';
    }

    return this.i18n.translateContext(`Abbreviation for ${MONTH_NAMES[month]}`, MONTH_ABBR_NAMES[month]);
  }
}
