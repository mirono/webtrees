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

import { describe, expect, test, vi } from 'vitest';
import {
  axisAll,
  axisSexes,
  axisMonths,
  axisYears,
  axisNumbers,
  findAxisEntry,
  fillYData,
  myPlot,
  countEventsByMonth,
  countEventsByMonthAndSex,
  countFirstMarriagesByMonth,
  statsChildrenQuery,
  buildCustomChart,
  X_AXIS_NUMBER_OF_CHILDREN,
  X_AXIS_BIRTH_MONTH,
  X_AXIS_INDIVIDUAL_MAP,
  Y_AXIS_NUMBERS,
  Y_AXIS_PERCENT,
  Z_AXIS_ALL,
  Z_AXIS_SEX,
  Z_AXIS_TIME,
} from '../pages-server/statistics-custom-chart.mjs';

function mockPool(rows) {
  return { query: vi.fn().mockResolvedValue({ rows }) };
}

describe('axisYears', () => {
  test('builds N+1 ranges from N boundaries, last keyed by MAX_SAFE_INTEGER', () => {
    const axis = axisYears('1800,1850,1900');
    expect([...axis.entries()]).toEqual([
      [1799, '–1800'],
      [1849, '1800–1850'],
      [1899, '1850–1900'],
      [Number.MAX_SAFE_INTEGER, '1900–'],
    ]);
  });
});

describe('axisNumbers', () => {
  test('builds ranges, collapsing single-year gaps to one label', () => {
    const axis = axisNumbers('1,5,10');
    expect([...axis.entries()]).toEqual([
      [1, '0–1'],
      [5, '2–5'],
      [10, '6–10'],
      [Number.MAX_SAFE_INTEGER, '10+'],
    ]);
  });

  test('uses a plain number label when prevBoundary === boundary', () => {
    const axis = axisNumbers('0,1,2');
    expect(axis.get(0)).toBe('0');
    expect(axis.get(1)).toBe('1');
    expect(axis.get(2)).toBe('2');
  });
});

describe('findAxisEntry', () => {
  test('direct lookup for an exact numeric key', () => {
    const axis = axisNumbers('1,5,10');
    expect(findAxisEntry(5, axis)).toBe(5);
  });

  test('finds the smallest boundary >= value for an in-between numeric value', () => {
    const axis = axisNumbers('1,5,10');
    expect(findAxisEntry(3, axis)).toBe(5);
    expect(findAxisEntry(7, axis)).toBe(10);
    expect(findAxisEntry(50, axis)).toBe(Number.MAX_SAFE_INTEGER);
  });

  test('direct lookup for string keys (months, sexes)', () => {
    expect(findAxisEntry('JAN', axisMonths())).toBe('JAN');
    expect(findAxisEntry('F', axisSexes())).toBe('F');
  });
});

describe('fillYData', () => {
  test('accumulates into a sparse {z: {x: total}} structure', () => {
    const ydata = {};
    const xAxis = axisMonths();
    const zAxis = axisSexes();
    fillYData('JAN', 'M', 3, xAxis, zAxis, ydata);
    fillYData('JAN', 'M', 2, xAxis, zAxis, ydata);
    fillYData('FEB', 'F', 1, xAxis, zAxis, ydata);
    expect(ydata.M.JAN).toBe(5);
    expect(ydata.F.FEB).toBe(1);
  });
});

describe('myPlot', () => {
  test('returns hasData:false for an empty dataset', () => {
    expect(myPlot('Title', axisMonths(), 'Month', {}, 'Individuals', axisAll(), Y_AXIS_NUMBERS).hasData).toBe(false);
  });

  test('builds a dense per-z-row dataset with labels matching the x-axis order', () => {
    const xAxis = axisSexes(); // reuse as a tiny 2-key x-axis for simplicity
    const zAxis = axisAll();
    const ydata = { 0: { M: 4, F: 6 } };
    const plot = myPlot('Sex', xAxis, 'Sex', ydata, 'Individuals', zAxis, Y_AXIS_NUMBERS);
    expect(plot.hasData).toBe(true);
    expect(plot.labels).toEqual(['Male', 'Female']);
    expect(plot.datasets).toHaveLength(1);
    expect(plot.datasets[0].label).toBe('Total');
    expect(plot.datasets[0].data).toEqual([4, 6]);
  });

  test('converts to percentages per z-row when yAxisType is Y_AXIS_PERCENT', () => {
    const xAxis = axisSexes();
    const zAxis = axisAll();
    const ydata = { 0: { M: 1, F: 3 } };
    const plot = myPlot('Sex', xAxis, 'Sex', ydata, '%', zAxis, Y_AXIS_PERCENT);
    expect(plot.datasets[0].data).toEqual([25, 75]);
  });

  test('legend is only shown when there is more than one z-row', () => {
    const xAxis = axisMonths();
    const single = myPlot('T', xAxis, 'Month', { 0: { JAN: 1 } }, 'Y', axisAll(), Y_AXIS_NUMBERS);
    expect(single.chartOptions.plugins.legend.display).toBe(false);

    const multi = myPlot('T', xAxis, 'Month', { M: { JAN: 1 }, F: { JAN: 1 } }, 'Y', axisSexes(), Y_AXIS_NUMBERS);
    expect(multi.chartOptions.plugins.legend.display).toBe(true);
  });
});

