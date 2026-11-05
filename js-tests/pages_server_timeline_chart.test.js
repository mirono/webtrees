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
  collectIndividualTimelineEvents,
  layoutTimelineEvents,
  timelineColorIndex,
  timelineEventYear,
  timelineZoomIn,
  timelineZoomOut,
} from '../pages-server/timeline-chart.mjs';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

const noResn = { rows: [] };

describe('collectIndividualTimelineEvents', () => {
  test('collects every dated, showable fact of the individual, excluding NON_FACTS', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_default_resn')) return noResn;
      if (sql.includes('wt_link')) return { rows: [] }; // no spouse families
      throw new Error(`unexpected query: ${sql}`);
    });

    const individual = {
      xref: 'I1',
      gedcom: [
        '0 @I1@ INDI',
        '1 BIRT',
        '2 DATE 1 JAN 1900',
        '2 PLAC London, England',
        '1 CHAN',
        '2 DATE 1 JAN 2020',
        '1 EVEN',
        '2 TYPE Something',
      ].join('\n'),
    };

    const ctx = { gedcomId: 1, accessLevel: 2 };
    const { events, topYearBump } = await collectIndividualTimelineEvents(pool, ctx, individual, false, async () => null);

    expect(events).toHaveLength(1);
    expect(events[0].tag).toBe('BIRT');
    expect(events[0].place).toBe('London, England');
    expect(events[0].recordType).toBe('individual');
    expect(topYearBump).toBe(true); // isDeadIndividual=false, and a valid dated event was found
  });

  test('an undated fact is skipped entirely', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_default_resn')) return noResn;
      if (sql.includes('wt_link')) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    });

    const individual = { xref: 'I1', gedcom: '0 @I1@ INDI\n1 OCCU Farmer' };
    const ctx = { gedcomId: 1, accessLevel: 2 };
    const { events, topYearBump } = await collectIndividualTimelineEvents(pool, ctx, individual, false, async () => null);

    expect(events).toHaveLength(0);
    expect(topYearBump).toBe(false);
  });

  test('a dead individual with a dated event does not bump topyear', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_default_resn')) return noResn;
      if (sql.includes('wt_link')) return { rows: [] };
      throw new Error(`unexpected query: ${sql}`);
    });

    const individual = { xref: 'I1', gedcom: '0 @I1@ INDI\n1 BIRT\n2 DATE 1 JAN 1900' };
    const ctx = { gedcomId: 1, accessLevel: 2 };
    const { topYearBump } = await collectIndividualTimelineEvents(pool, ctx, individual, true, async () => null);

    expect(topYearBump).toBe(false);
  });

  test("merges in a spouse family's own dated facts, excluding FAM:CHAN", async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_default_resn')) return noResn;
      if (sql.includes('wt_link')) return { rows: [{ l_type: 'FAMS', l_to: 'F1' }] };
      throw new Error(`unexpected query: ${sql}`);
    });

    const individual = { xref: 'I1', gedcom: '0 @I1@ INDI' };
    const ctx = { gedcomId: 1, accessLevel: 2 };

    const shownFamily = {
      family: { xref: 'F1' },
      facts: ['1 MARR\n2 DATE 1 JAN 1920', '1 CHAN\n2 DATE 1 JAN 2020'],
      defaultResnInfo: { factResn: new Map(), treeFactResn: new Map() },
      husband: { individual: { xref: 'I1' } },
      wife: { individual: { xref: 'I2' } },
    };

    const { events } = await collectIndividualTimelineEvents(pool, ctx, individual, false, async (xref) => {
      expect(xref).toBe('F1');
      return shownFamily;
    });

    expect(events).toHaveLength(1);
    expect(events[0].tag).toBe('MARR');
    expect(events[0].recordType).toBe('family');
    expect(events[0].husbandXref).toBe('I1');
    expect(events[0].wifeXref).toBe('I2');
  });

  test('a null resolveShownFamily result (inaccessible family) is skipped', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_default_resn')) return noResn;
      if (sql.includes('wt_link')) return { rows: [{ l_type: 'FAMS', l_to: 'F1' }] };
      throw new Error(`unexpected query: ${sql}`);
    });

    const individual = { xref: 'I1', gedcom: '0 @I1@ INDI' };
    const ctx = { gedcomId: 1, accessLevel: 2 };

    const { events } = await collectIndividualTimelineEvents(pool, ctx, individual, false, async () => null);
    expect(events).toHaveLength(0);
  });

  test('two individuals sharing the same family produce the SAME dedup key for its facts', async () => {
    const pool = mockPool(async (sql) => {
      if (sql.includes('wt_default_resn')) return noResn;
      if (sql.includes('wt_link')) return { rows: [{ l_type: 'FAMS', l_to: 'F1' }] };
      throw new Error(`unexpected query: ${sql}`);
    });

    const ctx = { gedcomId: 1, accessLevel: 2 };
    const shownFamily = {
      family: { xref: 'F1' },
      facts: ['1 MARR\n2 DATE 1 JAN 1920'],
      defaultResnInfo: { factResn: new Map(), treeFactResn: new Map() },
      husband: { individual: { xref: 'I1' } },
      wife: { individual: { xref: 'I2' } },
    };

    const a = await collectIndividualTimelineEvents(pool, ctx, { xref: 'I1', gedcom: '' }, false, async () => shownFamily);
    const b = await collectIndividualTimelineEvents(pool, ctx, { xref: 'I2', gedcom: '' }, false, async () => shownFamily);

    expect(a.events[0].key).toBe(b.events[0].key);
  });
});

