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
import { writeFile, readFile } from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as exportGedcom from '../pages-server/gedcom-export.mjs';

vi.mock('fs/promises');

describe('gedcom-export.mjs', () => {
  describe('constants', () => {
    test('ACCESS_LEVELS has expected values', () => {
      expect(exportGedcom.ACCESS_LEVELS.gedadmin).toBe(0);
      expect(exportGedcom.ACCESS_LEVELS.user).toBe(1);
      expect(exportGedcom.ACCESS_LEVELS.visitor).toBe(2);
      expect(exportGedcom.ACCESS_LEVELS.none).toBe(-1);
    });

    test('ENCODING_OPTIONS has expected keys', () => {
      expect(exportGedcom.ENCODING_OPTIONS['UTF-8']).toBe('UTF-8');
      expect(exportGedcom.ENCODING_OPTIONS['UTF-16BE']).toBe('UNICODE (UTF16-BE)');
      expect(exportGedcom.ENCODING_OPTIONS.ANSEL).toBe('ANSEL');
      expect(exportGedcom.ENCODING_OPTIONS.ASCII).toBe('ASCII');
      expect(exportGedcom.ENCODING_OPTIONS.CP1252).toBe('ANSI (CP1252)');
    });

    test('FORMAT_OPTIONS contains expected formats', () => {
      expect(exportGedcom.FORMAT_OPTIONS).toContain('gedcom');
      expect(exportGedcom.FORMAT_OPTIONS).toContain('zip');
      expect(exportGedcom.FORMAT_OPTIONS).toContain('zipmedia');
      expect(exportGedcom.FORMAT_OPTIONS).toContain('gedzip');
    });

    test('PRIVACY_OPTIONS contains all levels', () => {
      expect(exportGedcom.PRIVACY_OPTIONS).toContain('none');
      expect(exportGedcom.PRIVACY_OPTIONS).toContain('gedadmin');
      expect(exportGedcom.PRIVACY_OPTIONS).toContain('user');
      expect(exportGedcom.PRIVACY_OPTIONS).toContain('visitor');
    });

    test('LINE_ENDINGS_OPTIONS contains both types', () => {
      expect(exportGedcom.LINE_ENDINGS_OPTIONS).toContain('CRLF');
      expect(exportGedcom.LINE_ENDINGS_OPTIONS).toContain('LF');
    });
  });

  describe('resolveExportFilenames', () => {
    test('returns expected structure with plain tree name', () => {
      const result = exportGedcom.resolveExportFilenames('mytree');
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('downloadFilename');
      expect(result).toHaveProperty('downloadFilenames');
      expect(result.filename).toBe('mytree');
      expect(result.downloadFilename).toBe('mytree');
    });

    test('strips .ged suffix (case-insensitive) from downloadFilename', () => {
      const lowerResult = exportGedcom.resolveExportFilenames('mytree.ged');
      expect(lowerResult.filename).toBe('mytree.ged');
      expect(lowerResult.downloadFilename).toBe('mytree');

      const upperResult = exportGedcom.resolveExportFilenames('mytree.GED');
      expect(upperResult.filename).toBe('mytree.GED');
      expect(upperResult.downloadFilename).toBe('mytree');

      const mixedResult = exportGedcom.resolveExportFilenames('mytree.Ged');
      expect(mixedResult.filename).toBe('mytree.Ged');
      expect(mixedResult.downloadFilename).toBe('mytree');
    });

    test('downloadFilenames object contains plain and date-suffixed keys', () => {
      const result = exportGedcom.resolveExportFilenames('mytree');
      const keys = Object.keys(result.downloadFilenames);
      expect(keys).toHaveLength(2);
      expect(keys[0]).toBe('mytree');
      expect(keys[1]).toMatch(/^mytree-\d{4}-\d{2}-\d{2}$/);
    });

    test('date-suffixed filename uses today\'s date in YYYY-MM-DD format', () => {
      const result = exportGedcom.resolveExportFilenames('mytree');
      const today = new Date();
      const expectedDateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const values = Object.values(result.downloadFilenames);
      expect(values[1]).toBe(`mytree-${expectedDateStr}`);
    });
  });

  describe('encodeGedcomText', () => {
    test('UTF-8 encoding returns a Buffer via Buffer.from(text, "utf8")', () => {
      const text = 'Hello world';
      const result = exportGedcom.encodeGedcomText(text, 'UTF-8');
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString('utf8')).toBe(text);
    });

    test('UTF-8 encoding handles non-ASCII characters', () => {
      const text = 'Hello 世界 مرحبا';
      const result = exportGedcom.encodeGedcomText(text, 'UTF-8');
      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.toString('utf8')).toBe(text);
    });

    test('non-UTF-8 encodings return a Buffer (not a string)', () => {
      const text = 'Hello';
      const encodings = ['UTF-16BE', 'ANSEL', 'ASCII', 'CP1252'];
      for (const encoding of encodings) {
        const result = exportGedcom.encodeGedcomText(text, encoding);
        expect(Buffer.isBuffer(result)).toBe(true);
      }
    });

    test('non-UTF-8 encodings produce different byte lengths for non-ASCII input', () => {
      const text = 'Hello café'; // contains é
      const utf8Result = exportGedcom.encodeGedcomText(text, 'UTF-8');
      const cp1252Result = exportGedcom.encodeGedcomText(text, 'CP1252');
      expect(utf8Result.length).not.toBe(cp1252Result.length);
    });

    test('ASCII encoding returns a Buffer', () => {
      const text = 'Hello';
      const result = exportGedcom.encodeGedcomText(text, 'ASCII');
      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe('loadMediaFolder', () => {
    test('returns media_folder from database when row exists', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ media_folder: 'custom/media/' }] }) };
      const result = await exportGedcom.loadMediaFolder(pool, 3);
      expect(result).toBe('custom/media/');
      expect(pool.query).toHaveBeenCalledWith('SELECT media_folder FROM wt_gedcom WHERE gedcom_id = $1', [3]);
    });

    test('defaults to "media/" when no row exists', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
      const result = await exportGedcom.loadMediaFolder(pool, 3);
      expect(result).toBe('media/');
    });

    test('defaults to "media/" when row exists but media_folder is null', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [{ media_folder: null }] }) };
      const result = await exportGedcom.loadMediaFolder(pool, 3);
      expect(result).toBe('media/');
    });
  });

  describe('readMediaFile', () => {
    let tempDir;

    beforeEach(async () => {
      tempDir = path.join(os.tmpdir(), 'webtrees-test-' + Math.random().toString(36).slice(2));
    });

    test('reads an existing file and returns a Buffer', async () => {
      const fsMock = await import('fs/promises');
      const testContent = Buffer.from('test file content');
      vi.mocked(fsMock.readFile).mockResolvedValue(testContent);

      const result = await exportGedcom.readMediaFile('/data/', 'media/', 'photo.jpg');
      expect(result).toEqual(testContent);
      expect(fsMock.readFile).toHaveBeenCalledWith('/data/media/photo.jpg');
    });

    test('returns null when file does not exist (ENOENT)', async () => {
      const fsMock = await import('fs/promises');
      vi.mocked(fsMock.readFile).mockRejectedValue(new Error('ENOENT'));

      const result = await exportGedcom.readMediaFile('/data/', 'media/', 'nonexistent.jpg');
      expect(result).toBeNull();
    });

    test('returns null on any read error', async () => {
      const fsMock = await import('fs/promises');
      vi.mocked(fsMock.readFile).mockRejectedValue(new Error('Permission denied'));

      const result = await exportGedcom.readMediaFile('/data/', 'media/', 'forbidden.jpg');
      expect(result).toBeNull();
    });

    test('constructs the full path from dataDir + mediaFolder + relativePath', async () => {
      const fsMock = await import('fs/promises');
      vi.mocked(fsMock.readFile).mockResolvedValue(Buffer.from('test'));

      await exportGedcom.readMediaFile('/data/', 'custom/media/', 'subdir/photo.jpg');
      expect(fsMock.readFile).toHaveBeenCalledWith('/data/custom/media/subdir/photo.jpg');
    });
  });

  describe('writeExportToServer', () => {
    test('writes buffer to file at dataDir + filename', async () => {
      const fsMock = await import('fs/promises');
      vi.mocked(fsMock.writeFile).mockResolvedValue(undefined);

      const buffer = Buffer.from('gedcom content');
      await exportGedcom.writeExportToServer('/data/', 'exports/mytree.ged', buffer);

      expect(fsMock.writeFile).toHaveBeenCalledWith('/data/exports/mytree.ged', buffer);
    });

    test('passes the buffer unchanged to writeFile', async () => {
      const fsMock = await import('fs/promises');
      vi.mocked(fsMock.writeFile).mockResolvedValue(undefined);

      const buffer = Buffer.from([0x00, 0x01, 0x02]);
      await exportGedcom.writeExportToServer('/data/', 'test.bin', buffer);

      expect(fsMock.writeFile).toHaveBeenCalledWith('/data/test.bin', buffer);
    });
  });

  describe('buildExportText', () => {
    function mockPool(individuals = [], families = [], sources = [], other = [], media = []) {
      return {
        query: vi.fn((sql, params) => {
          if (sql.includes('SELECT i_id AS xref')) return Promise.resolve({ rows: individuals });
          if (sql.includes('SELECT f_id AS xref')) return Promise.resolve({ rows: families });
          if (sql.includes('SELECT s_id AS xref')) return Promise.resolve({ rows: sources });
          if (sql.includes("SELECT o_id AS xref")) return Promise.resolve({ rows: other });
          if (sql.includes('SELECT m_id AS xref')) return Promise.resolve({ rows: media });
          if (sql.includes('SELECT tree_privacy_')) return Promise.resolve({ rows: [] });
          if (sql.includes('SELECT xref, tag_type')) return Promise.resolve({ rows: [] });
          if (sql.includes('SELECT l_from, l_to')) return Promise.resolve({ rows: [] });
          if (sql.includes('SELECT xref, ged_text')) return Promise.resolve({ rows: [] });
          if (sql.includes('SELECT gedcom_id FROM wt_user_gedcom_setting')) return Promise.resolve({ rows: [] });
          return Promise.resolve({ rows: [] });
        }),
      };
    }

    test('output starts with 0 HEAD and ends with 0 TRLR', async () => {
      const pool = mockPool(
        [{ xref: 'I1', gedcom: '0 @I1@ INDI\n1 NAME John /Doe/' }]
      );

      const result = await exportGedcom.buildExportText(
        pool,
        { gedcomId: 1, name: 'mytree' },
        { privacy: 'none', encoding: 'UTF-8', lineEndings: 'LF', includeMediaPath: null },
        { userId: null }
      );

      expect(result.text).toMatch(/^0 HEAD\n/);
      expect(result.text).toMatch(/\n0 TRLR\n?$/);
    });

    test('header includes CHAR line with correct encoding label', async () => {
      const pool = mockPool([{ xref: 'I1', gedcom: '0 @I1@ INDI' }]);

      const utf8Result = await exportGedcom.buildExportText(
        pool,
        { gedcomId: 1, name: 'mytree' },
        { privacy: 'none', encoding: 'UTF-8', lineEndings: 'LF', includeMediaPath: null },
        { userId: null }
      );
      expect(utf8Result.text).toContain('1 CHAR UTF-8');

      const cp1252Result = await exportGedcom.buildExportText(
        pool,
        { gedcomId: 1, name: 'mytree' },
        { privacy: 'none', encoding: 'CP1252', lineEndings: 'LF', includeMediaPath: null },
        { userId: null }
      );
      expect(cp1252Result.text).toContain('1 CHAR ANSI');

      const utf16Result = await exportGedcom.buildExportText(
        pool,
        { gedcomId: 1, name: 'mytree' },
        { privacy: 'none', encoding: 'UTF-16BE', lineEndings: 'LF', includeMediaPath: null },
        { userId: null }
      );
      expect(utf16Result.text).toContain('1 CHAR UNICODE');
    });

    test('privacy: none includes all records without filtering', async () => {
      const pool = mockPool(
        [
          { xref: 'I1', gedcom: '0 @I1@ INDI\n1 NAME John /Doe/\n1 RESN confidential\n1 BIRT\n2 DATE 1980' },
          { xref: 'I2', gedcom: '0 @I2@ INDI\n1 NAME Jane /Doe/' }
        ]
      );

      const result = await exportGedcom.buildExportText(
        pool,
        { gedcomId: 1, name: 'mytree' },
        { privacy: 'none', encoding: 'UTF-8', lineEndings: 'LF', includeMediaPath: null },
        { userId: null }
      );

      expect(result.text).toContain('0 @I1@ INDI');
      expect(result.text).toContain('1 RESN confidential');
      expect(result.text).toContain('0 @I2@ INDI');
    });

    test('media files are collected when includeMediaPath is set', async () => {
      const pool = mockPool(
        [],
        [],
        [],
        [],
        [{ xref: 'M1', gedcom: '0 @M1@ OBJE\n1 FILE photo.jpg\n1 TITL My Photo' }]
      );

      const result = await exportGedcom.buildExportText(
        pool,
        { gedcomId: 1, name: 'mytree' },
        { privacy: 'none', encoding: 'UTF-8', lineEndings: 'LF', includeMediaPath: 'media/' },
        { userId: null }
      );

      expect(result.mediaFiles).toContain('photo.jpg');
    });

    test('media files are empty when includeMediaPath is null', async () => {
      const pool = mockPool(
        [],
        [],
        [],
        [],
        [{ xref: 'M1', gedcom: '0 @M1@ OBJE\n1 FILE photo.jpg' }]
      );

      const result = await exportGedcom.buildExportText(
        pool,
        { gedcomId: 1, name: 'mytree' },
        { privacy: 'none', encoding: 'UTF-8', lineEndings: 'LF', includeMediaPath: null },
        { userId: null }
      );

      expect(result.mediaFiles).toEqual([]);
    });

    test('CRLF line endings are applied when requested', async () => {
      const pool = mockPool([{ xref: 'I1', gedcom: '0 @I1@ INDI' }]);

      const result = await exportGedcom.buildExportText(
        pool,
        { gedcomId: 1, name: 'mytree' },
        { privacy: 'none', encoding: 'UTF-8', lineEndings: 'CRLF', includeMediaPath: null },
        { userId: null }
      );

      expect(result.text).toContain('\r\n');
    });

    test('LF line endings are used when specified', async () => {
      const pool = mockPool([{ xref: 'I1', gedcom: '0 @I1@ INDI' }]);

      const result = await exportGedcom.buildExportText(
        pool,
        { gedcomId: 1, name: 'mytree' },
        { privacy: 'none', encoding: 'UTF-8', lineEndings: 'LF', includeMediaPath: null },
        { userId: null }
      );

      expect(result.text).not.toContain('\r\n');
      expect(result.text).toContain('\n');
    });

    test('returns object with text and mediaFiles properties', async () => {
      const pool = mockPool();

      const result = await exportGedcom.buildExportText(
        pool,
        { gedcomId: 1, name: 'mytree' },
        { privacy: 'none', encoding: 'UTF-8', lineEndings: 'LF', includeMediaPath: null },
        { userId: null }
      );

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('mediaFiles');
      expect(typeof result.text).toBe('string');
      expect(Array.isArray(result.mediaFiles)).toBe(true);
    });
  });
});
