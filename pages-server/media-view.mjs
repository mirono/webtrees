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

// Hand-rolled HTML for /tree/{tree}/media/{xref} - the same
// resources/views/media-page.phtml shape (its own "shell + narrow
// slice"): title + each media file's own block (filename/title/type/
// format, the actual image/icon, a download link) + the record's
// remaining facts table (CHAN, etc, same convention as Source/
// Repository/Note) - no linked-record reverse-lookup section, same
// precedent as every other record-page route. See
// docs/php-to-js-migration/phase5-media-page.md.
//
// Deliberately simplified vs. media-page-details.phtml: no edit
// controls (this migration has no edit UI anywhere yet - matches
// every other route), no file-exists check (editor-only feature), no
// audio/video <audio>/<video> players (the real imported tree has
// zero audio/video files - only images and PDFs) - a non-image file
// gets the same "wt-mime-<type>" icon real PHP shows for any
// non-image file, per resources/views/icons/mime.phtml.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Verified against app/Elements/SourceMediaType.php's real controlled
// value list (OBJE:FILE:FORM:TYPE). A value outside this list (a
// custom/non-standard TYPE) falls back to the raw value, matching real
// PHP's own AbstractElement::value() fallback for an unrecognized
// controlled value (`'<bdi>' . e($value) . '</bdi>'`).
const MEDIA_TYPE_LABELS = {
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

function mediaTypeValueHtml(type) {
  const label = MEDIA_TYPE_LABELS[type.toUpperCase()];

  return label !== undefined ? escapeHtml(label) : `<bdi>${escapeHtml(type)}</bdi>`;
}

function labelValueRow(label, valueHtml) {
  return `<div><span class="label">${escapeHtml(label)}</span>: <span class="value align-top">${valueHtml}</span></div>`;
}

/**
 * @param {{
 *   filename: string,
 *   isExternal: boolean,
 *   mimeType: string|null,
 *   fullMimeType: string,
 *   format: string,
 *   type: string,
 *   title: string,
 *   imageUrl: string|null,
 *   downloadUrl: string,
 *   attachmentUrl: string,
 *   showDownloadLink: boolean,
 * }} file
 */
function renderMediaFile(file) {
  // Filename is only ever shown for an external file - real PHP also
  // shows it to editors (with a file-existence check), but this
  // migration has no editor/edit-mode concept anywhere yet.
  const filenameRow = file.isExternal ? labelValueRow('Filename', escapeHtml(file.filename)) : '';
  const titleRow = file.title ? labelValueRow('Title', escapeHtml(file.title)) : '';
  const typeRow = file.type ? labelValueRow('Media type', mediaTypeValueHtml(file.type)) : '';
  const formatRow = file.format ? labelValueRow('Format', escapeHtml(file.format)) : '';

  let previewHtml;

  if (file.isExternal) {
    previewHtml =
      file.mimeType !== null
        ? `<img dir="auto" src="${escapeHtml(file.filename)}" alt="">`
        : `<span class="wt-mime wt-mime-${escapeHtml(file.fullMimeType.split('/')[0])} wt-mime-${escapeHtml(file.fullMimeType.replaceAll('/', '-'))}"></span>`;
  } else if (file.mimeType !== null) {
    previewHtml = `<a href="${escapeHtml(file.downloadUrl)}" data-wt-gallery="1"><img dir="auto" src="${escapeHtml(file.imageUrl)}" alt=""></a>`;
  } else {
    previewHtml = `<a href="${escapeHtml(file.downloadUrl)}"><span class="wt-mime wt-mime-${escapeHtml(file.fullMimeType.split('/')[0])} wt-mime-${escapeHtml(file.fullMimeType.replaceAll('/', '-'))}"></span></a>`;
  }

  const downloadLinkHtml = file.showDownloadLink ? `<br><a href="${escapeHtml(file.attachmentUrl)}">Download file</a>` : '';

  return `
        <tr>
            <th scope="row">Media file</th>
            <td class="d-flex justify-content-between">
                <div>
                    ${filenameRow}
                    ${titleRow}
                    ${typeRow}
                    ${formatRow}
                </div>
                <div>
                    ${previewHtml}
                    ${downloadLinkHtml}
                </div>
            </td>
        </tr>`;
}

const FACT_LABELS = {
  CHAN: 'Last change',
  NOTE: 'Note',
  SOUR: 'Source citation',
  REFN: 'Reference number',
  RIN: 'Record ID number',
};

function renderFact({ tag, value, date, time, author, otherAttributes = [] }) {
  const label = FACT_LABELS[tag] ?? tag;
  const valueHtml = value ? `<div class="wt-fact-value">${escapeHtml(value).replaceAll('\n', '<br>')}</div>` : '';
  const timeHtml = time ? ` – <span class="date">${escapeHtml(time)}</span>` : '';
  const dateHtml = date ? `<span class="wt-fact-date-age"><span class="date">${escapeHtml(date)}</span>${timeHtml}</span>` : '';
  const authorHtml =
    tag === 'CHAN' && author
      ? `<div class="wt-fact-place"><span class="label">Author of last change</span>: <span class="value align-top">${escapeHtml(author)}</span></div>`
      : '';
  const otherAttributesHtml = otherAttributes
    .map(({ label: attrLabel, value: attrValue }) => labelValueRow(attrLabel, escapeHtml(attrValue).replaceAll('\n', '<br>')))
    .join('');

  return `
        <tr>
            <th scope="row">
                <div class="wt-fact-label">${escapeHtml(label)}</div>
                <span class="wt-fact-icon wt-fact-icon-${escapeHtml(tag)}" title="${escapeHtml(label)}"></span>
            </th>
            <td>
                <div class="wt-fact-main-attributes">
                    ${valueHtml}
                    ${dateHtml}
                    ${authorHtml}
                </div>
                <div class="wt-fact-other-attributes mt-2">
                    ${otherAttributesHtml}
                </div>
            </td>
        </tr>`;
}

/**
 * @param {object} params
 * @param {{title: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken required (non-null) iff params.user !== null
 * @param {{
 *   xref: string,
 *   fullNameHtml: string,
 *   files: object[],
 *   facts: {tag: string, value: string, date: string, time: string, author: string, otherAttributes?: {label: string, value: string}[]}[],
 * }} params.media `fullNameHtml` is PRE-ESCAPED SAFE HTML - inserted
 *   RAW, never passed through escapeHtml() again.
 */
export function renderMediaPage({ tree, user, csrfToken, media }) {
  const csrfMetaTag =
    user !== null
      ? `
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <!-- resources/js/webtrees/http.js's httpPost() unconditionally reads
         this tag and throws (synchronously, before ever sending a
         request) if it's missing - required here because "Sign out"
         uses it, same as note-view.mjs. -->`
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

  const factsHtml = `
    <table class="table wt-facts-table">
        <tbody>${media.files.map(renderMediaFile).join('')}${media.facts.map(renderFact).join('')}
        </tbody>
    </table>`;

  // dir="ltr" is required, not decorative - see account-view.mjs's own
  // doc comment for the [dir]-selector CSS finding this fix addresses.
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${media.fullNameHtml.replace(/<[^>]*>/g, '')}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-media-page">
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
                    <h2 class="wt-page-title">${media.fullNameHtml}</h2>${factsHtml}
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
