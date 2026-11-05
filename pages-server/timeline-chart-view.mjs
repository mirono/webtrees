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

// View layer for /tree/{tree}/timeline-{scale} (TimelineChartModule,
// phase 5 step 35). Mirrors resources/views/modules/timeline-chart/
// chart.phtml and page.phtml, minus the drag-to-explore JS (age
// cursor, draggable fact boxes) - see timeline-chart.mjs's own doc
// comment for why. Always LTR positioning (`left:`, never real PHP's
// own RTL `right:` branch) - the same already-established "this
// migration doesn't port the bidi direction toggle" simplification as
// every other chart.

// Same label maps as individual-view.mjs/family-view.mjs, duplicated
// rather than shared - this migration's established convention (see
// those files' own doc comments on FACT_LABELS/FAMILY_FACT_LABELS).
// Verified against app/Gedcom.php's real 'INDI:TAG'/'FAM:TAG' element
// definitions.
const FACT_LABELS = {
  BIRT: 'Birth',
  CHR: 'Christening',
  BAPM: 'Baptism',
  CHRA: 'Adult christening',
  CONF: 'Confirmation',
  FCOM: 'First communion',
  BARM: 'Bar mitzvah',
  BASM: 'Bat mitzvah',
  BLES: 'Blessing',
  ADOP: 'Adoption',
  NATU: 'Naturalization',
  EMIG: 'Emigration',
  IMMI: 'Immigration',
  CENS: 'Census',
  PROB: 'Probate',
  WILL: 'Will',
  GRAD: 'Graduation',
  RETI: 'Retirement',
  DEAT: 'Death',
  BURI: 'Burial',
  CREM: 'Cremation',
  RESI: 'Residence',
  EVEN: 'Event',
  OCCU: 'Occupation',
  EDUC: 'Education',
  DSCR: 'Description',
  NATI: 'Nationality',
  RELI: 'Religion',
  TITL: 'Title',
  CAST: 'Caste',
  IDNO: 'Identification number',
  NMR: 'Number of marriages',
  SSN: 'Social security number',
  CHAN: 'Last change',
};

const FAMILY_FACT_LABELS = {
  MARR: 'Marriage',
  DIV: 'Divorce',
  DIVF: 'Divorce filed',
  ANUL: 'Annulment',
  _SEPR: 'Separation',
  ENGA: 'Engagement',
  MARB: 'Marriage banns',
  MARC: 'Marriage contract',
  MARL: 'Marriage license',
  MARS: 'Marriage settlement',
  CENS: 'Family census',
  RESI: 'Family residence',
  EVEN: 'Event',
  NCHI: 'Number of children',
  CHAN: 'Last change',
};

