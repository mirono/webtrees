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

// Port of app/Date/JewishDate.php.
// See docs/php-to-js-migration/task-11-calendar-french-hijri-jalali-jewish.md.
//
// formatDay()/formatShortYear()/formatLongYear() check the active
// locale's script via the injected i18n.scriptCode (PHP:
// I18N::locale()->script()->code() === 'Hebr') and delegate to
// JewishCalendar.numberToHebrewNumerals() when the script is Hebrew.
// The PHP source calls `(new JewishCalendar())->numberToHebrewNumerals()`
// — a fresh instance each time, rather than `$this->calendar`. Ported as
// `this.calendar.numberToHebrewNumerals()` instead: behaviorally
// identical, since numberToHebrewNumerals() doesn't depend on the
// EMULATE_BUG_54254 constructor option (the only thing a fresh instance
// could differ on), and this.calendar is always a JewishCalendar here.

import { AbstractCalendarDate } from './abstract-calendar-date.js';
import { JewishCalendar } from '../ext-calendar/jewish.js';

const MONTH_TO_NUMBER = {
  TSH: 1,
  CSH: 2,
  KSL: 3,
  TVT: 4,
  SHV: 5,
  ADR: 6,
  ADS: 7,
  NSN: 8,
  IYR: 9,
  SVN: 10,
  TMZ: 11,
  AAV: 12,
  ELL: 13,
};

const NUMBER_TO_MONTH = {
  1: 'TSH',
  2: 'CSH',
  3: 'KSL',
  4: 'TVT',
  5: 'SHV',
  6: 'ADR',
  7: 'ADS',
  8: 'NSN',
  9: 'IYR',
  10: 'SVN',
  11: 'TMZ',
  12: 'AAV',
  13: 'ELL',
};

const HEBREW_SCRIPT = 'Hebr';

export class JewishDate extends AbstractCalendarDate {
  static ESCAPE = '@#DHEBREW@';

  static MONTH_TO_NUMBER = MONTH_TO_NUMBER;

  static NUMBER_TO_MONTH = NUMBER_TO_MONTH;

  /**
   * @param {number|Array<string>|AbstractCalendarDate} date
   * @param {{i18n?: object, now?: () => number}} [options]
   */
  constructor(date, options = {}) {
    super(date, new JewishCalendar(), options);
  }

  /**
   * Generate the %j format for a date.
   */
  formatDay() {
    if (this.i18n.scriptCode === HEBREW_SCRIPT) {
      return this.calendar.numberToHebrewNumerals(this.day, true);
    }

    return super.formatDay();
  }

  /**
   * Generate the %y format for a date.
   *
   * NOTE Short year is NOT a 2-digit year. It is for calendars such as
   * Hebrew which have a 3-digit form of 4-digit years.
   */
  formatShortYear() {
    if (this.i18n.scriptCode === HEBREW_SCRIPT) {
      return this.calendar.numberToHebrewNumerals(this.year, false);
    }

    // Faithful to the PHP source: this branch calls the parent's
    // formatLongYear(), not formatShortYear() — same quirk as the
    // original (verified by reading app/Date/JewishDate.php).
    return super.formatLongYear();
  }

  /**
   * Generate the %Y format for a date.
   */
  formatLongYear() {
    if (this.i18n.scriptCode === HEBREW_SCRIPT) {
      return this.calendar.numberToHebrewNumerals(this.year, true);
    }

    return super.formatLongYear();
  }

  monthNameNominativeCase(month, leapYear) {
    if (month === 7 && leapYear) {
      return this.i18n.translateContext('NOMINATIVE', 'Adar II');
    }

    const names = {
      0: '',
      1: this.i18n.translateContext('NOMINATIVE', 'Tishrei'),
      2: this.i18n.translateContext('NOMINATIVE', 'Heshvan'),
      3: this.i18n.translateContext('NOMINATIVE', 'Kislev'),
      4: this.i18n.translateContext('NOMINATIVE', 'Tevet'),
      5: this.i18n.translateContext('NOMINATIVE', 'Shevat'),
      6: this.i18n.translateContext('NOMINATIVE', 'Adar I'),
      7: this.i18n.translateContext('NOMINATIVE', 'Adar'),
      8: this.i18n.translateContext('NOMINATIVE', 'Nissan'),
      9: this.i18n.translateContext('NOMINATIVE', 'Iyar'),
      10: this.i18n.translateContext('NOMINATIVE', 'Sivan'),
      11: this.i18n.translateContext('NOMINATIVE', 'Tamuz'),
      12: this.i18n.translateContext('NOMINATIVE', 'Av'),
      13: this.i18n.translateContext('NOMINATIVE', 'Elul'),
    };

    return names[month];
  }

