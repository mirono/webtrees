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

// Media data/logic - used by IndividualPage's photo box (phase 5, step
// 14a - docs/php-to-js-migration/phase5-individual-page-full.md) and,
// later, its Media/Album tabs. Deliberately does NOT reimplement image
// resizing: MediaFile::displayImage() (app/MediaFile.php:157-194) just
// builds a SIGNED URL pointing at PHP's own still-unmodified
// MediaFileThumbnail route - this module builds the identical signed
// URL (same md5-based signature algorithm, same query params) and lets
// the browser fetch the actual bytes through the proxy to PHP, which
// still does the real Imagick/GD work. No image-processing dependency
// needed in Node at all.

import { createHash, randomBytes } from 'node:crypto';
import { parseFacts } from './individual.mjs';
import { phpRouteUrl } from './route-url.mjs';

function factTag(factGedcom) {
  const match = /^1 (\S+)/.exec(factGedcom);
  return match ? match[1] : '';
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref
 * @returns {Promise<{xref: string, gedcom: string}|null>}
 */
export async function loadMedia(pool, gedcomId, xref) {
  const result = await pool.query('SELECT m_id, m_gedcom FROM wt_media WHERE m_id = $1 AND m_file = $2', [xref, gedcomId]);

  if (result.rows.length === 0) {
    return null;
  }

  return { xref: result.rows[0].m_id, gedcom: result.rows[0].m_gedcom };
}

// Reduced from app/Mime.php's full TYPES map (~40 entries) to just the
// extensions MediaFile::SUPPORTED_IMAGE_MIME_TYPES cares about
// (gif/jpeg/jpg/png/webp) - these are the only ones that ever make
// isImage() true, and isImage() is the only thing this migration uses
// mimeType() for (Node never sets a content-type header for the actual
// bytes - PHP's thumbnail route still does that).
const IMAGE_MIME_TYPES = {
  GIF: 'image/gif',
  JPEG: 'image/jpeg',
  JPG: 'image/jpeg',
  PNG: 'image/png',
  WEBP: 'image/webp',
};

/**
 * Mirrors Media::mediaFiles() (app/Media.php:65-69): every `1 FILE`
 * fact on the record, each mapped to a MediaFile-shaped object.
 * `factId` mirrors Fact::id() as GedcomRecord::parseFacts() actually
 * assigns it (app/GedcomRecord.php:930) - `md5($gedcom_fact)`, the md5
 * of the fact's own raw text (including its own sub-tags) - required
 * verbatim so PHP's MediaFileThumbnail handler (which re-derives this
 * same hash from the SAME m_gedcom row to find the matching FILE fact)
 * accepts a URL this function builds.
 *
 * @param {string} mediaGedcom
 * @returns {{factId: string, filename: string, isExternal: boolean, mimeType: string|null}[]}
 */
export function mediaFiles(mediaGedcom) {
  return parseFacts(mediaGedcom)
    .filter((fact) => factTag(fact) === 'FILE')
    .map((fact) => {
      const filenameMatch = /^1 FILE (.+)/.exec(fact);
      const filename = filenameMatch ? filenameMatch[1] : '';
      const extension = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1).toUpperCase() : '';

      return {
        factId: createHash('md5').update(fact).digest('hex'),
        filename,
        // MediaFile::isExternal() (app/MediaFile.php:199-202).
        isExternal: filename.includes('://'),
        mimeType: IMAGE_MIME_TYPES[extension] ?? null,
      };
    });
}

/**
 * Mirrors Media::firstImageFile() (app/Media.php:74-78): the first
 * non-external file whose mime type is one of the 4 known image types.
 *
 * @param {{factId: string, filename: string, isExternal: boolean, mimeType: string|null}[]} files
 * @returns {{factId: string, filename: string, isExternal: boolean, mimeType: string|null}|null}
 */
export function firstImageFile(files) {
  return files.find((file) => !file.isExternal && file.mimeType !== null) ?? null;
}

/**
 * Mirrors Auth::needsWatermark() (app/Auth.php:126-129): stricter
 * viewers (lower accessLevel - 0 admin, 1 member, 2 anonymous) see no
 * watermark once their access level is <= the tree's SHOW_NO_WATERMARK
 * preference; everyone else does.
 *
 * @param {number} accessLevel
 * @param {number} showNoWatermark
 * @returns {boolean}
 */
export function needsWatermark(accessLevel, showNoWatermark) {
  return accessLevel > showNoWatermark;
}

/**
 * Mirrors MediaFile::signature() (app/MediaFile.php:355-370):
 * `md5($glide_key . ':?' . http_build_query(ksort($params)))`. `params`
 * must NOT include `s` itself (mirrors the real method's own
 * `unset($params['s'])` - this port never has one to unset, since it's
 * only ever called while BUILDING a URL, never while validating one -
 * PHP's own MediaFileThumbnail handler does that side). Every value
 * used by this route (xref, tree name, a 32-hex-char factId, plain
 * digits, 'crop'/'contain', '' or '1') is plain ASCII with no
 * characters that could diverge between PHP's `http_build_query()` and
 * `URLSearchParams`'s encoding - confirmed by inspecting every real
 * value this function is ever called with, not assumed safe in general.
 *
 * @param {string} glideKey
 * @param {Record<string, string>} params
 * @returns {string}
 */
