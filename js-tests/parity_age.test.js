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

import { describe, test, expect } from 'vitest';
import { Age } from '../lib/age.js';
import { GregorianDate } from '../lib/date/gregorian.js';
import golden from '../golden/age.json';

/**
 * Month number to name mapping for GEDCOM month abbreviations.
 */
const MONTH_NAMES = ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Helper to create a GregorianDate from calendar date details.
 * Handles year-only, month+year, and full y/m/d dates.
 *
 * @param {Object} details Calendar date details: { year, month, day }
 * @returns {GregorianDate} A GregorianDate instance
 */
function makeCalendarDate(details) {
  // If year is 0, the date is invalid. Construct from JD 0.
  if (details.year === 0) {
    return new GregorianDate(0); // JD 0 = invalid
  }

  // Build a GEDCOM-style array: [year, month?, day?]
  // Month and day are omitted if they're 0 (representing lower precision).
  const dateArray = [String(details.year).padStart(4, '0')];

  // Add month name if present (month > 0)
  if (details.month > 0) {
    dateArray.push(MONTH_NAMES[details.month]);
  }

  // Add day if present (day > 0), but only if month is also present
  if (details.day > 0 && details.month > 0) {
    dateArray.push(String(details.day).padStart(2, '0'));
  }

  // Construct and return the GregorianDate from the array
  return new GregorianDate(dateArray);
}

describe('Age parity with PHP', () => {
  golden.forEach(({ input, xMinimumDate, xIsOK, yMaximumDate, yIsOK, output }, i) => {
    test(`case ${i}: ${input.description}`, () => {
      // Construct the shim objects for x and y.
      // x needs minimumDate (from xMinimumDate) and maximumDate (same for non-range dates)
      // y needs maximumDate (from yMaximumDate) and minimumDate (same for non-range dates)
      const xDate = makeCalendarDate(xMinimumDate);
      const yDate = makeCalendarDate(yMaximumDate);

      const x = {
        minimumDate: xDate,
        maximumDate: xDate, // For non-range dates, both are the same
        isOK: xIsOK,
      };

      const y = {
        minimumDate: yDate, // For non-range dates, both are the same
        maximumDate: yDate,
        isOK: yIsOK,
      };

      // Create Age instance
      const age = new Age(x, y, {
        i18n: {
          plural: (singular, plural, count, formattedCount) => {
            const form = count === 1 ? singular : plural;
            return form.replace(/%s/g, formattedCount);
          },
          number: (n) => String(n),
          warningIcon: () => '[warning-icon]',
        },
        warningIcon: '[warning-icon]',
      });

      // Test ageDays() — should match PHP output exactly
      expect(age.ageDays()).toEqual(output.ageDays);

      // Test ageYears() — should match PHP output exactly
      expect(age.ageYears()).toEqual(output.ageYears);

      // Test ageYearsString() — for warning cases it should match the placeholder
      if (output.ageYearsString === '[warning-icon]' || output.ageYearsString.includes('wt-icon-warning')) {
        expect(age.ageYearsString()).toEqual('[warning-icon]');
      } else {
        expect(age.ageYearsString()).toEqual(output.ageYearsString);
      }

      // Test toString() — for warning cases it should match the placeholder
      if (output.toString === '[warning-icon]' || output.toString.includes('wt-icon-warning')) {
        expect(age.toString()).toEqual('[warning-icon]');
      } else {
        expect(age.toString()).toEqual(output.toString);
      }
    });
  });
});
