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

// Hand-rolled HTML for /tree/{tree}/individual/{xref} - a replica of
// resources/views/individual-page*.phtml's real STRUCTURE (photo box,
// Name/Gender accordion, full tabs bar), same convention as
// tree-view.mjs (dir="ltr", escapeHtml(), CSRF meta tag only when
// logged in). See docs/php-to-js-migration/phase5-individual-page-full.md
// (phase 5, step 14a) for the full scope: every real section is
// present - nothing silently missing - but not every tab has real
// content yet. Facts and events (refined from the earlier flat-page
// version) and Families (today's existing simplified family-links
// list, relocated into its own tab) have real data; Sources/Notes/
// Media/Album are stubbed pending step 14c; Places/Interactive tree
// are permanently stubbed (each is its own disproportionately large
// subsystem - a Leaflet map and an SVG pedigree-drawing widget - out
// of scope for this migration for now, confirmed with the user). The
// right-hand sidebar (Family navigator + Extra information) lands in
// step 14b.

import { createHash } from 'node:crypto';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Verified against app/Gedcom.php's real 'INDI:TAG' element
// definitions (the I18N::translate() argument each entry passes), not
// guessed - widened from the original BIRT/DEAT-only set after the
// user's real imported tree turned out to have RESI/CENS/IMMI/EVEN
// facts that were silently invisible. A tag not listed here falls
// back to the raw tag name.
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

/**
 * Matches resources/views/fact.phtml's ACTUAL row shape (a 2-column
 * `<th scope="row">` label / `<td>` value table, not the 3-column
 * descriptionbox/rela layout an earlier draft of this file guessed at
 * - that guess used CSS classes from webtrees' pre-Bootstrap-5 theme,
 * which don't exist at all in this app's real webtrees.min.css,
 * leaving the whole table unstyled). Reduced to the label/date/place a
 * v1 vital-facts list needs - no Elements-driven value formatting, no
 * sub-fact citations (SOUR/NOTE/OBJE), no edit controls - but using
 * the REAL class names (`wt-fact-label`, `wt-fact-icon-<TAG>`,
 * `wt-fact-date-age`, `date`, `wt-fact-place`) so the existing
 * stylesheet actually applies. `date` is already locale-formatted text
 * (individual.mjs's displayDate()); `time`/`address`/`author` mirror
 * family-view.mjs's identical CHAN/ADDR handling - see that file's own
 * doc comment for the real markup shapes these match
 * (`fact-date.phtml`'s two-separate-`<span class="date">` rendering,
 * `AbstractElement::labelValue()`'s bolded-label markup).
 */
function renderFact({ tag, date, time, place, address, author }) {
  const label = FACT_LABELS[tag] ?? tag;
  const timeHtml = time ? ` – <span class="date">${escapeHtml(time)}</span>` : '';
  const dateHtml = date ? `<span class="wt-fact-date-age"><span class="date">${escapeHtml(date)}</span>${timeHtml}</span>` : '';
  const placeHtml = place ? `<div class="wt-fact-place">${escapeHtml(place)}</div>` : '';
  const addressHtml = address
    ? `<div class="wt-fact-place"><span class="label">Address</span>: <span class="value align-top">${escapeHtml(address)}</span></div>`
    : '';
  const authorHtml =
    tag === 'CHAN' && author
      ? `<div class="wt-fact-place"><span class="label">Author of last change</span>: <span class="value align-top">${escapeHtml(author)}</span></div>`
      : '';

  return `
        <tr>
            <th scope="row">
                <div class="wt-fact-label">${escapeHtml(label)}</div>
                <span class="wt-fact-icon wt-fact-icon-${escapeHtml(tag)}" title="${escapeHtml(label)}"></span>
            </th>
            <td>
                <div class="wt-fact-main-attributes">
                    ${dateHtml}
                    ${placeHtml}
                    ${addressHtml}
                    ${authorHtml}
                </div>
            </td>
        </tr>`;
}

