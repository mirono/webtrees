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

// View layer for the TENTH chart route, /module/statistics_chart/{action}/{tree}
// (StatisticsChartModule, phase 5 step 37) - a tree-wide chart with no
// `{xref}` of its own (unlike every earlier chart), four tabs
// (Individuals/Families/Other/Custom) loaded by AJAX into one tabbed
// shell. Mirrors resources/views/modules/statistics-chart/page.phtml
// and the SIX block templates each tab embeds, splicing in the already
// privacy-resolved/formatted HTML this module's caller (index.mjs,
// via statistics.mjs's 88 tag functions + statistics-records.mjs's
// privacy bridge) computed - this file does no DB access and makes no
// privacy decisions of its own, same role as every other *-chart-view.mjs.
//
// All chart-data tags (chartSex, statsAge, chartDistribution, ...)
// render as a `<canvas data-wt-chart-type="...">` element read by the
// SAME client-side resources/js/statistics.js (Chart.js + a geo-chart
// renderer) real PHP already ships - that script needs no changes for
// this port, so renderChartCanvas() below only has to reproduce the
// `data-wt-chart-data`/`data-wt-chart-options` JSON shape, not any
// chart-drawing logic itself.

import { createHash } from 'node:crypto';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

let idCounter = 0;

function nextChartId() {
  idCounter += 1;
  return `wt-stats-chart-${idCounter}`;
}

const MISSING_TEXT = 'This information is not available.';

/**
 * Mirrors resources/views/statistics/other/charts/{pie,column,combo,geo}.phtml -
 * all four are the SAME `<canvas data-wt-chart-type="...">` shape,
 * differing only in the `type` attribute and (for pie/geo) a couple of
 * extra `chartOptions` fields the caller already baked in.
 *
 * @param {'pie'|'column'|'combo'|'geo'} chartType
 * @param {{hasData: boolean, labels?: string[], datasets?: object[], features?: object[], chartOptions?: object, chartTitle?: string}} chart
 */
function renderChartCanvas(chartType, chart) {
  if (!chart.hasData) {
    return MISSING_TEXT;
  }

  const id = nextChartId();
  const data = chartType === 'geo' ? { features: chart.features } : { labels: chart.labels, datasets: chart.datasets };
  const options = chart.chartOptions ?? {};

  return `<div class="wt-chart-container" style="height: 20rem;">
    <canvas id="${id}"
            title="${escapeHtml(chart.chartTitle ?? '')}"
            data-wt-chart-type="${chartType}"
            data-wt-chart-data="${escapeHtml(JSON.stringify(data))}"
            data-wt-chart-options="${escapeHtml(JSON.stringify(options))}"
    ></canvas>
</div>`;
}

/**
 * Mirrors resources/views/statistics/other/charts/custom.phtml wrapping
 * column.phtml - the "Custom" tab's own built chart, titled with a
 * card header (the plain column.phtml used everywhere else has no
 * title bar of its own - the tag-driven tabs put the title in their
 * surrounding `<h4>` instead).
 */
function renderCustomChartCard(chart) {
  if (!chart.hasData) {
    return MISSING_TEXT;
  }

  return `<div class="d-grid mb-3">
    <div class="card">
        <div class="card-header">${escapeHtml(chart.chartTitle ?? '')}</div>
        <div class="card-body">${renderChartCanvas('column', { ...chart, chartTitle: '' })}</div>
    </div>
</div>`;
}

/** Mirrors resources/views/statistics/other/top10-list.phtml (place+count rows). */
function renderPlacesList(records) {
  if (records.length === 0) {
    return `<div class="card-body">${MISSING_TEXT}</div>`;
  }

  const items = records
    .map(
      (r) =>
        `<li class="list-group-item d-flex justify-content-between align-items-center">${escapeHtml(r.place)}<span class="badge bg-secondary rounded-pill ms-3">${escapeHtml(String(r.count))}</span></li>`,
    )
    .join('');

  return `<ul class="list-group list-group-flush">${items}</ul>`;
}

