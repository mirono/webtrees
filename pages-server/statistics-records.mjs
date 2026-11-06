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

// The privacy bridge between statistics.mjs/statistics-data.mjs's raw
// `{xref, gedcom}` records (and arrays of such) and the final
// privacy-aware HTML the "Individuals"/"Families"/"Other" tabs embed -
// mirrors StatisticsFormat::record() EXACTLY:
//
//   if ($record === null) return $this->missing();
//   if ($record->canShow()) return '<a href="'.e($record->url()).'">'.$record->fullName().'</a>';
//   return $record->fullName(); // "Private" when canShowName() is false too
//
// Like LifespansChartModule/TimelineChartModule (and now
// StatisticsChartModule), there is no single "root individual" here -
// every record is privacy-checked fresh, isSelfRecord compared against
// the CURRENT VIEWER's own linked individual (relPrefs.gedcomid), not
// a chart root. Individuals reuse buildChartBoxViewModel() from
// chart-box.mjs directly (same canShow/fullNameHtml/url fields
// StatisticsFormat::record() needs, thumbnail/alternate-name/lifespan
// fields simply unused here - real PHP's record() never shows those
// either). Families get their own small privacy helper below,
// mirroring index.mjs's own private resolveFamilyMember()/
// resolveShownFamily() (not exported, so duplicated here at the same
// scope every other "no root" chart module already duplicates its own
// per-record privacy at - see lifespans-chart.mjs/timeline-chart.mjs).
//
// Deliberately simplified for the family case: real Family::getAllNames()
// pairs every husband name-variant with every wife name-variant,
// grouping same-script pairs first (relevant only when a name has
// multiple romanization variants). Ported as husband's primary name +
// " + " + wife's primary name - the one real combination that matters
// for every GEDCOM without name-variant facts (this tree has none).

import { parseFacts, isDead, canShowRecord, canShowName, extractAllNameFacts, getPrimaryNameIndex, loadIndividual, loadDefaultResn } from './individual.mjs';
import { loadFamily, familyCanShowRecord } from './family.mjs';
import { buildChartBoxViewModel } from './chart-box.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const PRIVATE_NAME_HTML = '<span class="NAME" dir="auto" translate="no">Private</span>';
const MISSING_TEXT = 'This information is not available.';

/**
 * @param {import('pg').Pool} pool
 * @param {{gedcomId: number, name: string}} tree
 * @param {object} treePrivacyPrefs
 * @param {number} accessLevel
 * @param {{gedcomid: string|null, pathLength: number}} relPrefs
 * @param {{xref: string, gedcom: string}|null} record
 * @returns {Promise<string>}
 */
export async function individualRecordHtml(pool, tree, treePrivacyPrefs, accessLevel, relPrefs, record) {
  if (record === null) {
    return MISSING_TEXT;
  }

  const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, record.xref);
  const viewerBase = {
    accessLevel,
    isSelfRecord: relPrefs.gedcomid === record.xref,
    relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
  };

  const box = await buildChartBoxViewModel(
    pool,
    tree.gedcomId,
    tree.name,
    treePrivacyPrefs,
    false, // showHighlightImages - StatisticsFormat::record() never shows a thumbnail
    record,
    viewerBase,
    accessLevel,
    defaultResnInfo,
    null, // glideKey - unused since showHighlightImages is false
    null, // siteUrlConfig - unused since showHighlightImages is false
  );

  return box.canShow ? `<a href="${escapeHtml(box.url)}">${box.fullNameHtml}</a>` : box.fullNameHtml;
}

/**
 * Mirrors index.mjs's own (private) resolveFamilyMember() - computes
 * one spouse's privacy-gated display name, without the rest of the
 * chart-box model (no thumbnail/lifespan/birth-death summary - a bare
 * family record link never shows those).
 */
async function spouseNameHtml(pool, tree, treePrivacyPrefs, accessLevel, relPrefs, xref) {
  if (xref === null) {
    return { nameHtml: '… …', canShow: true };
  }

  const individual = await loadIndividual(pool, tree.gedcomId, xref);

  if (individual === null) {
    return { nameHtml: '… …', canShow: true };
  }

  const facts = parseFacts(individual.gedcom);
  const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
  const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, xref);
  const viewer = {
    accessLevel,
    isSelfRecord: relPrefs.gedcomid === xref,
    showDeadPeople: treePrivacyPrefs.showDeadPeople,
    dead,
    relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
  };
  const treeForPrivacy = {
    hideLivePeople: treePrivacyPrefs.hideLivePeople,
    defaultResn: defaultResnInfo.individualResn,
    keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
    keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
    showLivingNames: treePrivacyPrefs.showLivingNames,
  };

  const canShow = canShowRecord(treeForPrivacy, individual.gedcom, facts, viewer);
  const canShowNameOnly = canShowName(treeForPrivacy, individual.gedcom, facts, viewer);

  if (!canShowNameOnly) {
    return { nameHtml: PRIVATE_NAME_HTML, canShow };
  }

  const allNames = extractAllNameFacts(individual.gedcom, 'NAME');
  const primaryName = allNames[getPrimaryNameIndex(allNames)] ?? null;

  return { nameHtml: primaryName !== null ? primaryName.full : PRIVATE_NAME_HTML, canShow };
}

/**
 * @param {{xref: string, gedcom: string}|null} record
 * @returns {Promise<string>}
 */
export async function familyRecordHtml(pool, tree, treePrivacyPrefs, accessLevel, relPrefs, record) {
  if (record === null) {
    return MISSING_TEXT;
  }

  const family = await loadFamily(pool, tree.gedcomId, record.xref);

  if (family === null) {
    return MISSING_TEXT;
  }

  const husband = await spouseNameHtml(pool, tree, treePrivacyPrefs, accessLevel, relPrefs, family.husb);
  const wife = await spouseNameHtml(pool, tree, treePrivacyPrefs, accessLevel, relPrefs, family.wife);
  const fullNameHtml = `${husband.nameHtml} + ${wife.nameHtml}`;

  const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, family.xref);
  const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
  const familyViewer = { accessLevel, isSelfRecord: false };
  const memberCanShowResults = [husband.canShow, wife.canShow];
  const canShow = familyCanShowRecord(treeForPrivacy, family.gedcom, familyViewer, memberCanShowResults);

  return canShow ? `<a href="/tree/${escapeHtml(tree.name)}/family/${escapeHtml(family.xref)}">${fullNameHtml}</a>` : fullNameHtml;
}
