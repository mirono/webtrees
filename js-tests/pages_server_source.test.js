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
  sourceFactOtherAttributes,
  displayableRepositoryFacts,
  repositoryFactOtherAttributes,
  repositoryCanShowRecord,
  sourceCanShowRecord,
  loadRepositoryList,
  repositorySourceCounts,
  recordLastChange,
  loadSourceList,
  sourceIndividualCounts,
  sourceFamilyCounts,
  sourceMediaCounts,
  sourceNoteCounts,
  firstFactPlainValue,
  loadShowLastChangePref,
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

describe('loadRepositoryList', () => {
  test('returns every repository, ordered by xref', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_other');
      expect(sql).toContain("o_type = 'REPO'");
      expect(sql).toContain('ORDER BY o_id');
      expect(params).toEqual([1]);
      return {
        rows: [
          { o_id: 'R1', o_gedcom: '0 @R1@ REPO\n1 NAME A' },
          { o_id: 'R2', o_gedcom: '0 @R2@ REPO\n1 NAME B' },
        ],
      };
    });

    expect(await loadRepositoryList(pool, 1)).toEqual([
      { xref: 'R1', gedcom: '0 @R1@ REPO\n1 NAME A' },
      { xref: 'R2', gedcom: '0 @R2@ REPO\n1 NAME B' },
    ]);
  });

  test('an empty tree returns an empty array', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadRepositoryList(pool, 1)).toEqual([]);
  });
});

describe('repositorySourceCounts', () => {
  test('returns a Map of xref -> source count', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_link');
      expect(sql).toContain("l_type = 'REPO'");
      expect(params).toEqual([1]);
      return {
        rows: [
          { l_to: 'R1', total: '1' },
          { l_to: 'R3', total: '12' },
        ],
      };
    });

    const counts = await repositorySourceCounts(pool, 1);
    expect(counts.get('R1')).toBe(1);
    expect(counts.get('R3')).toBe(12);
    expect(counts.get('R2')).toBeUndefined();
  });
});

describe('recordLastChange', () => {
  test('extracts a real CHAN date and time', () => {
    const gedcom = '0 @R1@ REPO\n1 NAME A\n1 CHAN\n2 DATE 30 DEC 2017\n3 TIME 17:45:26';

    expect(recordLastChange(gedcom)).toEqual({ date: '30 DEC 2017', time: '17:45:26' });
  });

  test('a CHAN with no TIME still returns the date, with an empty time', () => {
    const gedcom = '0 @R1@ REPO\n1 CHAN\n2 DATE 30 DEC 2017';

    expect(recordLastChange(gedcom)).toEqual({ date: '30 DEC 2017', time: '' });
  });

  test('a record with no CHAN fact returns null', () => {
    expect(recordLastChange('0 @R1@ REPO\n1 NAME A')).toBeNull();
  });
});

describe('loadSourceList', () => {
  test('returns every source, ordered by xref', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_sources');
      expect(sql).toContain('ORDER BY s_id');
      expect(params).toEqual([1]);
      return {
        rows: [
          { s_id: 'S1', s_gedcom: '0 @S1@ SOUR\n1 TITL A' },
          { s_id: 'S2', s_gedcom: '0 @S2@ SOUR\n1 TITL B' },
        ],
      };
    });

    expect(await loadSourceList(pool, 1)).toEqual([
      { xref: 'S1', gedcom: '0 @S1@ SOUR\n1 TITL A' },
      { xref: 'S2', gedcom: '0 @S2@ SOUR\n1 TITL B' },
    ]);
  });

  test('an empty tree returns an empty array', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadSourceList(pool, 1)).toEqual([]);
  });
});

describe.each([
  ['sourceIndividualCounts', sourceIndividualCounts, 'wt_individuals'],
  ['sourceFamilyCounts', sourceFamilyCounts, 'wt_families'],
  ['sourceMediaCounts', sourceMediaCounts, 'wt_media'],
])('%s', (_name, fn, table) => {
  test(`returns a Map of xref -> count, joined to ${table}`, async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain(`FROM ${table}`);
      expect(sql).toContain("l_type = 'SOUR'");
      expect(params).toEqual([1]);
      return {
        rows: [
          { l_to: 'S1', total: '1' },
          { l_to: 'S3', total: '12' },
        ],
      };
    });

    const counts = await fn(pool, 1);
    expect(counts.get('S1')).toBe(1);
    expect(counts.get('S3')).toBe(12);
    expect(counts.get('S2')).toBeUndefined();
  });
});

describe('sourceNoteCounts', () => {
  test('returns a Map of xref -> count, joined to wt_other filtered to NOTE', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_other');
      expect(sql).toContain("o_type = 'NOTE'");
      expect(sql).toContain("l_type = 'SOUR'");
      expect(params).toEqual([1]);
      return { rows: [{ l_to: 'S1', total: '2' }] };
    });

    const counts = await sourceNoteCounts(pool, 1);
    expect(counts.get('S1')).toBe(2);
    expect(counts.get('S2')).toBeUndefined();
  });
});