/** Mirrors resources/views/statistics/individuals/top10-list.phtml (person+age rows, already privacy-formatted HTML). */
function renderPersonAgeList(records) {
  if (records.length === 0) {
    return `<div class="card-body">${MISSING_TEXT}</div>`;
  }

  const items = records
    .map(
      (r) =>
        `<li class="list-group-item d-flex justify-content-between align-items-center">${r.personHtml}<span class="badge bg-secondary rounded-pill ms-3">${escapeHtml(r.age)}</span></li>`,
    )
    .join('');

  return `<ul class="list-group list-group-flush">${items}</ul>`;
}

/** Mirrors resources/views/statistics/families/top10-nolist.phtml (family+count rows). */
function renderFamilyCountList(records, countLabel) {
  if (records.length === 0) {
    return `<div class="card-body">${MISSING_TEXT}</div>`;
  }

  const items = records
    .map(
      (r) =>
        `<li class="list-group-item d-flex justify-content-between align-items-center">${r.familyHtml}<span class="badge bg-secondary rounded-pill ms-3">${escapeHtml(String(r[countLabel]))}</span></li>`,
    )
    .join('');

  return `<ul class="list-group list-group-flush">${items}</ul>`;
}

/** Mirrors resources/views/statistics/families/top10-list-age.phtml (two children + age-gap rows). */
function renderSiblingAgeList(records) {
  if (records.length === 0) {
    return `<div class="card-body">${MISSING_TEXT}</div>`;
  }

  const items = records
    .map(
      (r) =>
        `<li class="list-group-item d-flex justify-content-between align-items-center">${r.child2Html} and ${r.child1Html}<span class="badge bg-secondary rounded-pill ms-3">${escapeHtml(r.ageDiff)}</span></li>`,
    )
    .join('');

  return `<ul class="list-group list-group-flush">${items}</ul>`;
}

/** Mirrors resources/views/statistics/families/top10-list-spouses.phtml (husband + wife + age-gap rows). */
function renderSpouseAgeList(records) {
  if (records.length === 0) {
    return `<div class="card-body">${MISSING_TEXT}</div>`;
  }

  const items = records
    .map(
      (r) =>
        `<li class="list-group-item d-flex justify-content-between align-items-center">${r.husbandHtml} and ${r.wifeHtml}<span class="badge bg-secondary rounded-pill ms-3">${escapeHtml(r.ageDiff)}</span></li>`,
    )
    .join('');

  return `<ul class="list-group list-group-flush">${items}</ul>`;
}

/**
 * Mirrors modules/statistics-chart/total-individuals.phtml.
 * @param {{totalIndividuals:string, totalSexMales:string, totalSexFemales:string, chartSex:object, totalLiving:string, totalDeceased:string, chartMortality:object}} tags
 */
export function renderTotalIndividualsBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Total individuals<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalIndividuals)}</span></h4>
<div class="row mb-3 row-cols-1 row-cols-lg-2 g-3">
    <div class="col"><div class="d-grid gap-3">
        <div class="row row-cols-1 row-cols-md-2 row-cols-lg-1 g-3">
            <div class="col"><div class="card"><h5 class="card-header border-bottom-0">Total males<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalSexMales)}</span></h5></div></div>
            <div class="col"><div class="card"><h5 class="card-header border-bottom-0">Total females<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalSexFemales)}</span></h5></div></div>
        </div>
        <div class="card"><div class="card-body">${renderChartCanvas('pie', tags.chartSex)}</div></div>
    </div></div>
    <div class="col"><div class="d-grid gap-3">
        <div class="row row-cols-1 row-cols-md-2 row-cols-lg-1 g-3">
            <div class="col"><div class="card"><h5 class="card-header border-bottom-0">Total living<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalLiving)}</span></h5></div></div>
            <div class="col"><div class="card"><h5 class="card-header border-bottom-0">Total dead<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalDeceased)}</span></h5></div></div>
        </div>
        <div class="card"><div class="card-body">${renderChartCanvas('pie', tags.chartMortality)}</div></div>
    </div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/individual-events.phtml. */