/**
 * Families TAB content (relocated here from what used to be its own
 * inline page section - see this file's top doc comment). Mirrors
 * RelativesTabModule's parent_families/spouse_families
 * (app/Module/RelativesTabModule.php), reduced to a flat list of links
 * rather than the full per-member chart-box + relationship-name
 * rendering `modules/relatives/family.phtml` does (that's effectively
 * re-embedding FamilyPage's own member cards inline - deferred to step
 * 14c, which upgrades this tab's content quality without changing
 * where it lives). Reuses the real `wt-facts-table`/`table table-sm`
 * wrapper classes rather than inventing new ones.
 *
 * @param {{titleHtml: string, url: string}[]} parentFamilies
 * @param {{titleHtml: string, url: string}[]} spouseFamilies
 * @returns {string}
 */
function renderFamiliesTabContent(parentFamilies, spouseFamilies) {
  if (parentFamilies.length === 0 && spouseFamilies.length === 0) {
    return '<p>This feature has not been migrated yet.</p>';
  }

  const parentRows = parentFamilies
    .map(
      (family) => `
        <tr>
            <th scope="row">Parents</th>
            <td><a href="${escapeHtml(family.url)}">${family.titleHtml}</a></td>
        </tr>`,
    )
    .join('');
  const spouseRows = spouseFamilies
    .map(
      (family) => `
        <tr>
            <th scope="row">Spouse family</th>
            <td><a href="${escapeHtml(family.url)}">${family.titleHtml}</a></td>
        </tr>`,
    )
    .join('');

  return `
    <table class="table table-sm wt-facts-table">
        <tbody>${parentRows}${spouseRows}
        </tbody>
    </table>`;
}

/**
 * Mirrors individual-page-images.phtml's real conditional structure
 * (app/MediaFile.php's displayImage() is what actually renders each
 * `<img>` - see media.mjs's own doc comment for why Node never needs
 * to process image pixels itself). The whole box is omitted entirely
 * when there's no photo AND silhouettes are disabled - matching real
 * PHP's own `$individual_media->isNotEmpty() || USE_SILHOUETTE`
 * condition exactly, not "always show something."
 *
 * @param {{images: {thumbnailUrl: string, srcset: string, alt: string}[], useSilhouette: boolean, sex: 'M'|'F'|'X'|'U'}} params
 * @returns {string}
 */
function renderPhotoBox({ images, useSilhouette, sex: individualSex }) {
  if (images.length === 0 && !useSilhouette) {
    return '';
  }

  let bodyHtml;

  if (images.length === 0) {
    bodyHtml = `
            <div class="img-thumbnail">
                <i class="wt-individual-silhouette wt-individual-silhouette-${escapeHtml(individualSex.toLowerCase())} wt-icon-flip-rtl w-100"></i>
            </div>`;
  } else if (images.length === 1) {
    bodyHtml = renderPhotoImage(images[0]);
  } else {
    const slides = images
      .map((image, index) => `
                    <div class="carousel-item ${index === 0 ? 'active' : ''}">${renderPhotoImage(image)}
                    </div>`)
      .join('');

    bodyHtml = `
            <div id="individual-images" class="carousel slide" data-bs-interval="false">
                <div class="carousel-inner">${slides}
                </div>
                <button type="button" class="carousel-control-prev" data-bs-target="#individual-images" data-bs-slide="prev">
                    <span class="carousel-control-prev-icon" aria-hidden="true"></span>
                    <span class="visually-hidden">previous</span>
                </button>
                <button type="button" class="carousel-control-next" data-bs-target="#individual-images" data-bs-slide="next">
                    <span class="carousel-control-next-icon" aria-hidden="true"></span>
                    <span class="visually-hidden">next</span>
                </button>
            </div>`;
  }

  return `
        <div class="col-sm-3">${bodyHtml}
        </div>`;
}

