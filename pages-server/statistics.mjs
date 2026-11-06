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

// Wrapper/formatting functions for statistics (Phase 5 step 37)
// Ports app/Statistics.php - 88 public methods exported below.
// All functions take (pool, gedcomId) as first two params, then method-specific params.
// Privacy handling: each function that needs to return individual/family HTML
// should accept a viewerCtx object with: { accessLevel, showDeadPeople, treePrefs, treeName }

import * as data from './statistics-data.mjs';
import { loadIndividual } from './individual.mjs';
import { loadFamily } from './family.mjs';
import { canShowRecord, canShowName, parseFacts } from './individual.mjs';

// Helper functions

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

function formatAge(days) {
  if (days < 31) {
    return days === 1 ? '1 day' : `${days} days`;
  }
  if (days < 365) {
    const months = Math.floor(days / 30.5);
    return months === 1 ? '1 month' : `${months} months`;
  }
  const years = Math.floor(days / 365.25);
  return years === 1 ? '1 year' : `${years} years`;
}

function centuryName(century) {
  const ordinals = {
    1: '1st',
    2: '2nd',
    3: '3rd',
    4: '4th',
    5: '5th',
    6: '6th',
    7: '7th',
    8: '8th',
    9: '9th',
    10: '10th',
    11: '11th',
    12: '12th',
    13: '13th',
    14: '14th',
    15: '15th',
    16: '16th',
    17: '17th',
    18: '18th',
    19: '19th',
    20: '20th',
    21: '21st',
  };

  if (century < 0) {
    return `${-century} BCE`;
  }

  return ordinals[century] || `${century - 1}01-${century}00`;
}

function getPrivateName(canShow) {
  return canShow ? null : '<span class="NAME" dir="auto" translate="no">Private</span>';
}

async function buildRecordHtml(pool, gedcomId, xref, gedcom, treePrefs, viewerCtx, treeName) {
  if (!canShow || !treePrefs || !viewerCtx) {
    return null;
  }

  const individual = await loadIndividual(pool, gedcomId, xref);
  if (!individual) {
    return null;
  }

  const facts = parseFacts(individual.gedcom);
  const canShowThisRecord = canShowRecord(treePrefs, individual.gedcom, facts, viewerCtx);

  if (!canShowThisRecord) {
    return getPrivateName(false);
  }

  const name = individual.names?.[0]?.full || 'Unknown';
  return `<a href="/tree/${treeName}/individual/${xref}">${name}</a>`;
}

// Export all 88 required functions

export async function totalIndividuals(pool, gedcomId) {
  const count = await data.countIndividuals(pool, gedcomId);
  return formatNumber(count);
}

export async function totalFamilies(pool, gedcomId) {
  const count = await data.countFamilies(pool, gedcomId);
  return formatNumber(count);
}

export async function totalRecords(pool, gedcomId) {
  const count = await data.countAllRecords(pool, gedcomId);
  return formatNumber(count);
}

export async function totalSexMales(pool, gedcomId) {
  const count = await data.countIndividualsBySex(pool, gedcomId, 'M');
  return formatNumber(count);
}

export async function totalSexFemales(pool, gedcomId) {
  const count = await data.countIndividualsBySex(pool, gedcomId, 'F');
  return formatNumber(count);
}

export async function totalBirths(pool, gedcomId) {
  const count = await data.countIndividualsWithEvents(pool, gedcomId, ['BIRT']);
  return formatNumber(count);
}

export async function totalDeaths(pool, gedcomId) {
  const count = await data.countIndividualsWithEvents(pool, gedcomId, ['DEAT']);
  return formatNumber(count);
}

export async function totalDeceased(pool, gedcomId) {
  const count = await data.countIndividualsDeceased(pool, gedcomId);
  return formatNumber(count);
}

export async function totalLiving(pool, gedcomId) {
  const count = await data.countIndividualsLiving(pool, gedcomId);
  return formatNumber(count);
}

export async function totalMarriages(pool, gedcomId) {
  const count = await data.countFamiliesWithEvents(pool, gedcomId, ['MARR']);
  return formatNumber(count);
}