export function mediaThumbnailSignature(glideKey, params) {
  const sortedEntries = Object.keys(params)
    .sort()
    .map((key) => [key, params[key]]);
  const query = new URLSearchParams(sortedEntries).toString();

  return createHash('md5').update(`${glideKey}:?${query}`).digest('hex');
}

/**
 * Mirrors MediaFile::imageUrl() (app/MediaFile.php:211-235) +
 * downloadUrl() (app/MediaFile.php:261-271): the signed thumbnail URL
 * for one media file, pointing at PHP's still-unmodified
 * MediaFileThumbnail route (registered at the bare path
 * `/media-thumbnail`, every real parameter passed via the query
 * string - see route-url.mjs's phpRouteUrl() doc comment for why the
 * ugly-URL form needs these as SIBLING params next to `route=`, not
 * nested inside it).
 *
 * @param {object} params
 * @param {string} params.xref the MEDIA record's own xref (not the
 *   individual/family/source that references it)
 * @param {string} params.treeName
 * @param {string} params.factId from mediaFiles()
 * @param {number} params.width
 * @param {number} params.height
 * @param {'crop'|'contain'} params.fit
 * @param {boolean} params.needsWatermark
 * @param {string} glideKey
 * @param {{baseUrl: string, rewriteUrls: boolean}} siteUrlConfig
 * @returns {string}
 */
export function mediaThumbnailUrl({ xref, treeName, factId, width, height, fit, needsWatermark: mark }, glideKey, siteUrlConfig) {
  // MediaFileThumbnail is registered INSIDE the shared '/tree/{tree}'
  // attach block (app/Http/Routes/WebRoutes.php:658,663:
  // `$router->get(MediaFileThumbnail::class, '/media-thumbnail')` nested
  // under `attach('', '/tree/{tree}', ...)`), NOT at a bare
  // '/media-thumbnail' path - confirmed by reading WebRoutes.php
  // directly after an initial guess (bare path) 404'd live. `tree` is
  // therefore a PATH token, substituted into the URL by route() the
  // same way `xref` is for IndividualPage - it must NOT also appear as
  // a query-string parameter.
  const signatureParams = {
    xref,
    tree: treeName,
    fact_id: factId,
    w: String(width),
    h: String(height),
    fit,
    // PHP's http_build_query() casts a bool false to '' and true to
    // '1' - MediaFileThumbnail's own re-validation reads the raw query
    // param back as a string, so this must match that cast exactly.
    mark: mark ? '1' : '',
  };
  const signature = mediaThumbnailSignature(glideKey, signatureParams);
  // `tree` is consumed by the path substitution above - MediaFileThumbnail's
  // handler re-derives it from the resolved Tree object (not the query
  // string) before re-checking the signature, so it must be excluded
  // here even though it WAS part of what got signed.
  const { tree: _tree, ...queryParams } = signatureParams;

  return phpRouteUrl(`/tree/${treeName}/media-thumbnail`, siteUrlConfig, { ...queryParams, s: signature });
}

/**
 * Mirrors the OBJE-fact resolution IndividualPage::handle() does inline
 * (app/Http/RequestHandlers/IndividualPage.php): for every `1 OBJE
 * @Mn@` fact in `facts`, load the referenced Media record and take its
 * firstImageFile() - a broken/missing reference or a media record with
 * no qualifying image file is silently skipped, same as real PHP's own
 * `instanceof` checks. Deliberately takes an already-`parseFacts()`'d
 * array rather than a raw gedcom blob so the SAME function can resolve
 * a family's spouse-facts too, not just an individual's own (needed by
 * the Media/Album tabs - phase 5 step 14c).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string[]} facts
 * @returns {Promise<{mediaXref: string, factId: string, filename: string, isExternal: boolean, mimeType: string|null}[]>}
 */
export async function loadFactsMedia(pool, gedcomId, facts) {
  const images = [];

  for (const fact of facts) {
    const match = /^1 OBJE @([^@]+)@/.exec(fact);

    if (!match) {
      continue;
    }

    const media = await loadMedia(pool, gedcomId, match[1]);

    if (media === null) {
      continue;
    }

    const imageFile = firstImageFile(mediaFiles(media.gedcom));

    if (imageFile !== null) {
      images.push({ mediaXref: media.xref, ...imageFile });
    }
  }

  return images;
}

/**
 * Mirrors MediaFile's own lazy get-or-create of Site::getPreference('glide-key')
 * (app/MediaFile.php:214-219, 362-367) - both systems share the SAME
 * wt_site_setting row, so whichever one is asked first creates it; this
 * uses Postgres's standard upsert-returning-existing-or-new idiom
 * (`DO UPDATE SET x = x` guarantees RETURNING always yields a row,
 * unlike `DO NOTHING`) to avoid a races-to-create TOCTOU gap between a
 * separate SELECT and INSERT.
 *
 * @param {import('pg').Pool} pool
 * @returns {Promise<string>}
 */
export async function loadGlideKey(pool) {
  const candidateKey = randomBytes(128).toString('hex');
  const result = await pool.query(
    `INSERT INTO wt_site_setting (setting_name, setting_value) VALUES ('glide-key', $1)
     ON CONFLICT (setting_name) DO UPDATE SET setting_name = wt_site_setting.setting_name
     RETURNING setting_value`,
    [candidateKey],
  );

  return result.rows[0].setting_value;
}
