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
import { loadHeader, headerCanShowRecord, displayableHeaderFacts, headerFactOtherAttributes } from '../pages-server/header.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

describe('loadHeader', () => {
  test('returns the raw gedcom blob for the "HEAD" pseudo-xref', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_other');
      expect(sql).toContain("o_type = 'HEAD'");
      expect(params).toEqual(['HEAD', 1]);
      return { rows: [{ o_id: 'HEAD', o_gedcom: '0 HEAD\n1 SOUR webtrees' }] };
    });

    expect(await loadHeader(pool, 1, 'HEAD')).toEqual({ xref: 'HEAD', gedcom: '0 HEAD\n1 SOUR webtrees' });
  });

  test('any other xref finds no matching row', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadHeader(pool, 1, 'WRONG')).toBeNull();
  });
});

describe('headerCanShowRecord', () => {
  const baseTree = { hideLivePeople: true, defaultResn: null };
  const baseViewer = { accessLevel: 2, isSelfRecord: false };

  test('HIDE_LIVE_PEOPLE off -> always shown', () => {
    expect(headerCanShowRecord({ ...baseTree, hideLivePeople: false }, '', { ...baseViewer, accessLevel: 0 }, new Map())).toBe(true);
  });

  test('no tree-wide HEAD default-resn row -> public by default (base GedcomRecord::canShowByType())', () => {
    expect(headerCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 0 }, new Map())).toBe(true);
  });

  test('a tree-wide HEAD default-resn row gates by access level', () => {
    const treeFactResn = new Map([['HEAD', 'confidential']]);

    expect(headerCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 0 }, treeFactResn)).toBe(true);
    expect(headerCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 1 }, treeFactResn)).toBe(false);
  });
});

describe('displayableHeaderFacts', () => {
  test('has no tag allowlist - every real level-1 fact passes through unchanged', () => {
    const facts = ['1 SOUR webtrees', '1 DATE 20 APR 2020', '1 GEDC\n2 VERS 5.5.1'];

    expect(displayableHeaderFacts(facts)).toEqual(facts);
  });

  // Regression test: parseFacts()'s own leading "0 HEAD" pseudo-fact
  // block used to leak through, rendering as an extra "undefined"-
  // labeled row on the real header - found live.
  test('excludes the leading "0 HEAD" pseudo-fact block', () => {
    const facts = ['0 HEAD', '1 SOUR webtrees'];

    expect(displayableHeaderFacts(facts)).toEqual(['1 SOUR webtrees']);
  });
});

describe('headerFactOtherAttributes', () => {
  test('GEDC:VERS/FORM get their real translated labels', () => {
    const fact = '1 GEDC\n2 VERS 5.5.1\n2 FORM Lineage-Linked';

    expect(headerFactOtherAttributes(fact, 'GEDC')).toEqual([
      { label: 'Version', value: '5.5.1' },
      { label: 'Format', value: 'Lineage-Linked' },
    ]);
  });

  test('SOUR:NAME/VERS get their real translated labels', () => {
    const fact = '1 SOUR webtrees\n2 NAME webtrees\n2 VERS 1.7.16';

    expect(headerFactOtherAttributes(fact, 'SOUR')).toEqual([
      { label: 'Application name', value: 'webtrees' },
      { label: 'Version', value: '1.7.16' },
    ]);
  });

  test('an unrecognized subtag falls back to the raw HEAD:<TAG>:<subtag> path', () => {
    const fact = '1 SOUR webtrees\n2 CORP Some Corp';

    expect(headerFactOtherAttributes(fact, 'SOUR')).toEqual([{ label: 'HEAD:SOUR:CORP', value: 'Some Corp' }]);
  });

  // Regression test: DATE's own TIME subtag used to render twice - once
  // via the handler's own dedicated date/time extraction, once again
  // here as a generic "HEAD:DATE:TIME" other-attribute row - found live.
  test("DATE's own TIME subtag is excluded (already shown as the fact's own time)", () => {
    const fact = '1 DATE 20 APR 2020\n2 TIME 10:17:01';

    expect(headerFactOtherAttributes(fact, 'DATE')).toEqual([]);
  });
});
