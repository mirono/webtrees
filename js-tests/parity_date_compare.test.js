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
import { compareDates } from '../lib/date-compare.js';
import golden from '../golden/date_compare.json';

describe('Date::compare parity with PHP', () => {
  golden.forEach(({ input, a_details, b_details, output }, i) => {
    test(`case ${i}: ${input.description}`, () => {
      const a = {
        qual1: a_details.qual1,
        minimumJulianDay: a_details.minimumJulianDay,
        maximumJulianDay: a_details.maximumJulianDay,
      };
      const b = {
        qual1: b_details.qual1,
        minimumJulianDay: b_details.minimumJulianDay,
        maximumJulianDay: b_details.maximumJulianDay,
      };

      expect(compareDates(a, b)).toEqual(output);
    });
  });
});
