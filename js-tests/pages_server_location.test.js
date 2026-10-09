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
  loadLocation,
  loadLocationList,
  locationIndividualCounts,
  locationFamilyCounts,
  locationCanShowRecord,
  recordLastChange,
  loadShowLastChangePref,
} from '../pages-server/location.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

describe('loadLocation', () => {
  test('returns the raw gedcom blob for an existing _LOC row in wt_other', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_other');
      expect(sql).toContain("o_type = '_LOC'");
      expect(params).toEqual(['L1', 1]);
      return { rows: [{ o_id: 'L1', o_gedcom: '0 @L1@ _LOC\n1 NAME London' }] };
    });

    expect(await loadLocation(pool, 1, 'L1')).toEqual({ xref: 'L1', gedcom: '0 @L1@ _LOC\n1 NAME London' });
  });

  test('returns null for a nonexistent xref', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadLocation(pool, 1, 'L999')).toBeNull();
  });
});

describe('loadLocationList', () => {
  test('returns every location, ordered by xref', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_other');
      expect(sql).toContain("o_type = '_LOC'");
      expect(sql).toContain('ORDER BY o_id');
      expect(params).toEqual([1]);
      return {
        rows: [
          { o_id: 'L1', o_gedcom: '0 @L1@ _LOC\n1 NAME London' },
          { o_id: 'L2', o_gedcom: '0 @L2@ _LOC\n1 NAME Paris' },
        ],
      };
    });

    expect(await loadLocationList(pool, 1)).toEqual([
      { xref: 'L1', gedcom: '0 @L1@ _LOC\n1 NAME London' },
      { xref: 'L2', gedcom: '0 @L2@ _LOC\n1 NAME Paris' },
    ]);
  });

  test('an empty tree returns an empty array', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadLocationList(pool, 1)).toEqual([]);
  });
});

describe('locationIndividualCounts', () => {
  test('returns a Map of xref -> individual count', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_individuals');
      expect(sql).toContain('JOIN wt_link');
      expect(sql).toContain("l_type = '_LOC'");
      expect(params).toEqual([1]);
      return {
        rows: [
          { l_to: 'L1', total: '5' },
          { l_to: 'L3', total: '12' },
        ],
      };
    });

    const counts = await locationIndividualCounts(pool, 1);
    expect(counts.get('L1')).toBe(5);
    expect(counts.get('L3')).toBe(12);
    expect(counts.get('L2')).toBeUndefined();
  });
});

describe('locationFamilyCounts', () => {
  test('returns a Map of xref -> family count', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_families');
      expect(sql).toContain('JOIN wt_link');
      expect(sql).toContain("l_type = '_LOC'");
      expect(params).toEqual([1]);
      return {
        rows: [
          { l_to: 'L1', total: '2' },
          { l_to: 'L2', total: '3' },
        ],
      };
    });

    const counts = await locationFamilyCounts(pool, 1);
    expect(counts.get('L1')).toBe(2);
    expect(counts.get('L2')).toBe(3);
    expect(counts.get('L3')).toBeUndefined();
  });
});

describe('locationCanShowRecord', () => {
  test('shows a location when the viewer has sufficient access', () => {
    const tree = { hideLivePeople: true, defaultResn: null };
    const gedcom = '1 NAME London';
    const viewer = { accessLevel: 2, isSelfRecord: false };
    const treeFactResn = new Map([['_LOC', 'none']]);

    expect(locationCanShowRecord(tree, gedcom, viewer, treeFactResn)).toBe(true);
  });

  test('hides a location when a RESN fact restricts it', () => {
    const tree = { hideLivePeople: true, defaultResn: null };
    const gedcom = '1 NAME London\n1 RESN confidential';
    const viewer = { accessLevel: 2, isSelfRecord: false };
    const treeFactResn = new Map([['_LOC', 'none']]);

    expect(locationCanShowRecord(tree, gedcom, viewer, treeFactResn)).toBe(false);
  });
});
