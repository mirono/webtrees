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

import { describe, expect, test, vi } from 'vitest';
import {
  buildLinkGraph,
  collectAncestors,
  collectExcludedFamilies,
  allShortestPaths,
  calculateRelationshipPaths,
  relationshipCodesForPath,
  loadPathRecords,
} from '../pages-server/relationship-chart.mjs';

// A small family tree for graph tests:
//   F1: husband I1, wife I2, child I3
//   F2: husband I3, wife I4, child I5
// so I1 -F1- I3 -F2- I5 is a grandparent/grandchild chain, and
// I1/I2 are husband and wife (F1).
const TYPED_ROWS = [
  { from: 'I1', to: 'F1', type: 'FAMS' },
  { from: 'I2', to: 'F1', type: 'FAMS' },
  { from: 'I3', to: 'F1', type: 'FAMC' },
  { from: 'I3', to: 'F2', type: 'FAMS' },
  { from: 'I4', to: 'F2', type: 'FAMS' },
  { from: 'I5', to: 'F2', type: 'FAMC' },
];

describe('buildLinkGraph', () => {
  test('builds an undirected individual<->family adjacency map', () => {
    const graph = buildLinkGraph(TYPED_ROWS);
    expect(graph.get('I1')).toEqual(new Set(['F1']));
    expect(graph.get('F1')).toEqual(new Set(['I1', 'I2', 'I3']));
  });

  test('restricts to edges from an allowed set', () => {
    const graph = buildLinkGraph(TYPED_ROWS, new Set(['I1', 'I2']));
    expect(graph.get('F1')).toEqual(new Set(['I1', 'I2']));
    expect(graph.has('I3')).toBe(false); // I3->F1 edge excluded, but F1->I3 added by I3's own excluded row too - neither direction present
  });

  test('restricts away an excluded "to" (family)', () => {
    const graph = buildLinkGraph(TYPED_ROWS, null, new Set(['F1']));
    expect(graph.has('F1')).toBe(false);
    expect(graph.get('I3')).toEqual(new Set(['F2']));
  });
});

describe('collectAncestors', () => {
  test('includes both starting individuals plus every ancestor, walking up through FAMC/FAMS', () => {
    const ancestors = collectAncestors(TYPED_ROWS, 'I5', 'I2');
    // I5's parents (via F2) are I3 and I4; I3's own parents (via F1) are I1 and I2.
    expect(ancestors).toEqual(new Set(['I5', 'I2', 'I3', 'I4', 'I1']));
  });

  test('an individual with no parent family contributes no further ancestors', () => {
    const ancestors = collectAncestors(TYPED_ROWS, 'I1', 'I2');
    expect(ancestors).toEqual(new Set(['I1', 'I2']));
  });
});

describe('collectExcludedFamilies', () => {
  test("finds the couple's own shared marriage family", () => {
    const excluded = collectExcludedFamilies(TYPED_ROWS, 'I1', 'I2');
    expect(excluded).toEqual(new Set(['F1']));
  });

  test('two individuals who are not a couple exclude nothing', () => {
    const excluded = collectExcludedFamilies(TYPED_ROWS, 'I1', 'I5');
    expect(excluded).toEqual(new Set());
  });
});

describe('allShortestPaths', () => {
  test('finds the grandparent/grandchild path', () => {
    const graph = buildLinkGraph(TYPED_ROWS);
    const paths = allShortestPaths(graph, 'I1', 'I5');
    expect(paths).toEqual([['I1', 'F1', 'I3', 'F2', 'I5']]);
  });

  test('returns an empty array when there is no path at all', () => {
    const graph = buildLinkGraph(TYPED_ROWS);
    expect(allShortestPaths(graph, 'I1', 'I999')).toEqual([]);
  });

  test('excluding a node on the only path removes it from the results', () => {
    const graph = buildLinkGraph(TYPED_ROWS);
    expect(allShortestPaths(graph, 'I1', 'I5', ['F1'])).toEqual([]);
  });

  test('finds multiple shortest paths of equal length when they exist', () => {
    // Add a second grandparent link of the same length: I2 -F1- I3 -F2- I5 (length 4, same as I1's).
    const graph = buildLinkGraph(TYPED_ROWS);
    const paths = allShortestPaths(graph, 'I2', 'I5');
    expect(paths).toEqual([['I2', 'F1', 'I3', 'F2', 'I5']]);

    // A genuine tie: two equally-short routes between the spouses of F1 and F2.
    const tieRows = [...TYPED_ROWS, { from: 'I4', to: 'F3', type: 'FAMS' }, { from: 'I3', to: 'F3', type: 'FAMC' }];
    const tieGraph = buildLinkGraph(tieRows);
    const tiePaths = allShortestPaths(tieGraph, 'I1', 'I4');
    const asStrings = tiePaths.map((p) => p.join('-')).sort();
    expect(asStrings).toEqual(['I1-F1-I3-F2-I4', 'I1-F1-I3-F3-I4'].sort());
  });
});

