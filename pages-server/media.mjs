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
import { parseFacts, canShowViaResnChain, otherFactAttributes } from './individual.mjs';
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

// Widened from IMAGE_MIME_TYPES above for MediaPage's own "wt-mime-<type>"
// icon on a non-image file (resources/views/icons/mime.phtml) - reduced
// from app/Mime.php's full ~40-entry TYPES map to the extensions the
// real imported tree actually has (BMP/PDF, plus every IMAGE_MIME_TYPES
// entry), falling back to Mime::DEFAULT_TYPE for anything else.
const EXTENDED_MIME_TYPES = {
  ...IMAGE_MIME_TYPES,
  BMP: 'image/bmp',
  PDF: 'application/pdf',
};
const DEFAULT_MIME_TYPE = 'application/octet-stream';

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
 * MediaPage's own facts-table scope (phase 5 step 17) - the same FILE
 * facts as mediaFiles() above, but with the sub-attributes
 * media-page-details.phtml actually displays per file (filename/title/
 * type/format - app/Gedcom.php's real 'OBJE:FILE:TITL'/'OBJE:FILE:FORM'/
 * 'OBJE:FILE:FORM:TYPE' elements). Kept as a SEPARATE function rather
 * than widening mediaFiles() itself - that function's existing callers
 * (the IndividualPage photo box / Media / Album tabs) only ever need
 * the 4 fields it already returns, and widening it would be a
 * needless, unrequested shape change to already-shipped code.
 *
 * @param {string} mediaGedcom
 * @returns {{factId: string, filename: string, isExternal: boolean, mimeType: string|null, title: string, type: string, format: string}[]}
 */