function renderPhotoImage({ thumbnailUrl, srcset, alt }) {
  return `
                    <img dir="auto" src="${escapeHtml(thumbnailUrl)}" srcset="${escapeHtml(srcset)}" alt="${escapeHtml(alt)}" class="img-thumbnail img-fluid w-100">`;
}

/**
 * One collapsed accordion item for a single NAME fact - matches
 * individual-page-name.phtml's real markup (Bootstrap accordion-item/
 * accordion-header/accordion-button/accordion-collapse/accordion-body,
 * real Font Awesome expand/collapse carets). `fullHtml`/`rawValueHtml`
 * are both PRE-ESCAPED SAFE HTML for `fullHtml` (from addName()) and
 * plain escaped text for `rawValueHtml` - the header shows the styled
 * `fullHtml`, but the body's own "Name" row shows the RAW gedcom value
 * text (`$fact->value()` in real PHP - e.g. literally "John /Smith/",
 * slashes included), a deliberate difference from the header, not a
 * mistake.
 *
 * @param {object} params
 * @param {string} params.id a stable per-name DOM id (md5 of the
 *   fact's own gedcom, matching Fact::id()'s real algorithm)
 * @param {string} params.fullHtml
 * @param {string} params.rawValue
 * @param {string} params.typeValue raw TYPE sub-tag value if present,
 *   else ''. Real PHP translates this through NameType's own small
 *   controlled-values enum (e.g. 'MARRIED' -> "married name") - not
 *   ported here, so this deliberately shows the raw GEDCOM code
 *   instead (e.g. "MARRIED"), same "known label vs. raw fallback"
 *   convention used elsewhere, just without the "known" half yet.
 * @param {{label: string, value: string}[]} params.subAttributes
 * @returns {string}
 */
function renderNameAccordionItem({ id, fullHtml, rawValue, typeValue, subAttributes }) {
  const typeSuffixHtml = typeValue ? ` — ${escapeHtml(typeValue)}` : '';
  const rowsHtml = subAttributes
    .map(
      ({ label, value }) => `
                        <dt class="col-md-4 col-lg-3">${escapeHtml(label)}</dt>
                        <dd class="col-md-8 col-lg-9">${escapeHtml(value)}</dd>`,
    )
    .join('');

  return `
        <div class="accordion-item">
            <div class="accordion-header" id="name-header-${id}">
                <button class="accordion-button collapsed gap-1" type="button" data-bs-toggle="collapse" data-bs-target="#name-content-${id}" aria-expanded="false" aria-controls="name-content-${id}">
                    <span class="wt-icon-expand"><i class="fa-solid fa-caret-down"></i></span><span class="wt-icon-collapse"><i class="fa-solid fa-caret-up"></i></span>
                    <span class="label">Name</span>
                    <div>${fullHtml}${typeSuffixHtml}</div>
                </button>
            </div>
            <div id="name-content-${id}" class="accordion-collapse collapse" data-bs-parent="#individual-names" aria-labelledby="name-header-${id}">
                <div class="accordion-body">
                    <dl class="row mb-0">
                        <dt class="col-md-4 col-lg-3">Name</dt>
                        <dd class="col-md-8 col-lg-9"><bdi>${escapeHtml(rawValue)}</bdi></dd>${rowsHtml}
                    </dl>
                </div>
            </div>
        </div>`;
}

/**
 * Matches individual-page-sex.phtml's real markup exactly (same
 * accordion-item shape as a name, no body content beyond the header -
 * fact-sources/fact-notes on a SEX fact are vanishingly rare and not
 * ported here).
 *
 * @param {{id: string, valueLabel: string}} params
 * @returns {string}
 */
