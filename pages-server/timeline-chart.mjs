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

// Data/logic layer for /tree/{tree}/timeline-{scale} (TimelineChartModule,
// phase 5 step 35) - the EIGHTH chart route, and (like Lifespans) a
// free-form ACCUMULATED set of individuals rather than one root with
// generations - but here every DATED fact of every selected individual
// (not just birth/death), plus every dated fact of each of their own
// spouse families, gets plotted on one shared vertical timeline with a
// collision-avoidance placement algorithm.
//
// Scope cut, confirmed reasonable on its own (not asked, unlike
// Lifespans' place/date search): real PHP's chart.phtml ships two
// drag-to-explore mouse interactions - a draggable "age cursor" per
// individual, and draggable repositioning of any fact's own box. Both
// are pure visual-exploration aids that change nothing about what data
// is shown (unlike every other chart's own client-side JS so far -
// Hourglass's lazy-load arrow, Fan's popup menu - each of which was
// load-bearing for the chart to show its own data at all). Not
// ported - see docs/php-to-js-migration/phase5-timeline-chart.md.

import { GedcomDate } from '../lib/gedcom-date.js';
import { GregorianCalendar } from '../lib/ext-calendar/gregorian.js';
import { parseFacts, factCanShow, factPlainValue, loadDefaultResn } from './individual.mjs';
import { loadRelatedFamilyXrefs } from './family.mjs';

const GREGORIAN_CALENDAR = new GregorianCalendar();

// Mirrors TimelineChartModule::NON_FACTS (app/Module/TimelineChartModule.php:58-65).
const NON_FACTS = new Set(['FAM:CHAN', 'INDI:BAPL', 'INDI:CHAN', 'INDI:ENDL', 'INDI:SLGC', 'INDI:SLGS', 'INDI:_TODO']);

function factTag(fact) {
  return /^1 (\S+)/.exec(fact)?.[1] ?? '';
}

function extractDatedEvent(fact, recordType, defaultResnInfo, accessLevel) {
  const tag = factTag(fact);

  if (tag === '' || NON_FACTS.has(`${recordType}:${tag}`)) {
    return null;
  }

  const resolvedDefaultResn = defaultResnInfo.factResn.get(tag) ?? defaultResnInfo.treeFactResn.get(tag) ?? null;

  if (!factCanShow(fact, accessLevel, resolvedDefaultResn)) {
    return null;
  }

  const dateMatch = /\n2 DATE (.+)/.exec(fact);

  if (!dateMatch) {
    return null;
  }

  const gedcomDate = new GedcomDate(dateMatch[1]);

  if (!gedcomDate.isOK()) {
    return null;
  }

  const placeMatch = /\n2 PLAC (.+)/.exec(fact);

  return { tag, value: factPlainValue(fact), place: placeMatch ? placeMatch[1] : '', gedcomDate };
}

/**
 * Mirrors the body of `TimelineChartModule::chart()`'s own per-
 * individual loop (app/Module/TimelineChartModule.php:214-245): every
 * dated, showable fact of this ONE individual, plus every dated,
 * showable fact of each of their own spouse families (via
 * `resolveShownFamily()`, reused unchanged from the Individual page's
 * own Facts-tab family-merge). `isDeadIndividual` drives the "topyear
 * is at least the current year, for anyone still alive" bump real PHP
 * applies once per qualifying dated event found while processing THIS
 * individual (not a fixed per-individual flag) - replicated exactly
 * by returning `topYearBump` only when at least one event was found.
 *
 * @param {import('pg').Pool} pool
 * @param {object} ctx
 * @param {{xref: string, gedcom: string}} individual
 * @param {boolean} isDeadIndividual
 * @param {(familyXref: string) => Promise<object|null>} resolveShownFamily
 * @returns {Promise<{events: Array<object>, topYearBump: boolean}>}
 */
export async function collectIndividualTimelineEvents(pool, ctx, individual, isDeadIndividual, resolveShownFamily) {
  const events = [];
  let topYearBump = false;

  const facts = parseFacts(individual.gedcom);
  const defaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, individual.xref);

  for (const fact of facts) {
    const event = extractDatedEvent(fact, 'INDI', defaultResnInfo, ctx.accessLevel);

    if (event === null) {
      continue;
    }

    events.push({
      key: `INDI:${individual.xref}:${event.tag}:${fact}`,
      recordType: 'individual',
      ownerXref: individual.xref,
      ...event,
    });
    topYearBump = topYearBump || !isDeadIndividual;
  }

  const related = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, individual.xref);

  for (const familyXref of related.spouseFamilies) {
    const shown = await resolveShownFamily(familyXref);

    if (shown === null) {
      continue;
    }

    for (const fact of shown.facts) {
      const event = extractDatedEvent(fact, 'FAM', shown.defaultResnInfo, ctx.accessLevel);

      if (event === null) {
        continue;
      }

      events.push({
        key: `FAM:${shown.family.xref}:${event.tag}:${fact}`,
        recordType: 'family',
        ownerXref: shown.family.xref,
        husbandXref: shown.husband?.individual.xref ?? null,
        wifeXref: shown.wife?.individual.xref ?? null,
        spouses: [shown.husband, shown.wife].filter((member) => member !== null),
        ...event,
      });
      topYearBump = topYearBump || !isDeadIndividual;
    }
  }

  return { events, topYearBump };
}

