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

// Port of app/Date/RomanDate.php.
//
// "The 5.5.1 gedcom spec mentions this calendar, but gives no details of
// how it is to be represented.... This class is just a place holder so
// that webtrees won't complain if it receives one." — per the PHP
// source's own docblock. Trivially extends JulianDate, completely
// replacing (not extending) its BCE/old-style year formatting — matches
// the PHP source exactly, including that a negative/old-style Roman year
// would produce an odd-looking result (e.g. "-5AUC") since this class
// makes no attempt to handle those cases specially.

import { JulianDate } from './julian.js';

export class RomanDate extends JulianDate {
  static ESCAPE = '@#DROMAN@';

  /**
   * Generate the %E format for a date.
   */
  formatGedcomYear() {
    return `${String(this.year).padStart(4, '0')}AUC`;
  }

  /**
   * Generate the %Y format for a date.
   */
  formatLongYear() {
    return `${this.year}AUC`;
  }
}