function renderSexAccordionItem({ id, valueLabel }) {
  return `
        <div class="accordion-item">
            <div class="accordion-header" id="name-header-${id}">
                <button class="accordion-button collapsed gap-1" type="button" data-bs-toggle="collapse" data-bs-target="#name-content-${id}" aria-expanded="false" aria-controls="name-content-${id}">
                    <span class="wt-icon-expand"><i class="fa-solid fa-caret-down"></i></span><span class="wt-icon-collapse"><i class="fa-solid fa-caret-up"></i></span>
                    <span class="label">Sex</span>
                    ${escapeHtml(valueLabel)}
                </button>
            </div>
            <div id="name-content-${id}" class="accordion-collapse collapse" data-bs-parent="#individual-names" aria-labelledby="name-header-${id}"></div>
        </div>`;
}

/**
 * Mirrors individual-page-names.phtml exactly: a Bootstrap accordion
 * with one item per real NAME fact (not just the primary one) plus one
 * SEX item - replaces what used to be a flat `<h2>` title (this
 * migration's original v1 slice).
 *
 * @param {{names: object[], sexId: string, sexValueLabel: string}} params
 * @returns {string}
 */
function renderNameGenderAccordion({ names, sexId, sexValueLabel }) {
  const nameItemsHtml = names
    .map((name) => {
      const id = createHash('md5').update(name.gedcom).digest('hex');
      const typeMatch = /\n2 TYPE (.+)/.exec(name.gedcom);

      return renderNameAccordionItem({
        id,
        fullHtml: name.full,
        rawValue: name.rawValue,
        typeValue: typeMatch ? typeMatch[1] : '',
        subAttributes: name.subAttributes,
      });
    })
    .join('');

  return `
        <div class="col-sm accordion" id="individual-names">${nameItemsHtml}${renderSexAccordionItem({ id: sexId, valueLabel: sexValueLabel })}
        </div>`;
}

// The 8 real ModuleTabInterface tabs (app/Module/*TabModule.php,
// AlbumModule, InteractiveTreeModule, PlacesModule), in their real
// defaultTabOrder() (confirmed by reading each module class directly -
// this deployment has no wt_module.tab_order override rows, so the
// code defaults are what actually renders). `stub: true` tabs render a
// "not yet available" placeholder instead of real content - see this
// file's top doc comment for which tabs that applies to and why.
const TAB_DEFINITIONS = [
  { id: 'tab-facts', title: 'Facts and events' },
  { id: 'tab-families', title: 'Families' },
  { id: 'tab-sources', title: 'Sources', stub: true },
  { id: 'tab-notes', title: 'Notes', stub: true },
  { id: 'tab-media', title: 'Media', stub: true },
  { id: 'tab-album', title: 'Album', stub: true },
  { id: 'tab-interactive-tree', title: 'Interactive tree', stub: true },
  { id: 'tab-places', title: 'Places', stub: true },
];

/**
 * Matches individual-page-tabs.phtml's real Bootstrap tab markup
 * (`wt-tabs-individual`/`nav nav-tabs flex-wrap`/`tab-content`/
 * `tab-pane fade`) and its client-side behavior via Bootstrap's own
 * `data-bs-toggle="tab"` JS (already bundled in vendor.min.js on every
 * page - no extra script needed). Real PHP activates the first tab via
 * a small inline script (also syncing `location.hash`); this renders
 * the first tab's `active`/`show active` classes directly in the
 * initial HTML instead, achieving the same default-visible-tab result
 * without needing that extra JS. Every tab's content is rendered
 * inline in the initial response - real PHP's `canLoadAjax()` lazy-
 * loading for some tabs isn't replicated (a performance optimization,
 * not a behavior difference: the content is identical, just not
 * deferred).
 *
 * @param {{factsHtml: string, familiesHtml: string}} content real
 *   content for the two tabs that have it yet; every other tab gets
 *   the shared stub placeholder.
 * @returns {string}
 */