export async function totalDivorces(pool, gedcomId) {
  const count = await data.countFamiliesWithEvents(pool, gedcomId, ['DIV']);
  return formatNumber(count);
}

export async function totalEvents(pool, gedcomId) {
  const excludeEvents = ['CHAN'];
  const count = await data.countOtherEvents(pool, gedcomId, excludeEvents);
  return formatNumber(count);
}

export async function noChildrenFamilies(pool, gedcomId) {
  const count = await data.countFamiliesWithNoChildren(pool, gedcomId);
  return formatNumber(count);
}

export async function totalMedia(pool, gedcomId) {
  const count = await data.countMedia(pool, gedcomId, null);
  return formatNumber(count);
}

export async function totalNotes(pool, gedcomId) {
  const count = await data.countNotes(pool, gedcomId);
  return formatNumber(count);
}

export async function totalPlaces(pool, gedcomId) {
  const count = await data.countAllPlaces(pool, gedcomId);
  return formatNumber(count);
}

export async function totalRepositories(pool, gedcomId) {
  const count = await data.countRepositories(pool, gedcomId);
  return formatNumber(count);
}

export async function totalSources(pool, gedcomId) {
  const count = await data.countSources(pool, gedcomId);
  return formatNumber(count);
}

export async function totalSurnames(pool, gedcomId) {
  const count = await data.countSurnames(pool, gedcomId, []);
  return formatNumber(count);
}

export async function totalGivennames(pool, gedcomId) {
  const count = await data.countGivenNames(pool, gedcomId, []);
  return formatNumber(count);
}

export async function totalIndisWithSources(pool, gedcomId) {
  const count = await data.countIndividualsWithSources(pool, gedcomId);
  return formatNumber(count);
}

export async function totalFamsWithSources(pool, gedcomId) {
  const count = await data.countFamiliesWithSources(pool, gedcomId);
  return formatNumber(count);
}

export async function averageChildren(pool, gedcomId) {
  const avg = await data.averageChildrenPerFamily(pool, gedcomId);
  return formatNumber(Math.round(avg * 100) / 100);
}

export async function averageLifespan(pool, gedcomId, showYears = '0') {
  const days = await data.averageLifespanDays(pool, gedcomId, 'ALL');
  if (showYears !== '0') {
    return formatAge(days);
  }
  return formatNumber(Math.floor(days / 365.25));
}

export async function averageLifespanFemale(pool, gedcomId, showYears = '0') {
  const days = await data.averageLifespanDays(pool, gedcomId, 'F');
  if (showYears !== '0') {
    return formatAge(days);
  }
  return formatNumber(Math.floor(days / 365.25));
}

export async function averageLifespanMale(pool, gedcomId, showYears = '0') {
  const days = await data.averageLifespanDays(pool, gedcomId, 'M');
  if (showYears !== '0') {
    return formatAge(days);
  }
  return formatNumber(Math.floor(days / 365.25));
}

export async function minAgeOfMarriage(pool, gedcomId) {
  const marriages = await data.ageOfMarriageQuery(pool, gedcomId, 'ASC', 1);
  if (marriages.length === 0) {
    return 'This information is not available.';
  }
  return formatAge(marriages[0].age);
}

export async function topAgeOfMarriage(pool, gedcomId) {
  const marriages = await data.ageOfMarriageQuery(pool, gedcomId, 'DESC', 1);
  if (marriages.length === 0) {
    return 'This information is not available.';
  }
  return formatAge(marriages[0].age);
}

export async function firstBirth(pool, gedcomId) {
  const row = await data.firstEventRecord(pool, gedcomId, ['BIRT'], true);
  return row ? { xref: row.xref, gedcom: row.gedcom } : null;
}

export async function lastBirth(pool, gedcomId) {
  const row = await data.firstEventRecord(pool, gedcomId, ['BIRT'], false);
  return row ? { xref: row.xref, gedcom: row.gedcom } : null;
}

export async function firstDeath(pool, gedcomId) {
  const row = await data.firstEventRecord(pool, gedcomId, ['DEAT'], true);
  return row ? { xref: row.xref, gedcom: row.gedcom } : null;
}