export function renderIndividualEventsBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Events</h4>
<div class="row mb-3 row-cols-1 row-cols-lg-2 g-3">
    <div class="col"><div class="d-grid gap-3">
        <div class="card"><h5 class="card-header border-bottom-0">Total births<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalBirths)}</span></h5></div>
        <div class="card"><h5 class="card-header">Births by century</h5><div class="card-body">${renderChartCanvas('pie', tags.statsBirth)}</div></div>
        <div class="row row-cols-1 row-cols-md-2 row-cols-lg-1 g-3">
            <div class="col"><div class="card"><h5 class="card-header">Earliest birth</h5><div class="card-body">${tags.firstBirthHtml}</div></div></div>
            <div class="col"><div class="card"><h5 class="card-header">Latest birth</h5><div class="card-body">${tags.lastBirthHtml}</div></div></div>
        </div>
    </div></div>
    <div class="col"><div class="d-grid gap-3">
        <div class="card"><h5 class="card-header border-bottom-0">Total deaths<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalDeaths)}</span></h5></div>
        <div class="card"><h5 class="card-header">Deaths by century</h5><div class="card-body">${renderChartCanvas('pie', tags.statsDeath)}</div></div>
        <div class="row row-cols-1 row-cols-md-2 row-cols-lg-1 g-3">
            <div class="col"><div class="card"><h5 class="card-header">Earliest death</h5><div class="card-body">${tags.firstDeathHtml}</div></div></div>
            <div class="col"><div class="card"><h5 class="card-header">Latest death</h5><div class="card-body">${tags.lastDeathHtml}</div></div></div>
        </div>
    </div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/lifespan.phtml. */
export function renderLifespanBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Lifespan</h4>
<div class="row mb-3"><div class="d-grid gap-3">
    <div class="card"><h5 class="card-header border-bottom-0">Average age at death<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.averageLifespan)}</span></h5></div>
    <div class="row row-cols-1 row-cols-md-2 g-3">
        <div class="col"><div class="card"><h5 class="card-header border-bottom-0">Males<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.averageLifespanMale)}</span></h5></div></div>
        <div class="col"><div class="card"><h5 class="card-header border-bottom-0">Females<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.averageLifespanFemale)}</span></h5></div></div>
    </div>
    <div class="card m-0"><div class="card-body">${renderChartCanvas('combo', tags.statsAge)}</div></div>
</div></div>`;
}

/** Mirrors modules/statistics-chart/greatest-age.phtml (male/female top-10-oldest-at-death). */
export function renderGreatestAgeBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Greatest age at death</h4>
<div class="row row-cols-1 row-cols-md-2 mb-3 g-3">
    <div class="col"><div class="card"><h5 class="card-header">Males</h5>${renderPersonAgeList(tags.topTenOldestMaleList)}</div></div>
    <div class="col"><div class="card"><h5 class="card-header">Females</h5>${renderPersonAgeList(tags.topTenOldestFemaleList)}</div></div>
</div>`;
}

/**
 * Mirrors modules/statistics-chart/oldest-living.phtml. `topTenOldestMaleListAlive`/
 * `topTenOldestFemaleListAlive` may be the string
 * "This information is private and cannot be shown." instead of a list
 * (real PHP's own `!Auth::isMember($tree)` gate) - render whichever it is.
 */