describe('calculateRelationshipPaths', () => {
  test('with recursion=0, returns only the shortest path(s)', () => {
    const graph = buildLinkGraph(TYPED_ROWS);
    const paths = calculateRelationshipPaths(graph, 'I1', 'I5', 0);
    expect(paths).toEqual([['I1', 'F1', 'I3', 'F2', 'I5']]);
  });

  test('with recursion>0, also finds alternative paths via excluding a family on the first path', () => {
    // Give I3 a second parent family (step-parent chain) so excluding F1 still finds a path to I5.
    const rows = [...TYPED_ROWS, { from: 'I3', to: 'F4', type: 'FAMC' }, { from: 'I6', to: 'F4', type: 'FAMS' }];
    const graph = buildLinkGraph(rows);
    const paths = calculateRelationshipPaths(graph, 'I1', 'I5', 1);
    const asStrings = paths.map((p) => p.join('-'));
    expect(asStrings).toContain('I1-F1-I3-F2-I5');
  });

  test('deduplicates identical paths found more than once', () => {
    const graph = buildLinkGraph(TYPED_ROWS);
    const paths = calculateRelationshipPaths(graph, 'I1', 'I5', 5);
    const keys = paths.map((p) => p.join('-'));
    expect(keys.length).toBe(new Set(keys).size);
  });
});

describe('relationshipCodesForPath', () => {
  test('a grandparent path (I1 -F1- I3 -F2- I5) produces par-then-chi-style codes', () => {
    const familyGedcomByXref = new Map([
      ['F1', '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@'],
      ['F2', '0 @F2@ FAM\n1 HUSB @I3@\n1 WIFE @I4@\n1 CHIL @I5@'],
    ]);
    const sexByIndividualXref = new Map([
      ['I1', 'M'],
      ['I3', 'M'],
      ['I5', 'F'],
    ]);

    const codes = relationshipCodesForPath(['I1', 'F1', 'I3', 'F2', 'I5'], familyGedcomByXref, sexByIndividualXref);
    expect(codes[1]).toBe('son'); // I1 (HUSB) -> I3 (CHIL), I3 is male
    expect(codes[3]).toBe('dau'); // I3 (HUSB) -> I5 (CHIL), I5 is female
  });

  test('two spouses produce a hus/wif code', () => {
    const familyGedcomByXref = new Map([['F1', '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@']]);
    const sexByIndividualXref = new Map([['I2', 'F']]);

    const codes = relationshipCodesForPath(['I1', 'F1', 'I2'], familyGedcomByXref, sexByIndividualXref);
    expect(codes[1]).toBe('wif');
  });

  test('two siblings produce a bro/sis code', () => {
    const familyGedcomByXref = new Map([['F1', '0 @F1@ FAM\n1 CHIL @I3@\n1 CHIL @I5@']]);
    const sexByIndividualXref = new Map([['I5', 'F']]);

    const codes = relationshipCodesForPath(['I3', 'F1', 'I5'], familyGedcomByXref, sexByIndividualXref);
    expect(codes[1]).toBe('sis');
  });

  test('returns null when a role cannot be determined (e.g. a privacy-redacted family)', () => {
    const familyGedcomByXref = new Map([['F1', '0 @F1@ FAM']]); // no HUSB/WIFE/CHIL lines at all
    const codes = relationshipCodesForPath(['I1', 'F1', 'I2'], familyGedcomByXref, new Map());
    expect(codes).toBeNull();
  });
});

describe('loadPathRecords', () => {
  test('loads every distinct individual and family referenced across all paths, once each', () => {
    const individualQuery = vi.fn(async () => ({
      rows: [
        { i_id: 'I1', i_gedcom: '0 @I1@ INDI\n1 SEX M' },
        { i_id: 'I3', i_gedcom: '0 @I3@ INDI\n1 SEX M' },
        { i_id: 'I5', i_gedcom: '0 @I5@ INDI\n1 SEX F' },
      ],
    }));
    const familyQuery = vi.fn(async (sql, params) => {
      if (sql.includes('wt_families')) {
        return { rows: [{ f_id: params[0], f_gedcom: `0 @${params[0]}@ FAM`, f_husb: null, f_wife: null }] };
      }
      throw new Error(`unexpected: ${sql}`);
    });
    const pool = {
      query: vi.fn(async (sql, params) => {
        if (sql.includes('wt_individuals')) return individualQuery(sql, params);
        return familyQuery(sql, params);
      }),
    };

    return loadPathRecords(pool, 1, [['I1', 'F1', 'I3', 'F2', 'I5']]).then((result) => {
      expect(result.sexByIndividualXref.get('I1')).toBe('M');
      expect(result.sexByIndividualXref.get('I5')).toBe('F');
      expect(result.familyGedcomByXref.get('F1')).toBe('0 @F1@ FAM');
      expect(result.familyGedcomByXref.get('F2')).toBe('0 @F2@ FAM');
      expect(individualQuery).toHaveBeenCalledTimes(1); // one batched query, not one per xref
    });
  });
});