  monthNameGenitiveCase(month, leapYear) {
    if (month === 7 && leapYear) {
      return this.i18n.translateContext('GENITIVE', 'Adar II');
    }

    const names = {
      0: '',
      1: this.i18n.translateContext('GENITIVE', 'Tishrei'),
      2: this.i18n.translateContext('GENITIVE', 'Heshvan'),
      3: this.i18n.translateContext('GENITIVE', 'Kislev'),
      4: this.i18n.translateContext('GENITIVE', 'Tevet'),
      5: this.i18n.translateContext('GENITIVE', 'Shevat'),
      6: this.i18n.translateContext('GENITIVE', 'Adar I'),
      7: this.i18n.translateContext('GENITIVE', 'Adar'),
      8: this.i18n.translateContext('GENITIVE', 'Nissan'),
      9: this.i18n.translateContext('GENITIVE', 'Iyar'),
      10: this.i18n.translateContext('GENITIVE', 'Sivan'),
      11: this.i18n.translateContext('GENITIVE', 'Tamuz'),
      12: this.i18n.translateContext('GENITIVE', 'Av'),
      13: this.i18n.translateContext('GENITIVE', 'Elul'),
    };

    return names[month];
  }

  monthNameLocativeCase(month, leapYear) {
    if (month === 7 && leapYear) {
      return this.i18n.translateContext('LOCATIVE', 'Adar II');
    }

    const names = {
      0: '',
      1: this.i18n.translateContext('LOCATIVE', 'Tishrei'),
      2: this.i18n.translateContext('LOCATIVE', 'Heshvan'),
      3: this.i18n.translateContext('LOCATIVE', 'Kislev'),
      4: this.i18n.translateContext('LOCATIVE', 'Tevet'),
      5: this.i18n.translateContext('LOCATIVE', 'Shevat'),
      6: this.i18n.translateContext('LOCATIVE', 'Adar I'),
      7: this.i18n.translateContext('LOCATIVE', 'Adar'),
      8: this.i18n.translateContext('LOCATIVE', 'Nissan'),
      9: this.i18n.translateContext('LOCATIVE', 'Iyar'),
      10: this.i18n.translateContext('LOCATIVE', 'Sivan'),
      11: this.i18n.translateContext('LOCATIVE', 'Tamuz'),
      12: this.i18n.translateContext('LOCATIVE', 'Av'),
      13: this.i18n.translateContext('LOCATIVE', 'Elul'),
    };

    return names[month];
  }

  monthNameInstrumentalCase(month, leapYear) {
    if (month === 7 && leapYear) {
      return this.i18n.translateContext('INSTRUMENTAL', 'Adar II');
    }

    const names = {
      0: '',
      1: this.i18n.translateContext('INSTRUMENTAL', 'Tishrei'),
      2: this.i18n.translateContext('INSTRUMENTAL', 'Heshvan'),
      3: this.i18n.translateContext('INSTRUMENTAL', 'Kislev'),
      4: this.i18n.translateContext('INSTRUMENTAL', 'Tevet'),
      5: this.i18n.translateContext('INSTRUMENTAL', 'Shevat'),
      6: this.i18n.translateContext('INSTRUMENTAL', 'Adar I'),
      7: this.i18n.translateContext('INSTRUMENTAL', 'Adar'),
      8: this.i18n.translateContext('INSTRUMENTAL', 'Nissan'),
      9: this.i18n.translateContext('INSTRUMENTAL', 'Iyar'),
      10: this.i18n.translateContext('INSTRUMENTAL', 'Sivan'),
      11: this.i18n.translateContext('INSTRUMENTAL', 'Tamuz'),
      12: this.i18n.translateContext('INSTRUMENTAL', 'Av'),
      13: this.i18n.translateContext('INSTRUMENTAL', 'Elul'),
    };

    return names[month];
  }

  monthNameAbbreviated(month, leapYear) {
    return this.monthNameNominativeCase(month, leapYear);
  }

  /**
   * Which month follows this one? Adar I (month 6) in a non-leap year
   * skips straight to Nissan (month 8) — there's no Adar II to fall
   * through to. In practice this branch is unreachable via normal GEDCOM
   * construction (AbstractCalendarDate's array-construction branch
   * already remaps ADR -> month 7 for non-leap years before nextMonth()
   * is ever called), but ported faithfully anyway since it's real logic
   * in the PHP source, not dead weight introduced by this port.
   */
  nextMonth() {
    if (this.month === 6 && !this.isLeapYear()) {
      return [this.year, 8];
    }

    return [this.year + (this.month === 13 ? 1 : 0), (this.month % 13) + 1];
  }
}
