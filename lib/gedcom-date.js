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

// Port of app/Date.php (task 17) — the constructor (qualifier/range/text
// parsing) and every non-display method: minimumDate(), maximumDate(),
// minimumJulianDay(), maximumJulianDay(), julianDay(), addYears(), isOK(),
// gregorianYear(), and compare(). NOT ported: display(), renderLink(),
// __clone() (JS objects don't need PHP's manual deep-clone dance except
// where addYears() needs its own copy — handled inline there).
//
// Named GedcomDate, not Date, to avoid colliding with the JS built-in.
//
// With this + the task-11/12/13/15 ports, a full "parse two GEDCOM date
// strings and compute the age between them" pipeline now exists purely in
// JS. Age's shim contract (task 15) reads minimumDate/maximumDate/isOK as
// plain properties, not methods, so bridging the two needs a one-line
// adapter rather than passing GedcomDate instances directly:
//
//   const shim = (gd) => ({ minimumDate: gd.minimumDate(), maximumDate: gd.maximumDate(), isOK: gd.isOK() });
//   new Age(shim(new GedcomDate(a)), shim(new GedcomDate(b)));
//
// See lib/age.js and docs/php-to-js-migration/task-17-gedcom-date.md.

import { makeCalendarDate } from './factories/calendar-date-factory.js';
import { GregorianCalendar } from './ext-calendar/gregorian.js';
import { compareDates } from './date-compare.js';

const TEXT_RE = /^(.*) ?[(](.*)[)]/;
const RANGE_RE = /^(FROM|BET) (.+) (AND|TO) (.+)/;
const SINGLE_QUALIFIER_RE = /^(TO|FROM|BEF|AFT|CAL|EST|INT|ABT) (.+)/;

const GREGORIAN_CALENDAR = new GregorianCalendar();

/**
 * A representation of GEDCOM dates and date ranges (non-display subset).
 */
export class GedcomDate {
  /**
   * @param {string} date A date in GEDCOM format
   * @param {{i18n?: object, now?: () => number}} [options] passed through
   *   to every constructed calendar-date object.
   */
  constructor(date, options = {}) {
    this.qual1 = '';
    this.qual2 = '';
    this.text = '';
    this.date2 = null;
    this.options = options;

    // Extract any explanatory text
    const textMatch = date.match(TEXT_RE);
    if (textMatch) {
      date = textMatch[1];
      this.text = textMatch[2];
    }

    const rangeMatch = date.match(RANGE_RE);
    const singleMatch = date.match(SINGLE_QUALIFIER_RE);

    if (rangeMatch) {
      this.qual1 = rangeMatch[1];
      this.date1 = makeCalendarDate(rangeMatch[2], options);
      this.qual2 = rangeMatch[3];
      this.date2 = makeCalendarDate(rangeMatch[4], options);
    } else if (singleMatch) {
      this.qual1 = singleMatch[1];
      this.date1 = makeCalendarDate(singleMatch[2], options);
    } else {
      this.date1 = makeCalendarDate(date, options);
    }
  }

  /**
   * Get the earliest calendar date from this GEDCOM date.
   * In "FROM 1900 TO 1910", this would be 1900.
   */
  minimumDate() {
    return this.date1;
  }

  /**
   * Get the latest calendar date from this GEDCOM date.
   * In "FROM 1900 TO 1910", this would be 1910.
   */
  maximumDate() {
    return this.date2 ?? this.date1;
  }

  /**
   * Get the earliest Julian day number from this GEDCOM date.
   */
  minimumJulianDay() {
    return this.minimumDate().minimumJulianDay();
  }

  /**
   * Get the latest Julian day number from this GEDCOM date.
   */
  maximumJulianDay() {
    return this.maximumDate().maximumJulianDay();
  }

  /**
   * Get the middle Julian day number from the GEDCOM date.
   * For a month-only date, this would be somewhere around the 16th day.
   * For a year-only date, this would be somewhere around 1st July.
   */
  julianDay() {
    return Math.trunc((this.minimumJulianDay() + this.maximumJulianDay()) / 2);
  }

  /**
   * Offset this date by N years, and round to the whole year.
   *
   * Typically used to create an estimated death date, before a certain
   * number of years after the birth date.
   *
   * @param {number} years a number of years, positive or negative
   * @param {string} [qualifier] typically "BEF" or "AFT"
   */
  addYears(years, qualifier = '') {
    const tmp = Object.create(GedcomDate.prototype);
    tmp.options = this.options;
    // AbstractCalendarDate's constructor has a "construct from an
    // equivalent xxxxDate object" branch that copies year/month/day/
    // min-max-JulianDay — the same shallow copy PHP's `clone $this->date1`
    // does.
    tmp.date1 = new this.date1.constructor(this.date1, this.options);
    tmp.date1.year += years;
    tmp.date1.month = 0;
    tmp.date1.day = 0;
    tmp.date1.setJdFromYmd();
    tmp.qual1 = qualifier;
    tmp.qual2 = '';
    tmp.text = this.text;
    tmp.date2 = null;

    return tmp;
  }

  /**
   * Check whether a gedcom date contains usable calendar date(s).
   * An incomplete date such as "12 AUG" would be invalid, as we cannot
   * sort it.
   */
  isOK() {
    return this.minimumJulianDay() !== 0 && this.maximumJulianDay() !== 0;
  }

  /**
   * Calculate the gregorian year for a date. This should NOT be used
   * internally — keep code "calendar neutral" to support Jewish/Arabic
   * users. Only for interfacing with external entities.
   */
  gregorianYear() {
    if (this.isOK()) {
      const [year] = GREGORIAN_CALENDAR.jdToYmd(this.julianDay());

      return year;
    }

    return 0;
  }

  /**
   * Compare two dates, so they can be sorted.
   * Returns -1 if a<b, +1 if b>a, 0 if dates same/overlap.
   * BEF/AFT sort as the day before/after.
   */
  static compare(a, b) {
    return compareDates(
      { qual1: a.qual1, minimumJulianDay: a.minimumJulianDay(), maximumJulianDay: a.maximumJulianDay() },
      { qual1: b.qual1, minimumJulianDay: b.minimumJulianDay(), maximumJulianDay: b.maximumJulianDay() },
    );
  }
}
