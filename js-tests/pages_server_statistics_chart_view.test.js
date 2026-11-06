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

import { describe, expect, test } from 'vitest';
import {
  renderTotalIndividualsBlock,
  renderGreatestAgeBlock,
  renderOldestLivingBlock,
  renderPlacesBlock,
  renderChartDistributionBlock,
  renderAgeDifferenceBlock,
  renderIndividualsTab,
  renderFamiliesTab,
  renderOtherTab,
  renderCustomTab,
  renderCustomChartResult,
  renderStatisticsChartPage,
} from '../pages-server/statistics-chart-view.mjs';

const NO_CHART = { hasData: false };

function baseIndividualsTags() {
  return {
    totalIndividuals: '100',
    totalSexMales: '55',
    totalSexFemales: '45',
    chartSex: NO_CHART,
    totalLiving: '10',
    totalDeceased: '90',
    chartMortality: NO_CHART,
    totalBirths: '100',
    totalDeaths: '90',
    statsBirth: NO_CHART,
    statsDeath: NO_CHART,
    firstBirthHtml: 'A',
    lastBirthHtml: 'B',
    firstDeathHtml: 'C',
    lastDeathHtml: 'D',
    averageLifespan: '70',
    averageLifespanMale: '68',
    averageLifespanFemale: '72',
    statsAge: NO_CHART,
    topAgeOfMarriage: '50 years',
    topAgeOfMarriageFamilyHtml: 'X',
    minAgeOfMarriage: '1 year',
    minAgeOfMarriageFamilyHtml: 'Y',
    topTenOldestMaleList: [],
    topTenOldestFemaleList: [],
    topTenOldestMaleListAlive: [],
    topTenOldestFemaleListAlive: 'This information is private and cannot be shown.',
    totalSurnames: '20',
    chartCommonSurnames: NO_CHART,
    totalGivennames: '30',
    chartCommonGiven: NO_CHART,
  };
}

describe('renderTotalIndividualsBlock', () => {
  test('embeds the totals and chart placeholders', () => {
    const html = renderTotalIndividualsBlock(baseIndividualsTags());
    expect(html).toContain('100');
    expect(html).toContain('Total males');
    expect(html).toContain('55');
  });
});

describe('renderGreatestAgeBlock', () => {
  test('shows the "not available" fallback for empty lists', () => {
    const html = renderGreatestAgeBlock(baseIndividualsTags());
    expect(html).toContain('This information is not available.');
  });

  test('renders person+age rows when present', () => {
    const html = renderGreatestAgeBlock({
      ...baseIndividualsTags(),
      topTenOldestMaleList: [{ personHtml: '<a href="/x">John</a>', age: '90 years' }],
    });
    expect(html).toContain('<a href="/x">John</a>');
    expect(html).toContain('90 years');
  });
});

describe('renderOldestLivingBlock', () => {
  test('renders the private-information string verbatim when the tag returned a string', () => {
    const html = renderOldestLivingBlock(baseIndividualsTags());
    expect(html).toContain('This information is private and cannot be shown.');
  });

  test('renders a list when the tag returned an array', () => {
    const html = renderOldestLivingBlock({
      ...baseIndividualsTags(),
      topTenOldestMaleListAlive: [{ personHtml: '<a href="/x">Bob</a>', age: '80 years' }],
    });
    expect(html).toContain('Bob');
  });
});

describe('renderPlacesBlock / renderChartDistributionBlock', () => {
  test('renders place lists and a missing-data geo chart', () => {
    const html = renderPlacesBlock({
      totalPlaces: '5',
      commonBirthPlacesList: [{ place: 'London', count: 3 }],
      commonDeathPlacesList: [],
      commonMarriagePlacesList: [],
      commonCountriesList: [],
    });
    expect(html).toContain('London');
    expect(html).toContain('This information is not available.');

    expect(renderChartDistributionBlock({ chartDistribution: NO_CHART })).toBe('This information is not available.');
  });
});

describe('renderAgeDifferenceBlock', () => {
  test('renders sibling and spouse age-gap rows', () => {
    const html = renderAgeDifferenceBlock({
      topAgeBetweenSiblingsList: [{ child1Html: 'Alice', child2Html: 'Bob', ageDiff: '5 years' }],
      topAgeBetweenSiblingsFullNameHtml: 'Bob and Alice',
      ageBetweenSpousesMFList: [{ husbandHtml: 'Husband', wifeHtml: 'Wife', ageDiff: '10 years' }],
      ageBetweenSpousesFMList: [],
    });
    expect(html).toContain('Alice');
    expect(html).toContain('Bob');
    expect(html).toContain('Husband');
    expect(html).toContain('10 years');
  });
});