export function renderOldestLivingBlock(tags) {
  const maleBody = typeof tags.topTenOldestMaleListAlive === 'string' ? tags.topTenOldestMaleListAlive : renderPersonAgeList(tags.topTenOldestMaleListAlive);
  const femaleBody =
    typeof tags.topTenOldestFemaleListAlive === 'string' ? tags.topTenOldestFemaleListAlive : renderPersonAgeList(tags.topTenOldestFemaleListAlive);

  return `<h4 class="border-bottom p-2 mb-4">Oldest living individuals</h4>
<div class="row row-cols-1 row-cols-md-2 mb-3 g-3">
    <div class="col"><div class="card"><h5 class="card-header">Males</h5>${maleBody}</div></div>
    <div class="col"><div class="card"><h5 class="card-header">Females</h5>${femaleBody}</div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/names.phtml. */
export function renderNamesBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Names</h4>
<div class="row row-cols-1 row-cols-lg-2 mb-3 g-3">
    <div class="col"><div class="d-grid gap-3">
        <div class="card"><h5 class="card-header border-bottom-0">Total surnames<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalSurnames)}</span></h5></div>
        <div class="card"><h5 class="card-header">Top surnames</h5><div class="card-body">${renderChartCanvas('pie', tags.chartCommonSurnames)}</div></div>
    </div></div>
    <div class="col"><div class="d-grid gap-3">
        <div class="card"><h5 class="card-header border-bottom-0">Total given names<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalGivennames)}</span></h5></div>
        <div class="card"><h5 class="card-header">Top given names</h5><div class="card-body">${renderChartCanvas('pie', tags.chartCommonGiven)}</div></div>
    </div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/individuals.phtml - the "Individuals" tab. */
export function renderIndividualsTab(tags) {
  return `<div class="container pt-3">
${renderTotalIndividualsBlock(tags)}
${renderIndividualEventsBlock(tags)}
${renderLifespanBlock(tags)}
${renderGreatestAgeBlock(tags)}
${renderOldestLivingBlock(tags)}
${renderNamesBlock(tags)}
</div>`;
}

/** Mirrors modules/statistics-chart/family-totals.phtml. */
export function renderFamilyTotalsBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Total families<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalFamilies)}</span></h4>
<div class="row mb-3 row-cols-1 row-cols-lg-2 g-3">
    <div class="col"><div class="d-grid gap-3">
        <div class="card"><h5 class="card-header border-bottom-0">Total marriages<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalMarriages)}</span></h5></div>
        <div class="card"><h5 class="card-header">Marriages by century</h5><div class="card-body">${renderChartCanvas('pie', tags.statsMarr)}</div></div>
        <div class="row row-cols-1 row-cols-md-2 row-cols-lg-1 g-3">
            <div class="col"><div class="card"><h5 class="card-header">Earliest marriage</h5><div class="card-body">${tags.firstMarriageHtml}</div></div></div>
            <div class="col"><div class="card"><h5 class="card-header">Latest marriage</h5><div class="card-body">${tags.lastMarriageHtml}</div></div></div>
        </div>
    </div></div>
    <div class="col"><div class="d-grid gap-3">
        <div class="card m-0"><h5 class="card-header border-bottom-0">Total divorces<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalDivorces)}</span></h5></div>
        <div class="card m-0"><h5 class="card-header">Divorces by century</h5><div class="card-body">${renderChartCanvas('pie', tags.statsDiv)}</div></div>
        <div class="row row-cols-1 row-cols-md-2 row-cols-lg-1 g-3">
            <div class="col"><div class="card"><h5 class="card-header">Earliest divorce</h5><div class="card-body">${tags.firstDivorceHtml}</div></div></div>
            <div class="col"><div class="card"><h5 class="card-header">Latest divorce</h5><div class="card-body">${tags.lastDivorceHtml}</div></div></div>
        </div>
    </div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/marriage-length.phtml. */
export function renderMarriageLengthBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Length of marriage</h4>
<div class="row row-cols-1 row-cols-md-2 g-3 mb-3">
    <div class="col"><div class="card"><h5 class="card-header">Longest marriage — ${escapeHtml(tags.topAgeOfMarriage)}</h5><div class="card-body">${tags.topAgeOfMarriageFamilyHtml}</div></div></div>
    <div class="col"><div class="card"><h5 class="card-header">Shortest marriage — ${escapeHtml(tags.minAgeOfMarriage)}</h5><div class="card-body">${tags.minAgeOfMarriageFamilyHtml}</div></div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/marriage-age.phtml (youngest/oldest marriage age, male/female). */
export function renderMarriageAgeBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Age in year of marriage</h4>
<div class="d-grid gap-3 mb-3">
    <div class="row row-cols-1 row-cols-md-2 g-3">
        <div class="col"><div class="card"><h5 class="card-header">Youngest male — ${escapeHtml(tags.youngestMarriageMaleAge)}</h5><div class="card-body">${tags.youngestMarriageMaleHtml}</div></div></div>
        <div class="col"><div class="card"><h5 class="card-header">Youngest female — ${escapeHtml(tags.youngestMarriageFemaleAge)}</h5><div class="card-body">${tags.youngestMarriageFemaleHtml}</div></div></div>
        <div class="col"><div class="card"><h5 class="card-header">Oldest male — ${escapeHtml(tags.oldestMarriageMaleAge)}</h5><div class="card-body">${tags.oldestMarriageMaleHtml}</div></div></div>
        <div class="col"><div class="card"><h5 class="card-header">Oldest female — ${escapeHtml(tags.oldestMarriageFemaleAge)}</h5><div class="card-body">${tags.oldestMarriageFemaleHtml}</div></div></div>
    </div>
    <div class="card m-0"><div class="card-body">${renderChartCanvas('combo', tags.statsMarrAge)}</div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/birth-age.phtml (youngest/oldest parent at a child's birth). */
export function renderBirthAgeBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Age at birth of child</h4>
<div class="row row-cols-1 row-cols-md-2 g-3 mb-3">
    <div class="col"><div class="card"><h5 class="card-header">Youngest father — ${escapeHtml(tags.youngestFatherAge)}</h5><div class="card-body">${tags.youngestFatherHtml}</div></div></div>
    <div class="col"><div class="card"><h5 class="card-header">Youngest mother — ${escapeHtml(tags.youngestMotherAge)}</h5><div class="card-body">${tags.youngestMotherHtml}</div></div></div>
    <div class="col"><div class="card"><h5 class="card-header">Oldest father — ${escapeHtml(tags.oldestFatherAge)}</h5><div class="card-body">${tags.oldestFatherHtml}</div></div></div>
    <div class="col"><div class="card"><h5 class="card-header">Oldest mother — ${escapeHtml(tags.oldestMotherAge)}</h5><div class="card-body">${tags.oldestMotherHtml}</div></div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/children.phtml. */
export function renderChildrenBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Children in family</h4>
<div class="row row-cols-1 row-cols-md-2 g-3 mb-3">
    <div class="col"><div class="card"><h5 class="card-header">Average number of children per family<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.averageChildren)}</span></h5><div class="card-body">${renderChartCanvas('column', tags.statsChildren)}</div></div></div>
    <div class="col"><div class="card"><h5 class="card-header">Number of families without children<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.noChildrenFamilies)}</span></h5><div class="card-body">${renderChartCanvas('column', tags.chartNoChildrenFamilies)}</div></div></div>
    <div class="col"><div class="card"><h5 class="card-header">Largest families</h5>${renderFamilyCountList(tags.topTenLargestFamilyList, 'children')}</div></div>
    <div class="col"><div class="card"><h5 class="card-header">Largest number of grandchildren</h5>${renderFamilyCountList(tags.topTenLargestGrandFamilyList, 'grandchildren')}</div></div>
</div>`;
}

