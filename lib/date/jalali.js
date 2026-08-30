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

// Port of app/Date/JalaliDate.php.
// See docs/php-to-js-migration/task-11-calendar-french-hijri-jalali-jewish.md.
//
// Unlike every other class in this task, monthNameAbbreviated() has its
// own distinct translated table here — NOT an alias of
// monthNameNominativeCase() — confirmed by reading the PHP source.

import { AbstractCalendarDate } from './abstract-calendar-date.js';
import { PersianCalendar } from '../ext-calendar/persian.js';

const MONTH_TO_NUMBER = {
  FARVA: 1,
  ORDIB: 2,
  KHORD: 3,
  TIR: 4,
  MORDA: 5,
  SHAHR: 6,
  MEHR: 7,
  ABAN: 8,
  AZAR: 9,
  DEY: 10,
  BAHMA: 11,
  ESFAN: 12,
};

const NUMBER_TO_MONTH = {
  1: 'FARVA',
  2: 'ORDIB',
  3: 'KHORD',
  4: 'TIR',
  5: 'MORDA',
  6: 'SHAHR',
  7: 'MEHR',
  8: 'ABAN',
  9: 'AZAR',
  10: 'DEY',
  11: 'BAHMA',
  12: 'ESFAN',
};

export class JalaliDate extends AbstractCalendarDate {
  static ESCAPE = '@#DJALALI@';

  static MONTH_TO_NUMBER = MONTH_TO_NUMBER;

  static NUMBER_TO_MONTH = NUMBER_TO_MONTH;

  /**
   * @param {number|Array<string>|AbstractCalendarDate} date
   * @param {{i18n?: object, now?: () => number}} [options]
   */
  constructor(date, options = {}) {
    super(date, new PersianCalendar(), options);
  }

  monthNameNominativeCase(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('NOMINATIVE', 'Farvardin'),
      2: this.i18n.translateContext('NOMINATIVE', 'Ordibehesht'),
      3: this.i18n.translateContext('NOMINATIVE', 'Khordad'),
      4: this.i18n.translateContext('NOMINATIVE', 'Tir'),
      5: this.i18n.translateContext('NOMINATIVE', 'Mordad'),
      6: this.i18n.translateContext('NOMINATIVE', 'Shahrivar'),
      7: this.i18n.translateContext('NOMINATIVE', 'Mehr'),
      8: this.i18n.translateContext('NOMINATIVE', 'Aban'),
      9: this.i18n.translateContext('NOMINATIVE', 'Azar'),
      10: this.i18n.translateContext('NOMINATIVE', 'Dey'),
      11: this.i18n.translateContext('NOMINATIVE', 'Bahman'),
      12: this.i18n.translateContext('NOMINATIVE', 'Esfand'),
    };

    return names[month];
  }

  monthNameGenitiveCase(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('GENITIVE', 'Farvardin'),
      2: this.i18n.translateContext('GENITIVE', 'Ordibehesht'),
      3: this.i18n.translateContext('GENITIVE', 'Khordad'),
      4: this.i18n.translateContext('GENITIVE', 'Tir'),
      5: this.i18n.translateContext('GENITIVE', 'Mordad'),
      6: this.i18n.translateContext('GENITIVE', 'Shahrivar'),
      7: this.i18n.translateContext('GENITIVE', 'Mehr'),
      8: this.i18n.translateContext('GENITIVE', 'Aban'),
      9: this.i18n.translateContext('GENITIVE', 'Azar'),
      10: this.i18n.translateContext('GENITIVE', 'Dey'),
      11: this.i18n.translateContext('GENITIVE', 'Bahman'),
      12: this.i18n.translateContext('GENITIVE', 'Esfand'),
    };

    return names[month];
  }

  monthNameLocativeCase(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('LOCATIVE', 'Farvardin'),
      2: this.i18n.translateContext('LOCATIVE', 'Ordibehesht'),
      3: this.i18n.translateContext('LOCATIVE', 'Khordad'),
      4: this.i18n.translateContext('LOCATIVE', 'Tir'),
      5: this.i18n.translateContext('LOCATIVE', 'Mordad'),
      6: this.i18n.translateContext('LOCATIVE', 'Shahrivar'),
      7: this.i18n.translateContext('LOCATIVE', 'Mehr'),
      8: this.i18n.translateContext('LOCATIVE', 'Aban'),
      9: this.i18n.translateContext('LOCATIVE', 'Azar'),
      10: this.i18n.translateContext('LOCATIVE', 'Dey'),
      11: this.i18n.translateContext('LOCATIVE', 'Bahman'),
      12: this.i18n.translateContext('LOCATIVE', 'Esfand'),
    };

    return names[month];
  }

  monthNameInstrumentalCase(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('INSTRUMENTAL', 'Farvardin'),
      2: this.i18n.translateContext('INSTRUMENTAL', 'Ordibehesht'),
      3: this.i18n.translateContext('INSTRUMENTAL', 'Khordad'),
      4: this.i18n.translateContext('INSTRUMENTAL', 'Tir'),
      5: this.i18n.translateContext('INSTRUMENTAL', 'Mordad'),
      6: this.i18n.translateContext('INSTRUMENTAL', 'Shahrivar'),
      7: this.i18n.translateContext('INSTRUMENTAL', 'Mehr'),
      8: this.i18n.translateContext('INSTRUMENTAL', 'Aban'),
      9: this.i18n.translateContext('INSTRUMENTAL', 'Azar'),
      10: this.i18n.translateContext('INSTRUMENTAL', 'Dey'),
      11: this.i18n.translateContext('INSTRUMENTAL', 'Bahman'),
      12: this.i18n.translateContext('INSTRUMENTAL', 'Esfand'),
    };

    return names[month];
  }

  monthNameAbbreviated(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('Abbreviation for Persian month: Farvardin', 'Far'),
      2: this.i18n.translateContext('Abbreviation for Persian month: Ordibehesht', 'Ord'),
      3: this.i18n.translateContext('Abbreviation for Persian month: Khordad', 'Khor'),
      4: this.i18n.translateContext('Abbreviation for Persian month: Tir', 'Tir'),
      5: this.i18n.translateContext('Abbreviation for Persian month: Mordad', 'Mor'),
      6: this.i18n.translateContext('Abbreviation for Persian month: Shahrivar', 'Shah'),
      7: this.i18n.translateContext('Abbreviation for Persian month: Mehr', 'Mehr'),
      8: this.i18n.translateContext('Abbreviation for Persian month: Aban', 'Aban'),
      9: this.i18n.translateContext('Abbreviation for Persian month: Azar', 'Azar'),
      10: this.i18n.translateContext('Abbreviation for Persian month: Dey', 'Dey'),
      11: this.i18n.translateContext('Abbreviation for Persian month: Bahman', 'Bah'),
      12: this.i18n.translateContext('Abbreviation for Persian month: Esfand', 'Esf'),
    };

    return names[month];
  }
}