describe('countEventsByMonth', () => {
  test('builds a month->total map from grouped rows', async () => {
    const pool = mockPool([
      { d_month: 'JAN', total: '3' },
      { d_month: 'MAR', total: '1' },
    ]);
    const result = await countEventsByMonth(pool, 1, 'BIRT');
    expect(result).toEqual({ JAN: 3, MAR: 1 });
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('d_year <> 0'), [1, 'BIRT', ['@#DGREGORIAN@', '@#DJULIAN@']]);
  });

  test('trims d_month in SQL (regression: wt_dates.d_month is a fixed-width CHAR(5) column, so an untrimmed SELECT returns "JAN  " and never matches the 3-letter axis keys downstream, silently zeroing every bucket)', async () => {
    const pool = mockPool([]);
    await countEventsByMonth(pool, 1, 'BIRT');
    const sql = pool.query.mock.calls[0][0];
    expect(sql).toMatch(/TRIM\(d_month\)/);
  });

  test('filters by year range when both years given', async () => {
    const pool = mockPool([]);
    await countEventsByMonth(pool, 1, 'BIRT', 1800, 1850);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('d_year BETWEEN'), [1, 'BIRT', ['@#DGREGORIAN@', '@#DJULIAN@'], 1800, 1850]);
  });
});

describe('countEventsByMonthAndSex', () => {
  test('returns one row per month/sex combination', async () => {
    const pool = mockPool([{ d_month: 'JAN', i_sex: 'M', total: '2' }]);
    const result = await countEventsByMonthAndSex(pool, 1, 'DEAT');
    expect(result).toEqual([{ month: 'JAN', sex: 'M', total: 2 }]);
  });
});

describe('countFirstMarriagesByMonth', () => {
  test('counts each family once, keyed by month, deduping repeat spouses', async () => {
    const pool = mockPool([
      { husb: 'I1', wife: 'I2', month: 'JAN' },
      { husb: 'I1', wife: 'I3', month: 'FEB' }, // I1 remarries - already seen, must not double count
      { husb: 'I4', wife: 'I5', month: 'JAN' },
    ]);
    const result = await countFirstMarriagesByMonth(pool, 1);
    expect(result.JAN).toBe(2);
    expect(result.FEB).toBe(0);
  });
});

describe('statsChildrenQuery', () => {
  test('returns f_numchil/total pairs as numbers', async () => {
    const pool = mockPool([{ f_numchil: '2', total: '5' }]);
    const result = await statsChildrenQuery(pool, 1);
    expect(result).toEqual([{ f_numchil: 2, total: 5 }]);
  });
});

describe('buildCustomChart', () => {
  test('dispatches map X-axis types to chartDistribution() via statistics.mjs', async () => {
    const pool = mockPool([]);
    const result = await buildCustomChart(pool, { gedcomId: 1, name: 'tree1' }, {
      xAxisType: X_AXIS_INDIVIDUAL_MAP,
      yAxisType: Y_AXIS_NUMBERS,
      zAxisType: Z_AXIS_ALL,
    });
    expect(result.kind).toBe('map');
  });

  test('returns an error for an unknown x-axis type', async () => {
    const pool = mockPool([]);
    const result = await buildCustomChart(pool, { gedcomId: 1, name: 'tree1' }, {
      xAxisType: 999,
      yAxisType: Y_AXIS_NUMBERS,
      zAxisType: Z_AXIS_ALL,
    });
    expect(result.kind).toBe('error');
  });

  test('returns an error for an unrecognised y-axis type', async () => {
    const pool = mockPool([]);
    const result = await buildCustomChart(pool, { gedcomId: 1, name: 'tree1' }, {
      xAxisType: X_AXIS_BIRTH_MONTH,
      yAxisType: 999,
      zAxisType: Z_AXIS_ALL,
    });
    expect(result.kind).toBe('error');
  });

  test('builds a month-of-birth chart grouped by sex', async () => {
    const pool = mockPool([
      { d_month: 'JAN', i_sex: 'M', total: '2' },
      { d_month: 'FEB', i_sex: 'F', total: '1' },
    ]);
    const result = await buildCustomChart(pool, { gedcomId: 1, name: 'tree1' }, {
      xAxisType: X_AXIS_BIRTH_MONTH,
      yAxisType: Y_AXIS_NUMBERS,
      zAxisType: Z_AXIS_SEX,
    });
    expect(result.kind).toBe('chart');
    expect(result.hasData).toBe(true);
    expect(result.datasets.find((d) => d.label === 'Male').data[0]).toBe(2);
  });

  test('builds a number-of-children chart with a time z-axis', async () => {
    const pool = mockPool([{ f_numchil: '2', total: '3' }]);
    const result = await buildCustomChart(pool, { gedcomId: 1, name: 'tree1' }, {
      xAxisType: X_AXIS_NUMBER_OF_CHILDREN,
      yAxisType: Y_AXIS_NUMBERS,
      zAxisType: Z_AXIS_TIME,
      zAxisBoundariesPeriods: '1900,1950,2000',
    });
    expect(result.kind).toBe('chart');
    expect(result.hasData).toBe(true);
  });
});
