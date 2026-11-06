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

// The "Custom" tab of StatisticsChartModule (phase 5 step 37) - a
// user-built Chart.js bar chart, picking one of 13 X-axis dimensions
// (month of birth/death/marriage/first-child/first-marriage, age at
// death/marriage/first-marriage, number of children, or one of 4
// geographic "map" dimensions that just delegate to chartDistribution()
// in statistics.mjs) crossed with an optional Y-axis (numbers/percent)
// and Z-axis grouping (none/sex/date-period). Mirrors
// StatisticsChartModule::postCustomChartAction() and its private
// axisAll()/axisSexes()/axisMonths()/axisYears()/axisNumbers()/
// fillYData()/findAxisEntry()/myPlot() helpers EXACTLY.
//
// Kept as its own file (not delegated) because the X/Y/Z axis matrix
// is the one genuinely algorithmic piece of this chart - same reasoning
// as RelationshipsChartModule's graph search in relationship-chart.mjs.
// The 4 "map" X-axis cases reuse chartDistribution() from statistics.mjs
// (the SAME function the "Other" tab's #chartDistribution# tag calls);
// everything else here queries tables not needed by any #tag#, so lives
// here rather than in statistics-data.mjs.

import { chartDistribution } from './statistics.mjs';

export const X_AXIS_INDIVIDUAL_MAP = 1;
export const X_AXIS_BIRTH_MAP = 2;
export const X_AXIS_DEATH_MAP = 3;
export const X_AXIS_MARRIAGE_MAP = 4;
export const X_AXIS_BIRTH_MONTH = 11;
export const X_AXIS_DEATH_MONTH = 12;
export const X_AXIS_MARRIAGE_MONTH = 13;
export const X_AXIS_FIRST_CHILD_MONTH = 14;
export const X_AXIS_FIRST_MARRIAGE_MONTH = 15;
export const X_AXIS_AGE_AT_DEATH = 18;
export const X_AXIS_AGE_AT_MARRIAGE = 19;
export const X_AXIS_AGE_AT_FIRST_MARRIAGE = 20;
export const X_AXIS_NUMBER_OF_CHILDREN = 21;

export const Y_AXIS_NUMBERS = 201;
export const Y_AXIS_PERCENT = 202;

export const Z_AXIS_ALL = 300;
export const Z_AXIS_SEX = 301;
export const Z_AXIS_TIME = 302;

// Mirrors StatisticsChartModule::Z_AXIS_COLORS - first two are
// blue/pink, to work with Z_AXIS_SEX.
const Z_AXIS_COLORS = ['0000FF', 'FFA0CB', '9F00FF', 'FF7000', '905030', 'FF0000', '00FF00', 'F0F000'];

const DAYS_IN_YEAR = 365.25;

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const GREGORIAN_JULIAN = ['@#DGREGORIAN@', '@#DJULIAN@'];

// ---------------------------------------------------------------------
// Raw queries not needed by any #tag# (so not part of statistics-data.mjs)
// ---------------------------------------------------------------------

function countEventQuerySql(event, year1, year2) {
  const conditions = ['d_file = $1', 'd_fact = $2', 'd_type = ANY($3)'];
  const params = [event.gedcomId, event.event, GREGORIAN_JULIAN];

  if (year1 !== 0 && year2 !== 0) {
    conditions.push(`d_year BETWEEN $${params.length + 1} AND $${params.length + 2}`);
    params.push(year1, year2);
  } else {
    conditions.push('d_year <> 0');
  }

  return { conditions, params };
}

/** Mirrors StatisticsData::countEventsByMonth(). @returns {Promise<Record<string,number>>} */
export async function countEventsByMonth(pool, gedcomId, event, year1 = 0, year2 = 0) {
  const { conditions, params } = countEventQuerySql({ gedcomId, event }, year1, year2);
  const result = await pool.query(
    `SELECT TRIM(d_month) AS d_month, COUNT(*) AS total FROM wt_dates WHERE ${conditions.join(' AND ')} GROUP BY TRIM(d_month)`,
    params,
  );

  const out = {};
  for (const row of result.rows) {
    out[row.d_month] = parseInt(row.total, 10);
  }
  return out;
}