describe('timelineEventYear', () => {
  test('returns the Gregorian year of the event date', () => {
    const event = { gedcomDate: new GedcomDate('1 JAN 1950') };
    expect(timelineEventYear(event)).toBe(1950);
  });
});

describe('layoutTimelineEvents', () => {
  function evt(dateStr) {
    return { gedcomDate: new GedcomDate(dateStr) };
  }

  test('places a single event at its natural slot', () => {
    const placed = layoutTimelineEvents([evt('1 JAN 1950')], 1900, 10, 30);
    expect(placed).toHaveLength(1);
    expect(placed[0].tyoffset).toBe(0);
  });

  test('two events in the same slot bounce to different offsets', () => {
    const placed = layoutTimelineEvents([evt('1 JAN 1950'), evt('2 JAN 1950')], 1900, 10, 30);
    expect(placed[0].tyoffset).toBe(0);
    expect(placed[1].tyoffset).not.toBe(0);
    expect(placed[0].yoffset).not.toBe(placed[1].yoffset);
  });

  test('every placed event keeps its own date fields', () => {
    const placed = layoutTimelineEvents([evt('1 JAN 1950')], 1900, 10, 30);
    expect(placed[0].year).toBe(1950);
  });
});

describe('timelineColorIndex', () => {
  test("an individual event's color follows that individual's position", () => {
    const selected = ['I1', 'I2', 'I3'];
    expect(timelineColorIndex(selected, { recordType: 'individual', ownerXref: 'I2' })).toBe(1);
  });

  test("a family event's color follows the husband when the husband is selected", () => {
    const selected = ['I1', 'I2'];
    expect(timelineColorIndex(selected, { recordType: 'family', husbandXref: 'I2', wifeXref: 'I9' })).toBe(1);
  });

  test("a family event's color falls back to the wife when the husband isn't in the selected set", () => {
    const selected = ['I1', 'I2'];
    expect(timelineColorIndex(selected, { recordType: 'family', husbandXref: 'I9', wifeXref: 'I2' })).toBe(1);
  });

  test('wraps to 0-7 for more than 8 selected individuals', () => {
    const selected = Array.from({ length: 10 }, (_, i) => `I${i}`);
    expect(timelineColorIndex(selected, { recordType: 'individual', ownerXref: 'I9' })).toBe(1);
  });

  test('an unresolvable owner defaults to color 0', () => {
    expect(timelineColorIndex(['I1'], { recordType: 'individual', ownerXref: 'I999' })).toBe(0);
  });
});

describe('timelineZoomIn / timelineZoomOut', () => {
  test('zoom in increases scale, clamped to the max', () => {
    expect(timelineZoomIn(10, 1, 200)).toBe(15);
    expect(timelineZoomIn(199, 1, 200)).toBe(200);
  });

  test('zoom out decreases scale, clamped to the min', () => {
    expect(timelineZoomOut(10, 1, 200)).toBe(5);
    expect(timelineZoomOut(1, 1, 200)).toBe(1);
  });
});