/**
 * Mirrors modules/statistics-chart/age-difference.phtml - note the real
 * labels: "Age between husband and wife" uses `ageBetweenSpousesMFList`
 * (NOT FMList) and "Age between wife and husband" uses `ageBetweenSpousesFMList` -
 * the tag names name which spouse is listed FIRST/older in the pair,
 * not which gender the surrounding card label leads with.
 */
export function renderAgeDifferenceBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Age difference</h4>
<div class="row row-cols-1 row-cols-md-2 g-3 mb-3">
    <div class="col"><div class="card"><h5 class="card-header">Age between siblings</h5>${renderSiblingAgeList(tags.topAgeBetweenSiblingsList)}</div></div>
    <div class="col"><div class="card"><h5 class="card-header">Greatest age between siblings</h5><div class="card-body">${tags.topAgeBetweenSiblingsFullNameHtml}</div></div></div>
    <div class="col"><div class="card"><h5 class="card-header">Age between husband and wife</h5>${renderSpouseAgeList(tags.ageBetweenSpousesMFList)}</div></div>
    <div class="col"><div class="card"><h5 class="card-header">Age between wife and husband</h5>${renderSpouseAgeList(tags.ageBetweenSpousesFMList)}</div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/families.phtml - the "Families" tab. */
export function renderFamiliesTab(tags) {
  return `<div class="container pt-3">
${renderFamilyTotalsBlock(tags)}
${renderMarriageLengthBlock(tags)}
${renderMarriageAgeBlock(tags)}
${renderBirthAgeBlock(tags)}
${renderChildrenBlock(tags)}
${renderAgeDifferenceBlock(tags)}
</div>`;
}