/** Mirrors StatisticsData::countEventsByMonthAndSex(). @returns {Promise<Array<{month:string,sex:string,total:number}>>} */
export async function countEventsByMonthAndSex(pool, gedcomId, event, year1 = 0, year2 = 0) {
  const { conditions, params } = countEventQuerySql({ gedcomId, event }, year1, year2);
  const result = await pool.query(
    `SELECT TRIM(d_month) AS d_month, i_sex, COUNT(*) AS total
       FROM wt_dates
       JOIN wt_individuals ON i_id = d_gid AND i_file = d_file
      WHERE ${conditions.join(' AND ')}
      GROUP BY i_sex, TRIM(d_month)`,
    params,
  );

  return result.rows.map((row) => ({ month: row.d_month, sex: row.i_sex, total: parseInt(row.total, 10) }));
}

const FIRST_CHILD_SUBQUERY = `
  SELECT l_from AS family_id, MIN(d_julianday1) AS min_birth_jd
    FROM wt_link
    JOIN wt_dates ON d_gid = l_to AND d_file = l_file AND d_julianday1 <> 0 AND TRIM(d_month) = ANY($2)
   WHERE l_file = $1 AND l_type = 'CHIL'
   GROUP BY l_from`;

/** Mirrors StatisticsData::countFirstChildrenByMonth(). @returns {Promise<Record<string,number>>} */
export async function countFirstChildrenByMonth(pool, gedcomId, year1 = 0, year2 = 0) {
  const params = [gedcomId, MONTH_NAMES];
  let yearFilter = '';
  if (year1 !== 0 && year2 !== 0) {
    yearFilter = `AND d_year BETWEEN $${params.length + 1} AND $${params.length + 2}`;
    params.push(year1, year2);
  }

  const result = await pool.query(
    `SELECT TRIM(d_month) AS d_month, COUNT(*) AS total
       FROM wt_link
       JOIN wt_dates ON d_gid = l_to AND d_file = l_file
       JOIN (${FIRST_CHILD_SUBQUERY}) subquery ON family_id = l_from AND min_birth_jd = d_julianday1
      WHERE l_file = $1 AND l_type = 'CHIL' ${yearFilter}
      GROUP BY TRIM(d_month)`,
    params,
  );

  const out = {};
  for (const row of result.rows) {
    out[row.d_month] = parseInt(row.total, 10);
  }
  return out;
}

/** Mirrors StatisticsData::countFirstChildrenByMonthAndSex(). @returns {Promise<Array<{month:string,sex:string,total:number}>>} */
export async function countFirstChildrenByMonthAndSex(pool, gedcomId, year1 = 0, year2 = 0) {
  const params = [gedcomId, MONTH_NAMES];
  let yearFilter = '';
  if (year1 !== 0 && year2 !== 0) {
    yearFilter = `AND d_year BETWEEN $${params.length + 1} AND $${params.length + 2}`;
    params.push(year1, year2);
  }

  const result = await pool.query(
    `SELECT TRIM(d_month) AS d_month, i_sex, COUNT(*) AS total
       FROM wt_link
       JOIN wt_dates ON d_gid = l_to AND d_file = l_file
       JOIN (${FIRST_CHILD_SUBQUERY}) subquery ON family_id = l_from AND min_birth_jd = d_julianday1
       JOIN wt_individuals ON i_file = l_file AND i_id = l_to
      WHERE l_file = $1 AND l_type = 'CHIL' ${yearFilter}
      GROUP BY TRIM(d_month), i_sex`,
    params,
  );

  return result.rows.map((row) => ({ month: row.d_month, sex: row.i_sex, total: parseInt(row.total, 10) }));
}

/** Mirrors StatisticsData::countFirstMarriagesByMonth(). @returns {Promise<Record<string,number>>} */
export async function countFirstMarriagesByMonth(pool, gedcomId, year1 = 0, year2 = 0) {
  const params = [gedcomId, MONTH_NAMES];
  let yearFilter = '';
  if (year1 !== 0 && year2 !== 0) {
    yearFilter = `AND d_year BETWEEN $${params.length + 1} AND $${params.length + 2}`;
    params.push(year1, year2);
  }

  const result = await pool.query(
    `SELECT f_husb AS husb, f_wife AS wife, TRIM(d_month) AS month
       FROM wt_families
       JOIN wt_dates ON d_gid = f_id AND d_file = f_file AND d_fact = 'MARR' AND TRIM(d_month) = ANY($2) AND d_julianday2 <> 0
      WHERE f_file = $1 ${yearFilter}
      ORDER BY d_julianday2`,
    params,
  );

  const months = {};
  for (const name of MONTH_NAMES) {
    months[name] = 0;
  }

  const seen = new Set();
  for (const row of result.rows) {
    if (!seen.has(row.husb) && !seen.has(row.wife)) {
      months[row.month]++;
      seen.add(row.husb);
      seen.add(row.wife);
    }
  }

  return months;
}

