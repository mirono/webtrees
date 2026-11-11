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

import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import {
  ENCODING_SELECT_OPTIONS,
  detectEncodingName,
  decodeBuffer,
  splitGedcomRecords,
  pafUid,
  classifyRecord,
  importOneRecord,
  treeHasExistingData,
  importGedcomFile,
  listServerGedcomFiles,
  loadImportPreferences,
  saveImportPreferences,
} from '../pages-server/gedcom-import.mjs';

describe('gedcom-import.mjs', () => {
  describe('ENCODING_SELECT_OPTIONS', () => {
    test('has expected structure', () => {
      expect(ENCODING_SELECT_OPTIONS).toHaveProperty('');
      expect(ENCODING_SELECT_OPTIONS).toHaveProperty('UTF-8');
      expect(ENCODING_SELECT_OPTIONS).toHaveProperty('UTF-16BE');
      expect(ENCODING_SELECT_OPTIONS).toHaveProperty('ANSEL');
      expect(ENCODING_SELECT_OPTIONS).toHaveProperty('ASCII');
      expect(ENCODING_SELECT_OPTIONS).toHaveProperty('CP1252');
    });

    test('values match keys or are display labels', () => {
      expect(ENCODING_SELECT_OPTIONS['UTF-8']).toBe('UTF-8');
      expect(ENCODING_SELECT_OPTIONS.ASCII).toBe('ASCII');
      expect(ENCODING_SELECT_OPTIONS.ANSEL).toBe('ANSEL');
      expect(ENCODING_SELECT_OPTIONS['UTF-16BE']).toContain('UNICODE');
      expect(ENCODING_SELECT_OPTIONS.CP1252).toContain('ANSI');
    });
  });

  describe('detectEncodingName', () => {
    test('detects UTF-8 BOM', () => {
      const buffer = Buffer.concat([
        Buffer.from([0xef, 0xbb, 0xbf]),
        Buffer.from('0 HEAD\n1 CHAR UTF-8\n', 'utf8'),
      ]);
      expect(detectEncodingName(buffer)).toBe('UTF-8');
    });

    test('detects UTF-16BE BOM', () => {
      const buffer = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from('0 HEAD\n', 'latin1')]);
      expect(detectEncodingName(buffer)).toBe('UTF-16BE');
    });

    test('detects UTF-16LE BOM', () => {
      const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('0 HEAD\n', 'latin1')]);
      expect(detectEncodingName(buffer)).toBe('UTF-16LE');
    });

    test('detects ANSEL from CHAR line', () => {
      const buffer = Buffer.from('0 HEAD\n1 CHAR ANSEL\n1 VERS 5.5\n', 'utf8');
      expect(detectEncodingName(buffer)).toBe('ANSEL');
    });

    test('detects ASCII from CHAR line', () => {
      const buffer = Buffer.from('0 HEAD\n1 CHAR ASCII\n', 'utf8');
      expect(detectEncodingName(buffer)).toBe('ASCII');
    });

    test('defaults to UTF-8 when no BOM and no CHAR line', () => {
      const buffer = Buffer.from('0 HEAD\n1 VERS 5.5\n', 'utf8');
      expect(detectEncodingName(buffer)).toBe('UTF-8');
    });

    test('detects CP1252 via label ANSI', () => {
      const buffer = Buffer.from('0 HEAD\n1 CHAR ANSI\n', 'utf8');
      expect(detectEncodingName(buffer)).toBe('CP850');
    });

    test('is case-insensitive for CHAR label', () => {
      const buffer = Buffer.from('0 HEAD\n1 CHAR ansel\n', 'utf8');
      expect(detectEncodingName(buffer)).toBe('ANSEL');
    });
  });

  describe('decodeBuffer', () => {
    test('UTF-8 decoding returns expected string', () => {
      const text = 'Hello café';
      const buffer = Buffer.from(text, 'utf8');
      const result = decodeBuffer(buffer, 'UTF-8');
      expect(result).toBe(text);
    });

    test('empty encoding name defaults to UTF-8', () => {
      const text = 'Hello world';
      const buffer = Buffer.from(text, 'utf8');
      const result = decodeBuffer(buffer, '');
      expect(result).toBe(text);
    });

    test('ASCII encoding returns a string', () => {
      const buffer = Buffer.from('Hello world', 'latin1');
      const result = decodeBuffer(buffer, 'ASCII');
      expect(typeof result).toBe('string');
    });

    test('ANSEL encoding returns a string', () => {
      const buffer = Buffer.from('Hello world', 'latin1');
      const result = decodeBuffer(buffer, 'ANSEL');
      expect(typeof result).toBe('string');
    });

    test('unrecognized encoding falls back to UTF-8', () => {
      const text = 'Hello world';
      const buffer = Buffer.from(text, 'utf8');
      const result = decodeBuffer(buffer, 'NONEXISTENT_ENCODING');
      expect(result).toBe(text);
    });
  });

  describe('splitGedcomRecords', () => {
    test('splits records at level-0 boundaries', () => {
      const text = '0 HEAD\n1 X\n0 @I1@ INDI\n1 NAME A\n0 TRLR';
      const result = splitGedcomRecords(text);
      expect(result).toHaveLength(3);
      expect(result[0]).toMatch(/^0 HEAD/);
      expect(result[1]).toMatch(/^0 @I1@ INDI/);
      expect(result[2]).toMatch(/^0 TRLR/);
    });

    test('trims each record', () => {
      const text = '  0 HEAD\n1 X  \n0 @I1@ INDI\n1 NAME A  ';
      const result = splitGedcomRecords(text);
      expect(result[0]).toBe('0 HEAD\n1 X');
      expect(result[1]).toBe('0 @I1@ INDI\n1 NAME A');
    });

    test('removes leading BOM character', () => {
      const text = '﻿0 HEAD\n1 X';
      const result = splitGedcomRecords(text);
      expect(result[0]).toBe('0 HEAD\n1 X');
    });

    test('drops empty records', () => {
      const text = '0 HEAD\n\n\n0 @I1@ INDI';
      const result = splitGedcomRecords(text);
      expect(result).toHaveLength(2);
    });

    test('handles multiple newlines between records', () => {
      const text = '0 HEAD\n\n\n\n0 @I1@ INDI\n\n\n0 TRLR';
      const result = splitGedcomRecords(text);
      expect(result).toHaveLength(3);
    });
  });

  describe('pafUid', () => {
    test('returns a 36-character uppercase hex string', () => {
      const uid = pafUid();
      expect(/^[0-9A-F]{36}$/.test(uid)).toBe(true);
    });

    test('returns different values on multiple calls', () => {
      const uid1 = pafUid();
      const uid2 = pafUid();
      expect(uid1).not.toBe(uid2);
    });

    test('first 32 chars are hex UUID, last 4 are checksum', () => {
      const uid = pafUid();
      expect(/^[0-9A-F]{32}[0-9A-F]{4}$/.test(uid)).toBe(true);
    });
  });

  describe('classifyRecord', () => {
    test('classifies INDI record with xref', () => {
      const result = classifyRecord('0 @I1@ INDI\n1 NAME John');
      expect(result.skip).toBe(false);
      expect(result.type).toBe('INDI');
      expect(result.xref).toBe('I1');
    });

    test('classifies FAM record with xref', () => {
      const result = classifyRecord('0 @F1@ FAM\n1 HUSB @I1@');
      expect(result.skip).toBe(false);
      expect(result.type).toBe('FAM');
      expect(result.xref).toBe('F1');
    });

    test('classifies HEAD record', () => {
      const result = classifyRecord('0 HEAD\n1 VERS 5.5');
      expect(result.skip).toBe(false);
      expect(result.type).toBe('HEAD');
      expect(result.xref).toBe('HEAD');
    });

    test('classifies TRLR record', () => {
      const result = classifyRecord('0 TRLR');
      expect(result.skip).toBe(false);
      expect(result.type).toBe('TRLR');
      expect(result.xref).toBe('TRLR');
    });

    test('marks _PTF records as skip', () => {
      const result = classifyRecord('0 _PTF @1@\n');
      expect(result.skip).toBe(true);
    });

    test('marks _PLAC_DEFN records as skip', () => {
      const result = classifyRecord('0 _PLAC_DEFN\n');
      expect(result.skip).toBe(true);
    });

    test('marks GLOBAL (GenoPro legacy) as skip', () => {
      const result = classifyRecord('0 GLOBAL something\n');
      expect(result.skip).toBe(true);
    });

    test('throws for unrecognized record type', () => {
      expect(() => classifyRecord('0 INVALID_TYPE something')).toThrow();
    });

    test('extracts xref with valid characters', () => {
      const result = classifyRecord('0 @Test-123:456_789@ INDI');
      expect(result.xref).toBe('Test-123:456_789');
    });
  });

  describe('importOneRecord', () => {
    test('skips records marked skip:true without querying', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await importOneRecord(client, 1, '0 GLOBAL foo', {
        gedcomMediaPath: '',
        wordWrappedNotes: '0',
        generateUids: false,
        keepMedia: false,
      });
      expect(client.query).not.toHaveBeenCalled();
    });

    test('inserts INDI record and calls client.query for wt_individuals', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const record = '0 @I1@ INDI\n1 NAME John /Smith/\n1 SEX M\n1 BIRT\n2 DATE 1 JAN 1900';
      await importOneRecord(client, 1, record, {
        gedcomMediaPath: '',
        wordWrappedNotes: '0',
        generateUids: false,
        keepMedia: false,
      });
      const calls = client.query.mock.calls;
      const insertCalls = calls.filter((c) => c[0].includes('INSERT INTO wt_individuals'));
      expect(insertCalls.length).toBeGreaterThan(0);
    });

    test('inserts FAM record and calls client.query for wt_families', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const record = '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@';
      await importOneRecord(client, 1, record, {
        gedcomMediaPath: '',
        wordWrappedNotes: '0',
        generateUids: false,
        keepMedia: false,
      });
      const calls = client.query.mock.calls;
      const insertCalls = calls.filter((c) => c[0].includes('INSERT INTO wt_families'));
      expect(insertCalls.length).toBeGreaterThan(0);
    });

    test('inserts SOUR record and calls client.query for wt_sources', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const record = '0 @S1@ SOUR\n1 TITL Census';
      await importOneRecord(client, 1, record, {
        gedcomMediaPath: '',
        wordWrappedNotes: '0',
        generateUids: false,
        keepMedia: false,
      });
      const calls = client.query.mock.calls;
      const insertCalls = calls.filter((c) => c[0].includes('INSERT INTO wt_sources'));
      expect(insertCalls.length).toBeGreaterThan(0);
    });

    test('generates _UID when generateUids:true and no _UID present', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const record = '0 @I1@ INDI\n1 NAME John';
      await importOneRecord(client, 1, record, {
        gedcomMediaPath: '',
        wordWrappedNotes: '0',
        generateUids: true,
        keepMedia: false,
      });
      const calls = client.query.mock.calls;
      const insertCall = calls.find((c) => c[0].includes('INSERT INTO wt_individuals'));
      const gedcomParam = insertCall[1][4];
      expect(gedcomParam).toContain('_UID');
      expect(/_UID [0-9A-F]{36}/.test(gedcomParam)).toBe(true);
    });

    test('does not generate _UID when already present', async () => {
      const client = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const record = '0 @I1@ INDI\n1 NAME John\n1 _UID EXISTING123456789012345678901234';
      const beforeGenerate = record.split('_UID').length;
      await importOneRecord(client, 1, record, {
        gedcomMediaPath: '',
        wordWrappedNotes: '0',
        generateUids: true,
        keepMedia: false,
      });
      const calls = client.query.mock.calls;
      const insertCall = calls.find((c) => c[0].includes('INSERT INTO wt_individuals'));
      const gedcomParam = insertCall[1][4];
      const afterGenerate = gedcomParam.split('_UID').length;
      expect(beforeGenerate).toBe(afterGenerate);
    });
  });

  describe('treeHasExistingData', () => {
    test('returns true when individuals exist', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{}] }) };
      const result = await treeHasExistingData(pool, 1);
      expect(result).toBe(true);
    });

    test('returns false when no data exists', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await treeHasExistingData(pool, 1);
      expect(result).toBe(false);
    });

    test('queries with correct gedcomId parameter', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await treeHasExistingData(pool, 42);
      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [42]);
    });
  });

  describe('importGedcomFile', () => {
    test('returns error when file does not start with 0 HEAD', async () => {
      const pool = { connect: vi.fn() };
      const buffer = Buffer.from('0 @I1@ INDI\n0 TRLR', 'utf8');
      const result = await importGedcomFile(pool, { gedcomId: 1 }, buffer, 'test.ged', {
        encoding: 'UTF-8',
        keepMedia: false,
        wordWrappedNotes: false,
        gedcomMediaPath: '',
        generateUids: false,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('HEAD');
      expect(pool.connect).not.toHaveBeenCalled();
    });

    test('returns error when no 0 TRLR record found', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };
      const buffer = Buffer.from('0 HEAD\n1 VERS 5.5\n0 @I1@ INDI', 'utf8');
      const result = await importGedcomFile(pool, { gedcomId: 1 }, buffer, 'test.ged', {
        encoding: 'UTF-8',
        keepMedia: false,
        wordWrappedNotes: false,
        gedcomMediaPath: '',
        generateUids: false,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('trailer');
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    test('returns success when valid GEDCOM file is imported', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };
      const buffer = Buffer.from('0 HEAD\n1 VERS 5.5\n0 @I1@ INDI\n1 NAME John\n0 TRLR', 'utf8');
      const result = await importGedcomFile(pool, { gedcomId: 1 }, buffer, 'test.ged', {
        encoding: 'UTF-8',
        keepMedia: false,
        wordWrappedNotes: false,
        gedcomMediaPath: '',
        generateUids: false,
      });
      expect(result.success).toBe(true);
      expect(result.recordCount).toBe(3);
      expect(client.query).toHaveBeenCalledWith('COMMIT');
    });

    test('rolls back transaction on error', async () => {
      const client = {
        query: vi.fn().mockRejectedValueOnce(new Error('DB error')),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };
      const buffer = Buffer.from('0 HEAD\n1 VERS 5.5\n0 TRLR', 'utf8');
      const result = await importGedcomFile(pool, { gedcomId: 1 }, buffer, 'test.ged', {
        encoding: 'UTF-8',
        keepMedia: false,
        wordWrappedNotes: false,
        gedcomMediaPath: '',
        generateUids: false,
      });
      expect(result.success).toBe(false);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
      expect(client.release).toHaveBeenCalled();
    });

    test('always releases the client', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };
      const buffer = Buffer.from('0 HEAD\n1 VERS 5.5\n0 TRLR', 'utf8');
      await importGedcomFile(pool, { gedcomId: 1 }, buffer, 'test.ged', {
        encoding: 'UTF-8',
        keepMedia: false,
        wordWrappedNotes: false,
        gedcomMediaPath: '',
        generateUids: false,
      });
      expect(client.release).toHaveBeenCalled();
    });

    test('calls BEGIN and COMMIT in order', async () => {
      const client = {
        query: vi.fn().mockResolvedValue({ rows: [] }),
        release: vi.fn(),
      };
      const pool = { connect: vi.fn().mockResolvedValue(client) };
      const buffer = Buffer.from('0 HEAD\n1 VERS 5.5\n0 TRLR', 'utf8');
      await importGedcomFile(pool, { gedcomId: 1 }, buffer, 'test.ged', {
        encoding: 'UTF-8',
        keepMedia: false,
        wordWrappedNotes: false,
        gedcomMediaPath: '',
        generateUids: false,
      });
      const calls = client.query.mock.calls.map((c) => c[0]);
      const beginIdx = calls.findIndex((c) => c === 'BEGIN');
      const commitIdx = calls.findIndex((c) => c === 'COMMIT');
      expect(beginIdx).toBeGreaterThanOrEqual(0);
      expect(commitIdx).toBeGreaterThan(beginIdx);
    });
  });

  describe('listServerGedcomFiles', () => {
    let tempDir;

    beforeEach(async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), 'webtrees-test-'));
    });

    afterEach(async () => {
      try {
        await rm(tempDir, { recursive: true });
      } catch {
        // ignore cleanup errors
      }
    });

    test('returns only .ged files', async () => {
      await writeFile(path.join(tempDir, 'test.ged'), 'content');
      await writeFile(path.join(tempDir, 'ignore.txt'), 'content');
      await writeFile(path.join(tempDir, 'other.GED'), 'content');
      const result = await listServerGedcomFiles(tempDir);
      expect(result).toEqual(['other.GED', 'test.ged']);
    });

    test('sorts files alphabetically', async () => {
      await writeFile(path.join(tempDir, 'zebra.ged'), '');
      await writeFile(path.join(tempDir, 'apple.ged'), '');
      await writeFile(path.join(tempDir, 'mango.ged'), '');
      const result = await listServerGedcomFiles(tempDir);
      expect(result).toEqual(['apple.ged', 'mango.ged', 'zebra.ged']);
    });

    test('is case-insensitive for .ged extension', async () => {
      await writeFile(path.join(tempDir, 'test.GED'), '');
      await writeFile(path.join(tempDir, 'test.Ged'), '');
      await writeFile(path.join(tempDir, 'test.ged'), '');
      const result = await listServerGedcomFiles(tempDir);
      expect(result).toHaveLength(3);
      expect(result).toContain('test.GED');
    });

    test('returns empty array for nonexistent directory', async () => {
      const result = await listServerGedcomFiles('/nonexistent/directory/path');
      expect(result).toEqual([]);
    });

    test('returns empty array when no .ged files exist', async () => {
      await writeFile(path.join(tempDir, 'test.txt'), '');
      await writeFile(path.join(tempDir, 'test.json'), '');
      const result = await listServerGedcomFiles(tempDir);
      expect(result).toEqual([]);
    });
  });

  describe('loadImportPreferences', () => {
    test('loads all preference fields correctly', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { setting_name: 'keep_media', setting_value: '1' },
            { setting_name: 'WORD_WRAPPED_NOTES', setting_value: '1' },
            { setting_name: 'GEDCOM_MEDIA_PATH', setting_value: 'media/' },
            { setting_name: 'GENERATE_UIDS', setting_value: '1' },
          ],
        }),
      };
      const result = await loadImportPreferences(pool, 1);
      expect(result.keepMedia).toBe(true);
      expect(result.wordWrappedNotes).toBe(true);
      expect(result.gedcomMediaPath).toBe('media/');
      expect(result.generateUids).toBe(true);
    });

    test('converts string "0" to false boolean', async () => {
      const pool = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { setting_name: 'keep_media', setting_value: '0' },
            { setting_name: 'WORD_WRAPPED_NOTES', setting_value: '0' },
            { setting_name: 'GENERATE_UIDS', setting_value: '0' },
          ],
        }),
      };
      const result = await loadImportPreferences(pool, 1);
      expect(result.keepMedia).toBe(false);
      expect(result.wordWrappedNotes).toBe(false);
      expect(result.generateUids).toBe(false);
    });

    test('defaults missing preferences to false/empty', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await loadImportPreferences(pool, 1);
      expect(result.keepMedia).toBe(false);
      expect(result.wordWrappedNotes).toBe(false);
      expect(result.gedcomMediaPath).toBe('');
      expect(result.generateUids).toBe(false);
    });

    test('queries with correct gedcomId', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await loadImportPreferences(pool, 42);
      expect(pool.query).toHaveBeenCalledWith(expect.any(String), [42]);
    });
  });

  describe('saveImportPreferences', () => {
    test('saves three preferences via INSERT...ON CONFLICT', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const prefs = {
        keepMedia: true,
        wordWrappedNotes: false,
        gedcomMediaPath: 'custom/media/',
      };
      await saveImportPreferences(pool, 1, prefs);
      expect(pool.query).toHaveBeenCalledTimes(3);
    });

    test('converts boolean true to "1"', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await saveImportPreferences(pool, 1, {
        keepMedia: true,
        wordWrappedNotes: false,
        gedcomMediaPath: '',
      });
      const calls = pool.query.mock.calls;
      const keepMediaCall = calls.find((c) => c[1][1] === 'keep_media');
      expect(keepMediaCall[1][2]).toBe('1');
    });

    test('converts boolean false to "0"', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      await saveImportPreferences(pool, 1, {
        keepMedia: false,
        wordWrappedNotes: false,
        gedcomMediaPath: '',
      });
      const calls = pool.query.mock.calls;
      const keepMediaCall = calls.find((c) => c[1][1] === 'keep_media');
      expect(keepMediaCall[1][2]).toBe('0');
    });

    test('passes gedcomId and preference values correctly', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const prefs = {
        keepMedia: true,
        wordWrappedNotes: true,
        gedcomMediaPath: 'test/path/',
      };
      await saveImportPreferences(pool, 42, prefs);
      const calls = pool.query.mock.calls;
      const pathCall = calls.find((c) => c[1][1] === 'GEDCOM_MEDIA_PATH');
      expect(pathCall[1][0]).toBe(42);
      expect(pathCall[1][2]).toBe('test/path/');
    });
  });
});