describe('tab assembly', () => {
  test('renderIndividualsTab assembles all six blocks without throwing', () => {
    expect(() => renderIndividualsTab(baseIndividualsTags())).not.toThrow();
  });

  test('renderFamiliesTab assembles all six blocks without throwing', () => {
    const html = renderFamiliesTab({
      totalFamilies: '50',
      totalMarriages: '45',
      statsMarr: NO_CHART,
      firstMarriageHtml: 'A',
      lastMarriageHtml: 'B',
      totalDivorces: '5',
      statsDiv: NO_CHART,
      firstDivorceHtml: 'C',
      lastDivorceHtml: 'D',
      topAgeOfMarriage: '50 years',
      topAgeOfMarriageFamilyHtml: 'E',
      minAgeOfMarriage: '1 year',
      minAgeOfMarriageFamilyHtml: 'F',
      noChildrenFamilies: '3',
      chartNoChildrenFamilies: NO_CHART,
      oldestMarriageMaleHtml: 'A',
      oldestMarriageMaleAge: '80',
      oldestMarriageFemaleHtml: 'B',
      oldestMarriageFemaleAge: '78',
      youngestMarriageMaleHtml: 'C',
      youngestMarriageMaleAge: '18',
      youngestMarriageFemaleHtml: 'D',
      youngestMarriageFemaleAge: '17',
      statsMarrAge: NO_CHART,
      oldestFatherHtml: 'E',
      oldestFatherAge: '60',
      oldestMotherHtml: 'F',
      oldestMotherAge: '55',
      youngestFatherHtml: 'G',
      youngestFatherAge: '18',
      youngestMotherHtml: 'H',
      youngestMotherAge: '16',
      averageChildren: '2.5',
      statsChildren: NO_CHART,
      topTenLargestFamilyList: [],
      topTenLargestGrandFamilyList: [],
      topAgeBetweenSiblingsList: [],
      topAgeBetweenSiblingsFullNameHtml: 'G',
      ageBetweenSpousesFMList: [],
      ageBetweenSpousesMFList: [],
    });
    expect(html).toContain('Total families');
  });

  test('renderOtherTab assembles all six blocks without throwing', () => {
    const html = renderOtherTab({
      totalRecords: '10',
      totalMedia: '1',
      totalNotes: '1',
      totalSources: '2',
      totalRepositories: '3',
      totalEvents: '5',
      firstEventHtml: 'A',
      lastEventHtml: 'B',
      firstEventType: 'BIRT',
      lastEventType: 'DEAT',
      chartMedia: NO_CHART,
      totalIndisWithSources: '1',
      chartIndisWithSources: NO_CHART,
      totalFamsWithSources: '2',
      chartFamsWithSources: NO_CHART,
      totalPlaces: '4',
      commonBirthPlacesList: [],
      commonDeathPlacesList: [],
      commonMarriagePlacesList: [],
      commonCountriesList: [],
      chartDistribution: NO_CHART,
    });
    expect(html).toContain('Records');
  });
});

describe('renderCustomTab', () => {
  test('includes the form action for the given tree', () => {
    const html = renderCustomTab({ tree: { name: 'ophir' } });
    expect(html).toContain('/module/statistics_chart/CustomChart/ophir');
  });
});

describe('renderCustomChartResult', () => {
  test('renders the missing-data text for an error result', () => {
    expect(renderCustomChartResult({ kind: 'error', message: 'Not Found' })).toBe('This information is not available.');
  });

  test('renders a geo chart for a map result', () => {
    const html = renderCustomChartResult({ kind: 'map', data: { hasData: true, features: [{ id: 'FR', label: 'France', value: 5 }] } });
    expect(html).toContain('data-wt-chart-type="geo"');
  });

  test('renders a card-wrapped column chart for a chart result', () => {
    const html = renderCustomChartResult({ kind: 'chart', hasData: true, chartTitle: 'Month of birth', labels: ['Jan'], datasets: [{ label: 'Total', data: [1] }] });
    expect(html).toContain('Month of birth');
    expect(html).toContain('data-wt-chart-type="column"');
  });
});

describe('renderStatisticsChartPage', () => {
  test('includes the tab nav and tree title for an anonymous visitor', () => {
    const html = renderStatisticsChartPage({ tree: { name: 'ophir', title: 'My tree' }, user: null, csrfToken: null });
    expect(html).toContain('My tree');
    expect(html).toContain('/module/statistics_chart/Individuals/ophir');
    expect(html).toContain('/module/statistics_chart/Custom/ophir');
    expect(html).toContain('Sign in');
  });

  test('each tab gets a distinct id (regression: a truncated hash collided across all four tabs)', () => {
    const html = renderStatisticsChartPage({ tree: { name: 'ophir', title: 'My tree' }, user: null, csrfToken: null });
    const ids = [...html.matchAll(/id="(tab-[0-9a-f]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
  });

  test('shows the signed-in user name and CSRF meta tag', () => {
    const html = renderStatisticsChartPage({
      tree: { name: 'ophir', title: 'My tree' },
      user: { realName: 'Jane Doe' },
      csrfToken: 'tok123',
    });
    expect(html).toContain('Jane Doe');
    expect(html).toContain('content="tok123"');
  });
});
