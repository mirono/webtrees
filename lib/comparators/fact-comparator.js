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

// Port of app/Comparators/FactComparator.php.
// See docs/php-to-js-migration/task-12-fact-comparator.md.
//
// Takes plain fact shim objects (not real Fact instances), shaped:
// {
//   tag: 'INDI:BIRT',
//   value: '',
//   id: 'birth',
//   attributeDate: '12 JAN 1900',
//   date: { qual1: '', minimumJulianDay: 2415032, maximumJulianDay: 2415032 }
// }

import { compareDates } from '../date-compare.js';
import { order as tagOrder, byOrder as tagByOrder } from './tag-comparator.js';

/**
 * Port of FactComparator::byDate().
 * Sort by date; if both dates are OK, use Date::compare(), with type as tie-break.
 * If either date is not OK (minimumJulianDay === 0 && maximumJulianDay === 0),
 * return 0 (stable sort).
 */
export function byDate(first, second) {
  const firstDateOK = first.date.minimumJulianDay !== 0 && first.date.maximumJulianDay !== 0;
  const secondDateOK = second.date.minimumJulianDay !== 0 && second.date.maximumJulianDay !== 0;

  if (firstDateOK && secondDateOK) {
    const result = compareDates(first.date, second.date);

    // Same date? Use type as a tie-break.
    if (result === 0) {
      return byType(first, second);
    }

    return result;
  }

  // One or both events have no date - stable sort preserves original order.
  return 0;
}

/**
 * Port of FactComparator::byType().
 * Compare effective tags; if equal, dated facts sort before undated.
 * Otherwise delegate to TagComparator::byOrder().
 */
export function byType(first, second) {
  const firstTag = effectiveTag(first);
  const secondTag = effectiveTag(second);

  // Same type: dated before undated, otherwise preserve original order.
  if (firstTag === secondTag) {
    if (first.attributeDate !== '' && second.attributeDate === '') {
      return -1;
    }

    if (second.attributeDate !== '' && first.attributeDate === '') {
      return 1;
    }

    return 0;
  }

  return tagByOrder(firstTag, secondTag);
}

/**
 * Port of FactComparator::typeOrder().
 * Return the numeric type-order position via TagComparator::order().
 */
export function typeOrder(fact) {
  const tag = effectiveTag(fact);
  return tagOrder(tag);
}

/**
 * Port of FactComparator::effectiveTag().
 * Determine the effective tag for sorting purposes.
 * NO events sort as the event they negate; associate events sort as EVEN.
 *
 * Splits fact.tag on ':' (e.g., 'INDI:BIRT' -> 'BIRT'):
 * - If the tag part is exactly 'NO', return fact.value (the negated tag).
 * - If fact.id === 'asso', return 'EVEN'.
 * - Otherwise return the tag part.
 */
function effectiveTag(fact) {
  const parts = fact.tag.split(':');
  const tag = parts.length > 1 ? parts[1] : parts[0];

  if (tag === 'NO') {
    return fact.value;
  }

  if (fact.id === 'asso') {
    return 'EVEN';
  }

  return tag;
}
