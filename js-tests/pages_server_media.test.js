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
  loadMedia,
  mediaFiles,
  firstImageFile,
  needsWatermark,
  mediaThumbnailSignature,
  mediaThumbnailUrl,
  loadFactsMedia,
  loadGlideKey,
} from '../pages-server/media.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

describe('loadMedia', () => {
  test('returns the raw gedcom blob for an existing xref', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_media');
      expect(params).toEqual(['M1', 1]);
      return { rows: [{ m_id: 'M1', m_gedcom: '0 @M1@ OBJE\n1 FILE photo.jpg' }] };
    });

    expect(await loadMedia(pool, 1, 'M1')).toEqual({ xref: 'M1', gedcom: '0 @M1@ OBJE\n1 FILE photo.jpg' });
  });

  test('returns null for a nonexistent xref', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadMedia(pool, 1, 'M999')).toBeNull();
  });
});

describe('mediaFiles', () => {
  test('extracts every FILE fact with a real, deterministic factId (md5 of the fact\'s own text)', () => {
    const fact = '1 FILE miron_ophir1.jpg\n2 FORM jpg\n3 TYPE photo\n2 TITL Miron Ophir';
    const files = mediaFiles(`0 @M3450@ OBJE\n${fact}\n1 CHAN\n2 DATE 17 JUN 2016`);

    expect(files).toHaveLength(1);
    expect(files[0]).toEqual({
      factId: 'e0c293ef05ae5796cea5ed6cccd0526d',
      filename: 'miron_ophir1.jpg',
      isExternal: false,
      mimeType: 'image/jpeg',
    });
  });

  test('maps every known image extension, case-insensitively, to its mime type', () => {
    const gedcom = '1 FILE a.GIF\n1 FILE b.jpeg\n1 FILE c.PNG\n1 FILE d.webp';

    expect(mediaFiles(gedcom).map((f) => f.mimeType)).toEqual(['image/gif', 'image/jpeg', 'image/png', 'image/webp']);
  });

  test('an unrecognized extension (e.g. a PDF) has a null mimeType', () => {
    expect(mediaFiles('1 FILE document.pdf')[0].mimeType).toBeNull();
  });

  test('a URL-shaped FILE value is external', () => {
    expect(mediaFiles('1 FILE https://example.com/photo.jpg')[0].isExternal).toBe(true);
  });

  test('a media record with no FILE facts returns an empty array', () => {
    expect(mediaFiles('0 @M1@ OBJE\n1 TITL Untitled')).toEqual([]);
  });
});

describe('firstImageFile', () => {
  test('returns the first non-external, known-image-type file', () => {
    const files = [
      { factId: 'a', filename: 'doc.pdf', isExternal: false, mimeType: null },
      { factId: 'b', filename: 'ext.jpg', isExternal: true, mimeType: 'image/jpeg' },
      { factId: 'c', filename: 'photo.jpg', isExternal: false, mimeType: 'image/jpeg' },
      { factId: 'd', filename: 'other.png', isExternal: false, mimeType: 'image/png' },
    ];

    expect(firstImageFile(files)).toEqual(files[2]);
  });

  test('no qualifying file -> null', () => {
    expect(firstImageFile([{ factId: 'a', filename: 'doc.pdf', isExternal: false, mimeType: null }])).toBeNull();
  });

  test('empty array -> null', () => {
    expect(firstImageFile([])).toBeNull();
  });
});

describe('needsWatermark', () => {
  test('a stricter (numerically lower) access level than the pref needs no watermark', () => {
    expect(needsWatermark(0, 1)).toBe(false); // admin
    expect(needsWatermark(1, 1)).toBe(false); // member, equal to the default pref
  });

  test('a laxer (numerically higher) access level than the pref needs a watermark', () => {
    expect(needsWatermark(2, 1)).toBe(true); // anonymous, default pref
  });
});