/** Mirrors modules/statistics-chart/other-records.phtml. */
export function renderOtherRecordsBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Records<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalRecords)}</span></h4>
<div class="row row-cols-1 row-cols-lg-2 g-3 mb-3">
    <div class="col"><div class="card"><h5 class="card-header border-bottom-0">Media objects<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalMedia)}</span></h5></div></div>
    <div class="col"><div class="card"><h5 class="card-header border-bottom-0">Sources<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalSources)}</span></h5></div></div>
    <div class="col"><div class="card"><h5 class="card-header border-bottom-0">Notes<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalNotes)}</span></h5></div></div>
    <div class="col"><div class="card"><h5 class="card-header border-bottom-0">Repositories<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalRepositories)}</span></h5></div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/other-events.phtml. */
export function renderOtherEventsBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Total events<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalEvents)}</span></h4>
<div class="row row-cols-1 row-cols-md-2 g-3 mb-3">
    <div class="col"><div class="card"><h5 class="card-header">First event — ${escapeHtml(tags.firstEventType)}</h5><div class="card-body">${tags.firstEventHtml}</div></div></div>
    <div class="col"><div class="card"><h5 class="card-header">Last event — ${escapeHtml(tags.lastEventType)}</h5><div class="card-body">${tags.lastEventHtml}</div></div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/chart-objects.phtml. */
export function renderChartObjectsBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Media objects</h4>
<div class="row row-cols-1 row-cols-lg-2 g-3 mb-3"><div class="col"><div class="card"><div class="card-body">${renderChartCanvas('pie', tags.chartMedia)}</div></div></div></div>`;
}

/** Mirrors modules/statistics-chart/chart-sources.phtml. */
export function renderChartSourcesBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Sources</h4>
<div class="row row-cols-1 row-cols-lg-2 g-3 mb-3">
    <div class="col"><div class="card"><h5 class="card-header">Individuals with sources<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalIndisWithSources)}</span></h5><div class="card-body">${renderChartCanvas('pie', tags.chartIndisWithSources)}</div></div></div>
    <div class="col"><div class="card"><h5 class="card-header">Families with sources<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalFamsWithSources)}</span></h5><div class="card-body">${renderChartCanvas('pie', tags.chartFamsWithSources)}</div></div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/places.phtml. */
export function renderPlacesBlock(tags) {
  return `<h4 class="border-bottom p-2 mb-4">Places<span class="badge bg-secondary rounded-pill float-end">${escapeHtml(tags.totalPlaces)}</span></h4>
<div class="row row-cols-1 row-cols-md-2 g-3 mb-3">
    <div class="col"><div class="card"><h5 class="card-header">Birth places</h5>${renderPlacesList(tags.commonBirthPlacesList)}</div></div>
    <div class="col"><div class="card"><h5 class="card-header">Death places</h5>${renderPlacesList(tags.commonDeathPlacesList)}</div></div>
    <div class="col"><div class="card"><h5 class="card-header">Marriage places</h5>${renderPlacesList(tags.commonMarriagePlacesList)}</div></div>
    <div class="col"><div class="card"><h5 class="card-header">Events in countries</h5>${renderPlacesList(tags.commonCountriesList)}</div></div>
