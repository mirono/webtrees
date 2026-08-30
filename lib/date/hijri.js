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

// Port of app/Date/HijriDate.php.
// See docs/php-to-js-migration/task-11-calendar-french-hijri-jalali-jewish.md.
//
// These are "theoretical" dates — "true" dates are based on local lunar
// observations and can be +/- one day (per the PHP source's own
// docblock). No day-name or year-format overrides — uses the base
// AbstractCalendarDate's Monday-Sunday day names and plain-digit year
// formatting unchanged.

import { AbstractCalendarDate } from './abstract-calendar-date.js';
import { ArabicCalendar } from '../ext-calendar/arabic.js';

const MONTH_TO_NUMBER = {
  MUHAR: 1,
  SAFAR: 2,
  RABIA: 3,
  RABIT: 4,
  JUMAA: 5,
  JUMAT: 6,
  RAJAB: 7,
  SHAAB: 8,
  RAMAD: 9,
  SHAWW: 10,
  DHUAQ: 11,
  DHUAH: 12,
};

const NUMBER_TO_MONTH = {
  1: 'MUHAR',
  2: 'SAFAR',
  3: 'RABIA',
  4: 'RABIT',
  5: 'JUMAA',
  6: 'JUMAT',
  7: 'RAJAB',
  8: 'SHAAB',
  9: 'RAMAD',
  10: 'SHAWW',
  11: 'DHUAQ',
  12: 'DHUAH',
};

export class HijriDate extends AbstractCalendarDate {
  static ESCAPE = '@#DHIJRI@';

  static MONTH_TO_NUMBER = MONTH_TO_NUMBER;

  static NUMBER_TO_MONTH = NUMBER_TO_MONTH;

  /**
   * @param {number|Array<string>|AbstractCalendarDate} date
   * @param {{i18n?: object, now?: () => number}} [options]
   */
  constructor(date, options = {}) {
    super(date, new ArabicCalendar(), options);
  }

  monthNameNominativeCase(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('NOMINATIVE', 'Muharram'),
      2: this.i18n.translateContext('NOMINATIVE', 'Safar'),
      3: this.i18n.translateContext('NOMINATIVE', 'Rabi’ al-awwal'),
      4: this.i18n.translateContext('NOMINATIVE', 'Rabi’ al-thani'),
      5: this.i18n.translateContext('NOMINATIVE', 'Jumada al-awwal'),
      6: this.i18n.translateContext('NOMINATIVE', 'Jumada al-thani'),
      7: this.i18n.translateContext('NOMINATIVE', 'Rajab'),
      8: this.i18n.translateContext('NOMINATIVE', 'Sha’aban'),
      9: this.i18n.translateContext('NOMINATIVE', 'Ramadan'),
      10: this.i18n.translateContext('NOMINATIVE', 'Shawwal'),
      11: this.i18n.translateContext('NOMINATIVE', 'Dhu al-Qi’dah'),
      12: this.i18n.translateContext('NOMINATIVE', 'Dhu al-Hijjah'),
    };

    return names[month];
  }

  monthNameGenitiveCase(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('GENITIVE', 'Muharram'),
      2: this.i18n.translateContext('GENITIVE', 'Safar'),
      3: this.i18n.translateContext('GENITIVE', 'Rabi’ al-awwal'),
      4: this.i18n.translateContext('GENITIVE', 'Rabi’ al-thani'),
      5: this.i18n.translateContext('GENITIVE', 'Jumada al-awwal'),
      6: this.i18n.translateContext('GENITIVE', 'Jumada al-thani'),
      7: this.i18n.translateContext('GENITIVE', 'Rajab'),
      8: this.i18n.translateContext('GENITIVE', 'Sha’aban'),
      9: this.i18n.translateContext('GENITIVE', 'Ramadan'),
      10: this.i18n.translateContext('GENITIVE', 'Shawwal'),
      11: this.i18n.translateContext('GENITIVE', 'Dhu al-Qi’dah'),
      12: this.i18n.translateContext('GENITIVE', 'Dhu al-Hijjah'),
    };

    return names[month];
  }

  monthNameLocativeCase(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('LOCATIVE', 'Muharram'),
      2: this.i18n.translateContext('LOCATIVE', 'Safar'),
      3: this.i18n.translateContext('LOCATIVE', 'Rabi’ al-awwal'),
      4: this.i18n.translateContext('LOCATIVE', 'Rabi’ al-thani'),
      5: this.i18n.translateContext('LOCATIVE', 'Jumada al-awwal'),
      6: this.i18n.translateContext('LOCATIVE', 'Jumada al-thani'),
      7: this.i18n.translateContext('LOCATIVE', 'Rajab'),
      8: this.i18n.translateContext('LOCATIVE', 'Sha’aban'),
      9: this.i18n.translateContext('LOCATIVE', 'Ramadan'),
      10: this.i18n.translateContext('LOCATIVE', 'Shawwal'),
      11: this.i18n.translateContext('LOCATIVE', 'Dhu al-Qi’dah'),
      12: this.i18n.translateContext('LOCATIVE', 'Dhu al-Hijjah'),
    };

    return names[month];
  }

  monthNameInstrumentalCase(month) {
    const names = {
      0: '',
      1: this.i18n.translateContext('INSTRUMENTAL', 'Muharram'),
      2: this.i18n.translateContext('INSTRUMENTAL', 'Safar'),
      3: this.i18n.translateContext('INSTRUMENTAL', 'Rabi’ al-awwal'),
      4: this.i18n.translateContext('INSTRUMENTAL', 'Rabi’ al-thani'),
      5: this.i18n.translateContext('INSTRUMENTAL', 'Jumada al-awwal'),
      6: this.i18n.translateContext('INSTRUMENTAL', 'Jumada al-thani'),
      7: this.i18n.translateContext('INSTRUMENTAL', 'Rajab'),
      8: this.i18n.translateContext('INSTRUMENTAL', 'Sha’aban'),
      9: this.i18n.translateContext('INSTRUMENTAL', 'Ramadan'),
      10: this.i18n.translateContext('INSTRUMENTAL', 'Shawwal'),
      11: this.i18n.translateContext('INSTRUMENTAL', 'Dhu al-Qi’dah'),
      12: this.i18n.translateContext('INSTRUMENTAL', 'Dhu al-Hijjah'),
    };

    return names[month];
  }

  monthNameAbbreviated(month, leapYear) {
    return this.monthNameNominativeCase(month, leapYear);
  }
}
