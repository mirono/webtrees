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

// Port of app/Date/GregorianDate.php.
// See docs/php-to-js-migration/task-08-gregorian-julian-date.md's
// bridging decision #1 for why `calendar` is now an explicit constructor
// parameter rather than set on `this` before `super()` (a JS-language
// constraint PHP doesn't have).

import { AbstractGregorianJulianDate } from './abstract-gregorian-julian-date.js';
import { GregorianCalendar } from '../ext-calendar/gregorian.js';

export class GregorianDate extends AbstractGregorianJulianDate {
  static ESCAPE = '@#DGREGORIAN@';

  /**
   * @param {number|Array<string>|import('./abstract-calendar-date.js').AbstractCalendarDate} date
   * @param {{i18n?: object, now?: () => number}} [options]
   */
  constructor(date, options = {}) {
    super(date, new GregorianCalendar(), options);
  }
}