</div>`;
}

/** Mirrors modules/statistics-chart/chart-distribution.phtml. */
export function renderChartDistributionBlock(tags) {
  return renderChartCanvas('geo', tags.chartDistribution);
}

/** Mirrors modules/statistics-chart/other.phtml - the "Other" tab. */
export function renderOtherTab(tags) {
  return `<div class="container pt-3">
${renderOtherRecordsBlock(tags)}
${renderOtherEventsBlock(tags)}
${renderChartObjectsBlock(tags)}
${renderChartSourcesBlock(tags)}
${renderPlacesBlock(tags)}
${renderChartDistributionBlock(tags)}
</div>`;
}

const X_AXIS_OPTIONS = [
  ['1', 'Individuals'],
  ['2', 'Births'],
  ['3', 'Deaths'],
  ['4', 'Marriages'],
];

/** Mirrors modules/statistics-chart/custom.phtml - the "Custom" tab's build-your-own-chart form. */
export function renderCustomTab({ tree }) {
  return `<div class="container pt-3">
    <h4 class="border-bottom p-2 mb-4">Create your own chart</h4>
    <form method="post" action="/module/statistics_chart/CustomChart/${escapeHtml(tree.name)}" id="own-stats-form" class="wt-page-options wt-page-options-statistics">
        <div class="row mb-3">
            <div class="col-sm-2 wt-page-options-label">Chart type</div>
            <div class="col-sm-4 wt-page-options-value">
                <fieldset><legend>Individual</legend>
                    <label><input type="radio" name="x-as" value="11" checked> Month of birth</label><br>
                    <label><input type="radio" name="x-as" value="12"> Month of death</label><br>
                    <label><input type="radio" name="x-as" value="14"> Month of birth of first child in a relation</label><br>
                    <label><input type="radio" name="x-as" value="18"> Average age at death</label><br>
                    <label><input type="radio" name="x-as" value="19"> Age in year of marriage</label><br>
                    <label><input type="radio" name="x-as" value="20"> Age in year of first marriage</label>
                </fieldset>
                <fieldset><legend>Family</legend>
                    <label><input type="radio" name="x-as" value="13"> Month of marriage</label><br>
                    <label><input type="radio" name="x-as" value="15"> Month of first marriage</label><br>
                    <label><input type="radio" name="x-as" value="21"> Number of children</label>
                </fieldset>
                <fieldset><legend>Map</legend>
                    ${X_AXIS_OPTIONS.map(([v, label]) => `<label><input type="radio" name="x-as" value="${v}"> ${label}</label><br>`).join('')}
                </fieldset>
            </div>
            <div class="col-sm-2 wt-page-options-label">Details</div>
            <div class="col-sm-4 wt-page-options-value">
                <fieldset><legend>Categories</legend>
                    <label><input type="radio" name="z-as" value="300"> none</label><br>
                    <label><input type="radio" name="z-as" value="301"> sex</label><br>
                    <label><input type="radio" name="z-as" value="302" checked> date periods</label>
                    <select class="form-select" name="z-axis-boundaries-periods">
                        <option value="1700,1750,1800,1850,1900,1950,2000" selected>from 1700 interval 50 years</option>
                        <option value="1800,1840,1880,1920,1950,1970,2000">from 1800 interval 40 years</option>
                        <option value="1900,1920,1940,1960,1980,1990,2000">from 1900 interval 20 years</option>
                    </select>
                </fieldset>
                <fieldset><legend>Results</legend>
                    <label><input type="radio" name="y-as" value="201" checked> numbers</label><br>
                    <label><input type="radio" name="y-as" value="202"> percentage</label>
                </fieldset>
                <div id="map_opt" style="display:none;">
                    <label for="chart_shows">Geographic area</label>
                    <select id="chart_shows" class="form-select" name="chart_shows">
                        <option value="world" selected>World</option>
                        <option value="150">Europe</option>
                        <option value="021">Northern America</option>
                        <option value="005">South America</option>
                        <option value="142">Asia</option>
                        <option value="145">Middle East</option>
                        <option value="002">Africa</option>
                    </select>
                </div>
            </div>
        </div>
        <p><button type="submit" class="btn btn-primary">show the chart</button></p>
    </form>
    <div id="custom-chart"></div>