/**
 * Mirrors StatisticsData::statsAgeQuery() + its private birthAndDeathQuery()
 * helper. @returns {Promise<Array<{days:number}>>}
 */
export async function statsAgeQuery(pool, gedcomId, sex, year1 = 0, year2 = 0) {
  const conditions = [
    'i_file = $1',
    "birth.d_fact = 'BIRT'",
    "death.d_fact = 'DEAT'",
    'death.d_julianday1 >= birth.d_julianday2',
    'birth.d_julianday2 <> 0',
  ];
  const params = [gedcomId];

  if (sex !== 'ALL') {
    params.push(sex);
    conditions.push(`i_sex = $${params.length}`);
  }

  if (year1 !== 0 && year2 !== 0) {
    conditions.push('birth.d_type = ANY($' + (params.length + 1) + ')');
    params.push(GREGORIAN_JULIAN);
    conditions.push('death.d_type = ANY($' + (params.length + 1) + ')');
    params.push(GREGORIAN_JULIAN);
    conditions.push(`death.d_year BETWEEN $${params.length + 1} AND $${params.length + 2}`);
    params.push(year1, year2);
  }

  const result = await pool.query(
    `SELECT (death.d_julianday2 - birth.d_julianday1) AS days
       FROM wt_individuals
       JOIN wt_dates AS birth ON birth.d_file = i_file AND birth.d_gid = i_id
       JOIN wt_dates AS death ON death.d_file = i_file AND death.d_gid = i_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY days DESC`,
    params,
  );

  return result.rows.map((row) => ({ days: parseInt(row.days, 10) }));
}

/** Mirrors StatisticsData::statsChildrenQuery(). @returns {Promise<Array<{f_numchil:number,total:number}>>} */
export async function statsChildrenQuery(pool, gedcomId, year1 = 0, year2 = 0) {
  let sql;
  let params;

  if (year1 !== 0 && year2 !== 0) {
    sql = `SELECT f_numchil, COUNT(*) AS total
             FROM wt_families
             JOIN wt_dates ON d_file = f_file AND d_gid = f_id
            WHERE f_file = $1 AND d_fact = 'MARR' AND d_type = ANY($2) AND d_year BETWEEN $3 AND $4
            GROUP BY f_numchil`;
    params = [gedcomId, GREGORIAN_JULIAN, year1, year2];
  } else {
    sql = `SELECT f_numchil, COUNT(*) AS total FROM wt_families WHERE f_file = $1 GROUP BY f_numchil`;
    params = [gedcomId];
  }

  const result = await pool.query(sql, params);
  return result.rows.map((row) => ({ f_numchil: parseInt(row.f_numchil, 10), total: parseInt(row.total, 10) }));
}

/** Mirrors StatisticsData::statsMarrAgeQuery(). @returns {Promise<Array<{f_id:string,d_gid:string,age:number}>>} */
export async function statsMarrAgeQuery(pool, gedcomId, sex, year1 = 0, year2 = 0) {
  const spouseColumn = sex === 'M' ? 'f_husb' : 'f_wife';
  const params = [gedcomId];
  let yearFilter = '';

  if (year1 !== 0 && year2 !== 0) {
    yearFilter = `AND married.d_year BETWEEN $${params.length + 1} AND $${params.length + 2}`;
    params.push(year1, year2);
  }

  const result = await pool.query(
    `SELECT f_id, birth.d_gid AS d_gid, (married.d_julianday2 - birth.d_julianday1) AS age
       FROM wt_dates AS married
       JOIN wt_families ON f_file = married.d_file AND f_id = married.d_gid
       JOIN wt_dates AS birth ON birth.d_file = married.d_file AND birth.d_gid = ${spouseColumn}
            AND birth.d_julianday1 <> 0 AND birth.d_fact = 'BIRT' AND birth.d_type = ANY($${params.length + 1})
      WHERE married.d_file = $1 AND married.d_fact = 'MARR' AND married.d_type = ANY($${params.length + 1})
        AND married.d_julianday1 > birth.d_julianday1
        ${yearFilter}`,
    [...params, GREGORIAN_JULIAN],
  );

  return result.rows.map((row) => ({ f_id: row.f_id, d_gid: row.d_gid, age: parseInt(row.age, 10) }));
}

