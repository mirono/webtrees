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

// View layer for /tree/{tree}/media-list (MediaListModule) - a
// genuinely different shape from every prior list route: a search
// form + slice-paginated card grid (real image thumbnails, reusing
// mediaThumbnailUrl() unchanged), not a DataTables table at all. No
// surname-collation nav strip to share with family-list/individual-list
// (media has no surname concept), so this gets its own full page-shell
// render function rather than reusing renderFamilyListPage().

import { compare } from './collation.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Mirrors Elements\SourceMediaType::values() (app/Elements/SourceMediaType.php:70-92) -
// the fixed GEDCOM 5.5.1 SOURCE_MEDIA_TYPE value set, English-only
// labels (this migration's established no-I18N convention), sorted by
// label via the same collation this migration already uses elsewhere
// (uasort($values, I18N::compare(...)) in real PHP).
const MEDIA_FORMAT_LABELS = {
  AUDIO: 'Audio',
  BOOK: 'Book',
  CARD: 'Card',
  CERTIFICATE: 'Certificate',
  COAT: 'Coat of arms',
  DOCUMENT: 'Document',
  ELECTRONIC: 'Electronic',
  FICHE: 'Microfiche',
  FILM: 'Microfilm',
  MAGAZINE: 'Magazine',
  MANUSCRIPT: 'Manuscript',
  MAP: 'Map',
  NEWSPAPER: 'Newspaper',
  OTHER: 'Other',
  PAINTING: 'Painting',
  PHOTO: 'Photo',
  TOMBSTONE: 'Tombstone',
  VIDEO: 'Video',
};

const MEDIA_FORMAT_OPTIONS = Object.entries(MEDIA_FORMAT_LABELS).sort((a, b) => compare(a[1], b[1]));

function mediaListUrl(treeName, params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  }

  const queryString = query.toString();

  return `/tree/${treeName}/media-list${queryString ? `?${queryString}` : ''}`;
}

/**
 * Mirrors resources/views/modules/media-list/pagination.phtml exactly -
 * first/previous/page-count/next/last, each link carrying every search
 * param so pagination doesn't lose the current filter.
 */
function paginationHtml({ treeName, page, pages, folder, subdirs, filter, format, max }) {
  const params = { go: '1', folder, subdirs: subdirs ? '1' : '', filter, format, max };

  const firstLink =
    page > 1
      ? `<a class="btn btn-outline-secondary" href="${escapeHtml(mediaListUrl(treeName, { ...params, page: 1 }))}">first</a>`
      : '';
  const prevLink =
    page > 1
      ? `<a class="btn btn-outline-secondary" href="${escapeHtml(mediaListUrl(treeName, { ...params, page: page - 1 }))}">previous</a>`
      : '';
  const nextLink =
    page < pages
      ? `<a class="btn btn-outline-secondary" href="${escapeHtml(mediaListUrl(treeName, { ...params, page: page + 1 }))}">next</a>`
      : '';
  const lastLink =
    page < pages
      ? `<a class="btn btn-outline-secondary" href="${escapeHtml(mediaListUrl(treeName, { ...params, page: pages }))}">last</a>`
      : '';

  return `
    <div class="row text-center">
        <div class="col">${firstLink}</div>
        <div class="col">${prevLink}</div>
        <div class="col">Page ${page} of ${pages}</div>
        <div class="col">${nextLink}</div>
        <div class="col">${lastLink}</div>
    </div>`;
}

/**
 * One card: mirrors page.phtml's own `<div class="col"><div class="card">...`
 * structure - thumbnail(s), file-detail text (type/linked SOUR+NOTE
 * facts/filename for editors), and the linked-record footer (icon +
 * name per individual/family/source/location referencing this media
 * object).
 *
 * @param {{
 *   xref: string, url: string, fullNameHtml: string,
 *   thumbnailHtml: string[],
 *   typeLabelHtml: string,
 *   sourceFactsHtml: string, noteFactsHtml: string,
 *   filenameHtml: string,
 *   linkedIndividuals: {url: string, fullNameHtml: string}[],
 *   linkedFamilies: {url: string, fullNameHtml: string}[],
 *   linkedSources: {url: string, fullNameHtml: string}[],
 *   linkedLocations: {url: string, fullNameHtml: string}[],
 * }} media
 */
function mediaCardHtml(media) {
  const linkedRow = (records, iconClass, faIcon) =>
    records
      .map(
        (r) => `
                            <span class="wt-icon-${iconClass}"><i class="fa-solid ${faIcon}"></i></span>
                            <a href="${escapeHtml(r.url)}">${r.fullNameHtml}</a>
                            <br>`,
      )
      .join('');

  return `
                <div class="col">
                    <div class="card h-100">
                        <div class="card-header">
                            <h4 class="card-title">
                                <a href="${escapeHtml(media.url)}">${media.fullNameHtml}</a>
                            </h4>
                        </div>
                        <div class="card-body">
                            ${media.thumbnailHtml.join('\n                            ')}
                            <div class="card-text mt-2">
                                ${media.typeLabelHtml}
                                ${media.sourceFactsHtml}
                                ${media.noteFactsHtml}
                                ${media.filenameHtml}
                            </div>
                        </div>
                        <div class="card-footer">${linkedRow(media.linkedIndividuals, 'individual', 'fa-user')}${linkedRow(
    media.linkedFamilies,
    'family',
    'fa-users',
  )}${linkedRow(media.linkedSources, 'source', 'fa-file-alt')}${linkedRow(media.linkedLocations, 'location', 'fa-map-marker-alt')}
                        </div>
                    </div>
                </div>`;
}

