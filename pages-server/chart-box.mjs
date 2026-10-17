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

// The shared "chart box" (resources/views/chart-box.phtml) - a single
// individual's summary card, reused by EVERY chart module (Ancestors,
// Pedigree, Descendancy, Hourglass, FamilyBook, CompactTree...). Built
// once here, first for AncestorsChartModule (phase 5 step 27), so every
// later chart reuses this unchanged rather than re-deriving the same
// name/thumbnail/lifespan/birth-death-summary logic per chart.
//
// Deliberately simplified away for v1 (documented, not silently
// dropped): the box's own dropdown menus (fact zoom-in list, cross-links
// to spouse/children/family pages) and SHOW_PARENTS_AGE's extra
// parents'-age-at-birth annotation - both real, secondary UI
// conveniences on top of the box's core genealogical content (name,
// thumbnail, lifespan, birth/death), not required for a first working
// chart. CHART_BOX_TAGS (extra configurable fact tags beyond birth/
// death) also not ported - this tree's own value is '' (the default),
// so real PHP shows nothing beyond birth/death here either.

import {
  parseFacts,
  isDead,
  canShowRecord,
  extractAllNameFacts,
  getPrimaryNameIndex,
  sex,
  getBirthDate,
  getDeathDate,
  lifespan,
  displayDate,
} from './individual.mjs';
import { loadFactsMedia, firstImageFile, mediaThumbnailUrl, needsWatermark } from './media.mjs';
import { GedcomDate } from '../lib/gedcom-date.js';

/**
 * Mirrors the CHART_BOX_TAGS tree preference (app/Tree.php:51, default
 * '') - whether to show extra configurable fact tags in the box beyond
 * birth/death. This tree's own value is the default (confirmed via the
 * DB), so this is always `[]` here - not wired to a live preference
 * lookup since there would be nothing to show either way.
 */
const EXTRA_CHART_BOX_TAGS = [];

/**
 * Mirrors Tree::getPreference('SHOW_HIGHLIGHT_IMAGES') (default '1' -
 * app/Tree.php:78) and the box's own thumbnail-visibility check
 * (resources/views/chart-box.phtml: `$individual->canShow() &&
 * SHOW_HIGHLIGHT_IMAGES === '1'`).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<boolean>}
 */
export async function loadShowHighlightImagesPref(pool, gedcomId) {
  const result = await pool.query(
    "SELECT setting_value FROM wt_gedcom_setting WHERE gedcom_id = $1 AND setting_name = 'SHOW_HIGHLIGHT_IMAGES'",
    [gedcomId],
  );
  const value = result.rows[0]?.setting_value ?? '1';

  return value === '1';
}

/**
 * Mirrors Tree::getPreference('SHOW_PRIVATE_RELATIONSHIPS') (default
 * '1' - app/Tree.php:86, ALSO this tree's own real, unoverridden value,
 * confirmed live) - see buildChartBoxViewModel()'s own doc comment for
 * why this matters: when true, Family::husband()/wife()/children()
 * force Auth::PRIV_HIDE (-1) regardless of the real viewer, for chart
 * relationship traversal specifically.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<boolean>}
 */
export async function loadShowPrivateRelationshipsPref(pool, gedcomId) {
  const result = await pool.query(
    "SELECT setting_value FROM wt_gedcom_setting WHERE gedcom_id = $1 AND setting_name = 'SHOW_PRIVATE_RELATIONSHIPS'",
    [gedcomId],
  );
  const value = result.rows[0]?.setting_value ?? '1';

  return value === '1';
}

/**
 * Mirrors Fact::summary()'s simplified shape (app/Fact.php:388-420) for
 * a plain dated/placed event fact (no linked-record target, the only
 * case BIRT/DEAT facts are) - value (if not 'Y'), date, place, each
 * already-escaped/HTML as appropriate. SHOW_PARENTS_AGE's extra
 * parents'-age annotation is not ported (see this file's own doc
 * comment).
 *
 * @param {string} fact
 * @returns {string} already-safe HTML, '' if the fact has nothing to summarize
 */