export function mediaFileDetails(mediaGedcom) {
  return parseFacts(mediaGedcom)
    .filter((fact) => factTag(fact) === 'FILE')
    .map((fact) => {
      const filenameMatch = /^1 FILE (.+)/.exec(fact);
      const filename = filenameMatch ? filenameMatch[1] : '';
      const extension = filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1).toUpperCase() : '';
      const formMatch = /\n2 FORM (\S+)/.exec(fact);
      const typeMatch = /\n3 TYPE (.+)/.exec(fact);
      const titleMatch = /\n2 TITL (.+)/.exec(fact);

      return {
        factId: createHash('md5').update(fact).digest('hex'),
        filename,
        isExternal: filename.includes('://'),
        mimeType: IMAGE_MIME_TYPES[extension] ?? null,
        fullMimeType: EXTENDED_MIME_TYPES[extension] ?? DEFAULT_MIME_TYPE,
        format: formMatch ? formMatch[1] : '',
        type: typeMatch ? typeMatch[1] : '',
        title: titleMatch ? titleMatch[1] : '',
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
 * Mirrors MediaFile::downloadUrl() (app/MediaFile.php:261-271) - unlike
 * imageUrl(), this route is NOT signed (MediaFileDownload.php re-checks
 * the media record's own canShow() before serving, rather than trusting
 * a URL signature - confirmed by reading the handler directly, no `s`
 * param anywhere). `mark` is real PHP's own "ignored but needed for
 * cache-busting" query param (still computed the same way as the
 * thumbnail route's, for consistency, though MediaFileDownload.php
 * itself re-derives whether to actually apply a watermark server-side
 * regardless of this value).
 *
 * @param {object} params
 * @param {string} params.xref the MEDIA record's own xref
 * @param {string} params.treeName
 * @param {string} params.factId
 * @param {'inline'|'attachment'} params.disposition
 * @param {boolean} params.needsWatermark
 * @param {{baseUrl: string, rewriteUrls: boolean}} siteUrlConfig
 * @returns {string}
 */
export function mediaDownloadUrl({ xref, treeName, factId, disposition, needsWatermark: mark }, siteUrlConfig) {
  return phpRouteUrl(`/tree/${treeName}/media-download`, siteUrlConfig, {
    xref,
    fact_id: factId,
    disposition,
    mark: mark ? '1' : '',
  });
}

/**
 * Mirrors the OBJE-fact resolution IndividualPage::handle() does inline
 * for the photo box (app/Http/RequestHandlers/IndividualPage.php -
 * direct `1 OBJE @Mn@` facts only) AND MediaTabModule::getFactsWithMedia()'s
 * broader scan for the Media/Album tabs (app/Module/MediaTabModule.php:
 * 99-114 - `OBJE @Xref@` at ANY nesting level, e.g. `2 OBJE @M1@` under
 * a BIRT fact, not just a top-level fact). Every `OBJE @Mn@` reference
 * found in a fact's own text resolves to the referenced Media record's
 * firstImageFile() - a broken/missing reference or a media record with
 * no qualifying image file is silently skipped, same as real PHP's own
 * `instanceof` checks. Deliberately takes an already-`parseFacts()`'d
 * array rather than a raw gedcom blob so the SAME function resolves a
 * family's spouse-facts too, not just an individual's own.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string[]} facts
 * @returns {Promise<{mediaXref: string, factId: string, filename: string, isExternal: boolean, mimeType: string|null}[]>}
 */
export async function loadFactsMedia(pool, gedcomId, facts) {
  const images = [];

  for (const fact of facts) {
    // A leading "\n" lets the SAME pattern match the fact's own first
    // line (no real preceding newline there) as well as any nested
    // sub-line - mirrors MediaTabModule's own `(?:^1|\n\d) OBJE` shape,
    // collapsed into one pattern.
    const matches = `\n${fact}`.matchAll(/\n\d OBJE @([^@]+)@/g);

    for (const match of matches) {
      const media = await loadMedia(pool, gedcomId, match[1]);

      if (media === null) {
        continue;
      }

      const imageFile = firstImageFile(mediaFiles(media.gedcom));

      if (imageFile !== null) {
        images.push({ mediaXref: media.xref, ...imageFile });
      }
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

// MediaPage's own facts table (phase 5 step 17) - same "no tag
// allowlist" reasoning already confirmed for Source/Repository/Note
// (app/GedcomRecord.php:552-570): every level-1 fact is shown,
// privacy-filtered only, EXCEPT `FILE` - media-page-details.phtml
// renders FILE facts in their own dedicated block above the generic
// facts table (`$record->facts()->filter(fn ($fact) => $fact->tag()
// !== 'OBJE:FILE')`), not through the generic per-fact renderer.
function factTagOnly(factGedcom) {
  return /^1 (\S+)/.exec(factGedcom)?.[1] ?? '';
}

/**
 * @param {string[]} facts
 * @returns {string[]}
 */
export function displayableMediaFacts(facts) {
  return facts.filter((fact) => factTagOnly(fact) !== 'FILE');
}

// CHAN's _WT_USER already gets its own dedicated "Author of last
// change" rendering, same as every other record type's CHAN handling -
// skip it here so it isn't shown twice.
const MEDIA_SUBTAG_EXTRA_SKIP = {
  CHAN: ['_WT_USER'],
};

/**
 * One fact's "other attributes" - see source.mjs's sourceFactOtherAttributes()
 * own doc comment for the shared mechanism. No known OBJE-specific
 * subtag label overrides yet - falls back to the raw "OBJE:<TAG>:<subtag>"
 * path for anything encountered.
 *
 * @param {string} factGedcom
 * @param {string} tag this fact's own top-level tag, e.g. 'SOUR'
 * @returns {{label: string, value: string}[]}
 */
export function mediaFactOtherAttributes(factGedcom, tag) {
  const attributes = otherFactAttributes(factGedcom, MEDIA_SUBTAG_EXTRA_SKIP[tag] ?? []);

  return attributes.map(({ subtag, value }) => ({ label: `OBJE:${tag}:${subtag}`, value }));
}

// Base GedcomRecord::canShowByType() (app/GedcomRecord.php:841-852)'s
// own record-type-level default: PUBLIC unless a tree-wide
// wt_default_resn row exists for this record type (tag_type = 'OBJE',
// xref IS NULL) - same shape already confirmed for NOTE/REPO/SOUR.
function defaultRecordCanShow(treeFactResn, viewer) {
  const resn = treeFactResn.get('OBJE') ?? null;

  if (resn === null) {
    return true;
  }

  return { none: 2, privacy: 1, confidential: 0, hidden: -1 }[resn] >= viewer.accessLevel;
}

/**
 * Mirrors Media::canShowByType() (app/Media.php:41-58) via the shared
 * RESN chain: hidden whenever any record linking to this media object
 * is itself unshowable, otherwise base GedcomRecord::canShowByType()
 * applies - the EXACT same shape as Note::canShowByType()
 * (note.mjs's own noteCanShowRecord()), since both real PHP methods
 * are near-identical "hide if attached to a private record" loops.
 *
 * @param {{hideLivePeople: boolean, defaultResn: string|null}} tree
 * @param {string} gedcom the media record's raw text
 * @param {{accessLevel: 0|1|2, isSelfRecord: boolean}} viewer
 * @param {Map<string,string>} treeFactResn from loadDefaultResn()
 * @param {boolean} linkedRecordsShowable false if ANY record linking to
 *   this media object (via wt_link) is itself unshowable to this viewer
 * @returns {boolean}
 */
export function mediaCanShowRecord(tree, gedcom, viewer, treeFactResn, linkedRecordsShowable) {
  return canShowViaResnChain(tree, gedcom, viewer, () => linkedRecordsShowable && defaultRecordCanShow(treeFactResn, viewer));
}
