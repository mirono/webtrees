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

// Data/logic layer for /tree/{tree}/pedigree-map-{generations}/{xref}
// (PedigreeMapModule, phase 5 step 38) - plots the birthplace of every
// ancestor of one individual on a Leaflet map, one marker per Sosa-
// Stradonitz number, with polylines joining each ancestor to their
// child.
//
// Two SEPARATE access-level contexts are used, matching real PHP
// EXACTLY (this is the subtle part of this module - see
// PedigreeMapModule::getMapData()/getPedigreeMapFacts()):
//
//   - TRAVERSAL (sosaStradonitzAncestors() below): walking up via
//     Family::husband()/wife()/Individual::childFamilies() uses the
//     SHOW_PRIVATE_RELATIONSHIPS-aware bypass (-1/PRIV_HIDE when that
//     preference is on, else the viewer's own accessLevel) - same
//     pattern as every other chart's own relationship traversal (see
//     chart-box.mjs's own doc comment). A family with a private member
//     (husband/wife/child) blocks climbing further up that line
//     entirely, even if the preference is off and the two SPECIFIC
//     ancestors being connected would individually be showable.
//
//   - DISPLAY (buildPedigreeMapData() below): once the (privacy-blind
//     w.r.t. the above) ancestor set is known, `$person->canShow()`
//     with NO override decides which ancestors actually get a map
//     marker - the viewer's own plain accessLevel, regardless of
//     SHOW_PRIVATE_RELATIONSHIPS. So that preference can let you climb
//     PAST a private ancestor to reach a public one beyond them, while
//     still hiding the private ancestor's own marker - a real, if
//     unusual, asymmetry (same flavour as the Hourglass chart's own
//     documented access-control asymmetry).
//
// The place_location gazetteer fallback (real PlaceLocation::id()'s
// own DB lookup) is read-only here - unlike real PHP, which inserts a
// placeholder row for any place not yet in the table, this port never
// writes one. Confirmed live: wt_place_location is completely empty on
// the "ophir" tree, so this is a behavior-invisible simplification for
// every place this migration can actually test against (no visible
// output ever depends on that insert, only on-disk admin-table state
// nothing in this chart ever reads back).

import { parseFacts, isDead, canShowRecord, canShowName, canShowViaResnChain, factCanShow, loadIndividual, loadDefaultResn, displayDate } from './individual.mjs';
import { loadFamily, loadRelatedFamilyXrefs, childrenXrefs } from './family.mjs';
import { buildChartBoxViewModel } from './chart-box.mjs';
import { legacyNameAlgorithm } from './relationship-names.mjs';
import { readLatitude, readLongitude } from '../lib/services/gedcom-service.js';
import { GedcomDate } from '../lib/gedcom-date.js';

// Mirrors Gedcom::BIRTH_EVENTS (app/Gedcom.php:228) - also the tie-break
// order FactComparator::byType() would apply (TagComparator::FACT_ORDER
// lists BIRT before CHR before BAPM).
const BIRTH_EVENT_TAGS = ['BIRT', 'CHR', 'BAPM'];

// Mirrors the generic ElementFactory label each of these three tags
// would resolve to - English only, matching this migration's
// established no-I18N convention.
const BIRTH_EVENT_LABELS = { BIRT: 'Birth', CHR: 'Christening', BAPM: 'Baptism' };

// CSS colors for each generation - PedigreeMapModule::COUNT_CSS_COLORS.
const COUNT_CSS_COLORS = 12;

function factTag(factGedcom) {
  return /^1 (\S+)/.exec(factGedcom)?.[1] ?? '';
}

function factDate(factGedcom) {
  const match = /\n2 DATE (.+)/.exec(factGedcom);
  return match ? new GedcomDate(match[1]) : new GedcomDate('');
}

function factPlace(factGedcom) {
  const match = /\n2 PLAC (.+)/.exec(factGedcom);
  return match ? match[1] : '';
}

