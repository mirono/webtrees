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
import { byDate, byType, typeOrder } from '../lib/comparators/fact-comparator.js';
import golden from '../golden/fact_comparator.json';

describe('FactComparator parity with PHP', () => {
  golden.forEach(({ label, fact1, fact2, comparisons }, i) => {
    describe(`case ${i}: ${label}`, () => {
      // Reconstruct the shim objects from golden data
      const shimFact1 = {
        tag: fact1.tag,
        value: fact1.value,
        id: fact1.id_method,
        attributeDate: fact1.attributeDate,
        date: {
          qual1: fact1.date.qual1,
          minimumJulianDay: fact1.date.minimumJulianDay,
          maximumJulianDay: fact1.date.maximumJulianDay,
        },
      };

      const shimFact2 = {
        tag: fact2.tag,
        value: fact2.value,
        id: fact2.id_method,
        attributeDate: fact2.attributeDate,
        date: {
          qual1: fact2.date.qual1,
          minimumJulianDay: fact2.date.minimumJulianDay,
          maximumJulianDay: fact2.date.maximumJulianDay,
        },
      };

      test('byDate()', () => {
        expect(byDate(shimFact1, shimFact2)).toEqual(comparisons.byDate);
      });

      test('byType()', () => {
        expect(byType(shimFact1, shimFact2)).toEqual(comparisons.byType);
      });

      test('typeOrder(fact1)', () => {
        expect(typeOrder(shimFact1)).toEqual(fact1.typeOrder);
      });

      test('typeOrder(fact2)', () => {
        expect(typeOrder(shimFact2)).toEqual(fact2.typeOrder);
      });
    });
  });
});