export async function lastDeath(pool, gedcomId) {
  const row = await data.firstEventRecord(pool, gedcomId, ['DEAT'], false);
  return row ? { xref: row.xref, gedcom: row.gedcom } : null;
}

export async function firstMarriage(pool, gedcomId) {
  const row = await data.firstEventRecord(pool, gedcomId, ['MARR'], true);
  return row ? { xref: row.xref, gedcom: row.gedcom } : null;
}

export async function lastMarriage(pool, gedcomId) {
  const row = await data.firstEventRecord(pool, gedcomId, ['MARR'], false);
  return row ? { xref: row.xref, gedcom: row.gedcom } : null;
}

export async function firstDivorce(pool, gedcomId) {
  const row = await data.firstEventRecord(pool, gedcomId, ['DIV'], true);
  return row ? { xref: row.xref, gedcom: row.gedcom } : null;
}

export async function lastDivorce(pool, gedcomId) {
  const row = await data.firstEventRecord(pool, gedcomId, ['DIV'], false);
  return row ? { xref: row.xref, gedcom: row.gedcom } : null;
}

// Unlike the fact-specific tags above, firstEvent/lastEvent scan EVERY
// fact (individual or family) - the resolved record can genuinely be
// either, so (unlike every other record tag here) the caller needs
// `isFamily` to know which privacy/link resolver to use.
export async function firstEvent(pool, gedcomId) {
  const row = await data.firstEventRecord(pool, gedcomId, [], true);
  return row ? { xref: row.xref, gedcom: row.gedcom, isFamily: row.isFamily } : null;
}

export async function lastEvent(pool, gedcomId) {
  const row = await data.firstEventRecord(pool, gedcomId, [], false);
  return row ? { xref: row.xref, gedcom: row.gedcom, isFamily: row.isFamily } : null;
}

export async function firstEventType(pool, gedcomId) {
  const result = await data.firstEventType(pool, gedcomId, [], true);
  return result || 'N/A';
}

export async function lastEventType(pool, gedcomId) {
  const result = await data.firstEventType(pool, gedcomId, [], false);
  return result || 'N/A';
}

