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
  loadSubmitter,
  submitterCanShowRecord,
  displayableSubmitterFacts,
  submitterFactOtherAttributes,
} from '../pages-server/submitter.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

describe('loadSubmitter', () => {
  test('returns the raw gedcom blob for an existing xref', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_other');
      expect(sql).toContain("o_type = 'SUBM'");
      expect(params).toEqual(['S1', 1]);
      return { rows: [{ o_id: 'S1', o_gedcom: '0 @S1@ SUBM\n1 NAME Miron Ophir' }] };
    });

    expect(await loadSubmitter(pool, 1, 'S1')).toEqual({ xref: 'S1', gedcom: '0 @S1@ SUBM\n1 NAME Miron Ophir' });
  });

  test('returns null for a nonexistent xref', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadSubmitter(pool, 1, 'S999')).toBeNull();
  });
});

describe('submitterCanShowRecord', () => {
  const baseTree = { hideLivePeople: true, defaultResn: null };
  const baseViewer = { accessLevel: 2, isSelfRecord: false };

  test('HIDE_LIVE_PEOPLE off -> always shown', () => {
    expect(submitterCanShowRecord({ ...baseTree, hideLivePeople: false }, '', { ...baseViewer, accessLevel: 0 }, new Map())).toBe(
      true,
    );
  });

  test('no tree-wide SUBM default-resn row -> public by default (base GedcomRecord::canShowByType())', () => {
    expect(submitterCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 0 }, new Map())).toBe(true);
  });

  test('a tree-wide SUBM default-resn row gates by access level', () => {
    const treeFactResn = new Map([['SUBM', 'confidential']]);

    expect(submitterCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 0 }, treeFactResn)).toBe(true);
    expect(submitterCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 1 }, treeFactResn)).toBe(false);
  });

  test('an inline RESN on the submitter record itself still applies (shared RESN chain)', () => {
    const gedcom = '0 @S1@ SUBM\n1 RESN confidential';

    expect(submitterCanShowRecord(baseTree, gedcom, { ...baseViewer, accessLevel: 2 }, new Map())).toBe(false);
    expect(submitterCanShowRecord(baseTree, gedcom, { ...baseViewer, accessLevel: 0 }, new Map())).toBe(true);
  });
});

describe('displayableSubmitterFacts', () => {
  test('has no tag allowlist - every real level-1 fact passes through unchanged', () => {
    const facts = ['1 NAME Miron Ophir', '1 NOTE Some note', '1 CHAN\n2 DATE 1 JAN 2020'];

    expect(displayableSubmitterFacts(facts)).toEqual(facts);
  });

  // Regression test: parseFacts()'s own leading "0 @xref@ SUBM" pseudo-
  // fact block used to leak through, rendering as an extra "undefined"-
  // labeled row on every real submitter - found live.
  test('excludes the leading "0 @xref@ SUBM" pseudo-fact block', () => {
    const facts = ['0 @S1@ SUBM', '1 NAME Miron Ophir'];

    expect(displayableSubmitterFacts(facts)).toEqual(['1 NAME Miron Ophir']);
  });
});

describe('submitterFactOtherAttributes', () => {
  test('falls back to the raw SUBM:<TAG>:<subtag> path', () => {
    const fact = '1 ADDR 28 Moshe Dayan St.\n2 _CUSTOM some value';

    expect(submitterFactOtherAttributes(fact, 'ADDR')).toEqual([{ label: 'SUBM:ADDR:_CUSTOM', value: 'some value' }]);
  });

  test("CHAN's _WT_USER is excluded (already shown as \"Author of last change\")", () => {
    const fact = '1 CHAN\n2 DATE 1 JAN 2020\n2 _WT_USER miron';

    expect(submitterFactOtherAttributes(fact, 'CHAN')).toEqual([]);
  });
});
