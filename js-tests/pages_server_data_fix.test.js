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

import { describe, expect, test, vi, beforeEach } from 'vitest';
import {
  DATA_FIX_MODULES,
  findDataFixModule,
  recordsToFix,
  gedcomDiff,
} from '../pages-server/data-fix.mjs';

describe('data-fix.mjs', () => {
  describe('DATA_FIX_MODULES', () => {
    test('contains exactly 9 modules', () => {
      expect(DATA_FIX_MODULES).toHaveLength(9);
    });

    test('all modules have required properties', () => {
      DATA_FIX_MODULES.forEach((module) => {
        expect(module.name).toBeDefined();
        expect(typeof module.name).toBe('string');
        expect(module.title).toBeDefined();
        expect(typeof module.title).toBe('string');
        expect(module.description).toBeDefined();
        expect(typeof module.description).toBe('string');
        expect(module.recordTypes).toBeDefined();
        expect(Array.isArray(module.recordTypes)).toBe(true);
        expect(typeof module.candidatesForType).toBe('function');
        expect(typeof module.doesRecordNeedUpdate).toBe('function');
        expect(typeof module.previewUpdate).toBe('function');
        expect(typeof module.applyFix).toBe('function');
      });
    });

    test('all modules are sorted alphabetically by title', () => {
      const titles = DATA_FIX_MODULES.map((m) => m.title);
      const sorted = [...titles].sort((a, b) => a.localeCompare(b));
      expect(titles).toEqual(sorted);
    });

    test('contains all expected module names', () => {
      const names = DATA_FIX_MODULES.map((m) => m.name);
      expect(names).toContain('fix-add-death');
      expect(names).toContain('fix-ceme-tag');
      expect(names).toContain('fix-duplicate-links');
      expect(names).toContain('fix-name-slashes-spaces');
      expect(names).toContain('fix-name-tags');
      expect(names).toContain('fix-place-names');
      expect(names).toContain('fix-prim-tag');
      expect(names).toContain('fix-search-and-replace');
      expect(names).toContain('fix-wt-obje-sort');
    });
  });

  describe('findDataFixModule', () => {
    test('returns module by name', () => {
      const module = findDataFixModule('fix-add-death');
      expect(module).toBeDefined();
      expect(module.name).toBe('fix-add-death');
    });

    test('returns null for unknown module name', () => {
      const module = findDataFixModule('fix-unknown');
      expect(module).toBeNull();
    });

    test('returns null for empty string', () => {
      const module = findDataFixModule('');
      expect(module).toBeNull();
    });

    test('finds all 9 modules by name', () => {
      const names = ['fix-add-death', 'fix-ceme-tag', 'fix-duplicate-links', 'fix-name-slashes-spaces',
        'fix-name-tags', 'fix-place-names', 'fix-prim-tag', 'fix-search-and-replace', 'fix-wt-obje-sort'];
      names.forEach((name) => {
        const module = findDataFixModule(name);
        expect(module).not.toBeNull();
        expect(module.name).toBe(name);
      });
    });
  });

  describe('fix-add-death module', () => {
    let module;

    beforeEach(() => {
      module = findDataFixModule('fix-add-death');
    });

    test('operates on INDI records only', () => {
      expect(module.recordTypes).toEqual(['INDI']);
    });

    test('has no optionsHtml', () => {
      expect(module.optionsHtml).toBeNull();
    });

    test('doesRecordNeedUpdate returns false for FAM', () => {
      const record = {
        type: 'FAM',
        gedcom: '0 @F1@ FAM\n1 HUSB @I1@',
      };
      const ctx = { treePrefs: { maxAliveAge: 110 } };
      expect(module.doesRecordNeedUpdate(record, {}, ctx)).toBe(false);
    });

    test('doesRecordNeedUpdate returns false when death fact exists', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/\n1 DEAT Y',
      };
      const ctx = { treePrefs: { maxAliveAge: 110 } };
      expect(module.doesRecordNeedUpdate(record, {}, ctx)).toBe(false);
    });

    test('doesRecordNeedUpdate returns false when burial exists', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/\n1 BURI Y',
      };
      const ctx = { treePrefs: { maxAliveAge: 110 } };
      expect(module.doesRecordNeedUpdate(record, {}, ctx)).toBe(false);
    });

    test('doesRecordNeedUpdate returns false when cremation exists', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/\n1 CREM Y',
      };
      const ctx = { treePrefs: { maxAliveAge: 110 } };
      expect(module.doesRecordNeedUpdate(record, {}, ctx)).toBe(false);
    });

    test('doesRecordNeedUpdate returns false if not dead', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/\n1 BIRT 2020',
      };
      const ctx = { treePrefs: { maxAliveAge: 110 } };
      expect(module.doesRecordNeedUpdate(record, {}, ctx)).toBe(false);
    });

    test('previewUpdate returns diff with DEAT Y line', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record);
      expect(result).toContain('<ins>');
      expect(result).toContain('1 DEAT Y');
      expect(result).toContain('<pre class="gedcom-data">');
    });

    test('previewUpdate result would add death fact', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record);
      expect(result).toContain('1 DEAT Y');
      expect(result).toContain('<ins>');
    });
  });

  describe('fix-ceme-tag module', () => {
    let module;

    beforeEach(() => {
      module = findDataFixModule('fix-ceme-tag');
    });

    test('operates on INDI records only', () => {
      expect(module.recordTypes).toEqual(['INDI']);
    });

    test('has optionsHtml method', () => {
      expect(typeof module.optionsHtml).toBe('function');
      const html = module.optionsHtml();
      expect(html).toContain('convert');
      expect(html).toContain('ADDR');
      expect(html).toContain('PLAC');
    });

    test('doesRecordNeedUpdate returns false when no CEME tags', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/\n1 BURI Y',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(false);
    });

    test('doesRecordNeedUpdate returns true when CEME tag present', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 BURI Y\n2 CEME Cemetery Name',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(true);
    });

    test('previewUpdate converts CEME to ADDR by default', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 BURI Y\n2 CEME My Cemetery',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record, { convert: 'ADDR' });
      expect(result).toContain('ADDR');
      expect(result).toContain('My Cemetery');
    });

    test('previewUpdate converts CEME to PLAC when specified', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 BURI Y\n2 CEME My Cemetery',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record, { convert: 'PLAC' });
      expect(result).toContain('PLAC');
      expect(result).toContain('My Cemetery');
    });

    test('previewUpdate with ADDR conversion', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 BURI Y\n2 CEME My Cemetery',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record, { convert: 'ADDR' });
      expect(result).toContain('ADDR');
      expect(result).toContain('My Cemetery');
    });
  });

  describe('fix-duplicate-links module', () => {
    let module;

    beforeEach(() => {
      module = findDataFixModule('fix-duplicate-links');
    });

    test('operates on correct record types', () => {
      expect(module.recordTypes).toContain('FAM');
      expect(module.recordTypes).toContain('INDI');
      expect(module.recordTypes).toContain('OBJE');
      expect(module.recordTypes).toContain('NOTE');
      expect(module.recordTypes).toContain('REPO');
      expect(module.recordTypes).toContain('SOUR');
      expect(module.recordTypes).toContain('SUBM');
      expect(module.recordTypes).not.toContain('_LOC');
    });

    test('doesRecordNeedUpdate returns false without duplicates', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/\n1 FAMS @F1@',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(false);
    });

    test('doesRecordNeedUpdate returns true with duplicate OBJE links', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 OBJE @M1@\n1 OBJE @M1@',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(true);
    });

    test('previewUpdate removes duplicate blocks', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 OBJE @M1@\n1 OBJE @M1@',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record);
      expect(result).toContain('<del>');
      expect(result).toContain('OBJE @M1@');
    });

    test('previewUpdate actually removes the duplicate', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 OBJE @M1@\n1 OBJE @M1@',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record);
      expect(result).toContain('<del>');
    });
  });

  describe('fix-name-slashes-spaces module', () => {
    let module;

    beforeEach(() => {
      module = findDataFixModule('fix-name-slashes-spaces');
    });

    test('operates on INDI records only', () => {
      expect(module.recordTypes).toEqual(['INDI']);
    });

    test('doesRecordNeedUpdate returns false for correct format', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(false);
    });

    test('doesRecordNeedUpdate returns true for John/Doe/ format', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John/Doe/',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(true);
    });

    test('doesRecordNeedUpdate returns true for John /Doe format', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(true);
    });

    test('previewUpdate fixes slash spacing', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 NAME John/Doe/',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record);
      expect(result).toContain('John /Doe/');
    });
  });

  describe('fix-name-tags module', () => {
    let module;

    beforeEach(() => {
      module = findDataFixModule('fix-name-tags');
    });

    test('operates on INDI records only', () => {
      expect(module.recordTypes).toEqual(['INDI']);
    });

    test('doesRecordNeedUpdate returns false without name tags', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(false);
    });

    test('doesRecordNeedUpdate returns true with _MARNM tag', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/\n2 _MARNM Married Name',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(true);
    });

    test('doesRecordNeedUpdate returns true with _AKA tag', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/\n2 _AKA Alias',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(true);
    });

    test('previewUpdate converts _MARNM to new NAME fact', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/\n2 _MARNM Smith',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record);
      expect(result).toContain('married');
    });
  });

  describe('fix-place-names module', () => {
    let module;

    beforeEach(() => {
      module = findDataFixModule('fix-place-names');
    });

    test('operates on FAM and INDI records', () => {
      expect(module.recordTypes).toContain('FAM');
      expect(module.recordTypes).toContain('INDI');
      expect(module.recordTypes).toHaveLength(2);
    });

    test('has optionsHtml method', () => {
      expect(typeof module.optionsHtml).toBe('function');
      const html = module.optionsHtml();
      expect(html).toContain('search-for');
      expect(html).toContain('replace-with');
    });

    test('candidatesForType returns null if search-for is empty', async () => {
      const pool = { query: vi.fn() };
      const result = await module.candidatesForType(pool, 1, 'INDI', { 'search-for': '', 'replace-with': 'New' });
      expect(result).toBeNull();
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('candidatesForType returns null if replace-with is empty', async () => {
      const pool = { query: vi.fn() };
      const result = await module.candidatesForType(pool, 1, 'INDI', { 'search-for': 'Old', 'replace-with': '' });
      expect(result).toBeNull();
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('doesRecordNeedUpdate returns false without matching place', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 BIRT\n2 PLAC England',
      };
      expect(module.doesRecordNeedUpdate(record, { 'search-for': 'USA' })).toBe(false);
    });

    test('doesRecordNeedUpdate returns true when search term is at end of place', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 BIRT\n2 PLAC Maine, USA',
      };
      expect(module.doesRecordNeedUpdate(record, { 'search-for': 'USA' })).toBe(true);
    });

    test('doesRecordNeedUpdate returns true for simple place name matching', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 BIRT\n2 PLAC USA',
      };
      expect(module.doesRecordNeedUpdate(record, { 'search-for': 'USA' })).toBe(true);
    });

    test('previewUpdate replaces place name', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 BIRT\n2 PLAC Maine, USA',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record, { 'search-for': 'USA', 'replace-with': 'United States' });
      expect(result).toContain('United States');
    });
  });

  describe('fix-prim-tag module', () => {
    let module;

    beforeEach(() => {
      module = findDataFixModule('fix-prim-tag');
    });

    test('operates on OBJE records only', () => {
      expect(module.recordTypes).toEqual(['OBJE']);
    });

    test('doesRecordNeedUpdate returns false without _PRIM tag', () => {
      const record = {
        type: 'OBJE',
        gedcom: '0 @M1@ OBJE\n1 FILE image.jpg',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(false);
    });

    test('doesRecordNeedUpdate returns true with _PRIM tag', () => {
      const record = {
        type: 'OBJE',
        gedcom: '0 @M1@ OBJE\n1 FILE image.jpg\n1 _PRIM Y',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(true);
    });

    test('previewUpdate includes linked individuals info', async () => {
      const record = {
        type: 'OBJE',
        xref: 'M1',
        gedcom: '0 @M1@ OBJE\n1 FILE image.jpg\n1 _PRIM Y',
      };
      const client = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { xref: 'I1', gedcom: '0 @I1@ INDI' },
          ],
        }),
      };
      const result = await module.previewUpdate(client, 1, record);
      expect(result).toContain('I1');
    });

    test('previewUpdate shows _PRIM facts and linked individuals', async () => {
      const record = {
        type: 'OBJE',
        xref: 'M1',
        gedcom: '0 @M1@ OBJE\n1 FILE image.jpg\n1 _PRIM Y',
      };
      const client = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { xref: 'I1', gedcom: '0 @I1@ INDI' },
          ],
        }),
      };
      const result = await module.previewUpdate(client, 1, record);
      expect(result).toContain('Delete');
      expect(result).toContain('_PRIM');
      expect(result).toContain('I1');
    });
  });

  describe('fix-search-and-replace module', () => {
    let module;

    beforeEach(() => {
      module = findDataFixModule('fix-search-and-replace');
    });

    test('operates on correct record types', () => {
      expect(module.recordTypes).toContain('FAM');
      expect(module.recordTypes).toContain('INDI');
      expect(module.recordTypes).toContain('_LOC');
      expect(module.recordTypes).toContain('OBJE');
      expect(module.recordTypes).toContain('NOTE');
      expect(module.recordTypes).toContain('REPO');
      expect(module.recordTypes).toContain('SOUR');
      expect(module.recordTypes).toContain('SUBM');
    });

    test('has optionsHtml method', () => {
      expect(typeof module.optionsHtml).toBe('function');
      const html = module.optionsHtml();
      expect(html).toContain('search-for');
      expect(html).toContain('replace-with');
      expect(html).toContain('method');
      expect(html).toContain('case');
      expect(html).toContain('type');
    });

    test('candidatesForType returns null if type does not match', async () => {
      const pool = { query: vi.fn() };
      const result = await module.candidatesForType(pool, 1, 'FAM', { type: 'INDI', 'search-for': 'test' });
      expect(result).toBeNull();
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('candidatesForType returns null if search-for is empty', async () => {
      const pool = { query: vi.fn() };
      const result = await module.candidatesForType(pool, 1, 'INDI', { type: 'INDI', 'search-for': '' });
      expect(result).toBeNull();
      expect(pool.query).not.toHaveBeenCalled();
    });

    test('doesRecordNeedUpdate with exact method', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/',
      };
      expect(module.doesRecordNeedUpdate(record, { 'search-for': 'John', method: 'exact' })).toBe(true);
      expect(module.doesRecordNeedUpdate(record, { 'search-for': 'Jane', method: 'exact' })).toBe(false);
    });

    test('doesRecordNeedUpdate with words method', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/',
      };
      expect(module.doesRecordNeedUpdate(record, { 'search-for': 'John', method: 'words' })).toBe(true);
      expect(module.doesRecordNeedUpdate(record, { 'search-for': 'oh', method: 'words' })).toBe(false);
    });

    test('doesRecordNeedUpdate with case-insensitive flag', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/',
      };
      expect(module.doesRecordNeedUpdate(record, { 'search-for': 'john', case: 'i' })).toBe(true);
      expect(module.doesRecordNeedUpdate(record, { 'search-for': 'john', case: '' })).toBe(false);
    });

    test('doesRecordNeedUpdate with invalid regex returns false', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/',
      };
      expect(module.doesRecordNeedUpdate(record, { 'search-for': '[invalid(regex', method: 'regex' })).toBe(false);
    });

    test('previewUpdate replaces text', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record, { 'search-for': 'John', 'replace-with': 'Jane', method: 'exact' });
      expect(result).toContain('Jane');
    });
  });

  describe('fix-wt-obje-sort module', () => {
    let module;

    beforeEach(() => {
      module = findDataFixModule('fix-wt-obje-sort');
    });

    test('operates on INDI records only', () => {
      expect(module.recordTypes).toEqual(['INDI']);
    });

    test('doesRecordNeedUpdate returns false without sort tags', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 NAME John /Doe/',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(false);
    });

    test('doesRecordNeedUpdate returns true with _WT_OBJE_SORT tag', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 _WT_OBJE_SORT M1',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(true);
    });

    test('doesRecordNeedUpdate returns true with _PGV_OBJE_SORT tag', () => {
      const record = {
        type: 'INDI',
        gedcom: '0 @I1@ INDI\n1 _PGV_OBJE_SORT M1',
      };
      expect(module.doesRecordNeedUpdate(record)).toBe(true);
    });

    test('previewUpdate generates diff output', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 _WT_OBJE_SORT @M1@\n1 OBJE @M1@\n1 OBJE @M2@',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record);
      expect(result).toContain('<pre class="gedcom-data">');
    });

    test('previewUpdate removes _WT_OBJE_SORT but keeps _PGV_OBJE_SORT', async () => {
      const record = {
        type: 'INDI',
        xref: 'I1',
        gedcom: '0 @I1@ INDI\n1 _WT_OBJE_SORT @M1@\n1 _PGV_OBJE_SORT @M2@\n1 OBJE @M1@\n1 OBJE @M2@',
      };
      const pool = {};
      const result = await module.previewUpdate(pool, 1, record);
      expect(result).toContain('<del>');
      expect(result).toContain('_WT_OBJE_SORT');
      expect(result).toContain('_PGV_OBJE_SORT');
    });
  });

  describe('recordsToFix', () => {
    test('returns empty array when no candidates', async () => {
      const module = {
        recordTypes: ['INDI'],
        candidatesForType: vi.fn().mockResolvedValue([]),
      };
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      const result = await recordsToFix(module, pool, 1, {});
      expect(result).toEqual([]);
    });

    test('returns candidates sorted by xref', async () => {
      const module = {
        recordTypes: ['INDI'],
        candidatesForType: vi.fn().mockResolvedValue(['I3', 'I1', 'I2']),
      };
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      const result = await recordsToFix(module, pool, 1, {});
      expect(result).toHaveLength(3);
      expect(result[0].xref).toBe('I1');
      expect(result[1].xref).toBe('I2');
      expect(result[2].xref).toBe('I3');
    });

    test('includes pending xrefs in results', async () => {
      const module = {
        recordTypes: ['INDI'],
        candidatesForType: vi.fn().mockResolvedValue(['I1', 'I2']),
      };
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [{ xref: 'I3' }],
        }),
      };
      const result = await recordsToFix(module, pool, 1, {});
      expect(result).toHaveLength(3);
      const xrefs = result.map((r) => r.xref);
      expect(xrefs).toContain('I1');
      expect(xrefs).toContain('I2');
      expect(xrefs).toContain('I3');
    });

    test('deduplicates xrefs from candidates and pending', async () => {
      const module = {
        recordTypes: ['INDI'],
        candidatesForType: vi.fn().mockResolvedValue(['I1', 'I2']),
      };
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [{ xref: 'I1' }, { xref: 'I3' }],
        }),
      };
      const result = await recordsToFix(module, pool, 1, {});
      expect(result).toHaveLength(3);
      const xrefs = result.map((r) => r.xref);
      expect(xrefs).toEqual(['I1', 'I2', 'I3']);
    });

    test('returns records with correct type field', async () => {
      const module = {
        recordTypes: ['INDI', 'FAM'],
        candidatesForType: vi.fn()
          .mockResolvedValueOnce(['I1'])
          .mockResolvedValueOnce(['F1']),
      };
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      const result = await recordsToFix(module, pool, 1, {});
      expect(result).toHaveLength(2);
      const indi = result.find((r) => r.xref === 'I1');
      const fam = result.find((r) => r.xref === 'F1');
      expect(indi.type).toBe('INDI');
      expect(fam.type).toBe('FAM');
    });

    test('skips type when candidatesForType returns null', async () => {
      const module = {
        recordTypes: ['INDI', 'FAM'],
        candidatesForType: vi.fn()
          .mockResolvedValueOnce(['I1'])
          .mockResolvedValueOnce(null),
      };
      const pool = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      const result = await recordsToFix(module, pool, 1, {});
      expect(result).toHaveLength(1);
      expect(result[0].xref).toBe('I1');
    });
  });

  describe('gedcomDiff', () => {
    test('returns HTML with gedcom-data class', () => {
      const result = gedcomDiff('old', 'new');
      expect(result).toContain('<pre class="gedcom-data">');
      expect(result).toContain('</pre>');
    });

    test('identical content produces no changes', () => {
      const result = gedcomDiff('0 @I1@ INDI\n1 NAME John /Doe/', '0 @I1@ INDI\n1 NAME John /Doe/');
      expect(result).not.toContain('<del>');
      expect(result).not.toContain('<ins>');
    });

    test('changed line produces both del and ins', () => {
      const result = gedcomDiff('0 @I1@ INDI\n1 NAME John /Doe/', '0 @I1@ INDI\n1 NAME Jane /Doe/');
      expect(result).toContain('<del>');
      expect(result).toContain('<ins>');
      expect(result).toContain('John');
      expect(result).toContain('Jane');
    });

    test('added line produces ins', () => {
      const result = gedcomDiff('0 @I1@ INDI\n1 NAME John /Doe/', '0 @I1@ INDI\n1 NAME John /Doe/\n1 DEAT Y');
      expect(result).toContain('<ins>');
      expect(result).toContain('1 DEAT Y');
    });

    test('removed line produces del', () => {
      const result = gedcomDiff('0 @I1@ INDI\n1 NAME John /Doe/\n1 DEAT Y', '0 @I1@ INDI\n1 NAME John /Doe/');
      expect(result).toContain('<del>');
      expect(result).toContain('1 DEAT Y');
    });

    test('escapes HTML characters', () => {
      const result = gedcomDiff('old<tag>', 'new<tag>');
      expect(result).toContain('&lt;tag&gt;');
      expect(result).not.toContain('<tag>');
    });

    test('each line ends with br tag', () => {
      const result = gedcomDiff('line1\nline2', 'line1\nline2');
      const lines = result.split('<br>');
      expect(lines.length).toBeGreaterThan(2);
    });
  });
});