</div>`;
}

/** Mirrors StatisticsChartModule::postCustomChartAction()'s HTML response. */
export function renderCustomChartResult(result) {
  if (result.kind === 'error') {
    return MISSING_TEXT;
  }
  if (result.kind === 'map') {
    return renderChartCanvas('geo', result.data);
  }
  return renderCustomChartCard(result);
}

/**
 * Mirrors modules/statistics-chart/page.phtml - the tabbed shell GET
 * /module/statistics_chart/Chart/{tree} returns, loading each tab's
 * content by AJAX (same jQuery `.load()` pattern real PHP uses - the
 * tab URLs below point at this port's own
 * /module/statistics_chart/{Individuals,Families,Other,Custom}/{tree}
 * routes, which real PHP's AJAX-tab markup already expected to be
 * plain GETs returning an HTML fragment).
 */
export function renderStatisticsChartPage({ tree, user, csrfToken, genealogyMenuHtml = '' }) {
  const csrfMetaTag = user !== null ? `\n    <meta name="csrf" content="${escapeHtml(csrfToken)}">` : '';

  const userMenuHtml =
    user !== null
      ? `
                    <li class="nav-item"><span class="nav-link">${escapeHtml(user.realName)}</span></li>
                    <li class="nav-item menu-logout"><a class="nav-link" href="#" data-wt-post-url="/logout" data-wt-reload-url="/">Sign out</a></li>`
      : `
                    <li class="nav-item"><a class="nav-link" href="/login">Sign in</a></li>`;

  const tabs = [
    ['Individuals', `/module/statistics_chart/Individuals/${encodeURIComponent(tree.name)}`],
    ['Families', `/module/statistics_chart/Families/${encodeURIComponent(tree.name)}`],
    ['Other', `/module/statistics_chart/Other/${encodeURIComponent(tree.name)}`],
    ['Custom', `/module/statistics_chart/Custom/${encodeURIComponent(tree.name)}`],
  ];

  const tabIds = tabs.map(([, url]) => `tab-${createHash('md5').update(url).digest('hex')}`);

  const navItems = tabs
    .map(
      ([label, url], i) =>
        `<li class="nav-item" role="presentation"><a class="nav-link" href="#${tabIds[i]}" data-bs-toggle="tab" data-wt-href="${escapeHtml(url)}" role="tab">${escapeHtml(label)}</a></li>`,
    )
    .join('');

  const panes = tabIds.map((id) => `<div class="tab-pane fade" role="tabpanel" id="${id}"><span class="wt-icon-spinner"><i class="fa-solid fa-spinner fa-spin fa-3x" aria-hidden="true"></i></span></div>`).join('');

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Statistics</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-statistics-chart-page">
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
                    <h2 class="wt-page-title">Statistics</h2>
                    <div class="wt-page-content wt-chart wt-statistics-chart" id="statistics-tabs">
                        <ul class="nav nav-tabs" role="tablist">${navItems}</ul>
                        <div class="tab-content">${panes}</div>
                    </div>
                </div>
            </div>
        </div>
    </main>
    <script>
        (function () {
            document.querySelectorAll('a[data-bs-toggle="tab"][data-wt-href]').forEach(function (tab) {
                tab.addEventListener('shown.bs.tab', function () {}, { once: false });
            });
            var tabEls = document.querySelectorAll('#statistics-tabs .nav-link');
            function loadTab(a) {
                var href = a.getAttribute('data-wt-href');
                if (href) {
                    fetch(href).then(function (r) { return r.text(); }).then(function (html) {
                        document.querySelector(a.getAttribute('href')).innerHTML = html;
                    });
                    a.setAttribute('data-wt-href', '');
                }
            }
            tabEls.forEach(function (a) {
                a.addEventListener('shown.bs.tab', function () { loadTab(a); });
            });
            if (window.bootstrap && tabEls.length > 0) {
                tabEls[0].click();
            }
        })();
    </script>
</body>
</html>`;
}