// ---------------------------------------------------------------------
// Axis builders - mirror StatisticsChartModule's private helpers exactly
// ---------------------------------------------------------------------

/** @returns {Record<string,string>} */
export function axisAll() {
  return { 0: 'Total' };
}

/** @returns {Record<string,string>} */
export function axisSexes() {
  return { M: 'Male', F: 'Female' };
}

const MONTH_LABELS = {
  JAN: 'January',
  FEB: 'February',
  MAR: 'March',
  APR: 'April',
  MAY: 'May',
  JUN: 'June',
  JUL: 'July',
  AUG: 'August',
  SEP: 'September',
  OCT: 'October',
  NOV: 'November',
  DEC: 'December',
};

/** @returns {Record<string,string>} */
export function axisMonths() {
  return { ...MONTH_LABELS };
}

/**
 * Mirrors StatisticsChartModule::axisYears() - converts N year-boundaries
 * into N+1 year-ranges, keyed by the boundary (last bucket keyed by
 * Number.MAX_SAFE_INTEGER, mirroring PHP_INT_MAX).
 * @returns {Map<number,string>}
 */
export function axisYears(boundariesCsv) {
  const boundaries = boundariesCsv.split(',').map((x) => parseInt(x, 10));
  const axis = new Map();

  boundaries.forEach((boundary, n) => {
    if (n === 0) {
      axis.set(boundary - 1, `–${boundary}`);
    } else {
      axis.set(boundary - 1, `${boundaries[n - 1]}–${boundary}`);
    }
  });

  axis.set(Number.MAX_SAFE_INTEGER, `${boundaries[boundaries.length - 1]}–`);

  return axis;
}

/**
 * Mirrors StatisticsChartModule::axisNumbers().
 * @returns {Map<number,string>}
 */
export function axisNumbers(boundariesCsv) {
  const boundaries = boundariesCsv.split(',').map((x) => parseInt(x, 10));
  const axis = new Map();

  boundaries.forEach((boundary, n) => {
    const prevBoundary = n === 0 ? 0 : boundaries[n - 1] + 1;

    if (prevBoundary === boundary) {
      axis.set(boundary, String(boundary));
    } else {
      axis.set(boundary, `${prevBoundary}–${boundary}`);
    }
  });

  axis.set(Number.MAX_SAFE_INTEGER, `${boundaries[boundaries.length - 1]}+`);

  return axis;
}

/**
 * Mirrors StatisticsChartModule::findAxisEntry() - direct lookup for
 * string keys (M/F, JAN/FEB/...), range lookup (smallest boundary >=
 * value) for numeric keys.
 */
export function findAxisEntry(value, axis) {
  const keys = axis instanceof Map ? [...axis.keys()] : Object.keys(axis).map((k) => (/^-?\d+$/.test(k) ? parseInt(k, 10) : k));
  const numericValue = typeof value === 'number' ? value : Number(value);

  if (Number.isFinite(numericValue) && String(value).trim() !== '' && !Array.isArray(value)) {
    if (keys.includes(numericValue)) {
      return numericValue;
    }

    for (const boundary of keys) {
      if (typeof boundary === 'number' && numericValue <= boundary) {
        return boundary;
      }
    }

    return numericValue;
  }

  return value;
}

/** Mirrors StatisticsChartModule::fillYData(). */
export function fillYData(x, z, value, xAxis, zAxis, ydata) {
  const xKey = findAxisEntry(x, xAxis);
  const zKey = findAxisEntry(z, zAxis);

  if (ydata[zKey] === undefined) {
    ydata[zKey] = {};
  }
  ydata[zKey][xKey] = (ydata[zKey][xKey] ?? 0) + value;
}

function axisKeys(axis) {
  return axis instanceof Map ? [...axis.keys()] : Object.keys(axis).map((k) => (/^-?\d+$/.test(k) ? parseInt(k, 10) : k));
}

function axisLabel(axis, key) {
  return axis instanceof Map ? axis.get(key) : axis[key];
}

