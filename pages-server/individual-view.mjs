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
// Name/Gender accordion, full tabs bar, right-hand sidebar), same
// convention as tree-view.mjs (dir="ltr", escapeHtml(), CSRF meta tag
// only when logged in). See docs/php-to-js-migration/
// phase5-individual-page-full.md (phase 5, steps 14a-14c) for the full
// scope: every real section is present - nothing silently missing.
// Facts and events, Families, Sources, Notes, Media, and Album all
// have real data (each simplified from real PHP's own richer
// rendering - no edit affordances, no citation/PAGE/DATA/QUAY detail,
// no collapsible "show all" toggles - see each tab's own render
// function for its specific scope note); Places and Interactive tree
// are permanently stubbed (each is its own disproportionately large
// subsystem - a Leaflet map and an SVG pedigree-drawing widget - out
// of scope for this migration for now, confirmed with the user).

import { createHash } from 'node:crypto';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Matches family-view.mjs's own placeholder for a missing/unlinked
// spouse - not shared/exported (this migration's convention is small
// per-file duplicates over a shared registry).
const UNKNOWN_NAME_HTML = '<span class="NAME" dir="auto" translate="no">…</span>';

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
  // Not shown on the main Facts tab (SOUR/NOTE are excluded there,
  // same as real PHP's own tab/sidebar routing) - needed here because
  // the Sources/Notes tabs' OWN items can be a top-level `1 SOUR @Sx@`
  // or `1 NOTE ...` fact, which uses this SAME label lookup.
  SOUR: 'Source citation',
  NOTE: 'Note',
};

// A family fact merged onto the individual's own Facts tab (see
// familyFactsForIndividual() in index.mjs) keeps its ORIGINAL record's
// label, not the individual-level one - real PHP's Fact::label() looks
// up `$this->record->tag() . ':' . $this->tag`, and `$fact->record()`
// for a merged family fact is still the FAMILY, not the individual
// viewing it (e.g. a family's own RESI is "Family residence", distinct
// from an individual's own RESI = "Residence" - both real, different
// tree-of-life). Verified against family-view.mjs's own FACT_LABELS
// (not re-exported from there - this migration's convention is small
// per-file label maps, not a shared registry).
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
  // See FACT_LABELS's own SOUR/NOTE entries - 'FAM:SOUR'/'FAM:NOTE'
  // resolve to the same real translated label as 'INDI:SOUR'/'INDI:NOTE'.
  SOUR: 'Source citation',
  NOTE: 'Note',
};