describe('firstFactPlainValue', () => {
  test("returns the first matching fact's plain value", () => {
    const gedcom = '0 @S1@ SOUR\n1 TITL Census 1900\n1 ABBR Census\n1 AUTH J. Smith';

    expect(firstFactPlainValue(gedcom, 'ABBR')).toBe('Census');
    expect(firstFactPlainValue(gedcom, 'AUTH')).toBe('J. Smith');
  });

  test('no matching fact -> empty string', () => {
    expect(firstFactPlainValue('0 @S1@ SOUR\n1 TITL Census 1900', 'PUBL')).toBe('');
  });
});

describe('loadShowLastChangePref', () => {
  test('no row at all -> false (real PHP default, unlike HIDE_LIVE_PEOPLE\'s own \'1\' default)', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadShowLastChangePref(pool, 1)).toBe(false);
  });

  test("setting_value '0' -> false", async () => {
    const pool = mockPool(async () => ({ rows: [{ setting_value: '0' }] }));

    expect(await loadShowLastChangePref(pool, 1)).toBe(false);
  });

  test("setting_value '1' -> true", async () => {
    const pool = mockPool(async () => ({ rows: [{ setting_value: '1' }] }));

    expect(await loadShowLastChangePref(pool, 1)).toBe(true);
  });

  test('queries wt_gedcom_setting for the SHOW_LAST_CHANGE row', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_gedcom_setting');
      expect(sql).toContain('SHOW_LAST_CHANGE');
      expect(params).toEqual([1]);
      return { rows: [] };
    });

    await loadShowLastChangePref(pool, 1);
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

describe('sourceFactOtherAttributes', () => {
  // Regression test: a real, common case in the imported tree - TITL's
  // _HEB Hebrew transliteration wasn't rendered at all, reported live
  // as "not showing ... SOUR:TITL:_HEB: מחלקת ההגירה". Since this
  // migration hasn't ported any subtag-level element registry, the raw
  // colon-delimited tag path IS the correct label (matches real PHP's
  // own UnknownElement fallback exactly for a tag it doesn't know).
  test("an unknown subtag (e.g. TITL's _HEB) falls back to the raw 'SOUR:TAG:subtag' path as its label", () => {
    expect(sourceFactOtherAttributes('1 TITL Department Of Immigration\n2 _HEB מחלקת ההגירה', 'TITL')).toEqual([
      { label: 'SOUR:TITL:_HEB', value: 'מחלקת ההגירה' },
    ]);
  });

  // Regression test: a real, common case - REPO facts with a CALN
  // call-number line, silently dropped entirely before this fix.
  test("a known subtag (REPO's CALN) uses its real translated label, not the raw path", () => {
    expect(sourceFactOtherAttributes('1 REPO @R3@\n2 CALN ISA-000etdl', 'REPO')).toEqual([
      { label: 'Call number', value: 'ISA-000etdl' },
    ]);
  });

  // Regression test: CHAN's _WT_USER is already hand-rendered as
  // "Author of last change" elsewhere - must not also appear here, or
  // it would show twice.
  test("CHAN's _WT_USER is excluded - already rendered as the dedicated author line", () => {
    expect(sourceFactOtherAttributes('1 CHAN\n2 DATE 1 JAN 2020\n2 _WT_USER miron', 'CHAN')).toEqual([]);
  });

  test('a fact with no other subtags returns an empty array', () => {
    expect(sourceFactOtherAttributes('1 AUTH J. Smith', 'AUTH')).toEqual([]);
  });
});

describe('displayableRepositoryFacts', () => {
  test('keeps NAME/ADDR/PHON/EMAIL/FAX/WWW/REFN/RIN/CHAN, drops NOTE', () => {
    const facts = parseFacts(
      '0 @R1@ REPO\n1 NAME Israel State Archives\n1 ADDR 14 Hartom St.\n1 PHON 02-5680680\n1 EMAIL info@example.com\n1 FAX 02-1234567\n1 WWW https://example.com\n1 REFN abc\n1 RIN xyz\n1 NOTE A note\n1 CHAN\n2 DATE 1 JAN 2020',
    );

    const displayable = displayableRepositoryFacts(facts);
    expect(displayable).toHaveLength(9);
    expect(displayable.map((fact) => /^1 (\S+)/.exec(fact)[1])).toEqual([
      'NAME',
      'ADDR',
      'PHON',
      'EMAIL',
      'FAX',
      'WWW',
      'REFN',
      'RIN',
      'CHAN',
    ]);
  });

  test('a repository with only NOTE returns an empty array', () => {
    expect(displayableRepositoryFacts(parseFacts('1 NOTE A note'))).toEqual([]);
  });
});

describe('repositoryFactOtherAttributes', () => {
  test('an unknown subtag falls back to the raw REPO:TAG:subtag path', () => {
    expect(repositoryFactOtherAttributes('1 NAME Israel State Archives\n2 _HEB ארכיון המדינה', 'NAME')).toEqual([
      { label: 'REPO:NAME:_HEB', value: 'ארכיון המדינה' },
    ]);
  });

  test("CHAN's _WT_USER is excluded - already rendered as the dedicated author line", () => {
    expect(repositoryFactOtherAttributes('1 CHAN\n2 DATE 1 JAN 2020\n2 _WT_USER miron', 'CHAN')).toEqual([]);
  });

  test('a fact with no other subtags returns an empty array', () => {
    expect(repositoryFactOtherAttributes('1 PHON 02-5680680', 'PHON')).toEqual([]);
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