const SEX_ICONS = {
  F: ['wt-icon-sex-f', 'fa-venus'],
  M: ['wt-icon-sex-m', 'fa-mars'],
  X: ['wt-icon-sex-x', 'fa-transgender'],
  U: ['wt-icon-sex-u', 'fa-genderless'],
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderSexIcon(sex) {
  const [cssClass, faIcon] = SEX_ICONS[sex] ?? SEX_ICONS.U;

  return `<span class="wt-icon-sex ${cssClass}"><i class="fa-solid ${faIcon}"></i></span>`;
}

function eventLabel(event) {
  return event.recordType === 'family' ? FAMILY_FACT_LABELS[event.tag] ?? `FAM:${event.tag}` : FACT_LABELS[event.tag] ?? event.tag;
}

/**
 * One fact box + its diagonal connector line - mirrors chart.phtml's
 * own per-event echo block, minus the `onmousedown` drag handlers.
 *
 * @param {object} event see layoutTimelineEvents() in timeline-chart.mjs, plus `colorIndex`/`ageHtml`/`ownerFullNameHtml`
 * @param {number} bheight
 * @param {boolean} showNames whether to prefix the box with the owner's name (real PHP: more than 8 selected individuals)
 * @returns {string}
 */
function renderEventBox(event, bheight, showNames) {
  const nameHtml = showNames ? `${event.ownerFullNameHtml} — ` : '';
  const placeHtml = event.place !== '' ? ` — ${escapeHtml(event.place)}` : '';
  const valueHtml = event.value !== '' ? ` ${escapeHtml(event.value)}` : '';
  const familyLinkHtml =
    event.recordType === 'family' ? ` — <a href="${escapeHtml(event.family.url)}">${event.family.fullNameHtml}</a>` : '';

  const dyoffset = event.tyoffset < 0 ? event.yoffset + bheight / 3 : event.yoffset - event.tyoffset + bheight / 3;
  const dimension = Math.abs(event.tyoffset);

  return (
    `<div style="position:absolute; left: ${event.xoffset}px; top:${event.yoffset}px; font-size: 8pt; height: ${bheight}px;">` +
    '<table cellspacing="0" cellpadding="0" border="0"><tr><td>' +
    '<img src="/css/images/hline.png" height="3" width="10" style="padding-left: 3px;">' +
    `</td><td class="person${event.colorIndex}">${nameHtml}${eventLabel(event)} — ${escapeHtml(event.dateDisplay)}${event.ageHtml}${valueHtml}${placeHtml}${familyLinkHtml}</td></tr></table>` +
    '</div>' +
    `<div style="position:absolute; left: 25px; top:${dyoffset}px; height: ${dimension}px; width: ${dimension}px;"></div>`
  );
}

/**
 * The ajax-loaded chart body - mirrors chart.phtml's own vertical
 * scale line + year markers + per-event boxes, without the inline
 * drag-interaction `<script>`.
 *
 * @param {object} params
 * @param {number} params.baseyear
 * @param {number} params.topyear
 * @param {number} params.scale
 * @param {number} params.bheight
 * @param {Array<object>} params.placedEvents see layoutTimelineEvents()
 * @param {boolean} params.showNames
 * @returns {string}
 */
export function renderTimelineChart({ baseyear, topyear, scale, bheight, placedEvents, showNames }) {
  const mod = Math.max(1, Math.trunc(25 / scale));
  const yearMarkers = [];

  for (let year = baseyear + 1; year < topyear; year++) {
    if (year % mod === 0) {
      yearMarkers.push(`<div style="position:absolute; left:0; top:${(year - baseyear) * scale - scale / 2}px; font-size: 7pt;">${year}</div>`);
    }
  }

  const eventBoxes = placedEvents.map((event) => renderEventBox(event, bheight, showNames)).join('');

  return (
    `<div id="timeline_chart" style="height:${Math.max(0, (topyear - baseyear) * scale * 1.1)}px">` +
    `<div style="position:absolute; left:22px; top:0;"><img src="/css/images/vline.png" width="3" height="${Math.max(0, (topyear - baseyear) * scale)}"></div>` +
    `<div style="position:absolute; left:0; top:-5px; font-size: 7pt;">${baseyear}</div>` +
    yearMarkers.join('') +
    `<div style="position:absolute; left:0; top:${(topyear - baseyear) * scale}px; font-size: 7pt;">${topyear}</div>` +
    eventBoxes +
    '</div>'
  );
}

/**
 * Full page: /tree/{tree}/timeline-{scale}. Mirrors
 * resources/views/modules/timeline-chart/page.phtml - the "Add
 * individuals" field (plain text, same simplification as every other
 * chart's own xref field - see e.g. Lifespans) plus one card per
 * selected individual (sex icon, name, alternate name, a "Remove
 * individual" link) and zoom in/out/reset controls.
 *
 * @param {object} params
 * @param {{title: string, name: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken
 * @param {string} params.title
 * @param {Array<{box: object, removeUrl: string}>} params.individuals
 * @param {string} params.resetUrl
 * @param {string} params.zoomInUrl
 * @param {string} params.zoomOutUrl
 * @param {string} params.ajaxUrl
 * @param {string} [params.genealogyMenuHtml]
 * @returns {string}
 */
export function renderTimelineChartPage({
  tree,
  user,
  csrfToken,
  title,
  individuals,
  resetUrl,
  zoomInUrl,
  zoomOutUrl,
  ajaxUrl,
  genealogyMenuHtml = '',
}) {
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

  const individualCards = individuals
    .map(({ box, removeUrl }, n) => {
      const altNameHtml = box.alternateNameHtml !== '' ? `<br>${box.alternateNameHtml}` : '';

      return (
        `<div class="col-md-6 col-lg-4 col-xl-3 person${n % 8}">` +
        renderSexIcon(box.sex) +
        `<a href="${escapeHtml(box.url)}">${box.fullNameHtml}${altNameHtml}</a> ` +
        `<a href="${escapeHtml(removeUrl)}">Remove individual</a>` +
        '</div>'
      );
    })
    .join('');

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-timeline-chart-page">
    <header class="wt-header-wrapper d-print-none">
        <div class="container-lg wt-header-container">
            <div class="row wt-header-content">
                <div class="col wt-site-logo"></div>
                <h1 class="col wt-site-title">${escapeHtml(tree.title)}</h1>
                <div class="col wt-secondary-navigation">
                    <ul class="nav wt-user-menu">${userMenuHtml}
                    </ul>
                </div>
                ${genealogyMenuHtml}
            </div>
        </div>
    </header>

    <main id="content" class="wt-main-wrapper">
        <div class="container-lg wt-main-container">
            <div class="row">
                <div class="col-md-12">
                    <h2 class="wt-page-title">${escapeHtml(title)}</h2>

                    <form method="post" class="wt-page-options wt-page-options-timeline-chart d-print-none">
                        <div class="row">
                            <label class="col-sm-3 col-form-label wt-page-options-label" for="add">Individual</label>
                            <div class="col-sm-9 wt-page-options-value">
                                <input class="form-control" type="text" name="add" id="add" required>
                            </div>
                        </div>
                        <div class="row mb-3">
                            <div class="col-form-label col-sm-3 wt-page-options-label"></div>
                            <div class="col-sm-9 wt-page-options-value">
                                <button type="submit" class="btn btn-primary">add</button>
                                <a class="btn btn-secondary" href="${escapeHtml(resetUrl)}">reset</a>
                            </div>
                        </div>
                        <div class="row mb-3">
                            <div class="col-form-label col-sm-3 wt-page-options-label"></div>
                            <div class="col-sm-9 wt-page-options-value">
                                <a href="${escapeHtml(zoomInUrl)}" title="Zoom in">+</a>
                                <a href="${escapeHtml(zoomOutUrl)}" title="Zoom out">&minus;</a>
                            </div>
                        </div>
                        ${user !== null ? `<input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">` : ''}
                    </form>

                    <div class="row my-4">${individualCards}</div>

                    <div class="wt-page-content wt-chart wt-timeline-chart" data-wt-ajax-url="${escapeHtml(ajaxUrl)}"></div>
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