/**
 * Mirrors Fact::latitude()/longitude() (app/Fact.php:170-193) - a
 * fact's own explicit PLAC:MAP:LATI/LONG, if present.
 *
 * @param {string} factGedcom
 * @returns {{latitude: number|null, longitude: number|null}}
 */
function factCoordinates(factGedcom) {
  const latMatch = /\n4 LATI (.+)/.exec(factGedcom);
  const lonMatch = /\n4 LONG (.+)/.exec(factGedcom);

  return {
    latitude: latMatch ? readLatitude(latMatch[1]) : null,
    longitude: lonMatch ? readLongitude(lonMatch[1]) : null,
  };
}

/**
 * Mirrors PlaceLocation::latitude()/longitude() - a read-only lookup
 * of the place_location gazetteer by walking the place's name parts
 * from the most-specific down to the top level (see this file's own
 * top doc comment for why no row is ever inserted on a miss).
 *
 * @param {import('pg').Pool} pool
 * @param {string} placeName e.g. "Westminster, London, England"
 * @returns {Promise<{latitude: number|null, longitude: number|null}>}
 */
export async function placeLocationCoordinates(pool, placeName) {
  const parts = placeName
    .trim()
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');

  if (parts.length === 0) {
    return { latitude: null, longitude: null };
  }

  let parentId = null;

  // Walk from the TOP-level part down to the most-specific one, so
  // each step's parent_id is already known - mirrors PlaceLocation::id()'s
  // own recursive parent-first lookup.
  for (let i = parts.length - 1; i >= 0; i--) {
    const place = parts[i].slice(0, 120);
    const result =
      parentId === null
        ? await pool.query('SELECT id FROM wt_place_location WHERE place = $1 AND parent_id IS NULL', [place])
        : await pool.query('SELECT id FROM wt_place_location WHERE place = $1 AND parent_id = $2', [place, parentId]);

    if (result.rows.length === 0) {
      return { latitude: null, longitude: null };
    }

    parentId = result.rows[0].id;
  }

  const result = await pool.query('SELECT latitude, longitude FROM wt_place_location WHERE id = $1', [parentId]);
  const row = result.rows[0];

  return {
    latitude: row?.latitude !== null && row?.latitude !== undefined ? Number(row.latitude) : null,
    longitude: row?.longitude !== null && row?.longitude !== undefined ? Number(row.longitude) : null,
  };
}

/**
 * Shared viewer-context builder for an individual - matches the shape
 * every other "no root" chart in this migration already builds inline
 * (see e.g. statistics-records.mjs's own spouseNameHtml()).
 */