describe('mediaThumbnailSignature', () => {
  // Hand-verified against the real algorithm (MediaFile::signature(),
  // app/MediaFile.php:355-370): md5(key + ':?' + ksort'd http_build_query).
  test('matches a hand-computed value for a known input', () => {
    const params = { xref: 'M3450', tree: 'ophir', fact_id: 'abc123', w: '200', h: '260', fit: 'crop', mark: '' };

    expect(mediaThumbnailSignature('testkey', params)).toBe('f91ec1d87822fc6cf02ca2a4051b8336');
  });

  test('key order does not matter - params are always sorted before signing', () => {
    const inOrder = { xref: 'M1', tree: 't', fact_id: 'f', w: '1', h: '2', fit: 'crop', mark: '1' };
    const reversed = { mark: '1', fit: 'crop', h: '2', w: '1', fact_id: 'f', tree: 't', xref: 'M1' };

    expect(mediaThumbnailSignature('k', inOrder)).toBe(mediaThumbnailSignature('k', reversed));
  });

  test('a different glide key produces a different signature', () => {
    const params = { xref: 'M1', tree: 't', fact_id: 'f', w: '1', h: '2', fit: 'crop', mark: '' };

    expect(mediaThumbnailSignature('key-a', params)).not.toBe(mediaThumbnailSignature('key-b', params));
  });
});

describe('mediaThumbnailUrl', () => {
  test('builds a signed URL with every real MediaFileThumbnail query param', () => {
    const url = mediaThumbnailUrl(
      { xref: 'M3450', treeName: 'ophir', factId: 'abc123', width: 200, height: 260, fit: 'crop', needsWatermark: false },
      'testkey',
      { baseUrl: '', rewriteUrls: false },
    );

    // MediaFileThumbnail is registered inside the shared '/tree/{tree}'
    // route group (app/Http/Routes/WebRoutes.php:658,663) - `tree` is a
    // PATH token, substituted into route= itself, NOT a query param
    // (confirmed live: an earlier draft treating it as a bare
    // '/media-thumbnail' + tree= query param 404'd against the real app).
    expect(url).toContain('route=%2Ftree%2Fophir%2Fmedia-thumbnail');
    expect(url).not.toMatch(/[?&]tree=/);
    expect(url).toContain('xref=M3450');
    expect(url).toContain('fact_id=abc123');
    expect(url).toContain('w=200');
    expect(url).toContain('h=260');
    expect(url).toContain('fit=crop');
    // The signature is still computed over the full params dict
    // INCLUDING tree - MediaFileThumbnail's handler re-derives `tree`
    // from the resolved Tree object (not the query string) before
    // re-checking it, so the signed value must match even though `tree`
    // never appears literally in the URL's own query string.
    expect(url).toContain(`s=${mediaThumbnailSignature('testkey', { xref: 'M3450', tree: 'ophir', fact_id: 'abc123', w: '200', h: '260', fit: 'crop', mark: '' })}`);
  });

  test('needsWatermark true -> mark=1', () => {
    const url = mediaThumbnailUrl(
      { xref: 'M1', treeName: 't', factId: 'f', width: 1, height: 2, fit: 'crop', needsWatermark: true },
      'k',
      { baseUrl: '', rewriteUrls: false },
    );

    expect(url).toContain('mark=1');
  });
});

describe('loadFactsMedia', () => {
  test('resolves every OBJE fact to its first image file, in order', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_media');
      const xref = params[0];
      return { rows: [{ m_id: xref, m_gedcom: `0 @${xref}@ OBJE\n1 FILE ${xref}.jpg` }] };
    });

    const facts = ['1 SEX M', '1 OBJE @M1@', '1 BIRT', '1 OBJE @M2@'];
    const result = await loadFactsMedia(pool, 1, facts);

    expect(result).toHaveLength(2);
    expect(result[0].mediaXref).toBe('M1');
    expect(result[0].filename).toBe('M1.jpg');
    expect(result[1].mediaXref).toBe('M2');
  });

  test('a broken OBJE reference (media record does not exist) is silently skipped', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadFactsMedia(pool, 1, ['1 OBJE @M999@'])).toEqual([]);
  });

  test('a media record with no qualifying image file is silently skipped', async () => {
    const pool = mockPool(async () => ({ rows: [{ m_id: 'M1', m_gedcom: '0 @M1@ OBJE\n1 FILE document.pdf' }] }));

    expect(await loadFactsMedia(pool, 1, ['1 OBJE @M1@'])).toEqual([]);
  });

  test('no OBJE facts -> empty array, no queries', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadFactsMedia(pool, 1, ['1 SEX M', '1 BIRT'])).toEqual([]);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('loadGlideKey', () => {
  test('upserts a candidate key and returns whatever the row actually holds', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('wt_site_setting');
      expect(sql).toContain('ON CONFLICT');
      expect(params[0]).toHaveLength(256); // bin2hex(random_bytes(128))
      return { rows: [{ setting_value: 'existing-key-from-php' }] };
    });

    expect(await loadGlideKey(pool)).toBe('existing-key-from-php');
  });
});