/**
 * Mirrors StatisticsChartModule::myPlot() - builds the Chart.js "bar"
 * dataset the "Custom" tab's column chart renders, from the sparse
 * ydata accumulated by fillYData().
 */
export function myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) {
  if (Object.keys(ydata).length === 0) {
    return { hasData: false, chartTitle };
  }

  const zKeys = axisKeys(zAxis);
  const xKeys = axisKeys(xAxis);

  const colors = [];
  let colorIndex = 0;
  while (colors.length < Object.keys(ydata).length) {
    colors.push(Z_AXIS_COLORS[colorIndex]);
    colorIndex = (colorIndex + 1) % Z_AXIS_COLORS.length;
  }

  // Convert the sparse dataset into a fixed-size array, one row per z key.
  const dense = {};
  for (const z of zKeys) {
    dense[z] = {};
    for (const x of xKeys) {
      dense[z][x] = ydata[z]?.[x] ?? 0;
    }
  }

  if (yAxisType === Y_AXIS_PERCENT) {
    for (const z of Object.keys(dense)) {
      const sum = Object.values(dense[z]).reduce((a, b) => a + b, 0);
      if (sum > 0) {
        for (const x of Object.keys(dense[z])) {
          dense[z][x] = (dense[z][x] * 100.0) / sum;
        }
      }
    }
  }

  const labels = xKeys.map((x) => axisLabel(xAxis, x));
  const datasets = [];
  let colorCursor = 0;

  for (const z of Object.keys(dense)) {
    const zKeyTyped = /^-?\d+$/.test(z) ? parseInt(z, 10) : z;
    datasets.push({
      label: zKeys.includes(zKeyTyped) ? axisLabel(zAxis, zKeyTyped) : z,
      data: xKeys.map((x) => dense[z][x]),
      backgroundColor: `#${colors[colorCursor % colors.length]}`,
    });
    colorCursor++;
  }

  return {
    hasData: true,
    chartTitle,
    labels,
    datasets,
    chartOptions: {
      plugins: {
        legend: { display: zKeys.length > 1, position: 'right' },
        tooltip: { enabled: true },
      },
      scales: {
        y: { title: { display: true, text: yAxisTitle } },
        x: { title: { display: true, text: xAxisTitle } },
      },
    },
  };
}

// ---------------------------------------------------------------------
// Main dispatch - mirrors StatisticsChartModule::postCustomChartAction()
// ---------------------------------------------------------------------

/**
 * @param {import('pg').Pool} pool
 * @param {{gedcomId: number, name: string}} tree
 * @param {{
 *   xAxisType: number, yAxisType: number, zAxisType: number,
 *   zAxisBoundariesPeriods: string, xAxisBoundariesAges: string,
 *   xAxisBoundariesAgesM: string, chartShows: string, chartType: string,
 *   surname: string,
 * }} params
 * @returns {Promise<{kind: 'map'} & object | {kind: 'chart'} & ReturnType<typeof myPlot> | {kind: 'error', message: string}>}
 */
