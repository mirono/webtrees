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

// Port of app/Date/FrenchDate.php.
// See docs/php-to-js-migration/task-11-calendar-french-hijri-jalali-jewish.md.
//
// dayNamesAbbreviated() deliberately just calls dayNames() — the French
// republican calendar's 10-day week (decade) has no abbreviated day-name
// form, confirmed by reading the PHP source.

import { AbstractCalendarDate } from './abstract-calendar-date.js';
import { FrenchCalendar } from '../ext-calendar/french.js';
import { numberToRomanNumerals } from '../services/roman-numerals-service.js';

const MONTH_TO_NUMBER = {
  VEND: 1,
  BRUM: 2,
  FRIM: 3,
  NIVO: 4,
  PLUV: 5,
  VENT: 6,
  GERM: 7,
  FLOR: 8,
  PRAI: 9,
  MESS: 10,
  THER: 11,
  FRUC: 12,
  COMP: 13,
};

const NUMBER_TO_MONTH = {
  1: 'VEND',
  2: 'BRUM',
  3: 'FRIM',
  4: 'NIVO',
  5: 'PLUV',
  6: 'VENT',
  7: 'GERM',
  8: 'FLOR',
  9: 'PRAI',
  10: 'MESS',
  11: 'THER',
  12: 'FRUC',
  13: 'COMP',
};

export class FrenchDate extends AbstractCalendarDate {
  static ESCAPE = '@#DFRENCH R@';

  static MONTH_TO_NUMBER = MONTH_TO_NUMBER;

  static NUMBER_TO_MONTH = NUMBER_TO_MONTH;

  /**
   * @param {number|Array<string>|AbstractCalendarDate} date
   * @param {{i18n?: object, now?: () => number}} [options]
   */
  constructor(date, options = {}) {
    super(date, new FrenchCalendar(), options);
  }

  monthNameNominativeCase(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('NOMINATIVE', 'Vendemiaire'),
      2: this.i18n.translateContext('NOMINATIVE', 'Brumaire'),
      3: this.i18n.translateContext('NOMINATIVE', 'Frimaire'),
      4: this.i18n.translateContext('NOMINATIVE', 'Nivose'),
      5: this.i18n.translateContext('NOMINATIVE', 'Pluviose'),
      6: this.i18n.translateContext('NOMINATIVE', 'Ventose'),
      7: this.i18n.translateContext('NOMINATIVE', 'Germinal'),
      8: this.i18n.translateContext('NOMINATIVE', 'Floreal'),
      9: this.i18n.translateContext('NOMINATIVE', 'Prairial'),
      10: this.i18n.translateContext('NOMINATIVE', 'Messidor'),
      11: this.i18n.translateContext('NOMINATIVE', 'Thermidor'),
      12: this.i18n.translateContext('NOMINATIVE', 'Fructidor'),
      13: this.i18n.translateContext('NOMINATIVE', 'jours complementaires'),
    };

    return names[month];
  }

  monthNameGenitiveCase(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('GENITIVE', 'Vendemiaire'),
      2: this.i18n.translateContext('GENITIVE', 'Brumaire'),
      3: this.i18n.translateContext('GENITIVE', 'Frimaire'),
      4: this.i18n.translateContext('GENITIVE', 'Nivose'),
      5: this.i18n.translateContext('GENITIVE', 'Pluviose'),
      6: this.i18n.translateContext('GENITIVE', 'Ventose'),
      7: this.i18n.translateContext('GENITIVE', 'Germinal'),
      8: this.i18n.translateContext('GENITIVE', 'Floreal'),
      9: this.i18n.translateContext('GENITIVE', 'Prairial'),
      10: this.i18n.translateContext('GENITIVE', 'Messidor'),
      11: this.i18n.translateContext('GENITIVE', 'Thermidor'),
      12: this.i18n.translateContext('GENITIVE', 'Fructidor'),
      13: this.i18n.translateContext('GENITIVE', 'jours complementaires'),
    };

    return names[month];
  }

  monthNameLocativeCase(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('LOCATIVE', 'Vendemiaire'),
      2: this.i18n.translateContext('LOCATIVE', 'Brumaire'),
      3: this.i18n.translateContext('LOCATIVE', 'Frimaire'),
      4: this.i18n.translateContext('LOCATIVE', 'Nivose'),
      5: this.i18n.translateContext('LOCATIVE', 'Pluviose'),
      6: this.i18n.translateContext('LOCATIVE', 'Ventose'),
      7: this.i18n.translateContext('LOCATIVE', 'Germinal'),
      8: this.i18n.translateContext('LOCATIVE', 'Floreal'),
      9: this.i18n.translateContext('LOCATIVE', 'Prairial'),
      10: this.i18n.translateContext('LOCATIVE', 'Messidor'),
      11: this.i18n.translateContext('LOCATIVE', 'Thermidor'),
      12: this.i18n.translateContext('LOCATIVE', 'Fructidor'),
      13: this.i18n.translateContext('LOCATIVE', 'jours complementaires'),
    };

    return names[month];
  }

  monthNameInstrumentalCase(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('INSTRUMENTAL', 'Vendemiaire'),
      2: this.i18n.translateContext('INSTRUMENTAL', 'Brumaire'),
      3: this.i18n.translateContext('INSTRUMENTAL', 'Frimaire'),
      4: this.i18n.translateContext('INSTRUMENTAL', 'Nivose'),
      5: this.i18n.translateContext('INSTRUMENTAL', 'Pluviose'),
      6: this.i18n.translateContext('INSTRUMENTAL', 'Ventose'),
      7: this.i18n.translateContext('INSTRUMENTAL', 'Germinal'),
      8: this.i18n.translateContext('INSTRUMENTAL', 'Floreal'),
      9: this.i18n.translateContext('INSTRUMENTAL', 'Prairial'),
      10: this.i18n.translateContext('INSTRUMENTAL', 'Messidor'),
      11: this.i18n.translateContext('INSTRUMENTAL', 'Thermidor'),
      12: this.i18n.translateContext('INSTRUMENTAL', 'Fructidor'),
      13: this.i18n.translateContext('INSTRUMENTAL', 'jours complementaires'),
    };

    return names[month];
  }

  monthNameAbbreviated(month, leapYear) {
    return this.monthNameNominativeCase(month, leapYear);
  }

  /**
   * Full day of the week
   */
  dayNames(dayNumber) {
    const names = [
      this.i18n.translate('Primidi'),
      this.i18n.translate('Duodi'),
      this.i18n.translate('Tridi'),
      this.i18n.translate('Quartidi'),
      this.i18n.translate('Quintidi'),
      this.i18n.translate('Sextidi'),
      this.i18n.translate('Septidi'),
      this.i18n.translate('Octidi'),
      this.i18n.translate('Nonidi'),
      this.i18n.translate('Decidi'),
    ];

    return names[dayNumber];
  }

  /**
   * Abbreviated day of the week
   */
  dayNamesAbbreviated(dayNumber) {
    return this.dayNames(dayNumber);
  }

  /**
   * Generate the %Y format for a date.
   */
  formatLongYear() {
    return 'An ' + numberToRomanNumerals(this.year);
  }
}
