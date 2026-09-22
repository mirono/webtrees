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
  loadSource,
  loadRepository,
  repoXrefs,
  displayableSourceFacts,
  repositoryCanShowRecord,
  sourceCanShowRecord,
} from '../pages-server/source.mjs';
import { parseFacts } from '../pages-server/individual.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

describe('loadSource', () => {
  test('returns the raw gedcom blob for an existing xref', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_sources');
      expect(params).toEqual(['S1', 1]);
      return { rows: [{ s_id: 'S1', s_gedcom: '0 @S1@ SOUR\n1 TITL Census 1900' }] };
    });

    expect(await loadSource(pool, 1, 'S1')).toEqual({ xref: 'S1', gedcom: '0 @S1@ SOUR\n1 TITL Census 1900' });
  });

  test('returns null for a nonexistent xref', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadSource(pool, 1, 'S999')).toBeNull();
  });
});

describe('loadRepository', () => {
  test('returns the raw gedcom blob for an existing REPO row in wt_other', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_other');
      expect(sql).toContain("o_type = 'REPO'");
      expect(params).toEqual(['R1', 1]);
      return { rows: [{ o_id: 'R1', o_gedcom: '0 @R1@ REPO\n1 NAME National Archives' }] };
    });

    expect(await loadRepository(pool, 1, 'R1')).toEqual({ xref: 'R1', gedcom: '0 @R1@ REPO\n1 NAME National Archives' });
  });

  test('returns null for a nonexistent xref', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadRepository(pool, 1, 'R999')).toBeNull();
  });
});

describe('repoXrefs', () => {
  test('extracts every 1 REPO reference', () => {
    const facts = parseFacts('1 TITL Census 1900\n1 REPO @R1@\n1 AUTH Someone\n1 REPO @R2@');

    expect(repoXrefs(facts)).toEqual(['R1', 'R2']);
  });

  test('no REPO references -> empty array', () => {
    expect(repoXrefs(parseFacts('1 TITL Census 1900'))).toEqual([]);
  });
});

describe('displayableSourceFacts', () => {
  // Matches real PHP's record-page-details.phtml exactly: NO tag
  // allowlist at all ($record->facts([], true), app/GedcomRecord.php:
  // 552-570 - empty $filter). TITL and REPO are shown as their own
  // fact rows too (TITL redundantly with the page heading - confirmed
  // this duplication is genuinely what real PHP renders, not a guess).
  // NOTE is the one deliberate exclusion (needs its own shared-note
  // handling this simple renderer doesn't have yet).
  test('keeps TITL/AUTH/PUBL/ABBR/TEXT/REPO/CHAN, drops NOTE', () => {
    const facts = parseFacts(
      '0 @S1@ SOUR\n1 TITL Census 1900\n1 AUTH J. Smith\n1 PUBL Somewhere\n1 ABBR Census\n1 TEXT Some transcription\n1 REPO @R1@\n1 NOTE A note\n1 CHAN\n2 DATE 1 JAN 2020',
    );

    const displayable = displayableSourceFacts(facts);
    expect(displayable).toHaveLength(7);
    expect(displayable[0]).toContain('1 TITL');
    expect(displayable[1]).toContain('1 AUTH');
    expect(displayable[2]).toContain('1 PUBL');
    expect(displayable[3]).toContain('1 ABBR');
    expect(displayable[4]).toContain('1 TEXT');
    expect(displayable[5]).toContain('1 REPO');
    expect(displayable[6]).toContain('1 CHAN');
  });

  test('a source with only NOTE returns an empty array', () => {
    expect(displayableSourceFacts(parseFacts('1 NOTE A note'))).toEqual([]);
  });
});

describe('repositoryCanShowRecord', () => {
  const baseTree = { hideLivePeople: true, defaultResn: null };
  const baseViewer = { accessLevel: 2, isSelfRecord: false };

  test('HIDE_LIVE_PEOPLE off -> always shown', () => {
    expect(repositoryCanShowRecord({ ...baseTree, hideLivePeople: false }, '', { ...baseViewer, accessLevel: 0 }, new Map())).toBe(true);
  });

  test('no tree-wide REPO default-resn row -> public by default (base GedcomRecord::canShowByType())', () => {
    expect(repositoryCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 0 }, new Map())).toBe(true);
  });

  test('a tree-wide REPO default-resn row gates by access level', () => {
    const treeFactResn = new Map([['REPO', 'confidential']]);

    expect(repositoryCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 0 }, treeFactResn)).toBe(true);
    expect(repositoryCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 1 }, treeFactResn)).toBe(false);
  });

  test('an inline RESN on the repository record itself still applies (shared RESN chain)', () => {
    const gedcom = '1 NAME National Archives\n1 RESN confidential';

    expect(repositoryCanShowRecord(baseTree, gedcom, { ...baseViewer, accessLevel: 2 }, new Map())).toBe(false);
    expect(repositoryCanShowRecord(baseTree, gedcom, { ...baseViewer, accessLevel: 0 }, new Map())).toBe(true);
  });
});

describe('sourceCanShowRecord', () => {
  const baseTree = { hideLivePeople: true, defaultResn: null };
  const baseViewer = { accessLevel: 2, isSelfRecord: false };

  test('HIDE_LIVE_PEOPLE off -> always shown, even with a hidden repository', () => {
    expect(sourceCanShowRecord({ ...baseTree, hideLivePeople: false }, '', baseViewer, new Map(), [false])).toBe(true);
  });

  test('no tree-wide SOUR default-resn row and every repo showable -> public by default', () => {
    expect(sourceCanShowRecord(baseTree, '', baseViewer, new Map(), [true, true])).toBe(true);
  });

  test('any one referenced repository not showable -> whole source hidden', () => {
    expect(sourceCanShowRecord(baseTree, '', baseViewer, new Map(), [true, false])).toBe(false);
  });

  test('no referenced repositories at all (empty array) -> falls through to the record-type default', () => {
    expect(sourceCanShowRecord(baseTree, '', baseViewer, new Map(), [])).toBe(true);
  });

  test('a tree-wide SOUR default-resn row gates by access level once every repo is showable', () => {
    const treeFactResn = new Map([['SOUR', 'confidential']]);

    expect(sourceCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 0 }, treeFactResn, [])).toBe(true);
    expect(sourceCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 1 }, treeFactResn, [])).toBe(false);
  });

  test('an inline RESN on the source record itself still applies (shared RESN chain), before the repo check', () => {
    const gedcom = '1 TITL Census 1900\n1 RESN confidential';

    expect(sourceCanShowRecord(baseTree, gedcom, { ...baseViewer, accessLevel: 2 }, new Map(), [true])).toBe(false);
    expect(sourceCanShowRecord(baseTree, gedcom, { ...baseViewer, accessLevel: 0 }, new Map(), [true])).toBe(true);
  });

  test('admin bypass applies before ever checking repo visibility', () => {
    expect(sourceCanShowRecord(baseTree, '', { ...baseViewer, accessLevel: 0 }, new Map(), [false])).toBe(true);
  });
});
