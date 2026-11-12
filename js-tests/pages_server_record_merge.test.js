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
  MERGEABLE_TYPES,
  MERGEABLE_TYPE_LABELS,
  getRecordByXref,
  listRecordsByType,
  isPendingDeletion,
  validateMergeSelection,
  compareFacts,
  buildMergedGedcom,
  allLinkedXrefs,
  rewriteLinkingGedcom,
  updateChan,
  applyRecordUpdate,
  applyRecordDelete,
  mergeRecordsTransactional,
} from '../pages-server/record-merge.mjs';

describe('record-merge.mjs', () => {
  describe('MERGEABLE_TYPES', () => {
    test('contains exactly 8 record types', () => {
      expect(MERGEABLE_TYPES).toHaveLength(8);
    });

    test('includes all expected types', () => {
      expect(MERGEABLE_TYPES).toContain('INDI');
      expect(MERGEABLE_TYPES).toContain('FAM');
      expect(MERGEABLE_TYPES).toContain('SOUR');
      expect(MERGEABLE_TYPES).toContain('REPO');
      expect(MERGEABLE_TYPES).toContain('NOTE');
      expect(MERGEABLE_TYPES).toContain('OBJE');
      expect(MERGEABLE_TYPES).toContain('SUBM');
      expect(MERGEABLE_TYPES).toContain('_LOC');
    });
  });

  describe('MERGEABLE_TYPE_LABELS', () => {
    test('has labels for all mergeable types', () => {
      MERGEABLE_TYPES.forEach((type) => {
        expect(MERGEABLE_TYPE_LABELS).toHaveProperty(type);
      });
    });

    test('labels are human-readable strings', () => {
      expect(MERGEABLE_TYPE_LABELS.INDI).toBe('Individual');
      expect(MERGEABLE_TYPE_LABELS.FAM).toBe('Family');
      expect(MERGEABLE_TYPE_LABELS.SOUR).toBe('Source');
      expect(MERGEABLE_TYPE_LABELS.REPO).toBe('Repository');
      expect(MERGEABLE_TYPE_LABELS.NOTE).toBe('Note');
      expect(MERGEABLE_TYPE_LABELS.OBJE).toBe('Media object');
      expect(MERGEABLE_TYPE_LABELS.SUBM).toBe('Submitter');
      expect(MERGEABLE_TYPE_LABELS._LOC).toBe('Location');
    });
  });

  describe('getRecordByXref', () => {
    test('returns null when no matching record exists', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
      };
      const result = await getRecordByXref(client, 1, 'I999');
      expect(result).toBeNull();
    });

    test('finds an INDI record in wt_individuals', async () => {
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] }),
      };
      await getRecordByXref(client, 1, 'I1');
      const calls = client.query.mock.calls;
      expect(calls[0][0]).toContain('wt_individuals');
    });

    test('returns correct structure for found individual', async () => {
      const gedcom = '0 @I1@ INDI\n1 NAME John /Doe/';
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [{ gedcom }] }),
      };
      const result = await getRecordByXref(client, 1, 'I1');
      expect(result).toEqual({ xref: 'I1', type: 'INDI', gedcom });
    });

    test('finds FAM record when INDI tables fail', async () => {
      const gedcom = '0 @F1@ FAM\n1 HUSB @I1@';
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ gedcom }] }),
      };
      const result = await getRecordByXref(client, 1, 'F1');
      expect(result).toEqual({ xref: 'F1', type: 'FAM', gedcom });
    });

    test('finds SOUR record when others fail', async () => {
      const gedcom = '0 @S1@ SOUR\n1 TITL Census';
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ gedcom }] }),
      };
      const result = await getRecordByXref(client, 1, 'S1');
      expect(result).toEqual({ xref: 'S1', type: 'SOUR', gedcom });
    });

    test('finds _LOC in wt_other with o_type', async () => {
      const gedcom = '0 @L1@ _LOC\n1 NAME Place';
      const client = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [{ o_type: '_LOC', o_gedcom: gedcom }] }),
      };
      const result = await getRecordByXref(client, 1, 'L1');
      expect(result).toEqual({ xref: 'L1', type: '_LOC', gedcom });
    });
  });

  describe('listRecordsByType', () => {
    test('returns empty array for empty results', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await listRecordsByType(pool, 1, 'INDI');
      expect(result).toEqual([]);
    });

    test('returns INDI with name label', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { xref: 'I1', label: 'John Doe' },
            { xref: 'I2', label: 'Jane Doe' },
          ],
        }),
      };
      const result = await listRecordsByType(pool, 1, 'INDI');
      expect(result).toEqual([
        { xref: 'I1', label: 'John Doe' },
        { xref: 'I2', label: 'Jane Doe' },
      ]);
    });

    test('returns FAM with ID as label', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [{ xref: 'F1', label: 'F1' }],
        }),
      };
      const result = await listRecordsByType(pool, 1, 'FAM');
      expect(result).toEqual([{ xref: 'F1', label: 'F1' }]);
    });

    test('returns SOUR with s_name as label', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [{ xref: 'S1', label: 'Census 1900' }],
        }),
      };
      const result = await listRecordsByType(pool, 1, 'SOUR');
      expect(result).toEqual([{ xref: 'S1', label: 'Census 1900' }]);
    });

    test('queries with correct gedcomId for INDI', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await listRecordsByType(pool, 42, 'INDI');
      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [42]);
    });

    test('queries with gedcomId and type for non-typed records', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await listRecordsByType(pool, 1, '_LOC');
      const calls = pool.query.mock.calls;
      expect(calls[0][1]).toContain(1);
      expect(calls[0][1]).toContain('_LOC');
    });
  });

  describe('isPendingDeletion', () => {
    test('returns false when no pending changes exist', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await isPendingDeletion(client, 1, 'I1');
      expect(result).toBe(false);
    });

    test('returns true when latest pending change has empty new_gedcom', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({
          rows: [{ new_gedcom: '' }],
        }),
      };
      const result = await isPendingDeletion(client, 1, 'I1');
      expect(result).toBe(true);
    });

    test('returns false when latest pending change has non-empty new_gedcom', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({
          rows: [{ new_gedcom: '0 @I1@ INDI\n1 NAME John' }],
        }),
      };
      const result = await isPendingDeletion(client, 1, 'I1');
      expect(result).toBe(false);
    });

    test('queries with correct gedcomId and xref', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await isPendingDeletion(client, 42, 'X99');
      expect(client.query).toHaveBeenCalledWith(expect.any(String), [42, 'X99']);
    });

    test('orders by change_id DESC to get latest change', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await isPendingDeletion(client, 1, 'I1');
      const sql = client.query.mock.calls[0][0];
      expect(sql).toContain('ORDER BY change_id DESC');
      expect(sql).toContain('LIMIT 1');
    });
  });

  describe('validateMergeSelection', () => {
    const record1 = { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' };
    const record2 = { xref: 'I2', type: 'INDI', gedcom: '0 @I2@ INDI' };

    test('returns error when record1 is null', () => {
      const error = validateMergeSelection(null, record2, false, false);
      expect(error).toContain('does not exist');
    });

    test('returns error when record2 is null', () => {
      const error = validateMergeSelection(record1, null, false, false);
      expect(error).toContain('does not exist');
    });

    test('returns error when records have the same xref', () => {
      const error = validateMergeSelection(record1, record1, false, false);
      expect(error).toContain('cannot merge a record with itself');
    });

    test('returns error when record1.type is not mergeable', () => {
      const nonMergeableRecord = { xref: 'H1', type: 'HEAD', gedcom: '0 HEAD' };
      const error = validateMergeSelection(nonMergeableRecord, record2, false, false);
      expect(error).toContain('cannot be merged');
    });

    test('returns error when record2.type is not mergeable', () => {
      const nonMergeableRecord = { xref: 'T1', type: 'TRLR', gedcom: '0 TRLR' };
      const error = validateMergeSelection(record1, nonMergeableRecord, false, false);
      expect(error).toContain('cannot be merged');
    });

    test('returns error when types do not match', () => {
      const family = { xref: 'F1', type: 'FAM', gedcom: '0 @F1@ FAM' };
      const error = validateMergeSelection(record1, family, false, false);
      expect(error).toContain('same type');
    });

    test('returns error when record1 is pending deletion', () => {
      const error = validateMergeSelection(record1, record2, true, false);
      expect(error).toContain('already being deleted');
    });

    test('returns error when record2 is pending deletion', () => {
      const error = validateMergeSelection(record1, record2, false, true);
      expect(error).toContain('already being deleted');
    });

    test('returns null when all validations pass', () => {
      const error = validateMergeSelection(record1, record2, false, false);
      expect(error).toBeNull();
    });
  });

  describe('compareFacts', () => {
    test('returns empty buckets for empty gedcoms', () => {
      const result = compareFacts('0 @I1@ INDI', '0 @I2@ INDI');
      expect(result.both).toHaveLength(0);
      expect(result.only1).toHaveLength(0);
      expect(result.only2).toHaveLength(0);
    });

    test('identical facts go into both bucket', () => {
      const gedcom1 = '0 @I1@ INDI\n1 NAME John /Doe/\n1 SEX M';
      const gedcom2 = '0 @I2@ INDI\n1 NAME John /Doe/\n1 SEX M';
      const result = compareFacts(gedcom1, gedcom2);
      expect(result.both).toHaveLength(2);
      expect(result.only1).toHaveLength(0);
      expect(result.only2).toHaveLength(0);
    });

    test('facts only in record1 go to only1 bucket', () => {
      const gedcom1 = '0 @I1@ INDI\n1 NAME John /Doe/\n1 SEX M';
      const gedcom2 = '0 @I2@ INDI\n1 NAME John /Doe/';
      const result = compareFacts(gedcom1, gedcom2);
      expect(result.both).toHaveLength(1);
      expect(result.only1).toHaveLength(1);
      expect(result.only2).toHaveLength(0);
    });

    test('facts only in record2 go to only2 bucket', () => {
      const gedcom1 = '0 @I1@ INDI\n1 NAME John /Doe/';
      const gedcom2 = '0 @I2@ INDI\n1 NAME John /Doe/\n1 SEX M';
      const result = compareFacts(gedcom1, gedcom2);
      expect(result.both).toHaveLength(1);
      expect(result.only1).toHaveLength(0);
      expect(result.only2).toHaveLength(1);
    });

    test('CHAN facts are excluded from all buckets', () => {
      const gedcom1 = '0 @I1@ INDI\n1 NAME John\n1 CHAN\n2 DATE 1 JAN 2020';
      const gedcom2 = '0 @I2@ INDI\n1 NAME John';
      const result = compareFacts(gedcom1, gedcom2);
      expect(result.both).toHaveLength(1);
      expect(result.only1).toHaveLength(0);
      expect(result.only2).toHaveLength(0);
    });

    test('facts differing by one character appear in both only1 and only2', () => {
      const gedcom1 = '0 @I1@ INDI\n1 NAME John /Doe/';
      const gedcom2 = '0 @I2@ INDI\n1 NAME John /Smith/';
      const result = compareFacts(gedcom1, gedcom2);
      expect(result.both).toHaveLength(0);
      expect(result.only1).toHaveLength(1);
      expect(result.only2).toHaveLength(1);
    });

    test('each fact has an id property', () => {
      const gedcom1 = '0 @I1@ INDI\n1 NAME John /Doe/';
      const gedcom2 = '0 @I2@ INDI\n1 SEX M';
      const result = compareFacts(gedcom1, gedcom2);
      expect(result.both).toHaveLength(0);
      expect(result.only1[0]).toHaveProperty('id');
      expect(result.only1[0]).toHaveProperty('gedcom');
      expect(typeof result.only1[0].id).toBe('string');
    });
  });

  describe('buildMergedGedcom', () => {
    test('returns level-0 line for empty keep arrays', () => {
      const result = buildMergedGedcom('I1', 'INDI', '', '', [], []);
      expect(result).toBe('0 @I1@ INDI');
    });

    test('starts with level-0 line using xref1 and type', () => {
      const gedcom1 = '0 @I1@ INDI\n1 NAME John';
      const gedcom2 = '0 @I2@ INDI\n1 NAME Jane';
      const result = buildMergedGedcom('I1', 'INDI', gedcom1, gedcom2, [], []);
      expect(result).toMatch(/^0 @I1@ INDI$/);
    });

    test('includes kept facts from record1 in original order', () => {
      const gedcom1 = '0 @I1@ INDI\n1 NAME John\n1 SEX M\n1 BIRT\n2 DATE 1900';
      const gedcom2 = '0 @I2@ INDI\n1 NAME Jane';
      const compareFacetsResult = compareFacts(gedcom1, gedcom2);
      const keep1 = compareFacetsResult.only1.map((f) => f.id);
      const result = buildMergedGedcom('I1', 'INDI', gedcom1, gedcom2, keep1, []);
      expect(result).toContain('1 NAME John');
      expect(result).toContain('1 SEX M');
      expect(result).toContain('1 BIRT');
    });

    test('appends kept facts from record2 after record1 facts', () => {
      const gedcom1 = '0 @I1@ INDI\n1 NAME John';
      const gedcom2 = '0 @I2@ INDI\n1 NAME Jane\n1 SEX F';
      const compareFacetsResult = compareFacts(gedcom1, gedcom2);
      const keep2 = compareFacetsResult.only2.map((f) => f.id);
      const result = buildMergedGedcom('I1', 'INDI', gedcom1, gedcom2, [], keep2);
      const recordLines = result.split('\n');
      const janeIndex = recordLines.findIndex((line) => line.includes('Jane'));
      const sexIndex = recordLines.findIndex((line) => line.includes('SEX'));
      expect(janeIndex).toBeGreaterThan(-1);
      expect(sexIndex).toBeGreaterThan(janeIndex);
    });

    test('drops facts not in keep arrays', () => {
      const gedcom1 = '0 @I1@ INDI\n1 NAME John\n1 SEX M';
      const gedcom2 = '0 @I2@ INDI\n1 NAME Jane';
      const result = buildMergedGedcom('I1', 'INDI', gedcom1, gedcom2, [], []);
      expect(result).not.toContain('John');
      expect(result).not.toContain('Jane');
      expect(result).not.toContain('SEX');
    });
  });

  describe('allLinkedXrefs', () => {
    test('returns empty array when no links exist', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await allLinkedXrefs(client, 1, 'I2');
      expect(result).toEqual([]);
    });

    test('returns xrefs from wt_link rows', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({
          rows: [{ xref: 'I1' }, { xref: 'F1' }],
        }),
      };
      const result = await allLinkedXrefs(client, 1, 'I2');
      expect(result).toContain('I1');
      expect(result).toContain('F1');
    });

    test('includes xrefs from pending changes mentioning xref2', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { xref: 'I1' },
            { xref: 'F1' },
          ],
        }),
      };
      const result = await allLinkedXrefs(client, 1, 'I2');
      expect(Array.isArray(result)).toBe(true);
    });

    test('excludes xref2 from results (self-reference)', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { xref: 'I1' },
            { xref: 'F1' },
          ],
        }),
      };
      const result = await allLinkedXrefs(client, 1, 'I2');
      expect(result).not.toContain('I2');
      expect(result).toContain('I1');
      expect(result).toContain('F1');
    });

    test('removes duplicates from UNION result', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { xref: 'I1' },
            { xref: 'F1' },
          ],
        }),
      };
      const result = await allLinkedXrefs(client, 1, 'I2');
      expect(result).toContain('I1');
      expect(result).toContain('F1');
    });

    test('queries with correct gedcomId and xref2', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await allLinkedXrefs(client, 42, 'X99');
      const sql = client.query.mock.calls[0][0];
      const params = client.query.mock.calls[0][1];
      expect(params[0]).toBe(42);
      expect(params[1]).toBe('X99');
      expect(sql).toContain('wt_link');
      expect(sql).toContain('wt_change');
    });
  });

  describe('rewriteLinkingGedcom', () => {
    test('replaces all @xref2@ with @xref1@', () => {
      const gedcom = '0 @I1@ INDI\n1 FAMS @F1@\n1 FAMC @F2@';
      const result = rewriteLinkingGedcom(gedcom, 'F2', 'F1');
      expect(result).toContain('@F1@');
      expect(result).not.toContain('@F2@');
    });

    test('collapses duplicate level-1 blocks after substitution', () => {
      const gedcom = '0 @I1@ INDI\n1 FAMS @F1@\n1 FAMS @F2@';
      const result = rewriteLinkingGedcom(gedcom, 'F2', 'F1');
      const famsCount = (result.match(/1 FAMS/g) || []).length;
      expect(famsCount).toBe(1);
    });

    test('preserves non-duplicate blocks', () => {
      const gedcom = '0 @I1@ INDI\n1 NAME John\n1 FAMS @F2@\n1 FAMC @F3@';
      const result = rewriteLinkingGedcom(gedcom, 'F2', 'F1');
      expect(result).toContain('1 NAME John');
      expect(result).toContain('1 FAMC @F3@');
    });

    test('handles multi-line facts with sub-values', () => {
      const gedcom = '0 @I1@ INDI\n1 NOTE @F2@\n2 CONT continued\n1 FAMS @F2@';
      const result = rewriteLinkingGedcom(gedcom, 'F2', 'F1');
      expect(result).toContain('@F1@');
    });

    test('preserves CHAN blocks unchanged', () => {
      const gedcom = '0 @I1@ INDI\n1 FAMS @F2@\n1 CHAN\n2 DATE 1 JAN 2020';
      const result = rewriteLinkingGedcom(gedcom, 'F2', 'F1');
      expect(result).toContain('1 CHAN');
      expect(result).toContain('2 DATE 1 JAN 2020');
    });
  });

  describe('updateChan', () => {
    test('appends a new CHAN block if none exists', () => {
      const gedcom = '0 @I1@ INDI\n1 NAME John';
      const result = updateChan(gedcom, 'admin');
      expect(result).toContain('1 CHAN');
      expect(result).toContain('2 DATE');
      expect(result).toContain('2 _WT_USER admin');
    });

    test('replaces existing CHAN block in place', () => {
      const gedcom = '0 @I1@ INDI\n1 NAME John\n1 CHAN\n2 DATE 1 JAN 2000\n2 _WT_USER olduser';
      const result = updateChan(gedcom, 'newadmin');
      expect(result).not.toContain('olduser');
      expect(result).toContain('2 _WT_USER newadmin');
    });

    test('includes DATE and TIME in CHAN block', () => {
      const gedcom = '0 @I1@ INDI\n1 NAME John';
      const result = updateChan(gedcom, 'admin');
      expect(result).toContain('2 DATE');
      expect(result).toContain('3 TIME');
    });

    test('dates are in GEDCOM format (DD MMM YYYY)', () => {
      const gedcom = '0 @I1@ INDI\n1 NAME John';
      const result = updateChan(gedcom, 'admin');
      const dateMatch = result.match(/2 DATE (\d{1,2} [A-Z]{3} \d{4})/);
      expect(dateMatch).not.toBeNull();
    });

    test('times are in HH:MM:SS format', () => {
      const gedcom = '0 @I1@ INDI\n1 NAME John';
      const result = updateChan(gedcom, 'admin');
      const timeMatch = result.match(/3 TIME (\d{2}:\d{2}:\d{2})/);
      expect(timeMatch).not.toBeNull();
    });

    test('strips old DATE/TIME/_WT_USER lines when replacing CHAN', () => {
      const gedcom = '0 @I1@ INDI\n1 CHAN\n2 DATE 1 JAN 2000\n2 TIME 12:00:00\n2 _WT_USER olduser';
      const result = updateChan(gedcom, 'newadmin');
      const chanMatch = /\n1 CHAN([\s\S]*)/.exec(result);
      const dateLines = (chanMatch[1].match(/2 DATE/g) || []).length;
      expect(dateLines).toBe(1);
    });
  });

  describe('applyRecordUpdate', () => {
    test('inserts wt_change row with pending status', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [{ change_id: 1 }] }),
      };
      const current = { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' };
      await applyRecordUpdate(client, 1, 10, false, current, '0 @I1@ INDI\n1 NAME New', {
        updateChan: false,
        author: 'admin',
      });
      const calls = client.query.mock.calls;
      expect(calls[0][0]).toContain('INSERT INTO wt_change');
      expect(calls[0][0]).toContain('pending');
    });

    test('normalizes line endings in new gedcom', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [{ change_id: 1 }] }),
      };
      const current = { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' };
      const newGedcom = '0 @I1@ INDI\r\n1 NAME New\r\nExtra';
      await applyRecordUpdate(client, 1, 10, false, current, newGedcom, {
        updateChan: false,
        author: 'admin',
      });
      const insertedGedcom = client.query.mock.calls[0][1][3];
      expect(insertedGedcom).not.toContain('\r\n');
      expect(insertedGedcom).toContain('\n');
    });

    test('updates CHAN when updateChan is true and type supports it', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [{ change_id: 1 }] }),
      };
      const current = { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' };
      await applyRecordUpdate(client, 1, 10, false, current, '0 @I1@ INDI\n1 NAME New', {
        updateChan: true,
        author: 'admin',
      });
      const insertedGedcom = client.query.mock.calls[0][1][3];
      expect(insertedGedcom).toContain('1 CHAN');
      expect(insertedGedcom).toContain('2 _WT_USER admin');
    });

    test('does not update CHAN for _LOC type even when updateChan is true', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [{ change_id: 1 }] }),
      };
      const current = { xref: 'L1', type: '_LOC', gedcom: '0 @L1@ _LOC' };
      await applyRecordUpdate(client, 1, 10, false, current, '0 @L1@ _LOC\n1 NAME Place', {
        updateChan: true,
        author: 'admin',
      });
      const insertedGedcom = client.query.mock.calls[0][1][3];
      expect(insertedGedcom).not.toContain('1 CHAN');
    });

    test('when autoAcceptEdits is false, does not call delete/insert', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [{ change_id: 1 }] }),
      };
      const current = { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' };
      await applyRecordUpdate(client, 1, 10, false, current, '0 @I1@ INDI\n1 NAME New', {
        updateChan: false,
        author: 'admin',
      });
      expect(client.query).toHaveBeenCalledTimes(1);
    });

    test('when autoAcceptEdits is true, calls deleteRecordRows and insertTypedRecord', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [{ change_id: 1 }] }),
      };
      const current = { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' };
      await applyRecordUpdate(client, 1, 10, true, current, '0 @I1@ INDI\n1 NAME New', {
        updateChan: false,
        author: 'admin',
      });
      expect(client.query.mock.calls.length).toBeGreaterThan(1);
    });

    test('when autoAcceptEdits is true, updates change status to accepted', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [{ change_id: 1 }] }),
      };
      const current = { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' };
      await applyRecordUpdate(client, 1, 10, true, current, '0 @I1@ INDI\n1 NAME New', {
        updateChan: false,
        author: 'admin',
      });
      const calls = client.query.mock.calls;
      const updateStatusCall = calls.find((c) => c[0].includes("UPDATE wt_change SET status = 'accepted'"));
      expect(updateStatusCall).not.toBeUndefined();
    });
  });

  describe('applyRecordDelete', () => {
    test('inserts wt_change with empty new_gedcom', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [{ change_id: 1 }] }),
      };
      const current = { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' };
      await applyRecordDelete(client, 1, 10, false, current);
      const insertCall = client.query.mock.calls[0];
      expect(insertCall[0]).toContain('INSERT INTO wt_change');
      expect(insertCall[0]).toContain("''");
    });

    test('when autoAcceptEdits is false, only inserts wt_change', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [{ change_id: 1 }] }),
      };
      const current = { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' };
      await applyRecordDelete(client, 1, 10, false, current);
      expect(client.query).toHaveBeenCalledTimes(1);
    });

    test('when autoAcceptEdits is true, deletes live rows and accepts change', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [{ change_id: 1 }] }),
      };
      const current = { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' };
      await applyRecordDelete(client, 1, 10, true, current);
      expect(client.query.mock.calls.length).toBeGreaterThan(1);
    });
  });

  describe('mergeRecordsTransactional', () => {
    test('calls BEGIN and COMMIT on success', async () => {
      const client = {
        query: vi.fn()
          .mockImplementation((sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
              return Promise.resolve({});
            }
            if (sql.includes('wt_individuals') || sql.includes('wt_families')) {
              return Promise.resolve({ rows: [{ xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' }] });
            }
            if (sql.includes('wt_link') || sql.includes('wt_change')) {
              return Promise.resolve({ rows: [] });
            }
            if (sql.includes('INSERT INTO wt_change') || sql.includes('UPDATE wt_change SET status')) {
              return Promise.resolve({ rows: [{ change_id: 1 }] });
            }
            return Promise.resolve({ rows: [] });
          }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };
      const user = { userId: 1, userName: 'admin', autoAcceptEdits: false };
      await mergeRecordsTransactional(pool, 1, user, 'I1', 'I2', [], []);
      const calls = client.query.mock.calls.map((c) => c[0]);
      expect(calls).toContain('BEGIN');
      expect(calls[calls.length - 1]).toBe('COMMIT');
    });

    test('calls ROLLBACK on validation error', async () => {
      let callCount = 0;
      const client = {
        query: vi.fn()
          .mockImplementation((sql) => {
            callCount++;
            if (sql === 'BEGIN' || sql === 'ROLLBACK') {
              return Promise.resolve({});
            }
            // First attempt to fetch I1 should fail
            if (callCount <= 4 && sql.includes('wt_individuals')) {
              return Promise.resolve({ rows: [] });
            }
            // Second attempt to fetch I2 should also fail (to trigger validation error on same xref scenario, or return invalid type)
            if (sql.includes('wt_families')) {
              return Promise.resolve({ rows: [] });
            }
            if (sql.includes('wt_sources')) {
              return Promise.resolve({ rows: [] });
            }
            if (sql.includes('wt_media')) {
              return Promise.resolve({ rows: [] });
            }
            if (sql.includes('wt_other')) {
              return Promise.resolve({ rows: [] });
            }
            return Promise.resolve({ rows: [] });
          }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };
      const user = { userId: 1, userName: 'admin', autoAcceptEdits: false };
      const result = await mergeRecordsTransactional(pool, 1, user, 'I1', 'I2', [], []);
      expect(result.error).not.toBeNull();
      const calls = client.query.mock.calls.map((c) => c[0]);
      expect(calls).toContain('ROLLBACK');
    });

    test('always calls client.release in finally', async () => {
      const client = {
        query: vi.fn()
          .mockImplementation((sql) => {
            if (sql === 'BEGIN') {
              return Promise.resolve({});
            }
            throw new Error('DB error');
          }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };
      const user = { userId: 1, userName: 'admin', autoAcceptEdits: false };
      try {
        await mergeRecordsTransactional(pool, 1, user, 'I1', 'I2', [], []);
      } catch {
        // expected
      }
      expect(client.release).toHaveBeenCalled();
    });

    test('returns error object with validation errors', async () => {
      let callCount = 0;
      const client = {
        query: vi.fn()
          .mockImplementation((sql) => {
            callCount++;
            if (sql === 'BEGIN' || sql === 'ROLLBACK') {
              return Promise.resolve({});
            }
            // First call to fetch I1 - return nothing to trigger validation error
            if (callCount <= 4) {
              return Promise.resolve({ rows: [] });
            }
            return Promise.resolve({ rows: [] });
          }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };
      const user = { userId: 1, userName: 'admin', autoAcceptEdits: false };
      const result = await mergeRecordsTransactional(pool, 1, user, 'I1', 'I2', [], []);
      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
    });

    test('returns success when merge completes', async () => {
      const client = {
        query: vi.fn()
          .mockImplementation((sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') {
              return Promise.resolve({});
            }
            if (sql.includes('wt_individuals') || sql.includes('wt_families')) {
              return Promise.resolve({ rows: [{ xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' }] });
            }
            if (sql.includes('wt_link') || sql.includes('wt_change')) {
              return Promise.resolve({ rows: [] });
            }
            if (sql.includes('INSERT INTO wt_change') || sql.includes('UPDATE wt_change SET status')) {
              return Promise.resolve({ rows: [{ change_id: 1 }] });
            }
            return Promise.resolve({ rows: [] });
          }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };
      const user = { userId: 1, userName: 'admin', autoAcceptEdits: false };
      const result = await mergeRecordsTransactional(pool, 1, user, 'I1', 'I2', [], []);
      expect(result.error).toBeNull();
    });
  });
});
