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

// Port of app/Age.php.
// Calculates the difference between two GEDCOM dates (years/months/days/total-days),
// used for "age at event" display.
// The shim domain objects (x, y parameters) should have this shape:
// {
//   minimumDate: <AbstractCalendarDate instance or compatible>,
//   maximumDate: <AbstractCalendarDate instance or compatible>,
//   isOK: <boolean>
// }
// where each calendar date has methods: .dayValue(), .monthValue(), .ageDifference(other),
// .minimumJulianDay()

/**
 * English (untranslated) i18n defaults for Age.
 * For other locales, supply an options.i18n object with these methods.
 */
const DEFAULT_I18N = {
  /**
   * Plural form selection and %s substitution.
   * PHP's I18N::plural($singular, $plural, $count, $formattedCount)
   * chooses the form based on the count, then substitutes %s with formattedCount.
   *
   * @param {string} singular Singular form with %s placeholder
   * @param {string} plural Plural form with %s placeholder
   * @param {number} count The count to determine which form (1 = singular, else plural)
   * @param {string} formattedCount The pre-formatted number for %s substitution
   * @returns {string} The chosen form with %s substituted
   */
  plural: (singular, plural, count, formattedCount) => {
    const form = count === 1 ? singular : plural;
    return form.replace(/%s/g, formattedCount);
  },

  /**
   * Format a number for display (locale-aware).
   * For the default (English), this is just String(n).
   *
   * @param {number} n The number to format
   * @returns {string} The formatted number
   */
  number: (n) => String(n),

  /**
   * Warning icon for negative or invalid ages.
   * For the default (untranslated), return a placeholder string that tests can override.
   *
   * @returns {string} The warning icon HTML or placeholder
   */
  warningIcon: () => '[warning-icon]',
};

export class Age {
  #years;
  #months;
  #days;
  #totalDays;
  #isExact;
  #isValid;
  #i18n;
  #warningIcon;

  /**
   * Calculate the age difference between two GEDCOM dates.
   *
   * @param {Object} x The first date shim object with minimumDate, maximumDate, isOK
   * @param {Object} y The second date shim object with minimumDate, maximumDate, isOK
   * @param {Object} [options={}] Configuration options
   * @param {Object} [options.i18n] Internationalization object with plural(), number() methods
   * @param {string|Function} [options.warningIcon] Warning icon string or () => string function
   */
  constructor(x, y, options = {}) {
    this.#i18n = options.i18n ?? DEFAULT_I18N;

    // Handle warningIcon: could be a function or a string
    if (typeof options.warningIcon === 'function') {
      this.#warningIcon = options.warningIcon;
    } else if (typeof options.warningIcon === 'string') {
      this.#warningIcon = () => options.warningIcon;
    } else {
      this.#warningIcon = this.#i18n.warningIcon;
    }

    // If the dates are ranges, use the start/end calendar dates.
    const start = x.minimumDate;
    const end = y.maximumDate;

    // Calculate age difference as [years, months, days]
    const [years, months, days] = start.ageDifference(end);
    this.#years = years;
    this.#months = months;
    this.#days = days;

    // Calculate total days
    this.#totalDays = end.minimumJulianDay() - start.minimumJulianDay();

    // Use the same precision as found in the dates.
    // If either date has no day (dayValue === 0), zero out the days component.
    if (start.dayValue() === 0 || end.dayValue() === 0) {
      this.#days = 0;
    }

    // If either date has no month (monthValue === 0), zero out the months component.
    if (start.monthValue() === 0 || end.monthValue() === 0) {
      this.#months = 0;
    }

    // Are the dates exact? (both have a day value)
    this.#isExact = start.dayValue() !== 0 && end.dayValue() !== 0;

    // Are the dates valid? (both dates are OK)
    this.#isValid = x.isOK && y.isOK;
  }

  /**
   * Show an age in a human-friendly form, such as "34 years", "8 months", "20 days".
   * Show an empty string for invalid/missing dates.
   * Show a warning icon for negative ages.
   * Show zero ages without any units.
   */
  toString() {
    if (!this.#isValid) {
      return '';
    }

    if (this.#years < 0) {
      return this.#warningIcon();
    }

    if (this.#years > 0) {
      return this.#i18n.plural(
        '%s year',
        '%s years',
        this.#years,
        this.#i18n.number(this.#years)
      );
    }

    if (this.#months > 0) {
      return this.#i18n.plural(
        '%s month',
        '%s months',
        this.#months,
        this.#i18n.number(this.#months)
      );
    }

    if (this.#days > 0 || this.#isExact) {
      return this.#i18n.plural(
        '%s day',
        '%s days',
        this.#days,
        this.#i18n.number(this.#days)
      );
    }

    return this.#i18n.number(0);
  }

  /**
   * How many days between two events?
   * If either date is invalid, return -1.
   *
   * @returns {number} The number of days, or -1 if invalid
   */
  ageDays() {
    if (this.#isValid) {
      return this.#totalDays;
    }

    return -1;
  }

  /**
   * How many years between two events?
   * If either date is invalid, return -1.
   *
   * @returns {number} The number of years, or -1 if invalid
   */
  ageYears() {
    if (this.#isValid) {
      return this.#years;
    }

    return -1;
  }

  /**
   * How many years between two events, formatted as a string?
   * If either date is invalid, return an empty string.
   * For negative ages, return a warning icon.
   *
   * @returns {string} The formatted number of years, empty string, or warning icon
   */
  ageYearsString() {
    if (!this.#isValid) {
      return '';
    }

    if (this.#years < 0) {
      return this.#warningIcon();
    }

    return this.#i18n.number(this.#years);
  }
}
