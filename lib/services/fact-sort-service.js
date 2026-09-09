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

// Port of app/Services/FactSortService.php (task 18).
//
// Takes plain fact shim objects, shaped like lib/comparators/fact-comparator.js
// already expects, plus one addition:
// {
//   tag: 'INDI:BIRT', value: '', id: 'birth', attributeDate: '12 JAN 1900',
//   date: { qual1: '', minimumJulianDay: 2415032, maximumJulianDay: 2415032 },
//   record: { xref: 'F1' } | null,   // null for individual-owned facts;
//                                    // { xref } for family-owned facts
// }
//
// PHP compares `$fact->record() instanceof Family` and, for grouping,
// `$existing->record() === $family` (object identity). Two facts belong to
// "the same family" in practice exactly when they share the same family
// xref, so `record.xref` equality is used here instead of relying on JS
// object reference identity, which would make shim construction more
// fragile without changing what the algorithm actually needs to know.

import { byDate, byType, typeOrder } from '../comparators/fact-comparator.js';

function isFamilyFact(fact) {
  return fact.record !== null && fact.record !== undefined;
}

function isDatedFact(fact) {
  return fact.date.minimumJulianDay !== 0 && fact.date.maximumJulianDay !== 0;
}

function isDatedCloseRelativeEvent(fact) {
  return isDatedFact(fact) && fact.tag === 'INDI:EVEN' && fact.value === 'CLOSE_RELATIVE';
}

export class FactSortService {
  /**
   * Sort a collection of facts.
   *
   * 1. Split facts into dated (have a parseable date) and nondated.
   * 2. Sort dated facts chronologically, using type order as tiebreaker.
   * 3. Group nondated facts: individual facts stay separate; family facts
   *    are grouped by family identity so they are inserted as a unit.
   * 4. Insert each family group near its family's dated facts, or before
   *    any later-input families' facts (preserving original family order).
   * 5. Insert individual nondated facts at their type-order position in the result.
   *
   * @param {Array<object>} unsorted
   * @returns {Array<object>}
   */
  sort(unsorted) {
    const dated = [];
    const nondated = [];

    // Track the input order of families for tiebreaking
    const familyInputOrder = new Map();
    let order = 0;

    // Phase 1: Split into dated and nondated facts
    for (const fact of unsorted) {
      if (isFamilyFact(fact)) {
        const xref = fact.record.xref;

        if (!familyInputOrder.has(xref)) {
          familyInputOrder.set(xref, order++);
        }
      }

      if (isDatedFact(fact)) {
        dated.push(fact);
      } else {
        nondated.push(fact);
      }
    }

    // Phase 2: Sort dated facts chronologically
    dated.sort(byDate);

    // Phase 3: Group nondated facts by source record.
    // Individual facts are inserted one at a time by type order.
    // Family facts are kept together as a unit to preserve family grouping.
    const individualNondated = [];
    const familyGroups = new Map();

    for (const fact of nondated) {
      if (isFamilyFact(fact)) {
        const key = fact.record.xref;

        if (!familyGroups.has(key)) {
          familyGroups.set(key, []);
        }

        familyGroups.get(key).push(fact);
      } else {
        individualNondated.push(fact);
      }
    }

    // Phase 4: Sort within each group by type order
    individualNondated.sort(byType);

    for (const group of familyGroups.values()) {
      group.sort(byType);
    }

    // Phase 5: Build the result by merging nondated facts into the dated backbone.
    let sorted = dated;

    // Insert each family group near its family's existing dated facts.
    for (const group of familyGroups.values()) {
      sorted = this.insertFamilyGroup(sorted, group, familyInputOrder);
    }

    // Insert individual nondated facts at their type-order positions.
    for (const fact of individualNondated) {
      sorted = this.insertByTypeOrder(sorted, fact);
    }

    return sorted;
  }

  /**
   * Insert a family's undated facts near the same family's dated facts.
   * If no dated facts exist for this family, insert before facts from any
   * later-input family (preserving the original family order from the input).
   */
  insertFamilyGroup(sorted, group, familyInputOrder) {
    const familyXref = group[0].record.xref;

    // Check whether this family already has facts in the sorted array
    const hasFamilyFacts = sorted.some((existing) => isFamilyFact(existing) && existing.record.xref === familyXref);

    if (hasFamilyFacts) {
      // Insert each fact at the correct type-order position relative to same-family facts
      for (const fact of group) {
        sorted = this.insertInFamilyContext(sorted, fact, familyXref);
      }
    } else {
      // No dated facts from this family.
      // Insert before the first fact from a family that was input later.
      const thisOrder = familyInputOrder.get(familyXref);
      let insertPos = sorted.length;

      for (let i = 0; i < sorted.length; i++) {
        const existing = sorted[i];

        if (isFamilyFact(existing)) {
          const existingOrder = familyInputOrder.get(existing.record.xref) ?? 0;

          if (existingOrder > thisOrder) {
            insertPos = i;
            break;
          }
        }
      }

      sorted = sorted.slice();
      sorted.splice(insertPos, 0, ...group);
    }

    return sorted;
  }

  /**
   * Insert a single undated family fact at the correct position relative to
   * facts from the same family, using type order.
   */
  insertInFamilyContext(sorted, fact, familyXref) {
    const factTypeOrder = typeOrder(fact);

    // Find the last same-family fact with type order <= this fact's type order
    let insertAfter = -1;

    for (let i = 0; i < sorted.length; i++) {
      const existing = sorted[i];

      if (isFamilyFact(existing) && existing.record.xref === familyXref && typeOrder(existing) <= factTypeOrder) {
        insertAfter = i;
      }
    }

    sorted = sorted.slice();

    if (insertAfter >= 0) {
      sorted.splice(insertAfter + 1, 0, fact);

      return sorted;
    }

    // This fact has lower type order than all existing same-family facts.
    // Insert before the first same-family fact.
    for (let i = 0; i < sorted.length; i++) {
      if (isFamilyFact(sorted[i]) && sorted[i].record.xref === familyXref) {
        sorted.splice(i, 0, fact);

        return sorted;
      }
    }

    return sorted;
  }

  /**
   * Insert an undated individual fact at the position determined by type order.
   * The fact is placed before the first existing fact with a higher type order.
   */
  insertByTypeOrder(sorted, fact) {
    const factTypeOrder = typeOrder(fact);

    for (let i = 0; i < sorted.length; i++) {
      const existing = sorted[i];

      // Dated events of close relatives should not influence placement of
      // undated personal/family facts.
      if (isDatedCloseRelativeEvent(existing)) {
        continue;
      }

      if (typeOrder(existing) > factTypeOrder) {
        const result = sorted.slice();
        result.splice(i, 0, fact);

        return result;
      }
    }

    // All existing facts have lower or equal type order; append at end
    return [...sorted, fact];
  }
}
