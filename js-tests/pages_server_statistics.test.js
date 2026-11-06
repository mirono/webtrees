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
import * as stats from '../pages-server/statistics.mjs';

const GEDCOM_ID = 1;

const createMockPool = (queryMock) => ({
  query: queryMock,
});

describe('statistics.mjs - formatting functions', () => {
  describe('totalIndividuals', () => {
    test('returns formatted count of individuals', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ count: '42' }] }));

      const result = await stats.totalIndividuals(pool, GEDCOM_ID);

      expect(result).toBe('42');
    });

    test('formats large numbers with commas', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ count: '1234' }] }));

      const result = await stats.totalIndividuals(pool, GEDCOM_ID);

      expect(result).toBe('1,234');
    });
  });

  describe('totalFamilies', () => {
    test('returns formatted count of families', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ count: '15' }] }));

      const result = await stats.totalFamilies(pool, GEDCOM_ID);

      expect(result).toBe('15');
    });
  });

  describe('totalDeceased', () => {
    test('returns formatted count of deceased', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ count: '30' }] }));

      const result = await stats.totalDeceased(pool, GEDCOM_ID);

      expect(result).toBe('30');
    });
  });

  describe('totalLiving', () => {
    test('returns formatted count of living', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ count: '12' }] }));

      const result = await stats.totalLiving(pool, GEDCOM_ID);

      expect(result).toBe('12');
    });
  });

  describe('averageChildren', () => {
    test('returns formatted average children per family', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ avg: '2.345' }] }));

      const result = await stats.averageChildren(pool, GEDCOM_ID);

      expect(result).toBe('2.35');
    });
  });

  describe('averageLifespan', () => {
    test('returns year count by default', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ days: '25568' }] }));

      const result = await stats.averageLifespan(pool, GEDCOM_ID, '0');

      expect(result).toBe('70');
    });

    test('returns formatted age string when showYears is true', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ days: '25568' }] }));

      const result = await stats.averageLifespan(pool, GEDCOM_ID, '1');

      expect(result).toMatch(/year|month|day/);
    });
  });

  describe('totalSexMales', () => {
    test('returns count of males', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ count: '20' }] }));

      const result = await stats.totalSexMales(pool, GEDCOM_ID);

      expect(result).toBe('20');
    });
  });

  describe('totalSexFemales', () => {
    test('returns count of females', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ count: '22' }] }));

      const result = await stats.totalSexFemales(pool, GEDCOM_ID);

      expect(result).toBe('22');
    });
  });

  describe('totalBirths', () => {
    test('returns count of births', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ count: '40' }] }));

      const result = await stats.totalBirths(pool, GEDCOM_ID);

      expect(result).toBe('40');
    });
  });

  describe('totalDeaths', () => {
    test('returns count of deaths', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ count: '25' }] }));

      const result = await stats.totalDeaths(pool, GEDCOM_ID);

      expect(result).toBe('25');
    });
  });

  describe('totalMarriages', () => {
    test('returns count of marriages', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ count: '35' }] }));

      const result = await stats.totalMarriages(pool, GEDCOM_ID);

      expect(result).toBe('35');
    });
  });

  describe('totalDivorces', () => {
    test('returns count of divorces', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [{ count: '5' }] }));

      const result = await stats.totalDivorces(pool, GEDCOM_ID);

      expect(result).toBe('5');
    });
  });

  describe('firstBirth', () => {
    test('returns xref of earliest birth', async () => {
      const pool = createMockPool(
        vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ xref: 'I123' }] })
          .mockResolvedValueOnce({ rows: [{ i_gedcom: '0 @I123@ INDI' }] })
      );

      const result = await stats.firstBirth(pool, GEDCOM_ID);

      expect(result).toEqual({ xref: 'I123', gedcom: '0 @I123@ INDI' });
    });

    test('returns null when no births found', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [] }));

      const result = await stats.firstBirth(pool, GEDCOM_ID);

      expect(result).toBe(null);
    });
  });

  describe('chartSex', () => {
    test('returns chart data for sex distribution', async () => {
      const pool = createMockPool(
        vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ count: '20' }] })
          .mockResolvedValueOnce({ rows: [{ count: '22' }] })
          .mockResolvedValueOnce({ rows: [{ count: '2' }] })
          .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      );

      const result = await stats.chartSex(pool, GEDCOM_ID);

      expect(result.hasData).toBe(true);
      expect(result.labels).toEqual(['Males', 'Females', 'Unknown', 'Other']);
      expect(result.datasets).toHaveLength(1);
      expect(result.datasets[0].data).toEqual([20, 22, 2, 1]);
    });

    test('returns no data when zero individuals', async () => {
      const pool = createMockPool(
        vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ count: '0' }] })
          .mockResolvedValueOnce({ rows: [{ count: '0' }] })
          .mockResolvedValueOnce({ rows: [{ count: '0' }] })
          .mockResolvedValueOnce({ rows: [{ count: '0' }] })
      );

      const result = await stats.chartSex(pool, GEDCOM_ID);

      expect(result.hasData).toBe(false);
    });
  });

  describe('chartMortality', () => {
    test('returns chart data for living/deceased', async () => {
      const pool = createMockPool(
        vi
          .fn()
          .mockResolvedValueOnce({ rows: [{ count: '15' }] })
          .mockResolvedValueOnce({ rows: [{ count: '30' }] })
      );

      const result = await stats.chartMortality(pool, GEDCOM_ID);

      expect(result.hasData).toBe(true);
      expect(result.labels).toEqual(['Living', 'Dead']);
      expect(result.datasets[0].data).toEqual([15, 30]);
    });
  });

  describe('statsBirth', () => {
    test('returns birth statistics by century', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [
            { century: 19, total: '50' },
            { century: 20, total: '80' },
          ],
        })
      );

      const result = await stats.statsBirth(pool, GEDCOM_ID);

      expect(result.hasData).toBe(true);
      expect(result.labels).toHaveLength(2);
      expect(result.datasets[0].data).toEqual([50, 80]);
      expect(result.chartTitle).toBe('Births by century');
    });
  });

  describe('statsDeath', () => {
    test('returns death statistics with known upstream bug in title', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [
            { century: 19, total: '40' },
            { century: 20, total: '70' },
          ],
        })
      );

      const result = await stats.statsDeath(pool, GEDCOM_ID);

      expect(result.hasData).toBe(true);
      expect(result.chartTitle).toBe('Births by century'); // Upstream bug preserved
    });
  });

  describe('statsDiv', () => {
    test('returns divorce statistics', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [{ century: 20, total: '10' }],
        })
      );

      const result = await stats.statsDiv(pool, GEDCOM_ID);

      expect(result.chartTitle).toBe('Divorces by century');
    });
  });

  describe('statsMarr', () => {
    test('returns marriage statistics', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [{ century: 20, total: '35' }],
        })
      );

      const result = await stats.statsMarr(pool, GEDCOM_ID);

      expect(result.chartTitle).toBe('Marriages by century');
    });
  });

  describe('commonBirthPlacesList', () => {
    test('returns list of common birth places', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [
            { i_gedcom: '0 @I1@ INDI\n1 BIRT\n2 PLAC London, England' },
            { i_gedcom: '0 @I2@ INDI\n1 BIRT\n2 PLAC London, England' },
            { i_gedcom: '0 @I3@ INDI\n1 BIRT\n2 PLAC New York, USA' },
          ],
        })
      );

      const result = await stats.commonBirthPlacesList(pool, GEDCOM_ID, '10');

      expect(result).toHaveLength(2);
      expect(result[0].place).toBe('London, England');
      expect(result[0].count).toBe('2');
    });
  });

  describe('commonDeathPlacesList', () => {
    test('returns list of common death places', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [{ i_gedcom: '0 @I1@ INDI\n1 DEAT\n2 PLAC London, England' }],
        })
      );

      const result = await stats.commonDeathPlacesList(pool, GEDCOM_ID, '10');

      expect(result).toHaveLength(1);
      expect(result[0].place).toBe('London, England');
    });
  });

  describe('commonCountriesList', () => {
    test('returns list of common countries', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [
            { place: 'England', count: '50' },
            { place: 'USA', count: '25' },
          ],
        })
      );

      const result = await stats.commonCountriesList(pool, GEDCOM_ID, '10');

      expect(result).toHaveLength(2);
      expect(result[0].place).toBe('England');
    });
  });

  describe('oldestFather', () => {
    test('returns xref of oldest father', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [{ xref: 'I456', gedcom: '0 @I456@ INDI', age: 20000 }],
        })
      );

      const result = await stats.oldestFather(pool, GEDCOM_ID);

      expect(result).toEqual({ xref: 'I456', gedcom: '0 @I456@ INDI' });
    });

    test('returns null when no fathers found', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [] }));

      const result = await stats.oldestFather(pool, GEDCOM_ID);

      expect(result).toBe(null);
    });
  });

  describe('oldestFatherAge', () => {
    test('returns formatted age when showYears is false', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [{ xref: 'I456', gedcom: '0 @I456@ INDI', age: 27394 }], // ~75 years
        })
      );

      const result = await stats.oldestFatherAge(pool, GEDCOM_ID, '0');

      expect(result).toBe('75');
    });

    test('returns age in days/months/years when showYears is true', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [{ xref: 'I456', gedcom: '0 @I456@ INDI', age: 27394 }],
        })
      );

      const result = await stats.oldestFatherAge(pool, GEDCOM_ID, '1');

      expect(result).toMatch(/years?/);
    });
  });

  describe('topTenOldestFemaleList', () => {
    test('returns list of oldest females with ages', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [
            { i_id: 'I1', i_gedcom: '0 @I1@ INDI', days: '30000' },
            { i_id: 'I2', i_gedcom: '0 @I2@ INDI', days: '28000' },
          ],
        })
      );

      const result = await stats.topTenOldestFemaleList(pool, GEDCOM_ID, '10');

      expect(result).toHaveLength(2);
      expect(result[0].person).toEqual({ xref: 'I1', gedcom: '0 @I1@ INDI' });
      expect(result[0].age).toMatch(/year/);
    });

    test('returns empty list when no females found', async () => {
      const pool = createMockPool(vi.fn().mockResolvedValue({ rows: [] }));

      const result = await stats.topTenOldestFemaleList(pool, GEDCOM_ID, '10');

      expect(result).toEqual([]);
    });
  });

  describe('topTenLargestFamilyList', () => {
    test('returns list of largest families', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [
            { f_id: 'F1', f_gedcom: '0 @F1@ FAM', f_numchil: '8' },
            { f_id: 'F2', f_gedcom: '0 @F2@ FAM', f_numchil: '6' },
          ],
        })
      );

      const result = await stats.topTenLargestFamilyList(pool, GEDCOM_ID, '10');

      expect(result).toHaveLength(2);
      expect(result[0].family).toEqual({ xref: 'F1', gedcom: '0 @F1@ FAM' });
      expect(result[0].children).toBe('8');
    });
  });

  describe('topTenLargestGrandFamilyList', () => {
    test('returns list of families with most grandchildren', async () => {
      const pool = createMockPool(
        vi.fn().mockResolvedValue({
          rows: [
            { f_id: 'F1', f_gedcom: '0 @F1@ FAM', grandchildren: '20' },
          ],
        })
      );

      const result = await stats.topTenLargestGrandFamilyList(pool, GEDCOM_ID, '10');

      expect(result).toHaveLength(1);
      expect(result[0].family).toEqual({ xref: 'F1', gedcom: '0 @F1@ FAM' });
      expect(result[0].grandchildren).toBe('20');
    });
  });

  describe('chartCommonGiven', () => {
    test('returns chart data for common given names', async () => {
      const pool = createMockPool(
        vi
          .fn()
          .mockResolvedValueOnce({
            rows: [
              { name: 'John', count: '15' },
              { name: 'James', count: '10' },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              { name: 'John', count: '15' },
              { name: 'James', count: '10' },
              { name: 'Robert', count: '8' },
            ],
          })
      );

      const result = await stats.chartCommonGiven(pool, GEDCOM_ID, '2');

      expect(result.hasData).toBe(true);
      expect(result.labels).toContain('Other');
    });

    test('returns no data when no names found', async () => {
      const pool = createMockPool(
        vi
          .fn()
          .mockResolvedValueOnce({ rows: [] })
          .mockResolvedValueOnce({ rows: [] })
      );

      const result = await stats.chartCommonGiven(pool, GEDCOM_ID);

      expect(result.hasData).toBe(false);
    });
  });
});