/**
 * Full page: /tree/{tree}/media-list (MediaListModule). Mirrors
 * resources/views/modules/media-list/page.phtml - the search form
 * (folder/subdirs/max/format/filter), the "N found" count, pagination
 * top and bottom, and the card grid.
 *
 * @param {object} params
 * @param {{title: string, name: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken
 * @param {string[]} params.folders every real folder (from allFolders())
 * @param {string} params.folder current folder selection
 * @param {boolean} params.subdirs
 * @param {number} params.max
 * @param {string} params.format
 * @param {string} params.filter
 * @param {number} params.count total matches (before pagination)
 * @param {number} params.page
 * @param {number} params.pages
 * @param {object[]} params.media see mediaCardHtml()'s own param doc
 * @returns {string}
 */
export function renderMediaListPage({ tree, user, csrfToken, folders, folder, subdirs, max, format, filter, count, page, pages, media }) {
  const csrfMetaTag =
    user !== null
      ? `
    <meta name="csrf" content="${escapeHtml(csrfToken)}">`
      : '';

  const userMenuHtml =
    user !== null
      ? `
                    <li class="nav-item">
                        <span class="nav-link">${escapeHtml(user.realName)}</span>
                    </li>
                    <li class="nav-item menu-logout">
                        <a class="nav-link" href="#" data-wt-post-url="/logout" data-wt-reload-url="/">Sign out</a>
                    </li>`
      : `
                    <li class="nav-item">
                        <a class="nav-link" href="/login">Sign in</a>
                    </li>`;

  const folderOptionsHtml = folders
    .map((f) => `<option value="${escapeHtml(f)}"${f === folder ? ' selected="selected"' : ''}>${f === '' ? '&nbsp;' : escapeHtml(f)}</option>`)
    .join('\n                ');

  const maxOptionsHtml = [10, 20, 30, 40, 50, 75, 100, 150, 200]
    .map((n) => `<option value="${n}"${n === max ? ' selected' : ''}>${n}</option>`)
    .join('\n                ');

  const formatOptionsHtml = [['', ''], ...MEDIA_FORMAT_OPTIONS]
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${value === format ? ' selected="selected"' : ''}>${label === '' ? '&nbsp;' : escapeHtml(label)}</option>`)
    .join('\n                ');

  const paginationParams = { treeName: tree.name, page, pages, folder, subdirs, filter, format, max };
  const paginationHtmlBlock = media.length > 0 ? paginationHtml(paginationParams) : '';

  const cardsHtml =
    media.length > 0
      ? `
        ${paginationHtmlBlock}
        <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-4">${media.map(mediaCardHtml).join('')}
        </div>
        ${paginationHtmlBlock}`
      : '';

  // dir="ltr" is required, not decorative - see account-view.mjs's own
  // doc comment for the [dir]-selector CSS finding this fix addresses.
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Media</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-media-list-page">
    <header class="wt-header-wrapper d-print-none">
        <div class="container-lg wt-header-container">
            <div class="row wt-header-content">
                <div class="col wt-site-logo"></div>
                <h1 class="col wt-site-title">${escapeHtml(tree.title)}</h1>
                <div class="col wt-secondary-navigation">
                    <ul class="nav wt-user-menu">${userMenuHtml}
                    </ul>
                </div>
            </div>
        </div>
    </header>

    <main id="content" class="wt-main-wrapper">
        <div class="container-lg wt-main-container">
            <div class="row">
                <div class="col-md-12">
                    <h2 class="wt-page-title">Media</h2>

                    <form method="post" class="wt-page-options wt-page-options-media-list d-print-none">
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="folder">Folder</label>
                            <div class="col-sm-3 wt-page-options-value">
                                <select class="form-select" name="folder" id="folder" aria-label="">
                ${folderOptionsHtml}
                                </select>
                                <div class="form-check form-check-inline">
                                    <input type="checkbox" class="form-check-input" name="subdirs" id="subdirs-1" value="1"${subdirs ? ' checked="checked"' : ''}>
                                    <label class="form-check-label" for="subdirs-1">Include subfolders</label>
                                </div>
                            </div>
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="max">Media objects per page</label>
                            <div class="col-sm-3 wt-page-options-value">
                                <select class="form-select" name="max" id="max">
                ${maxOptionsHtml}
                                </select>
                            </div>
                        </div>
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="format">Type</label>
                            <div class="col-sm-3 wt-page-options-value">
                                <select class="form-select" name="format" id="format" aria-label="">
                ${formatOptionsHtml}
                                </select>
                            </div>
                            <div class="col-sm-3 col-form-label wt-page-options-label"></div>
                            <div class="col-sm-3 wt-page-options-value"></div>
                        </div>
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="filter">Search filters</label>
                            <div class="col-sm-3 wt-page-options-value">
                                <input type="text" class="form-control" name="filter" id="filter" value="${escapeHtml(filter)}">
                            </div>
                            <div class="col-sm-3 col-form-label wt-page-options-label"></div>
                            <div class="col-sm-3 wt-page-options-value">
                                <input type="hidden" name="page" value="1">
                                <button type="submit" class="btn btn-primary">search</button>
                                <a class="btn btn-secondary" href="${escapeHtml(mediaListUrl(tree.name, {}))}">reset</a>
                            </div>
                        </div>
                        ${user !== null ? `<input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">` : ''}
                    </form>

                    <div class="wt-page-content">
                        <p class="text-center mt-4">Media objects found ${count}</p>
                        ${cardsHtml}
                    </div>
                </div>
            </div>
        </div>
    </main>

    <footer class="container-lg wt-footers d-print-none"></footer>

    <script src="/public/js/vendor.min.js"></script>
    <script src="/public/js/webtrees.min.js"></script>
</body>
</html>
`;
}
