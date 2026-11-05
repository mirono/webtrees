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
import { GedcomDate } from '../lib/gedcom-date.js';
import {
  parseLifespansXrefs,
  joinLifespansXrefs,
  closeFamilyXrefs,
  resolvePlaceId,
  findIndividualsByDate,
  findIndividualsByPlace,
  ColorGenerator,
  lifespansMinYear,
  lifespansMaxYear,
  layoutIndividuals,
} from '../pages-server/lifespans-chart.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

describe('parseLifespansXrefs', () => {
  test('parses the modern dot-joined form', () => {
    const params = new URLSearchParams('xrefs=I1.I2.I3');
    expect(parseLifespansXrefs(params)).toEqual(['I1', 'I2', 'I3']);
  });

  test('falls back to the legacy array form when there is no scalar xrefs', () => {
    const params = new URLSearchParams('xrefs%5B%5D=I1&xrefs%5B%5D=I2');
    expect(parseLifespansXrefs(params)).toEqual(['I1', 'I2']);
  });

  test('no xrefs at all returns an empty array', () => {
    expect(parseLifespansXrefs(new URLSearchParams())).toEqual([]);
  });
});

describe('joinLifespansXrefs', () => {
  test('dot-joins', () => {
    expect(joinLifespansXrefs(['I1', 'I2'])).toBe('I1.I2');
  });
});

describe('closeFamilyXrefs', () => {
  test("gathers every spouse family's and parent family's own spouses and children", async () => {
    const pool = mockPool(async (sql, params) => {
      if (sql.includes('wt_link')) {
        return { rows: [{ l_type: 'FAMS', l_to: 'F1' }, { l_type: 'FAMC', l_to: 'F2' }] };
      }
      if (sql.includes('wt_families') && params[0] === 'F1') {
        return { rows: [{ f_id: 'F1', f_gedcom: '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@', f_husb: 'I1', f_wife: 'I2' }] };
      }
      if (sql.includes('wt_families') && params[0] === 'F2') {
        return { rows: [{ f_id: 'F2', f_gedcom: '0 @F2@ FAM\n1 HUSB @I4@\n1 WIFE @I5@\n1 CHIL @I6@', f_husb: 'I4', f_wife: 'I5' }] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const xrefs = await closeFamilyXrefs(pool, 1, 'I3');
    expect(new Set(xrefs)).toEqual(new Set(['I3', 'I1', 'I2', 'I6', 'I4', 'I5']));
  });
});

describe('resolvePlaceId', () => {
  test('resolves a multi-part place name from the top level down', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_places');
      const [, place, parentId] = params;
      if (place === 'Poland' && parentId === 0) {
        return { rows: [{ p_id: 8 }] };
      }
      if (place === 'Tomaszow Mazowiecki' && parentId === 8) {
        return { rows: [{ p_id: 9 }] };
      }
      return { rows: [] };
    });

    expect(await resolvePlaceId(pool, 1, 'Tomaszow Mazowiecki, Poland')).toBe(9);
  });

  test('returns 0 when any level of the chain is not found', async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    expect(await resolvePlaceId(pool, 1, 'Nowhereville, Nowhere')).toBe(0);
  });

  test('ignores empty parts (e.g. "Village, , Country")', async () => {
    const pool = mockPool(async (sql, params) => {
      const [, place, parentId] = params;
      if (place === 'Country' && parentId === 0) return { rows: [{ p_id: 1 }] };
      if (place === 'Village' && parentId === 1) return { rows: [{ p_id: 2 }] };
      return { rows: [] };
    });

    expect(await resolvePlaceId(pool, 1, 'Village, , , Country')).toBe(2);
  });
});

describe('findIndividualsByDate / findIndividualsByPlace', () => {
  test('findIndividualsByDate queries wt_dates with the date-range bounds reversed (julianday1 <= end, julianday2 >= start)', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('wt_dates');
      expect(params).toEqual([1, 2459581, 2459216]);
      return { rows: [{ d_gid: 'I1' }, { d_gid: 'I2' }] };
    });

    const result = await findIndividualsByDate(pool, 1, { minimumJulianDay: () => 2459216 }, { maximumJulianDay: () => 2459581 });
    expect(result).toEqual(['I1', 'I2']);
  });

  test('findIndividualsByPlace queries wt_placelinks', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('wt_placelinks');
      expect(params).toEqual([1, 9]);
      return { rows: [{ pl_gid: 'I3' }] };
    });

    expect(await findIndividualsByPlace(pool, 1, 9)).toEqual(['I3']);
  });
});

