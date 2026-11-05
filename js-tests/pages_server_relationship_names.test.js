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
import { GedcomDate } from '../lib/gedcom-date.js';
import { legacyNameAlgorithm } from '../pages-server/relationship-names.mjs';

function person(sex, birthDateStr) {
  return { sex, birthDate: birthDateStr ? { date: new GedcomDate(birthDateStr) } : null };
}

describe('legacyNameAlgorithm - single-step direct relationships', () => {
  test.each([
    ['fat', 'father'],
    ['mot', 'mother'],
    ['par', 'parent'],
    ['son', 'son'],
    ['dau', 'daughter'],
    ['chi', 'child'],
  ])('%s -> %s', (code, expected) => {
    expect(legacyNameAlgorithm(code, null, null, null)).toBe(expected);
  });

  test('the empty path is "self"', () => {
    expect(legacyNameAlgorithm('', null, null, null)).toBe('self');
  });
});

describe('legacyNameAlgorithm - spouse status', () => {
  test('a current marriage is husband/wife/spouse', () => {
    const facts = ['1 MARR\n2 DATE 1 JAN 2000'];
    expect(legacyNameAlgorithm('hus', null, null, facts)).toBe('husband');
    expect(legacyNameAlgorithm('wif', null, null, facts)).toBe('wife');
    expect(legacyNameAlgorithm('spo', null, null, facts)).toBe('spouse');
  });

  test('a divorce after the marriage is ex-husband/ex-wife', () => {
    const facts = ['1 MARR\n2 DATE 1 JAN 2000', '1 DIV\n2 DATE 1 JAN 2010'];
    expect(legacyNameAlgorithm('hus', null, null, facts)).toBe('ex-husband');
    expect(legacyNameAlgorithm('wif', null, null, facts)).toBe('ex-wife');
  });

  test('an engagement with no marriage is fiancé/fiancée', () => {
    const facts = ['1 ENGA\n2 DATE 1 JAN 2000'];
    expect(legacyNameAlgorithm('hus', null, null, facts)).toBe('fiancé');
    expect(legacyNameAlgorithm('wif', null, null, facts)).toBe('fiancée');
  });

  test('no linking family facts at all falls back to "partner"', () => {
    expect(legacyNameAlgorithm('hus', null, null, null)).toBe('partner');
  });
});

describe('legacyNameAlgorithm - sibling age', () => {
  test('twins', () => {
    expect(legacyNameAlgorithm('bro', person('M', '1 JAN 2000'), person('M', '1 JAN 2000'), null)).toBe('twin brother');
  });

  test('a younger sister', () => {
    expect(legacyNameAlgorithm('sis', person('M', '1 JAN 1990'), person('F', '1 JAN 2000'), null)).toBe('younger sister');
  });

  test('an elder sibling with no determinable age falls back to plain "sibling"', () => {
    expect(legacyNameAlgorithm('sib', null, null, null)).toBe('sibling');
  });
});

describe('legacyNameAlgorithm - two-step (level two) relationships', () => {
  test.each([
    ['fatfat', 'paternal grandfather'],
    ['motmot', 'maternal grandmother'],
    ['fatsis', 'aunt'],
    ['motbro', 'uncle'],
    ['sisson', 'nephew'],
    ['brodau', 'niece'],
    ['sonwif', 'daughter-in-law'],
    ['husfat', 'father-in-law'],
  ])('%s -> %s', (code, expected) => {
    expect(legacyNameAlgorithm(code, null, null, null)).toBe(expected);
  });
});

describe('legacyNameAlgorithm - generic ancestor/descendant/cousin formulas', () => {
  test('a pure 3-generation ancestor chain is a great-grandparent', () => {
    expect(legacyNameAlgorithm('fatfatfat', null, null, null)).toBe('great-grandfather');
  });

  test('a pure 3-generation descendant chain is a great-grandchild', () => {
    expect(legacyNameAlgorithm('sonsonson', null, null, null)).toBe('great-grandson');
  });

  test('a classic first-cousin pattern (equal up/down generation counts via a shared grandparent)', () => {
    // parent's sibling's child = first cousin (1 up, 1 down)
    expect(legacyNameAlgorithm('parsibchi', null, null, null)).toBe('first cousin');
  });

  test('a second cousin (two generations up, two generations down - a shared great-grandparent)', () => {
    expect(legacyNameAlgorithm('parparsibchichi', null, null, null)).toBe('second cousin');
  });

  test('a cousin "once removed" (unequal up/down generation counts)', () => {
    expect(legacyNameAlgorithm('parparsibchi', null, null, null)).toContain('cousin');
    expect(legacyNameAlgorithm('parparsibchi', null, null, null)).toContain('removed');
  });
});

describe('legacyNameAlgorithm - generic fallback (no case or regex matches)', () => {
  test("a compound path with no direct formula falls back to the shortest X's Y split", () => {
    const result = legacyNameAlgorithm('wifwifwif', null, null, null);
    expect(result).toContain("'s");
  });

  test('an unrecognized code still returns a non-empty string, never throws', () => {
    expect(() => legacyNameAlgorithm('xxxyyyzzz', null, null, null)).not.toThrow();
    expect(legacyNameAlgorithm('xxxyyyzzz', null, null, null).length).toBeGreaterThan(0);
  });
});