function renderTabs({ factsHtml, familiesHtml }) {
  const tabContent = { 'tab-facts': factsHtml, 'tab-families': familiesHtml };
  const stubHtml = '<p>This feature has not been migrated yet.</p>';

  const navItemsHtml = TAB_DEFINITIONS.map(
    (tab, index) => `
            <li class="nav-item" role="presentation">
                <a class="nav-link${index === 0 ? ' active' : ''}" data-bs-toggle="tab" role="tab" href="#${tab.id}">${escapeHtml(tab.title)}</a>
            </li>`,
  ).join('');

  const panesHtml = TAB_DEFINITIONS.map((tab, index) => {
    const paneClass = index === 0 ? 'tab-pane mt-2 fade show active' : 'tab-pane mt-2 fade';
    const html = tab.stub ? stubHtml : (tabContent[tab.id] ?? stubHtml);

    return `
            <div id="${tab.id}" class="${paneClass}" role="tabpanel">${html}</div>`;
  }).join('');

  return `
    <div class="wt-tabs-individual" id="individual-tabs">
        <ul class="nav nav-tabs flex-wrap" role="tablist">${navItemsHtml}
        </ul>
        <div class="tab-content">${panesHtml}
        </div>
    </div>`;
}

/**
 * @param {object} params
 * @param {{title: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken required (non-null) iff params.user !== null
 * @param {{
 *   xref: string,
 *   fullNameHtml: string,
 *   lifespan: string,
 *   age: string,
 *   sex: 'M'|'F'|'X'|'U',
 *   sexValueLabel: string,
 *   photoImages: {thumbnailUrl: string, srcset: string, alt: string}[],
 *   useSilhouette: boolean,
 *   names: {full: string, rawValue: string, gedcom: string, subAttributes: {label: string, value: string}[]}[],
 *   facts: {tag: string, date: string, time: string, place: string, address: string, author: string}[],
 *   parentFamilies: {titleHtml: string, url: string}[],
 *   spouseFamilies: {titleHtml: string, url: string}[],
 * }} params.individual `fullNameHtml` and each name's `full` are
 *   PRE-ESCAPED SAFE HTML (see pages-server/individual.mjs's addName())
 *   - inserted RAW, never passed through escapeHtml() again. `titleHtml`
 *   in each family entry is likewise pre-escaped (built from two such
 *   fullNameHtml values in pages-server/index.mjs).
 */
export function renderIndividualPage({ tree, user, csrfToken, individual }) {
  const csrfMetaTag =
    user !== null
      ? `
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <!-- resources/js/webtrees/http.js's httpPost() unconditionally reads
         this tag and throws (synchronously, before ever sending a
         request) if it's missing - required here because "Sign out"
         uses it, same as tree-view.mjs. -->`
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

  const photoBoxHtml = renderPhotoBox({ images: individual.photoImages, useSilhouette: individual.useSilhouette, sex: individual.sex });
  const sexId = createHash('md5').update(`__sex__${individual.xref}`).digest('hex');
  const nameGenderHtml = renderNameGenderAccordion({ names: individual.names, sexId, sexValueLabel: individual.sexValueLabel });

  const familiesHtml = renderFamiliesTabContent(individual.parentFamilies, individual.spouseFamilies);
  const factsHtml =
    individual.facts.length > 0
      ? `
    <table class="table wt-facts-table">
        <tbody>${individual.facts.map(renderFact).join('')}
        </tbody>
    </table>`
      : '<p>This feature has not been migrated yet.</p>';
  const tabsHtml = renderTabs({ factsHtml, familiesHtml });

  // dir="ltr" is required, not decorative - see account-view.mjs's own
  // doc comment for the [dir]-selector CSS finding this fix addresses.
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${individual.fullNameHtml.replace(/<[^>]*>/g, '')}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-individual-page">
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
                    <h2 class="wt-page-title">${individual.fullNameHtml} <span class="wt-lifespan">${escapeHtml(individual.lifespan)}</span> ${escapeHtml(individual.age)}</h2>
                    <div class="row mb-4">${photoBoxHtml}${nameGenderHtml}
                    </div>${tabsHtml}
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
