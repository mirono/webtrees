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
import { buildChartBoxViewModel, loadShowHighlightImagesPref } from '../pages-server/chart-box.mjs';

const baseTreePrivacyPrefs = {
  hideLivePeople: false,
  keepAliveYearsBirth: 0,
  keepAliveYearsDeath: 0,
  maxAliveAge: 120,
  showDeadPeople: 2,
  showNoWatermark: 1,
};
const baseViewerBase = { accessLevel: 2, isSelfRecord: false, relationshipGateBlocked: false };
const baseSiteUrlConfig = { baseUrl: '', rewriteUrls: false };
const noDefaultResn = { individualResn: null };

function individualWith(gedcomBody) {
  return { xref: 'I1', gedcom: `0 @I1@ INDI\n${gedcomBody}` };
}

describe('buildChartBoxViewModel', () => {
  test('a visible individual shows their real name and sex', async () => {
    const box = await buildChartBoxViewModel(
      null,
      1,
      'ophir',
      baseTreePrivacyPrefs,
      false,
      individualWith('1 NAME John /Smith/\n1 SEX M'),
      baseViewerBase,
      2,
      noDefaultResn,
      null,
      baseSiteUrlConfig,
    );

    expect(box.canShow).toBe(true);
    expect(box.fullNameHtml).toContain('John');
    expect(box.sex).toBe('M');
  });

  test('a hidden individual (RESN confidential, hideLivePeople on, viewer too low) shows "Private", not the real name', async () => {
    const box = await buildChartBoxViewModel(
      null,
      1,
      'ophir',
      { ...baseTreePrivacyPrefs, hideLivePeople: true },
      false,
      individualWith('1 NAME John /Smith/\n1 RESN confidential'),
      baseViewerBase,
      2,
      noDefaultResn,
      null,
      baseSiteUrlConfig,
    );

    expect(box.canShow).toBe(false);
    expect(box.fullNameHtml).toContain('Private');
  });

  test('traversalAccessLevel -1 (SHOW_PRIVATE_RELATIONSHIPS bypass) overrides even a hidden RESN', async () => {
    const box = await buildChartBoxViewModel(
      null,
      1,
      'ophir',
      { ...baseTreePrivacyPrefs, hideLivePeople: true },
      false,
      individualWith('1 NAME John /Smith/\n1 RESN confidential'),
      baseViewerBase,
      -1,
      noDefaultResn,
      null,
      baseSiteUrlConfig,
    );

    expect(box.canShow).toBe(true);
  });

  test('lifespan/birth/death summaries derive from real BIRT/DEAT facts', async () => {
    const box = await buildChartBoxViewModel(
      null,
      1,
      'ophir',
      baseTreePrivacyPrefs,
      false,
      individualWith('1 NAME John /Smith/\n1 SEX M\n1 BIRT\n2 DATE 1 JAN 1900\n2 PLAC London\n1 DEAT\n2 DATE 1 JAN 1980\n2 PLAC Paris'),
      baseViewerBase,
      2,
      noDefaultResn,
      null,
      baseSiteUrlConfig,
    );

    expect(box.lifespanText).toBe('1900–1980');
    expect(box.birthSummaryHtml).toContain('London');
    expect(box.deathSummaryHtml).toContain('Paris');
  });

  test('no thumbnail when glideKey is null (no displayable image expected)', async () => {
    const box = await buildChartBoxViewModel(
      null,
      1,
      'ophir',
      baseTreePrivacyPrefs,
      true,
      individualWith('1 NAME John /Smith/\n1 SEX M\n1 OBJE @M1@'),
      baseViewerBase,
      2,
      noDefaultResn,
      null,
      baseSiteUrlConfig,
    );

    expect(box.thumbnailUrl).toBeNull();
  });

  test('no thumbnail when showHighlightImages is false, even with a real linked image', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [{ m_id: 'M1', m_gedcom: '0 @M1@ OBJE\n1 FILE a.jpg\n2 FORM jpeg' }] })) };

    const box = await buildChartBoxViewModel(
      pool,
      1,
      'ophir',
      baseTreePrivacyPrefs,
      false,
      individualWith('1 NAME John /Smith/\n1 SEX M\n1 OBJE @M1@'),
      baseViewerBase,
      2,
      noDefaultResn,
      'glide-key',
      baseSiteUrlConfig,
    );

    expect(box.thumbnailUrl).toBeNull();
  });

  test('a real thumbnail URL when showHighlightImages is true and a glideKey is provided', async () => {
    const pool = { query: vi.fn(async () => ({ rows: [{ m_id: 'M1', m_gedcom: '0 @M1@ OBJE\n1 FILE a.jpg\n2 FORM jpeg' }] })) };

    const box = await buildChartBoxViewModel(
      pool,
      1,
      'ophir',
      baseTreePrivacyPrefs,
      true,
      individualWith('1 NAME John /Smith/\n1 SEX M\n1 OBJE @M1@'),
      baseViewerBase,
      2,
      noDefaultResn,
      'glide-key',
      baseSiteUrlConfig,
    );

    expect(box.thumbnailUrl).not.toBeNull();
    expect(box.thumbnailUrl).toContain('media-thumbnail');
  });
});

describe('loadShowHighlightImagesPref', () => {
  test('defaults to true when no row exists (real PHP default is "1")', async () => {
    const pool = { query: async () => ({ rows: [] }) };
    expect(await loadShowHighlightImagesPref(pool, 1)).toBe(true);
  });

  test('false only when explicitly stored as "0"', async () => {
    const pool = { query: async () => ({ rows: [{ setting_value: '0' }] }) };
    expect(await loadShowHighlightImagesPref(pool, 1)).toBe(false);
  });
});

describe('loadShowPrivateRelationshipsPref', () => {
  test('defaults to true when no row exists (real PHP default is "1")', async () => {
    const pool = { query: async () => ({ rows: [] }) };
    const { loadShowPrivateRelationshipsPref } = await import('../pages-server/chart-box.mjs');
    expect(await loadShowPrivateRelationshipsPref(pool, 1)).toBe(true);
  });

  test('false only when explicitly stored as "0"', async () => {
    const pool = { query: async () => ({ rows: [{ setting_value: '0' }] }) };
    const { loadShowPrivateRelationshipsPref } = await import('../pages-server/chart-box.mjs');
    expect(await loadShowPrivateRelationshipsPref(pool, 1)).toBe(false);
  });
});