/**
 * Mirrors `chart.phtml`'s own per-event placement loop
 * (resources/views/modules/timeline-chart/chart.phtml:~270-300)
 * EXACTLY: each event's natural Y position comes from its Gregorian
 * year/month/day (`GregorianCalendar.jdToYmd()`, same calendar-
 * independent-via-Julian-day approach real PHP's own
 * `new GregorianDate($date->minimumJulianDay())` uses); if that
 * "slot" (one `bheight`-tall row) is already taken, the box bounces
 * alternately further down then further up (`i`/`j` stepping) until
 * it finds a free slot - clustered events fan out from their natural
 * position instead of stacking exactly on top of each other.
 *
 * @param {Array<object>} events already sorted by date (FactComparator::byDate - this port's own date-only subset, no type tie-break - see the module doc comment)
 * @param {number} baseyear
 * @param {number} scale
 * @param {number} bheight
 * @returns {Array<object>} each event plus {year, xoffset, yoffset, tyoffset}
 */
export function layoutTimelineEvents(events, baseyear, scale, bheight) {
  const placements = new Map();
  const placed = [];

  for (const event of events) {
    const [year, rawMonth, rawDay] = GREGORIAN_CALENDAR.jdToYmd(event.gedcomDate.minimumJulianDay());
    const month = Math.max(1, rawMonth);
    const day = Math.max(1, rawDay);

    let yoffset = (year - baseyear) * scale - scale;
    yoffset += (month / 12) * scale;
    yoffset += (day / 30) * (scale / 12);
    yoffset = Math.trunc(yoffset);

    let place = Math.trunc(yoffset / bheight);
    let i = 1;
    let j = 0;
    let tyoffset = 0;

    while (placements.has(place)) {
      if (i === j) {
        tyoffset = bheight * i;
        i++;
      } else {
        tyoffset = -1 * bheight * j;
        j++;
      }

      place = Math.trunc((yoffset + tyoffset) / bheight);
    }

    yoffset += tyoffset;
    const xoffset = 22 + Math.abs(tyoffset);
    placements.set(place, yoffset);

    placed.push({ ...event, year, xoffset, yoffset, tyoffset });
  }

  return placed;
}

/**
 * The Gregorian year a dated event falls in - same calendar-
 * independent-via-Julian-day conversion `layoutTimelineEvents()`
 * itself uses, exposed separately for the baseyear/topyear
 * min/max scan (which happens before layout, over the UNplaced
 * events).
 *
 * @param {{gedcomDate: GedcomDate}} event
 * @returns {number}
 */
export function timelineEventYear(event) {
  const [year] = GREGORIAN_CALENDAR.jdToYmd(event.gedcomDate.minimumJulianDay());

  return year;
}

/**
 * Mirrors `array_search($event->record(), $individuals, true); $col %= 8`
 * (chart.phtml): a family event's color follows the husband if the
 * husband is one of the SELECTED individuals, else the wife; an
 * individual event follows that individual - all indexed against the
 * ORIGINAL (not date-sorted) selected-xrefs order, then wrapped to 8.
 *
 * @param {string[]} selectedXrefs
 * @param {object} event
 * @returns {number} 0-7
 */
export function timelineColorIndex(selectedXrefs, event) {
  let index;

  if (event.recordType === 'family') {
    index = selectedXrefs.indexOf(event.husbandXref);

    if (index === -1) {
      index = selectedXrefs.indexOf(event.wifeXref);
    }
  } else {
    index = selectedXrefs.indexOf(event.ownerXref);
  }

  if (index === -1) {
    return 0;
  }

  return index % 8;
}

/**
 * Mirrors `TimelineChartModule::handle()`'s own zoom in/out scale
 * math (app/Module/TimelineChartModule.php:174-183).
 */
export function timelineZoomIn(scale, minScale, maxScale) {
  return Math.min(maxScale, scale + Math.trunc(scale * 0.4 + 1));
}

export function timelineZoomOut(scale, minScale, maxScale) {
  return Math.max(minScale, scale - Math.trunc(scale * 0.4 + 1));
}