function factSummaryHtml(fact) {
  const valueMatch = /^1 \S+ (.+)/.exec(fact);
  const value = valueMatch ? valueMatch[1] : '';
  const dateMatch = /\n2 DATE (.+)/.exec(fact);
  const placeMatch = /\n2 PLAC (.+)/.exec(fact);

  const parts = [];

  if (value !== '' && value !== 'Y') {
    parts.push(`<bdi>${escapeHtml(value)}</bdi>`);
  }

  if (dateMatch) {
    const gedcomDate = new GedcomDate(dateMatch[1]);

    if (gedcomDate.isOK()) {
      parts.push(displayDate(gedcomDate));
    }
  }

  if (placeMatch) {
    parts.push(escapeHtml(placeMatch[1]));
  }

  return parts.join(' — ');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Mirrors Individual::getBirthDate()'s own BIRTH_EVENTS tag order
// (app/Individual.php) - reused here only to find the SPECIFIC fact
// block (not just its date) for factSummaryHtml() above, which needs
// the fact's own VALUE line too, not just date/place.
const BIRTH_EVENT_TAGS = ['BIRT', 'CHR', 'BAPM'];
const DEATH_EVENT_TAGS = ['DEAT', 'BURI', 'CREM'];

function factTag(factGedcom) {
  const match = /^1 (\S+)/.exec(factGedcom);
  return match ? match[1] : '';
}

function firstFactSummary(facts, tagList) {
  for (const tag of tagList) {
    const fact = facts.find((f) => factTag(f) === tag);

    if (fact) {
      const summary = factSummaryHtml(fact);

      if (summary !== '') {
        return summary;
      }
    }
  }

  return '';
}

/**
 * Resolves one individual's chart-box viewmodel - name, thumbnail,
 * lifespan, birth/death fact summaries, privacy-gated the same way
 * every other individual-resolving route in this migration already
 * is. `traversalAccessLevel` is the EFFECTIVE access level for this
 * box specifically - callers walking a chart's own relationship graph
 * (husband()/wife()/children()) must pass `-1` (Auth::PRIV_HIDE, bypasses
 * everything) whenever the tree's SHOW_PRIVATE_RELATIONSHIPS preference
 * is on (default '1' - app/Tree.php:86, ALSO this tree's own real,
 * unoverridden value, confirmed live) - a real, confirmed-live
 * divergence from the viewer's own normal access level that would
 * otherwise make chart traversal MORE restrictive than real PHP, not
 * just differently simplified.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} treeName
 * @param {{hideLivePeople: boolean, keepAliveYearsBirth: number, keepAliveYearsDeath: number, maxAliveAge: number, showDeadPeople: number}} treePrivacyPrefs
 * @param {boolean} showHighlightImages
 * @param {{xref: string, gedcom: string}} individual already-loaded
 * @param {{accessLevel: number, isSelfRecord: boolean, relationshipGateBlocked: boolean}} viewerBase
 * @param {number} traversalAccessLevel see above
 * @param {{individualResn: string|null}} defaultResnInfo from loadDefaultResn()
 * @param {string|null} glideKey pre-loaded once per page (null if no
 *   non-external image file is expected to exist at all - the caller's
 *   job to decide, same convention as every other route's own glideKey
 *   lazy-load)
 * @param {{baseUrl: string, rewriteUrls: boolean}} siteUrlConfig
 * @returns {Promise<{xref: string, url: string, canShow: boolean, fullNameHtml: string, alternateNameHtml: string, sex: string, lifespanText: string, birthSummaryHtml: string, deathSummaryHtml: string, thumbnailUrl: string|null}>}
 */
export async function buildChartBoxViewModel(
  pool,
  gedcomId,
  treeName,
  treePrivacyPrefs,
  showHighlightImages,
  individual,
  viewerBase,
  traversalAccessLevel,
  defaultResnInfo,
  glideKey,
  siteUrlConfig,
) {
  const facts = parseFacts(individual.gedcom);
  const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });

  const viewer = {
    accessLevel: traversalAccessLevel,
    isSelfRecord: viewerBase.isSelfRecord,
    showDeadPeople: treePrivacyPrefs.showDeadPeople,
    dead,
    relationshipGateBlocked: viewerBase.relationshipGateBlocked,
  };
  const treeForPrivacy = {
    hideLivePeople: treePrivacyPrefs.hideLivePeople,
    defaultResn: defaultResnInfo.individualResn,
    keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
    keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
  };

  const canShow = canShowRecord(treeForPrivacy, individual.gedcom, facts, viewer);

  const allNames = extractAllNameFacts(individual.gedcom, 'NAME');
  const primaryIndex = getPrimaryNameIndex(allNames);
  const primaryName = allNames[primaryIndex] ?? null;
  // Mirrors GedcomRecord::fullName()'s own canShow() gate - a hidden
  // record's name shows as "Private" (same as every other already-ported
  // route's established fallback text), not the real name, even though
  // the box itself still renders (just without a link or thumbnail).
  const fullNameHtml = canShow && primaryName !== null ? primaryName.full : '<span class="NAME" dir="auto" translate="no">Private</span>';

  const birthDate = getBirthDate(facts);
  const deathDate = getDeathDate(facts);
  const lifespanText = lifespan({ birthDate, deathDate, isDead: dead });

  const birthSummaryHtml = firstFactSummary(facts, BIRTH_EVENT_TAGS);
  const deathSummaryHtml = firstFactSummary(facts, DEATH_EVENT_TAGS);

  let thumbnailUrl = null;

  if (canShow && showHighlightImages && glideKey !== null) {
    const images = await loadFactsMedia(pool, gedcomId, facts);
    const firstImage = images[0] ?? null;

    if (firstImage !== null) {
      const watermark = needsWatermark(viewerBase.accessLevel, treePrivacyPrefs.showNoWatermark);

      thumbnailUrl = mediaThumbnailUrl(
        {
          xref: firstImage.mediaXref,
          treeName,
          factId: firstImage.factId,
          width: 40,
          height: 50,
          fit: 'crop',
          needsWatermark: watermark,
        },
        glideKey,
        siteUrlConfig,
      );
    }
  }

  return {
    xref: individual.xref,
    url: `/tree/${treeName}/individual/${individual.xref}`,
    canShow,
    fullNameHtml,
    sex: sex(individual.gedcom),
    lifespanText,
    birthSummaryHtml,
    deathSummaryHtml,
    thumbnailUrl,
  };
}