async function individualViewer(pool, gedcomId, treePrivacyPrefs, accessLevel, relPrefs, individual) {
  const facts = parseFacts(individual.gedcom);
  const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
  const defaultResnInfo = await loadDefaultResn(pool, gedcomId, individual.xref);

  const viewer = {
    accessLevel,
    isSelfRecord: relPrefs.gedcomid === individual.xref,
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

  return { facts, viewer, treeForPrivacy };
}

/**
 * Mirrors Family::husband()/wife()'s own canShowName() gate - returns
 * the parent individual record, or null if they're not loadable or
 * their name can't be shown at `accessLevel`.
 */
async function showableParent(pool, gedcomId, treePrivacyPrefs, accessLevel, relPrefs, xref) {
  if (xref === null) {
    return null;
  }

  const individual = await loadIndividual(pool, gedcomId, xref);

  if (individual === null) {
    return null;
  }

  const { facts, viewer, treeForPrivacy } = await individualViewer(pool, gedcomId, treePrivacyPrefs, accessLevel, relPrefs, individual);

  return canShowName(treeForPrivacy, individual.gedcom, facts, viewer) ? individual : null;
}

/**
 * Mirrors Individual::childFamilies()'s own filter
 * (`$family->canShow($access_level)`, app/Individual.php:707-723) -
 * the FIRST FAMC family (in GEDCOM/DB order) whose own canShow()
 * passes, or null. Family::canShowByType() hides a family if ANY
 * member (husband/wife/child) can't show - app/Family.php:118-131 -
 * so this checks every member, not just the two that matter for
 * climbing further.
 */
async function firstShowableParentFamily(pool, gedcomId, treePrivacyPrefs, accessLevel, relPrefs, individualXref) {
  const related = await loadRelatedFamilyXrefs(pool, gedcomId, individualXref);

  for (const familyXref of related.parentFamilies) {
    const family = await loadFamily(pool, gedcomId, familyXref);

    if (family === null) {
      continue;
    }

    const memberXrefs = [family.husb, family.wife, ...childrenXrefs(parseFacts(family.gedcom))].filter((xref) => xref !== null);

    let allMembersShow = true;

    for (const memberXref of memberXrefs) {
      const member = await loadIndividual(pool, gedcomId, memberXref);

      if (member === null) {
        continue;
      }

      const { facts, viewer, treeForPrivacy } = await individualViewer(pool, gedcomId, treePrivacyPrefs, accessLevel, relPrefs, member);

      if (!canShowRecord(treeForPrivacy, member.gedcom, facts, viewer)) {
        allMembersShow = false;
        break;
      }
    }

    if (!allMembersShow) {
      continue;
    }

    const defaultResnInfo = await loadDefaultResn(pool, gedcomId, family.xref);
    const familyTreeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const familyViewer = { accessLevel, isSelfRecord: false };

    if (canShowViaResnChain(familyTreeForPrivacy, family.gedcom, familyViewer, () => true)) {
      return family;
    }
  }

  return null;
}

/**
 * Mirrors ChartService::sosaStradonitzAncestors() (app/Services/ChartService.php:39-70)
 * EXACTLY - a breadth-first walk up via Sosa-Stradonitz numbering
 * (1=root, 2=father, 3=mother, 4=father's father, ...), privacy-gated
 * only by the TRAVERSAL rules described in this file's own top doc
 * comment (not the DISPLAY rules - those apply later).
 *
 * @returns {Promise<Map<number, {xref: string, gedcom: string}>>}
 */
export async function sosaStradonitzAncestors(pool, gedcomId, treePrivacyPrefs, traversalAccessLevel, relPrefs, rootXref, generations) {
  const root = await loadIndividual(pool, gedcomId, rootXref);
  const ancestors = new Map();

  if (root === null) {
    return ancestors;
  }

  ancestors.set(1, root);

  const queue = [1];
  const max = 2 ** (generations - 1);

  while (queue.length > 0) {
    const sosa = queue.shift();

    if (sosa >= max) {
      break;
    }

    const individual = ancestors.get(sosa);
    const family = await firstShowableParentFamily(pool, gedcomId, treePrivacyPrefs, traversalAccessLevel, relPrefs, individual.xref);

    if (family === null) {
      continue;
    }

    const husband = await showableParent(pool, gedcomId, treePrivacyPrefs, traversalAccessLevel, relPrefs, family.husb);

    if (husband !== null) {
      ancestors.set(sosa * 2, husband);
      queue.push(sosa * 2);
    }

    const wife = await showableParent(pool, gedcomId, treePrivacyPrefs, traversalAccessLevel, relPrefs, family.wife);

    if (wife !== null) {
      ancestors.set(sosa * 2 + 1, wife);
      queue.push(sosa * 2 + 1);
    }
  }

  return ancestors;
}

/**
 * Mirrors PedigreeMapModule::getSosaName() (app/Module/PedigreeMapModule.php:287-306)
 * EXACTLY - builds the 'fat'/'mot' path code from a Sosa number, then
 * runs it through the same legacy relationship-naming algorithm the
 * Relationships chart uses (phase 5 step 36), capitalizing the result.
 *
 * @param {number} sosa
 * @returns {string}
 */
export function getSosaName(sosa) {
  let path = '';

  while (sosa > 1) {
    path = (sosa % 2 === 1 ? 'mot' : 'fat') + path;
    sosa = Math.trunc(sosa / 2);
  }

  const name = legacyNameAlgorithm(path, null, null, null);

  return name.length > 0 ? name[0].toUpperCase() + name.slice(1) : name;
}

/**
 * Mirrors PedigreeMapModule::getPedigreeMapFacts() (app/Module/PedigreeMapModule.php:263-285) -
 * for every ancestor the (privacy-blind) traversal reached, if that
 * ancestor's plain-accessLevel canShow() passes, finds their first
 * BIRT/CHR/BAPM-type fact (by date, tie-broken by that type order -
 * see this file's own BIRTH_EVENT_TAGS doc comment) that has a
 * non-empty place.
 *
 * @returns {Promise<Map<number, {xref: string, gedcom: string, fact: string}>>}
 */
export async function getPedigreeMapFacts(pool, gedcomId, treePrivacyPrefs, accessLevel, relPrefs, ancestors) {
  const facts = new Map();

  for (const [sosa, person] of ancestors) {
    const { facts: personFacts, viewer, treeForPrivacy } = await individualViewer(pool, gedcomId, treePrivacyPrefs, accessLevel, relPrefs, person);

    if (!canShowRecord(treeForPrivacy, person.gedcom, personFacts, viewer)) {
      continue;
    }

    const defaultResnInfo = await loadDefaultResn(pool, gedcomId, person.xref);

    // Mirrors $person->facts(BIRTH_EVENTS, true)->first(place !== '') -
    // group by type (BIRT, then CHR, then BAPM), within each type by
    // date ascending (undated facts keep their GEDCOM declaration
    // order, same stable-sort behavior FactComparator::byDate()'s own
    // "preserve original order" fallback produces) - see this file's
    // own BIRTH_EVENT_TAGS doc comment.
    const candidateFacts = [];

    for (const tag of BIRTH_EVENT_TAGS) {
      const resolvedDefaultResn = defaultResnInfo.factResn.get(tag) ?? defaultResnInfo.treeFactResn.get(tag) ?? null;
      const matching = personFacts.filter((fact) => factTag(fact) === tag && factCanShow(fact, accessLevel, resolvedDefaultResn));

      matching.sort((a, b) => {
        const dateA = factDate(a);
        const dateB = factDate(b);

        if (dateA.isOK() && dateB.isOK()) {
          return GedcomDate.compare(dateA, dateB);
        }

        return 0;
      });

      candidateFacts.push(...matching);
    }

    const birthFact = candidateFacts.find((fact) => factPlace(fact) !== '');

    if (birthFact !== undefined) {
      facts.set(sosa, { xref: person.xref, gedcom: person.gedcom, fact: birthFact });
    }
  }

  return facts;
}

/**
 * Mirrors PedigreeMapModule::getMapData() (app/Module/PedigreeMapModule.php:188-257) -
 * builds the GeoJSON FeatureCollection the client-side Leaflet map
 * (resources/js/statistics.js's sibling, resources/views/modules/pedigree-map/chart.phtml,
 * already shipped unmodified) renders directly.
 *
 * @param {import('pg').Pool} pool
 * @param {{gedcomId: number, name: string}} tree
 * @param {object} treePrivacyPrefs
 * @param {boolean} showHighlightImages
 * @param {number} accessLevel plain viewer accessLevel - see this file's own top doc comment
 * @param {{gedcomid: string|null, pathLength: number}} relPrefs
 * @param {string|null} glideKey
 * @param {{baseUrl: string, rewriteUrls: boolean}|null} siteUrlConfig
 * @param {Map<number, {xref: string, gedcom: string}>} ancestors
 * @returns {Promise<object>} GeoJSON FeatureCollection
 */
export async function buildPedigreeMapData(pool, tree, treePrivacyPrefs, showHighlightImages, accessLevel, relPrefs, glideKey, siteUrlConfig, ancestors) {
  const facts = await getPedigreeMapFacts(pool, tree.gedcomId, treePrivacyPrefs, accessLevel, relPrefs, ancestors);

  const geojson = { type: 'FeatureCollection', features: [] };
  const sosaPoints = new Map();

  for (const [sosa, { gedcom, fact }] of facts) {
    const place = factPlace(fact);
    let { latitude, longitude } = factCoordinates(fact);

    if (latitude === null || longitude === null) {
      const located = await placeLocationCoordinates(pool, place);
      latitude = located.latitude;
      longitude = located.longitude;
    }

    if (latitude === null || longitude === null) {
      continue;
    }

    sosaPoints.set(sosa, [latitude, longitude]);

    const sosaChild = Math.trunc(sosa / 2);
    const generation = Math.trunc(Math.log2(sosa));
    const color = `var(--wt-pedigree-map-gen-${generation % COUNT_CSS_COLORS})`;
    const cssClass = `wt-pedigree-map-gen-${generation % COUNT_CSS_COLORS}`;

    let polyline = null;

    if (sosaPoints.has(sosaChild)) {
      polyline = { points: [sosaPoints.get(sosaChild), [latitude, longitude]], options: { color } };
    }

    const individual = { xref: facts.get(sosa).xref, gedcom };
    const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, individual.xref);
    const viewerBase = {
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === individual.xref,
      relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
    };
    const box = await buildChartBoxViewModel(
      pool,
      tree.gedcomId,
      tree.name,
      treePrivacyPrefs,
      showHighlightImages,
      individual,
      viewerBase,
      accessLevel,
      defaultResnInfo,
      glideKey,
      siteUrlConfig,
    );

    const dateText = factDate(fact).isOK() ? displayDate(factDate(fact)) : '';
    const label = BIRTH_EVENT_LABELS[factTag(fact)] ?? 'Birth';
    const dateLine = dateText !== '' ? `${label}: ${dateText}` : `${label}:`;

    geojson.features.push({
      type: 'Feature',
      id: sosa,
      geometry: { type: 'Point', coordinates: [longitude, latitude] },
      properties: {
        polyline,
        iconcolor: color,
        tooltip: null,
        summary: renderEventSummary({ cssClass, box, relationship: getSosaName(sosa), sosa, dateLine, place }),
      },
    });
  }

  return geojson;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Mirrors resources/views/modules/pedigree-map/events.phtml - the
 * marker popup / sidebar entry for one ancestor. Deliberately omits
 * the real template's thumbnail-image column fallback (the "40x50
 * crop" image itself comes from `box.thumbnailUrl`, same as every
 * other already-ported chart box) and the place's `fullName(true)`
 * link - the real link target (the Place-hierarchy page) requires a
 * non-empty place_location gazetteer, which is confirmed empty on this
 * migration's own "ophir" tree, so the real template's own fallback
 * (plain `<bdi>` text, no link) is what every reachable case produces
 * anyway.
 *
 * @param {{cssClass: string, box: object, relationship: string, sosa: number, dateLine: string, place: string}} params
 * @returns {string}
 */
function renderEventSummary({ cssClass, box, relationship, sosa, dateLine, place }) {
  const thumbnailHtml = box.thumbnailUrl !== null ? `<img src="${escapeHtml(box.thumbnailUrl)}" class="wt-pedigree-map-thumbnail" alt="">` : '';
  const nameHtml = box.canShow ? `<a href="${escapeHtml(box.url)}">${box.fullNameHtml}</a>` : box.fullNameHtml;

  return `<div class="d-flex justify-content-between">
    <div>
        <div>
            <a href="#" data-wt-sosa="${sosa}">
                <span class="${cssClass}"><span class="wt-icon-location"><i class="fa-solid fa-map-marker-alt"></i></span></span>
                ${escapeHtml(relationship)}
            </a>
        </div>

        <div>
            ${nameHtml}
        </div>

        <div>
            ${escapeHtml(dateLine)}
        </div>

        <div>
            <bdi>${escapeHtml(place)}</bdi>
        </div>
    </div>
    <div class="d-none d-lg-block">
        ${thumbnailHtml}
    </div>
</div>`;
}