// The "Extra information" sidebar's own tag set (IndividualMetadataModule
// ::HANDLED_FACTS, app/Module/IndividualMetadataModule.php:38-53),
// labels verified against app/Gedcom.php's real 'INDI:TAG' definitions.
// _UID/_FSFTID/_WEBTAG have no defined element in real PHP either
// (custom tags) - fall back to the raw "INDI:<TAG>" path, same
// UnknownElement-fallback convention already used for SourcePage's own
// otherFactAttributes(). ANCI/DESI/SUBM are really submitter
// cross-references (XrefSubmitter); this migration has no Submitter
// page, so their value renders as plain text (the raw "@Sxref@"
// reference) rather than a link - a deliberate, narrow simplification.
export const EXTRA_INFO_TAGS = ['AFN', 'ANCI', 'CHAN', 'DESI', 'IDNO', 'REFN', 'RESN', 'RFN', 'RIN', 'SSN', 'SUBM', '_UID', '_FSFTID', '_WEBTAG'];
const EXTRA_INFO_LABELS = {
  AFN: 'Ancestral file number',
  ANCI: 'Ancestors interest',
  CHAN: 'Last change',
  DESI: 'Descendants interest',
  IDNO: 'Identification number',
  REFN: 'Reference number',
  RESN: 'Restriction',
  RFN: 'Record file number',
  RIN: 'Record ID number',
  SSN: 'Social security number',
  SUBM: 'Submitter',
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
function renderFact({ tag, value, date, time, place, address, author, fromFamily, isExtraInfo }) {
  let label;

  if (fromFamily) {
    // Confirmed live: a real family record can carry a tag app/Gedcom.php
    // never defines for FAM (e.g. FAM:EMIG/FAM:IMMI - non-standard but
    // real GEDCOM usage) - real PHP's own UnknownElement fallback is
    // the FULL colon path (FAM:<TAG>), not the bare tag, same
    // convention already established for Extra info's _UID and
    // SourcePage's own subtag fallbacks.
    label = FAMILY_FACT_LABELS[tag] ?? `FAM:${tag}`;
  } else if (isExtraInfo) {
    label = EXTRA_INFO_LABELS[tag] ?? `INDI:${tag}`;
  } else {
    label = FACT_LABELS[tag] ?? tag;
  }

  const valueHtml = value ? `<div class="wt-fact-value">${escapeHtml(value)}</div>` : '';
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
                    ${valueHtml}
                    ${dateHtml}
                    ${placeHtml}
                    ${addressHtml}
                    ${authorHtml}
                </div>
            </td>
        </tr>`;
}

/**
 * One member's card within a Families-tab family - same real
 * chart-box.phtml classes already verified for FamilyPage's own
 * husband/wife/children cards (family-view.mjs's renderMemberCard(),
 * not exported from there - this migration's convention is small
 * per-file duplicates over a shared registry). A null member (missing/
 * unlinked spouse) renders the same "unknown name" placeholder
 * FamilyPage itself uses.
 *
 * @param {{fullNameHtml: string, sex: string, birthSummary: string, url: string}|null} member
 * @returns {string}
 */
function renderFamiliesTabMemberCard(member) {
  if (member === null) {
    return `
        <div class="wt-chart-box">${UNKNOWN_NAME_HTML}</div>`;
  }

  const factsHtml = member.birthSummary
    ? `
            <div class="wt-chart-box-facts">
                <div class="wt-chart-box-fact small">${escapeHtml(member.birthSummary)}</div>
            </div>`
    : '';

  return `
        <div class="wt-chart-box wt-chart-box-${escapeHtml(member.sex.toLowerCase())}">
            <div class="wt-chart-box-name"><a href="${escapeHtml(member.url)}">${member.fullNameHtml}</a></div>${factsHtml}
        </div>`;
}

/**
 * One family's full entry within the Families tab - real per-member
 * cards (husband/wife/children, reusing FamilyPage's own chart-box
 * rendering) plus the family's own displayable facts (MARR/RESI/etc,
 * the same extraction shared with FamilyPage and the Facts-tab merge -
 * see index.mjs's resolveFamiliesTabFamily()), upgraded from step 11's
 * flat "husband + wife" link. No step-families, no edit affordances
 * (add/re-order) - modules/relatives/family.phtml's own `can_edit`
 * block, same "no editing capability yet" cut as everywhere else.
 *
 * @param {{label: string, url: string, husband: object|null, wife: object|null, children: object[], facts: object[]}} family
 * @returns {string}
 */
function renderFamiliesTabFamily({ label, url, husband, wife, children, facts }) {
  const childrenHtml = children.map(renderFamiliesTabMemberCard).join('');
  const factsHtml =
    facts.length > 0
      ? `
        <table class="table table-sm wt-facts-table">
            <tbody>${facts.map((fact) => renderFact({ ...fact, fromFamily: true })).join('')}
            </tbody>
        </table>`
      : '';

  return `
    <div class="wt-family">
        <h4>${escapeHtml(label)} — <a href="${escapeHtml(url)}">View this family</a></h4>
        <div class="wt-chart-box-list d-flex flex-wrap">${renderFamiliesTabMemberCard(husband)}${renderFamiliesTabMemberCard(wife)}${childrenHtml}
        </div>${factsHtml}
    </div>`;
}

/**
 * Families TAB content - real per-member cards for each parent/spouse
 * family (see renderFamiliesTabFamily()), upgraded from step 11's flat
 * link list (phase 5 step 14c).
 *
 * @param {{parentFamilies: object[], spouseFamilies: object[]}} familiesTab
 * @returns {string}
 */
function renderFamiliesTabContent({ parentFamilies, spouseFamilies }) {
  const families = [...parentFamilies, ...spouseFamilies];

  if (families.length === 0) {
    return '<p>This feature has not been migrated yet.</p>';
  }

  return families.map(renderFamiliesTabFamily).join('');
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

/**
 * A tab item's own label - matches whichever tag-label map its source
 * fact actually belongs to (same fromFamily convention as renderFact()).
 *
 * @param {string} tag
 * @param {boolean} fromFamily
 * @returns {string}
 */
function tabItemLabel(tag, fromFamily) {
  // See renderFact()'s own fromFamily branch for why the raw-path
  // fallback differs by origin (FAM:<TAG> vs bare <TAG>).
  return fromFamily ? (FAMILY_FACT_LABELS[tag] ?? `FAM:${tag}`) : (FACT_LABELS[tag] ?? tag);
}

/**
 * Sources tab content (phase 5 step 14c) - matches
 * modules/sources_tab/tab.phtml's real `wt-tab-sources`/`wt-facts-table`
 * wrapper, simplified to a flat label + linked source title list (no
 * PAGE/DATA/QUAY citation details, no "show all sources" toggle - see
 * index.mjs's sourcesTabItems() for the full scope note).
 *
 * @param {{tag: string, fromFamily: boolean, sourceLinks: {url: string, nameHtml: string}[]}[]} items
 * @returns {string}
 */
function renderSourcesTab(items) {
  if (items.length === 0) {
    return '<p>There are no source citations for this individual.</p>';
  }

  const rowsHtml = items
    .map(({ tag, fromFamily, sourceLinks }) => {
      const linksHtml = sourceLinks.map(({ url, nameHtml }) => `<div><a href="${escapeHtml(url)}">${nameHtml}</a></div>`).join('');

      return `
        <tr>
            <th scope="row">${escapeHtml(tabItemLabel(tag, fromFamily))}</th>
            <td>${linksHtml}</td>
        </tr>`;
    })
    .join('');

  return `
    <div class="wt-tab-sources">
        <table class="table wt-facts-table">
            <tbody>${rowsHtml}
            </tbody>
        </table>
    </div>`;
}

/**
 * Notes tab content (phase 5 step 14c) - matches
 * modules/notes/tab.phtml's real `wt-tab-notes`/`wt-facts-table`
 * wrapper, simplified to a flat label + note-text list (shared notes
 * marked with the real "Shared note" wording, plain escaped text - no
 * "show all notes" toggle, no SubmitterText markdown-ish formatting).
 *
 * @param {{tag: string, fromFamily: boolean, notes: {isShared: boolean, text: string}[]}[]} items
 * @returns {string}
 */
function renderNotesTab(items) {
  if (items.length === 0) {
    return '<p>There are no notes for this individual.</p>';
  }

  const rowsHtml = items
    .map(({ tag, fromFamily, notes }) => {
      const notesHtml = notes
        .map(({ isShared, text }) => {
          const body = escapeHtml(text).replaceAll('\n', '<br>');

          return isShared ? `<div class="mb-2"><em>Shared note</em>: ${body}</div>` : `<div class="mb-2">${body}</div>`;
        })
        .join('');

      return `
        <tr>
            <th scope="row">${escapeHtml(tabItemLabel(tag, fromFamily))}</th>
            <td>${notesHtml}</td>
        </tr>`;
    })
    .join('');

  return `
    <div class="wt-tab-notes">
        <table class="table wt-facts-table">
            <tbody>${rowsHtml}
            </tbody>
        </table>
    </div>`;
}

/**
 * One image, shared by the Media tab (a labeled row) and the Album
 * tab (a bare gallery tile) - see the `gallery` flag.
 *
 * @param {{thumbnailUrl: string, srcset: string, alt: string}} image
 * @param {boolean} gallery
 * @returns {string}
 */
function renderMediaImage({ thumbnailUrl, srcset, alt }, gallery) {
  const imgHtml = `<img dir="auto" src="${escapeHtml(thumbnailUrl)}" srcset="${escapeHtml(srcset)}" alt="${escapeHtml(alt)}" class="img-thumbnail img-fluid${gallery ? '' : ' w-100'}">`;

  if (!gallery) {
    return `
        <tr>
            <td>${imgHtml}</td>
        </tr>`;
  }

  return `
        <div class="wt-media-tile me-2 mb-2">${imgHtml}
        </div>`;
}

/**
 * Media tab content (phase 5 step 14c) - matches
 * modules/media/tab.phtml's real `wt-tab-media`/`wt-facts-table`
 * wrapper, simplified to a bare thumbnail list (no PAGE/TYPE citation
 * details, no "show all media" toggle - reuses the exact same signed-
 * thumbnail-URL images the photo box already builds, see media.mjs's
 * own doc comment for why no Node-side image processing is needed).
 *
 * @param {{thumbnailUrl: string, srcset: string, alt: string}[]} images
 * @returns {string}
 */
function renderMediaTab(images) {
  if (images.length === 0) {
    return '<p>There are no media objects for this individual.</p>';
  }

  return `
    <div class="wt-tab-media">
        <table class="table wt-facts-table">
            <tbody>${images.map((image) => renderMediaImage(image, false)).join('')}
            </tbody>
        </table>
    </div>`;
}

/**
 * Album tab content (phase 5 step 14c) - AlbumModule extends
 * MediaTabModule (app/Module/AlbumModule.php), reusing the SAME
 * underlying image data as the Media tab, laid out as a gallery grid
 * (resources/views/modules/lightbox/tab.phtml) instead of a table -
 * simplified to a bare thumbnail grid, no lightbox click-to-enlarge
 * popup (same "no lightbox" cut already made for the photo box).
 *
 * @param {{thumbnailUrl: string, srcset: string, alt: string}[]} images
 * @returns {string}
 */
function renderAlbumTab(images) {
  if (images.length === 0) {
    return '<p>There are no media objects for this individual.</p>';
  }

  return `
    <div class="wt-tab-album d-flex flex-wrap">${images.map((image) => renderMediaImage(image, true)).join('')}
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
  { id: 'tab-sources', title: 'Sources' },
  { id: 'tab-notes', title: 'Notes' },
  { id: 'tab-media', title: 'Media' },
  { id: 'tab-album', title: 'Album' },
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
function renderTabs({ factsHtml, familiesHtml, sourcesHtml, notesHtml, mediaHtml, albumHtml }) {
  const tabContent = {
    'tab-facts': factsHtml,
    'tab-families': familiesHtml,
    'tab-sources': sourcesHtml,
    'tab-notes': notesHtml,
    'tab-media': mediaHtml,
    'tab-album': albumHtml,
  };
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
 * One relationship row (a spouse or a child) within one family navigator
 * table - matches modules/family_nav/sidebar-family.phtml's real
 * per-row markup exactly (sex-colored row class, a "you are here" user
 * icon for the self row in the label cell, name+lifespan always shown
 * in the data cell since every member here already passed the family's
 * own privacy gate before reaching this function).
 *
 * @param {{label: string, isSelf: boolean, fullNameHtml: string, lifespanText: string, url: string, sex: 'M'|'F'|'X'|'U', rowType: 'parent'|'child'}} row
 * @returns {string}
 */
function renderFamilyNavigatorRow({ label, isSelf, fullNameHtml, lifespanText, url, sex: memberSex, rowType }) {
  const rowClass = rowType === 'parent' ? 'wt-family-navigator-parent' : 'wt-family-navigator-child';
  const selfIconHtml = isSelf ? ' <span class="icon-selected"><span class="wt-icon-user"><i class="fa-solid fa-user"></i></span></span>' : '';

  return `
        <tr class="text-center ${rowClass} wt-sex-${escapeHtml(memberSex.toLowerCase())}">
            <th class="align-middle wt-family-navigator-label" scope="row">
                ${escapeHtml(label)}${selfIconHtml}
            </th>
            <td class="wt-family-navigator-name">
                <a href="${escapeHtml(url)}">${fullNameHtml}</a>
                <div class="small">${escapeHtml(lifespanText)}</div>
            </td>
        </tr>`;
}

/**
 * One family's table within the Family navigator sidebar - matches
 * modules/family_nav/sidebar-family.phtml's real outer structure (a
 * captioned mini facts-table, not a full chart-box).
 *
 * @param {{titleHtml: string, url: string, rows: object[]}} family
 * @returns {string}
 */
function renderFamilyNavigatorFamily({ titleHtml, url, rows }) {
  return `
    <table class="table table-sm wt-facts-table wt-family-navigator-family">
        <caption class="text-center wt-family-navigator-family-heading">
            <a href="${escapeHtml(url)}">${titleHtml}</a>
        </caption>
        <tbody>${rows.map(renderFamilyNavigatorRow).join('')}
        </tbody>
    </table>`;
}

/**
 * The "Family navigator" sidebar accordion item's content - matches
 * modules/family_nav/sidebar.phtml's real structure: parent families
 * first, then spouse families (no step-families - see this file's top
 * doc comment for the deliberate scope cut).
 *
 * @param {{parentFamilies: object[], spouseFamilies: object[]}} familyNavigator
 * @returns {string}
 */
function renderFamilyNavigator({ parentFamilies, spouseFamilies }) {
  return `
    <div class="wt-sidebar-content wt-sidebar-family-navigator">${[...parentFamilies, ...spouseFamilies].map(renderFamilyNavigatorFamily).join('')}
    </div>`;
}

/**
 * The "Extra information" sidebar accordion item's content - matches
 * IndividualMetadataModule::getSidebarContent()'s tag set
 * (AFN/ANCI/CHAN/DESI/IDNO/REFN/RESN/RFN/RIN/SSN/SUBM/_UID/_FSFTID/
 * _WEBTAG), reusing the same renderFact() row shape as the Facts tab
 * (real PHP joins bare `<hr>`-separated fact partials instead - this
 * migration wraps them in the same wt-facts-table shape used
 * everywhere else, a deliberate, documented divergence rather than
 * reproducing the bare-div layout).
 *
 * @param {object[]} facts
 * @returns {string}
 */
function renderExtraInformation(facts) {
  if (facts.length === 0) {
    return '<p>This feature has not been migrated yet.</p>';
  }

  return `
    <table class="table wt-facts-table">
        <tbody>${facts.map((fact) => renderFact({ ...fact, isExtraInfo: true })).join('')}
        </tbody>
    </table>`;
}

// Real names/order: individual-page-sidebars.phtml iterates enabled
// ModuleSidebarInterface modules - "family_nav" (FamilyNavigatorModule)
// is forced open by name, everything else (just "extra_info" here)
// starts collapsed, regardless of any configured order.
const SIDEBAR_DEFINITIONS = [
  { name: 'extra_info', title: 'Extra information', open: false },
  { name: 'family_nav', title: 'Family navigator', open: true },
];

/**
 * Matches individual-page-sidebars.phtml's real accordion structure
 * (`accordion wt-sidebar`/`#sidebar`, real expand/collapse caret icons
 * matching the Name/Gender accordion's own convention) exactly.
 *
 * @param {{extraInformationHtml: string, familyNavigatorHtml: string}} content
 * @returns {string}
 */
function renderSidebar({ extraInformationHtml, familyNavigatorHtml }) {
  const contentByName = { extra_info: extraInformationHtml, family_nav: familyNavigatorHtml };

  const itemsHtml = SIDEBAR_DEFINITIONS.map(({ name, title, open }) => {
    const buttonClass = open ? 'accordion-button gap-1' : 'accordion-button gap-1 collapsed';
    const collapseClass = open ? 'accordion-collapse collapse show' : 'accordion-collapse collapse';

    return `
        <div class="accordion-item">
            <div class="accordion-header" id="sidebar-header-${name}">
                <button class="${buttonClass}" type="button" data-bs-toggle="collapse" data-bs-target="#sidebar-content-${name}" aria-expanded="${open}" aria-controls="sidebar-content-${name}">
                    <span class="wt-icon-expand"><i class="fa-solid fa-caret-down"></i></span><span class="wt-icon-collapse"><i class="fa-solid fa-caret-up"></i></span>
                    ${title}
                </button>
            </div>
            <div id="sidebar-content-${name}" class="${collapseClass}" data-bs-parent="#sidebar" aria-labelledby="sidebar-header-${name}">
                <div class="accordion-body">${contentByName[name]}</div>
            </div>
        </div>`;
  }).join('');

  return `
    <div class="accordion wt-sidebar" id="sidebar">${itemsHtml}
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
 *   extraInformationFacts: object[],
 *   familyNavigator: {parentFamilies: object[], spouseFamilies: object[]},
 *   familiesTab: {parentFamilies: object[], spouseFamilies: object[]},
 *   sourcesTab: object[],
 *   notesTab: object[],
 *   mediaImages: {thumbnailUrl: string, srcset: string, alt: string}[],
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

  const familiesHtml = renderFamiliesTabContent(individual.familiesTab);
  const factsHtml =
    individual.facts.length > 0
      ? `
    <table class="table wt-facts-table">
        <tbody>${individual.facts.map(renderFact).join('')}
        </tbody>
    </table>`
      : '<p>This feature has not been migrated yet.</p>';
  const sourcesHtml = renderSourcesTab(individual.sourcesTab);
  const notesHtml = renderNotesTab(individual.notesTab);
  const mediaHtml = renderMediaTab(individual.mediaImages);
  const albumHtml = renderAlbumTab(individual.mediaImages);
  const tabsHtml = renderTabs({ factsHtml, familiesHtml, sourcesHtml, notesHtml, mediaHtml, albumHtml });

  const sidebarHtml = renderSidebar({
    extraInformationHtml: renderExtraInformation(individual.extraInformationFacts),
    familyNavigatorHtml: renderFamilyNavigator(individual.familyNavigator),
  });

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
            <h2 class="wt-page-title mx-auto">${individual.fullNameHtml} <span class="wt-lifespan">${escapeHtml(individual.lifespan)}</span> ${escapeHtml(individual.age)}</h2>
            <div class="row">
                <div class="col-sm-8">
                    <div class="row mb-4">${photoBoxHtml}${nameGenderHtml}
                    </div>${tabsHtml}
                </div>
                <div class="col-sm-4">${sidebarHtml}
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