export async function buildCustomChart(pool, tree, params) {
  const { gedcomId } = tree;
  const {
    xAxisType,
    yAxisType,
    zAxisType,
    zAxisBoundariesPeriods = '',
    xAxisBoundariesAges = '',
    xAxisBoundariesAgesM = '',
    chartShows = 'world',
    chartType = '',
    surname = '',
  } = params;

  // The 4 "map" X-axis cases just delegate straight to chartDistribution() -
  // the SAME function statistics.mjs exports for the "Other" tab's
  // #chartDistribution# tag.
  if (xAxisType === X_AXIS_INDIVIDUAL_MAP) {
    return { kind: 'map', data: await chartDistribution(pool, gedcomId, chartShows, chartType, surname) };
  }
  if (xAxisType === X_AXIS_BIRTH_MAP) {
    return { kind: 'map', data: await chartDistribution(pool, gedcomId, chartShows, 'birth_distribution_chart') };
  }
  if (xAxisType === X_AXIS_DEATH_MAP) {
    return { kind: 'map', data: await chartDistribution(pool, gedcomId, chartShows, 'death_distribution_chart') };
  }
  if (xAxisType === X_AXIS_MARRIAGE_MAP) {
    return { kind: 'map', data: await chartDistribution(pool, gedcomId, chartShows, 'marriage_distribution_chart') };
  }

  let chartTitle;
  let xAxisTitle;
  let xAxis;
  let yAxisTitle;
  const ydata = {};

  const monthEvent = async (fact, title) => {
    chartTitle = title;
    xAxisTitle = 'Month';
    xAxis = axisMonths();

    if (yAxisType === Y_AXIS_NUMBERS) {
      yAxisTitle = fact === 'MARR' ? 'Families' : 'Individuals';
    } else if (yAxisType === Y_AXIS_PERCENT) {
      yAxisTitle = '%';
    } else {
      return { kind: 'error', message: 'Not Found' };
    }

    if (zAxisType === Z_AXIS_ALL) {
      const zAxis = axisAll();
      const rows = await countEventsByMonth(pool, gedcomId, fact, 0, 0);
      for (const [month, total] of Object.entries(rows)) {
        fillYData(month, 0, total, xAxis, zAxis, ydata);
      }
      return myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType);
    }

    if (zAxisType === Z_AXIS_SEX) {
      const zAxis = axisSexes();
      const rows = await countEventsByMonthAndSex(pool, gedcomId, fact, 0, 0);
      for (const row of rows) {
        fillYData(row.month, row.sex, row.total, xAxis, zAxis, ydata);
      }
      return myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType);
    }

    if (zAxisType === Z_AXIS_TIME) {
      const zAxis = axisYears(zAxisBoundariesPeriods);
      let prevBoundary = 0;
      for (const boundary of zAxis.keys()) {
        const rows = await countEventsByMonth(pool, gedcomId, fact, prevBoundary, boundary);
        for (const [month, total] of Object.entries(rows)) {
          fillYData(month, boundary, total, xAxis, zAxis, ydata);
        }
        prevBoundary = boundary + 1;
      }
      return myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType);
    }

    return { kind: 'error', message: 'Not Found' };
  };

  if (xAxisType === X_AXIS_BIRTH_MONTH) {
    const result = await monthEvent('BIRT', 'Month of birth');
    return 'kind' in result ? result : { kind: 'chart', ...result };
  }

  if (xAxisType === X_AXIS_DEATH_MONTH) {
    const result = await monthEvent('DEAT', 'Month of death');
    return 'kind' in result ? result : { kind: 'chart', ...result };
  }

  if (xAxisType === X_AXIS_MARRIAGE_MONTH) {
    chartTitle = 'Month of marriage';
    xAxisTitle = 'Month';
    xAxis = axisMonths();

    if (yAxisType === Y_AXIS_NUMBERS) {
      yAxisTitle = 'Families';
    } else if (yAxisType === Y_AXIS_PERCENT) {
      yAxisTitle = '%';
    } else {
      return { kind: 'error', message: 'Not Found' };
    }

    if (zAxisType === Z_AXIS_ALL) {
      const zAxis = axisAll();
      const rows = await countEventsByMonth(pool, gedcomId, 'MARR', 0, 0);
      for (const [month, total] of Object.entries(rows)) {
        fillYData(month, 0, total, xAxis, zAxis, ydata);
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    if (zAxisType === Z_AXIS_TIME) {
      const zAxis = axisYears(zAxisBoundariesPeriods);
      let prevBoundary = 0;
      for (const boundary of zAxis.keys()) {
        const rows = await countEventsByMonth(pool, gedcomId, 'MARR', prevBoundary, boundary);
        for (const [month, total] of Object.entries(rows)) {
          fillYData(month, boundary, total, xAxis, zAxis, ydata);
        }
        prevBoundary = boundary + 1;
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    return { kind: 'error', message: 'Not Found' };
  }

  if (xAxisType === X_AXIS_FIRST_CHILD_MONTH) {
    chartTitle = 'Month of birth of first child in a relation';
    xAxisTitle = 'Month';
    xAxis = axisMonths();

    if (yAxisType === Y_AXIS_NUMBERS) {
      yAxisTitle = 'Children';
    } else if (yAxisType === Y_AXIS_PERCENT) {
      yAxisTitle = '%';
    } else {
      return { kind: 'error', message: 'Not Found' };
    }

    if (zAxisType === Z_AXIS_ALL) {
      const zAxis = axisAll();
      const rows = await countFirstChildrenByMonth(pool, gedcomId, 0, 0);
      for (const [month, total] of Object.entries(rows)) {
        fillYData(month, 0, total, xAxis, zAxis, ydata);
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    if (zAxisType === Z_AXIS_SEX) {
      const zAxis = axisSexes();
      const rows = await countFirstChildrenByMonthAndSex(pool, gedcomId, 0, 0);
      for (const row of rows) {
        fillYData(row.month, row.sex, row.total, xAxis, zAxis, ydata);
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    if (zAxisType === Z_AXIS_TIME) {
      const zAxis = axisYears(zAxisBoundariesPeriods);
      let prevBoundary = 0;
      for (const boundary of zAxis.keys()) {
        const rows = await countFirstChildrenByMonth(pool, gedcomId, prevBoundary, boundary);
        for (const [month, total] of Object.entries(rows)) {
          fillYData(month, boundary, total, xAxis, zAxis, ydata);
        }
        prevBoundary = boundary + 1;
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    return { kind: 'error', message: 'Not Found' };
  }

  if (xAxisType === X_AXIS_FIRST_MARRIAGE_MONTH) {
    chartTitle = 'Month of first marriage';
    xAxisTitle = 'Month';
    xAxis = axisMonths();

    if (yAxisType === Y_AXIS_NUMBERS) {
      yAxisTitle = 'Families';
    } else if (yAxisType === Y_AXIS_PERCENT) {
      yAxisTitle = '%';
    } else {
      return { kind: 'error', message: 'Not Found' };
    }

    if (zAxisType === Z_AXIS_ALL) {
      const zAxis = axisAll();
      const rows = await countFirstMarriagesByMonth(pool, gedcomId, 0, 0);
      for (const [month, total] of Object.entries(rows)) {
        fillYData(month, 0, total, xAxis, zAxis, ydata);
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    if (zAxisType === Z_AXIS_TIME) {
      const zAxis = axisYears(zAxisBoundariesPeriods);
      let prevBoundary = 0;
      for (const boundary of zAxis.keys()) {
        const rows = await countFirstMarriagesByMonth(pool, gedcomId, prevBoundary, boundary);
        // Mirrors a real PHP quirk: StatisticsChartModule's Z_AXIS_TIME
        // branch for this X-axis calls fillYData($month, 0, ...) - always
        // bucket 0, not $boundary - so every time-period ends up merged
        // into a single z-row. Preserved exactly, not "fixed".
        for (const [month, total] of Object.entries(rows)) {
          fillYData(month, 0, total, xAxis, zAxis, ydata);
        }
        prevBoundary = boundary + 1;
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    return { kind: 'error', message: 'Not Found' };
  }

  if (xAxisType === X_AXIS_AGE_AT_DEATH) {
    chartTitle = 'Average age at death';
    xAxisTitle = 'age';
    xAxis = axisNumbers(xAxisBoundariesAges || '1,5,10,20,30,40,50,60,70,80,90,100');

    if (yAxisType === Y_AXIS_NUMBERS) {
      yAxisTitle = 'Individuals';
    } else if (yAxisType === Y_AXIS_PERCENT) {
      yAxisTitle = '%';
    } else {
      return { kind: 'error', message: 'Not Found' };
    }

    if (zAxisType === Z_AXIS_ALL) {
      const zAxis = axisAll();
      const rows = await statsAgeQuery(pool, gedcomId, 'ALL', 0, 0);
      for (const row of rows) {
        fillYData(Math.trunc(row.days / DAYS_IN_YEAR), 0, 1, xAxis, zAxis, ydata);
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    if (zAxisType === Z_AXIS_SEX) {
      const zAxis = axisSexes();
      for (const sex of Object.keys(zAxis)) {
        const rows = await statsAgeQuery(pool, gedcomId, sex, 0, 0);
        for (const row of rows) {
          fillYData(Math.trunc(row.days / DAYS_IN_YEAR), sex, 1, xAxis, zAxis, ydata);
        }
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    if (zAxisType === Z_AXIS_TIME) {
      const zAxis = axisYears(zAxisBoundariesPeriods);
      let prevBoundary = 0;
      for (const boundary of zAxis.keys()) {
        const rows = await statsAgeQuery(pool, gedcomId, 'ALL', prevBoundary, boundary);
        for (const row of rows) {
          fillYData(Math.trunc(row.days / DAYS_IN_YEAR), boundary, 1, xAxis, zAxis, ydata);
        }
        prevBoundary = boundary + 1;
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    return { kind: 'error', message: 'Not Found' };
  }

  if (xAxisType === X_AXIS_AGE_AT_MARRIAGE || xAxisType === X_AXIS_AGE_AT_FIRST_MARRIAGE) {
    const firstOnly = xAxisType === X_AXIS_AGE_AT_FIRST_MARRIAGE;
    chartTitle = firstOnly ? 'Age in year of first marriage' : 'Age in year of marriage';
    xAxisTitle = 'age';
    xAxis = axisNumbers(xAxisBoundariesAgesM || '16,18,20,22,24,26,28,30,32,35,40,50');

    if (yAxisType === Y_AXIS_NUMBERS) {
      yAxisTitle = 'Individuals';
    } else if (yAxisType === Y_AXIS_PERCENT) {
      yAxisTitle = '%';
    } else {
      return { kind: 'error', message: 'Not Found' };
    }

    // The stats query doesn't have an "all" function, so query M/F separately.
    if (zAxisType === Z_AXIS_ALL) {
      const zAxis = axisAll();
      for (const sex of ['M', 'F']) {
        const rows = await statsMarrAgeQuery(pool, gedcomId, sex);
        const seen = firstOnly ? new Set() : null;
        for (const row of rows) {
          if (firstOnly) {
            if (seen.has(row.d_gid)) {
              continue;
            }
            seen.add(row.d_gid);
          }
          fillYData(Math.trunc(row.age / DAYS_IN_YEAR), 0, 1, xAxis, zAxis, ydata);
        }
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    if (zAxisType === Z_AXIS_SEX) {
      const zAxis = axisSexes();
      for (const sex of Object.keys(zAxis)) {
        const rows = await statsMarrAgeQuery(pool, gedcomId, sex);
        const seen = firstOnly ? new Set() : null;
        for (const row of rows) {
          if (firstOnly) {
            if (seen.has(row.d_gid)) {
              continue;
            }
            seen.add(row.d_gid);
          }
          fillYData(Math.trunc(row.age / DAYS_IN_YEAR), sex, 1, xAxis, zAxis, ydata);
        }
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    if (zAxisType === Z_AXIS_TIME) {
      const zAxis = axisYears(zAxisBoundariesPeriods);
      for (const sex of ['M', 'F']) {
        let prevBoundary = 0;
        const seen = firstOnly ? new Set() : null;
        for (const boundary of zAxis.keys()) {
          const rows = await statsMarrAgeQuery(pool, gedcomId, sex, prevBoundary, boundary);
          for (const row of rows) {
            if (firstOnly) {
              if (seen.has(row.d_gid)) {
                continue;
              }
              seen.add(row.d_gid);
            }
            fillYData(Math.trunc(row.age / DAYS_IN_YEAR), boundary, 1, xAxis, zAxis, ydata);
          }
          prevBoundary = boundary + 1;
        }
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    return { kind: 'error', message: 'Not Found' };
  }

  if (xAxisType === X_AXIS_NUMBER_OF_CHILDREN) {
    chartTitle = 'Number of children';
    xAxisTitle = 'Children';
    xAxis = axisNumbers('0,1,2,3,4,5,6,7,8,9,10');

    if (yAxisType === Y_AXIS_NUMBERS) {
      yAxisTitle = 'Families';
    } else if (yAxisType === Y_AXIS_PERCENT) {
      yAxisTitle = '%';
    } else {
      return { kind: 'error', message: 'Not Found' };
    }

    if (zAxisType === Z_AXIS_ALL) {
      const zAxis = axisAll();
      const rows = await statsChildrenQuery(pool, gedcomId, 0, 0);
      for (const row of rows) {
        fillYData(row.f_numchil, 0, row.total, xAxis, zAxis, ydata);
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    if (zAxisType === Z_AXIS_TIME) {
      const zAxis = axisYears(zAxisBoundariesPeriods);
      let prevBoundary = 0;
      for (const boundary of zAxis.keys()) {
        const rows = await statsChildrenQuery(pool, gedcomId, prevBoundary, boundary);
        for (const row of rows) {
          fillYData(row.f_numchil, boundary, row.total, xAxis, zAxis, ydata);
        }
        prevBoundary = boundary + 1;
      }
      return { kind: 'chart', ...myPlot(chartTitle, xAxis, xAxisTitle, ydata, yAxisTitle, zAxis, yAxisType) };
    }

    return { kind: 'error', message: 'Not Found' };
  }

  return { kind: 'error', message: 'Not Found' };
}