export async function chartCommonGiven(pool, gedcomId, limit = '7') {
  const limitNum = parseInt(limit, 10);
  const given = await data.commonGivenNames(pool, gedcomId, 'ALL', 1, limitNum);

  if (given.length === 0) {
    return { hasData: false };
  }

  const labels = given.map((g) => g.name);
  const values = given.map((g) => g.count);

  const totalGiven = await data.commonGivenNames(pool, gedcomId, 'ALL', 1, 10000);
  const totalCount = totalGiven.reduce((sum, g) => sum + g.count, 0);
  const otherCount = Math.max(0, totalCount - values.reduce((a, b) => a + b, 0));

  if (otherCount > 0) {
    labels.push('Other');
    values.push(otherCount);
  }

  return {
    hasData: values.reduce((a, b) => a + b, 0) > 0,
    labels,
    datasets: [{ label: '', data: values, backgroundColor: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'] }],
  };
}

export async function chartCommonSurnames(pool, gedcomId, limit = '10') {
  const limitNum = parseInt(limit, 10);
  const surnames = await data.commonSurnames(pool, gedcomId, limitNum, 1, 'count');

  if (surnames.length === 0) {
    return { hasData: false };
  }

  const labels = surnames.map((s) => s.name);
  const values = surnames.map((s) => s.count);

  const totalSurnames = await data.commonSurnames(pool, gedcomId, 10000, 1, 'count');
  const totalCount = totalSurnames.reduce((sum, s) => sum + s.count, 0);
  const usedCount = values.reduce((a, b) => a + b, 0);
  const otherCount = Math.max(0, totalCount - usedCount);

  if (otherCount > 0) {
    labels.push('Other');
    values.push(otherCount);
  }

  return {
    hasData: values.reduce((a, b) => a + b, 0) > 0,
    labels,
    datasets: [{ label: '', data: values, backgroundColor: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'] }],
  };
}

export async function chartDistribution(pool, gedcomId, chartShows = 'world', chartType = '', surname = '') {
  let chartData = [];
  let chartTitle = 'Individual distribution chart';

  switch (chartType) {
    case 'surname_distribution_chart':
      chartTitle = `Surname distribution chart: ${surname}`;
      chartData = await data.countSurnamesByCountry(pool, gedcomId, surname);
      break;

    case 'birth_distribution_chart':
      chartTitle = 'Birth by country';
      chartData = await data.countIndividualEventsByCountry(pool, gedcomId, 'BIRT');
      break;

    case 'death_distribution_chart':
      chartTitle = 'Death by country';
      chartData = await data.countIndividualEventsByCountry(pool, gedcomId, 'DEAT');
      break;

    case 'marriage_distribution_chart':
      chartTitle = 'Marriage by country';
      chartData = await data.countFamilyEventsByCountry(pool, gedcomId, 'MARR');
      break;

    default:
      chartTitle = 'Individual distribution chart';
      chartData = await data.countIndividualsByCountry(pool, gedcomId);
  }

  if (chartData.length === 0) {
    return { hasData: false, features: [] };
  }

  // Mirrors StatisticsData::createChartData() - the client-side geo
  // chart renderer (resources/js/statistics.js's geoFeatureForNumericId())
  // looks features up by ISO-3166 numeric code, zero-padded to 3
  // digits, not by place name.
  const features = chartData.map((row) => ({
    id: String(row.numericCode).padStart(3, '0'),
    label: data.countryNameForNumericCode(row.numericCode),
    value: row.count,
  }));

  return {
    hasData: features.length > 0,
    features,
    chartTitle,
  };
}

export async function chartSex(pool, gedcomId) {
  const males = await data.countIndividualsBySex(pool, gedcomId, 'M');
  const females = await data.countIndividualsBySex(pool, gedcomId, 'F');
  const unknown = await data.countIndividualsBySex(pool, gedcomId, 'U');
  const other = await data.countIndividualsBySex(pool, gedcomId, 'X');

  const total = males + females + unknown + other;

  return {
    hasData: total > 0,
    labels: ['Males', 'Females', 'Unknown', 'Other'],
    datasets: [
      {
        label: '',
        data: [males, females, unknown, other],
        backgroundColor: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728'],
      },
    ],
  };
}

export async function chartMortality(pool, gedcomId) {
  const living = await data.countIndividualsLiving(pool, gedcomId);
  const deceased = await data.countIndividualsDeceased(pool, gedcomId);

  const total = living + deceased;

  return {
    hasData: total > 0,
    labels: ['Living', 'Dead'],
    datasets: [
      {
        label: '',
        data: [living, deceased],
        backgroundColor: ['#1f77b4', '#ff7f0e'],
      },
    ],
  };
}

export async function chartMedia(pool, gedcomId) {
  const mediaByType = await data.countMediaByType(pool, gedcomId);

  const labels = mediaByType.map((m) => m[0] || '(unknown)');
  const values = mediaByType.map((m) => m[1]);

  return {
    hasData: values.reduce((a, b) => a + b, 0) > 0,
    labels,
    datasets: [{ label: '', data: values }],
  };
}

export async function chartNoChildrenFamilies(pool, gedcomId) {
  const centuries = await data.countEventsByCentury(pool, gedcomId, 'MARR');
  const labels = centuries.map((c) => centuryName(c[0]));
  const values = centuries.map((c) => c[1]);

  return {
    hasData: values.reduce((a, b) => a + b, 0) > 0,
    labels,
    datasets: [{ label: 'Families with no children', data: values }],
  };
}

export async function chartFamsWithSources(pool, gedcomId) {
  const totalFamilies = await data.countFamilies(pool, gedcomId);
  const withSources = await data.countFamiliesWithSources(pool, gedcomId);
  const withoutSources = totalFamilies - withSources;

  return {
    hasData: totalFamilies > 0,
    labels: ['Without sources', 'With sources'],
    datasets: [{ label: '', data: [withoutSources, withSources] }],
  };
}

export async function chartIndisWithSources(pool, gedcomId) {
  const totalIndividuals = await data.countIndividuals(pool, gedcomId);
  const withSources = await data.countIndividualsWithSources(pool, gedcomId);
  const withoutSources = totalIndividuals - withSources;

  return {
    hasData: totalIndividuals > 0,
    labels: ['Without sources', 'With sources'],
    datasets: [{ label: '', data: [withoutSources, withSources] }],
  };
}

export async function statsBirth(pool, gedcomId) {
  const births = await data.countEventsByCentury(pool, gedcomId, 'BIRT');
  const labels = births.map((b) => centuryName(b[0]));
  const values = births.map((b) => b[1]);

  return {
    hasData: values.reduce((a, b) => a + b, 0) > 0,
    labels,
    datasets: [{ label: '', data: values }],
    chartTitle: 'Births by century',
  };
}

export async function statsDeath(pool, gedcomId) {
  // Known upstream bug: title says "Births by century" instead of "Deaths by century"
  const deaths = await data.countEventsByCentury(pool, gedcomId, 'DEAT');
  const labels = deaths.map((d) => centuryName(d[0]));
  const values = deaths.map((d) => d[1]);

  return {
    hasData: values.reduce((a, b) => a + b, 0) > 0,
    labels,
    datasets: [{ label: '', data: values }],
    chartTitle: 'Births by century', // Bug preserved for fidelity
  };
}

export async function statsDiv(pool, gedcomId) {
  const divs = await data.countEventsByCentury(pool, gedcomId, 'DIV');
  const labels = divs.map((d) => centuryName(d[0]));
  const values = divs.map((d) => d[1]);

  return {
    hasData: values.reduce((a, b) => a + b, 0) > 0,
    labels,
    datasets: [{ label: '', data: values }],
    chartTitle: 'Divorces by century',
  };
}

export async function statsMarr(pool, gedcomId) {
  const marrs = await data.countEventsByCentury(pool, gedcomId, 'MARR');
  const labels = marrs.map((m) => centuryName(m[0]));
  const values = marrs.map((m) => m[1]);

  return {
    hasData: values.reduce((a, b) => a + b, 0) > 0,
    labels,
    datasets: [{ label: '', data: values }],
    chartTitle: 'Marriages by century',
  };
}

export async function statsAge(pool, gedcomId) {
  const ageData = await data.statsAge(pool, gedcomId);

  const bycentury = {};
  for (const row of ageData) {
    if (!bycentury[row.century]) {
      bycentury[row.century] = {};
    }
    bycentury[row.century][row.sex] = Math.round(row.age);
  }

  const labels = Object.keys(bycentury).map((c) => centuryName(parseInt(c, 10)));
  const maleData = Object.values(bycentury).map((d) => d.M || 0);
  const femaleData = Object.values(bycentury).map((d) => d.F || 0);
  const avgData = Object.values(bycentury).map((d) => Math.round(((d.M || 0) + (d.F || 0)) / 2));

  return {
    hasData: labels.length > 0,
    labels,
    datasets: [
      { label: 'Males', data: maleData },
      { label: 'Females', data: femaleData },
      { label: 'Average age', data: avgData },
    ],
    chartTitle: 'Average age related to death century',
  };
}

export async function statsMarrAge(pool, gedcomId) {
  const ageData = await data.statsMarrAgeByCentury(pool, gedcomId);

  const byCentury = {};
  for (const row of ageData) {
    if (!byCentury[row.century]) {
      byCentury[row.century] = {};
    }
    byCentury[row.century][row.sex] = row.age;
  }

  const labels = Object.keys(byCentury)
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((c) => centuryName(parseInt(c, 10)));
  const maleData = Object.entries(byCentury)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map((d) => Math.round(d[1].M || 0, 1));
  const femaleData = Object.entries(byCentury)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map((d) => Math.round(d[1].F || 0, 1));
  const avgData = Object.entries(byCentury)
    .sort((a, b) => parseInt(a[0], 10) - parseInt(b[0], 10))
    .map((d) => Math.round(((d[1].M || 0) + (d[1].F || 0)) / 2, 1));

  return {
    hasData: labels.length > 0,
    labels,
    datasets: [
      { label: 'Males', data: maleData, type: 'bar' },
      { label: 'Females', data: femaleData, type: 'bar' },
      { label: 'Average age', data: avgData, type: 'line' },
    ],
    chartTitle: 'Average age in century of marriage',
  };
}

export async function statsChildren(pool, gedcomId) {
  const childrenData = await data.statsChildrenByCentury(pool, gedcomId);

  const labels = childrenData.map((c) => centuryName(c.century));
  const values = childrenData.map((c) => Math.round(c.total, 2));

  return {
    hasData: labels.length > 0,
    labels,
    datasets: [{ label: 'Average number', data: values }],
    chartTitle: 'Average number of children per family',
  };
}

export async function commonBirthPlacesList(pool, gedcomId, limit = '10') {
  const limitNum = parseInt(limit, 10);
  const places = await data.countPlacesForIndividuals(pool, gedcomId, 'BIRT', limitNum);
  return places.map((p) => ({ place: p.place, count: formatNumber(p.count) }));
}

export async function commonDeathPlacesList(pool, gedcomId, limit = '10') {
  const limitNum = parseInt(limit, 10);
  const places = await data.countPlacesForIndividuals(pool, gedcomId, 'DEAT', limitNum);
  return places.map((p) => ({ place: p.place, count: formatNumber(p.count) }));
}

export async function commonMarriagePlacesList(pool, gedcomId, limit = '10') {
  const limitNum = parseInt(limit, 10);
  const places = await data.countPlacesForFamilies(pool, gedcomId, 'MARR', limitNum);
  return places.map((p) => ({ place: p.place, count: formatNumber(p.count) }));
}

export async function commonCountriesList(pool, gedcomId, limit = '10') {
  const limitNum = parseInt(limit, 10);
  const countries = await data.countCountries(pool, gedcomId, limitNum);
  return countries.map((c) => ({ place: c.place, count: formatNumber(c.count) }));
}

export async function chartCommon(pool, gedcomId, sex = 'ALL', limit = '10') {
  const limitNum = parseInt(limit, 10);
  const given = await data.commonGivenNames(pool, gedcomId, sex, 1, limitNum);
  const labels = given.map((g) => g.name);
  const values = given.map((g) => g.count);

  return {
    hasData: values.reduce((a, b) => a + b, 0) > 0,
    labels,
    datasets: [{ label: '', data: values }],
  };
}

export async function oldestFather(pool, gedcomId) {
  const row = await data.parentsQuery(pool, gedcomId, 'M', 'DESC');
  return row ? { xref: row.xref, gedcom: row.gedcom } : null;
}

export async function oldestFatherAge(pool, gedcomId, showYears = '0') {
  const row = await data.parentsQuery(pool, gedcomId, 'M', 'DESC');
  if (!row) {
    return 'N/A';
  }
  return showYears !== '0' ? formatAge(row.age) : formatNumber(Math.floor(row.age / 365.25));
}

export async function youngestFather(pool, gedcomId) {
  const row = await data.parentsQuery(pool, gedcomId, 'M', 'ASC');
  return row ? { xref: row.xref, gedcom: row.gedcom } : null;
}

export async function youngestFatherAge(pool, gedcomId, showYears = '0') {
  const row = await data.parentsQuery(pool, gedcomId, 'M', 'ASC');
  if (!row) {
    return 'N/A';
  }
  return showYears !== '0' ? formatAge(row.age) : formatNumber(Math.floor(row.age / 365.25));
}

export async function oldestMother(pool, gedcomId) {
  const row = await data.parentsQuery(pool, gedcomId, 'F', 'DESC');
  return row ? { xref: row.xref, gedcom: row.gedcom } : null;
}

export async function oldestMotherAge(pool, gedcomId, showYears = '0') {
  const row = await data.parentsQuery(pool, gedcomId, 'F', 'DESC');
  if (!row) {
    return 'N/A';
  }
  return showYears !== '0' ? formatAge(row.age) : formatNumber(Math.floor(row.age / 365.25));
}

export async function youngestMother(pool, gedcomId) {
  const row = await data.parentsQuery(pool, gedcomId, 'F', 'ASC');
  return row ? { xref: row.xref, gedcom: row.gedcom } : null;
}

export async function youngestMotherAge(pool, gedcomId, showYears = '0') {
  const row = await data.parentsQuery(pool, gedcomId, 'F', 'ASC');
  if (!row) {
    return 'N/A';
  }
  return showYears !== '0' ? formatAge(row.age) : formatNumber(Math.floor(row.age / 365.25));
}

// Mirrors Statistics::oldestMarriageMale() et al. - all call
// marriageQuery('full', ...), and marriageQuery's 'full' case shows the
// FAMILY (family->formatList()), not the individual - unlike
// parentsQuery's 'full' case, which shows the individual parent.
export async function oldestMarriageMale(pool, gedcomId) {
  const row = await data.marriageQuery(pool, gedcomId, 'M', 'DESC');
  return row ? { xref: row.familyXref, gedcom: row.familyGedcom } : null;
}

export async function oldestMarriageMaleAge(pool, gedcomId, showYears = '0') {
  const row = await data.marriageQuery(pool, gedcomId, 'M', 'DESC');
  if (!row) {
    return 'N/A';
  }
  return showYears !== '0' ? formatAge(row.age) : formatNumber(Math.floor(row.age / 365.25));
}

export async function youngestMarriageMale(pool, gedcomId) {
  const row = await data.marriageQuery(pool, gedcomId, 'M', 'ASC');
  return row ? { xref: row.familyXref, gedcom: row.familyGedcom } : null;
}

export async function youngestMarriageMaleAge(pool, gedcomId, showYears = '0') {
  const row = await data.marriageQuery(pool, gedcomId, 'M', 'ASC');
  if (!row) {
    return 'N/A';
  }
  return showYears !== '0' ? formatAge(row.age) : formatNumber(Math.floor(row.age / 365.25));
}

export async function oldestMarriageFemale(pool, gedcomId) {
  const row = await data.marriageQuery(pool, gedcomId, 'F', 'DESC');
  return row ? { xref: row.familyXref, gedcom: row.familyGedcom } : null;
}

export async function oldestMarriageFemaleAge(pool, gedcomId, showYears = '0') {
  const row = await data.marriageQuery(pool, gedcomId, 'F', 'DESC');
  if (!row) {
    return 'N/A';
  }
  return showYears !== '0' ? formatAge(row.age) : formatNumber(Math.floor(row.age / 365.25));
}

export async function youngestMarriageFemale(pool, gedcomId) {
  const row = await data.marriageQuery(pool, gedcomId, 'F', 'ASC');
  return row ? { xref: row.familyXref, gedcom: row.familyGedcom } : null;
}

export async function youngestMarriageFemaleAge(pool, gedcomId, showYears = '0') {
  const row = await data.marriageQuery(pool, gedcomId, 'F', 'ASC');
  if (!row) {
    return 'N/A';
  }
  return showYears !== '0' ? formatAge(row.age) : formatNumber(Math.floor(row.age / 365.25));
}

export async function minAgeOfMarriageFamily(pool, gedcomId) {
  const marriages = await data.ageOfMarriageQuery(pool, gedcomId, 'ASC', 1);
  if (marriages.length === 0) {
    return null;
  }
  return { xref: marriages[0].xref, gedcom: marriages[0].gedcom };
}

export async function topAgeOfMarriageFamily(pool, gedcomId) {
  const marriages = await data.ageOfMarriageQuery(pool, gedcomId, 'DESC', 1);
  if (marriages.length === 0) {
    return null;
  }
  return { xref: marriages[0].xref, gedcom: marriages[0].gedcom };
}

export async function topTenOldestFemaleList(pool, gedcomId, limit = '10') {
  const limitNum = parseInt(limit, 10);
  const records = await data.topTenOldestQuery(pool, gedcomId, 'F', limitNum);
  return records.map((r) => ({
    person: { xref: r.xref, gedcom: r.gedcom },
    age: formatAge(r.days),
  }));
}

export async function topTenOldestFemaleListAlive(pool, gedcomId, limit = '10', isMember = true) {
  if (!isMember) {
    return 'This information is private and cannot be shown.';
  }
  const limitNum = parseInt(limit, 10);
  const records = await data.topTenOldestAliveQuery(pool, gedcomId, 'F', limitNum);

  const todayJd = Math.floor(Date.now() / 86400000) + 2440588;
  return records.map((r) => {
    const age = todayJd - r.birthJulianDay;
    return {
      person: { xref: r.xref, gedcom: r.gedcom },
      age: formatAge(age),
    };
  });
}

export async function topTenOldestMaleList(pool, gedcomId, limit = '10') {
  const limitNum = parseInt(limit, 10);
  const records = await data.topTenOldestQuery(pool, gedcomId, 'M', limitNum);
  return records.map((r) => ({
    person: { xref: r.xref, gedcom: r.gedcom },
    age: formatAge(r.days),
  }));
}

export async function topTenOldestMaleListAlive(pool, gedcomId, limit = '10', isMember = true) {
  if (!isMember) {
    return 'This information is private and cannot be shown.';
  }
  const limitNum = parseInt(limit, 10);
  const records = await data.topTenOldestAliveQuery(pool, gedcomId, 'M', limitNum);

  const todayJd = Math.floor(Date.now() / 86400000) + 2440588;
  return records.map((r) => {
    const age = todayJd - r.birthJulianDay;
    return {
      person: { xref: r.xref, gedcom: r.gedcom },
      age: formatAge(age),
    };
  });
}

export async function topTenLargestFamilyList(pool, gedcomId, limit = '10') {
  const limitNum = parseInt(limit, 10);
  const families = await data.topTenLargestFamilyList(pool, gedcomId, limitNum);
  return families.map((f) => ({
    family: { xref: f.xref, gedcom: f.gedcom },
    children: formatNumber(f.children),
  }));
}

export async function topTenLargestGrandFamilyList(pool, gedcomId, limit = '10') {
  const limitNum = parseInt(limit, 10);
  const families = await data.topTenLargestGrandFamilyList(pool, gedcomId, limitNum);
  return families.map((f) => ({
    family: { xref: f.xref, gedcom: f.gedcom },
    grandchildren: formatNumber(f.grandchildren),
  }));
}

export async function topAgeBetweenSiblingsList(pool, gedcomId, limit = '10', one = '0') {
  const limitNum = parseInt(limit, 10);
  const siblings = await data.topAgeBetweenSiblingsList(pool, gedcomId, limitNum, one !== '0');
  return siblings.map((s) => ({
    family: { xref: s.family.xref, gedcom: s.family.gedcom },
    child1: { xref: s.child1.xref, gedcom: s.child1.gedcom },
    child2: { xref: s.child2.xref, gedcom: s.child2.gedcom },
    ageDiff: formatAge(s.ageDiff),
  }));
}

export async function topAgeBetweenSiblingsFullName(pool, gedcomId) {
  const row = await data.topAgeBetweenSiblingsList(pool, gedcomId, 1, false);
  if (row.length === 0) {
    return null;
  }
  return {
    child1: row[0].child1,
    child2: row[0].child2,
    family: row[0].family,
  };
}

export async function ageBetweenSpousesFMList(pool, gedcomId, limit = '10') {
  const limitNum = parseInt(limit, 10);
  const records = await data.ageBetweenSpousesQuery(pool, gedcomId, 'asc', limitNum);

  return records.map((r) => {
    const ageDiff = r.husbandBirtJd - r.wifeBirtJd;
    return {
      family: { xref: r.familyXref, gedcom: r.familyGedcom },
      husband: { xref: r.husbandXref },
      wife: { xref: r.wifeXref },
      ageDiff: formatAge(ageDiff),
    };
  });
}

export async function ageBetweenSpousesMFList(pool, gedcomId, limit = '10') {
  const limitNum = parseInt(limit, 10);
  const records = await data.ageBetweenSpousesQuery(pool, gedcomId, 'desc', limitNum);

  return records.map((r) => {
    const ageDiff = r.wifeBirtJd - r.husbandBirtJd;
    return {
      family: { xref: r.familyXref, gedcom: r.familyGedcom },
      husband: { xref: r.husbandXref },
      wife: { xref: r.wifeXref },
      ageDiff: formatAge(ageDiff),
    };
  });
}