describe('ColorGenerator', () => {
  test('cycles lightness before advancing hue, and formats as hsla()', () => {
    const generator = new ColorGenerator(240, 100, 30, 0.25, -120);
    expect(generator.getNextColor()).toBe('hsla(240, 100%, 40%, 0.25)');
    expect(generator.getNextColor()).toBe('hsla(240, 100%, 50%, 0.25)');
  });

  test('wraps lightness back to baseline and advances hue once lightness hits 100', () => {
    const generator = new ColorGenerator(240, 100, 95, 0.25, -120);
    expect(generator.getNextColor()).toBe('hsla(225, 100%, 95%, 0.25)');
  });

  test('resets hue back to basehue once it passes the far end of its range', () => {
    const generator = new ColorGenerator(240, 100, 95, 0.25, -15);
    // One step already exhausts the (-15 degree) range, so hue wraps back to 240 immediately.
    expect(generator.getNextColor()).toBe('hsla(240, 100%, 95%, 0.25)');
  });
});

describe('lifespansMinYear / lifespansMaxYear', () => {
  test('uses the earliest OK birth date and latest OK death date', () => {
    const individuals = [
      { birthDate: new GedcomDate('1900'), deathDate: new GedcomDate('1950') },
      { birthDate: new GedcomDate('1920'), deathDate: new GedcomDate('1990') },
    ];

    expect(lifespansMinYear(individuals)).toBe(1900);
    expect(lifespansMaxYear(individuals)).toBe(1990);
  });

  test('falls back to the current year when nothing has an OK date', () => {
    const individuals = [{ birthDate: new GedcomDate(''), deathDate: new GedcomDate('') }];
    const currentYear = new Date().getFullYear();

    expect(lifespansMinYear(individuals)).toBe(currentYear);
    expect(lifespansMaxYear(individuals)).toBe(currentYear);
  });

  test("maxYear never exceeds the current year, even with a future death date", () => {
    const farFuture = new Date().getFullYear() + 50;
    const individuals = [{ deathDate: new GedcomDate(String(farFuture)) }];

    expect(lifespansMaxYear(individuals)).toBe(new Date().getFullYear());
  });
});

describe('layoutIndividuals', () => {
  function box(xref, sex) {
    return { xref, sex, fullNameHtml: xref, url: `/${xref}`, lifespanText: '', birthSummaryHtml: '', deathSummaryHtml: '' };
  }

  test('non-overlapping lifespans all land in row 0', () => {
    const individuals = [
      { box: box('I1', 'M'), birthDate: new GedcomDate('1900'), deathDate: new GedcomDate('1910') },
      { box: box('I2', 'F'), birthDate: new GedcomDate('1920'), deathDate: new GedcomDate('1930') },
    ];

    const lifespans = layoutIndividuals(individuals);
    expect(lifespans.map((l) => l.row)).toEqual([0, 0]);
  });

  test('overlapping lifespans stack into separate rows', () => {
    const individuals = [
      { box: box('I1', 'M'), birthDate: new GedcomDate('1900'), deathDate: new GedcomDate('1950') },
      { box: box('I2', 'F'), birthDate: new GedcomDate('1910'), deathDate: new GedcomDate('1920') },
    ];

    const lifespans = layoutIndividuals(individuals);
    expect(lifespans.map((l) => l.row)).toEqual([0, 1]);
  });

  test('a third lifespan reuses row 0 once the first individual there has died', () => {
    const individuals = [
      { box: box('I1', 'M'), birthDate: new GedcomDate('1900'), deathDate: new GedcomDate('1910') },
      { box: box('I2', 'F'), birthDate: new GedcomDate('1905'), deathDate: new GedcomDate('1950') },
      { box: box('I3', 'M'), birthDate: new GedcomDate('1920'), deathDate: new GedcomDate('1930') },
    ];

    const lifespans = layoutIndividuals(individuals);
    expect(lifespans.map((l) => l.row)).toEqual([0, 1, 0]);
  });

  test('a death before birth is swapped so the bar still renders', () => {
    const individuals = [{ box: box('I1', 'U'), birthDate: new GedcomDate('1950'), deathDate: new GedcomDate('1900') }];
    const lifespans = layoutIndividuals(individuals);
    expect(lifespans[0].deathYear).toBe(lifespans[0].birthYear);
  });

  test('male/female/unknown each get their own color generator', () => {
    const individuals = [
      { box: box('I1', 'M'), birthDate: new GedcomDate('1900'), deathDate: new GedcomDate('1910') },
      { box: box('I2', 'F'), birthDate: new GedcomDate('1900'), deathDate: new GedcomDate('1910') },
      { box: box('I3', 'U'), birthDate: new GedcomDate('1900'), deathDate: new GedcomDate('1910') },
    ];

    const [m, f, u] = layoutIndividuals(individuals);
    expect(m.background).not.toBe(f.background);
    expect(f.background).not.toBe(u.background);
  });
});
