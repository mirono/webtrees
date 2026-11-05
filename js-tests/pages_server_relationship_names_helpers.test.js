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
import { spouseRelationshipStatus, siblingAgeTerm, legacyCousinName, legacyCousinName2 } from '../pages-server/relationship-names.mjs';

function birthDate(dateStr) {
  return { date: new GedcomDate(dateStr) };
}

describe('spouseRelationshipStatus', () => {
  test('a plain marriage fact', () => {
    expect(spouseRelationshipStatus(['1 MARR\n2 DATE 1 JAN 2000'])).toBe('MARR');
  });

  test('a later divorce wins over an earlier marriage', () => {
    expect(spouseRelationshipStatus(['1 MARR\n2 DATE 1 JAN 2000', '1 DIV\n2 DATE 1 JAN 2010'])).toBe('DIV');
  });

  test('an engagement before a marriage - the marriage (later date) wins', () => {
    expect(spouseRelationshipStatus(['1 ENGA\n2 DATE 1 JAN 1999', '1 MARR\n2 DATE 1 JAN 2000'])).toBe('MARR');
  });

  test('no status facts at all returns null', () => {
    expect(spouseRelationshipStatus(['1 RESI\n2 DATE 1 JAN 2000'])).toBeNull();
  });

  test('undated status facts fall back to gedcom order (last one wins)', () => {
    expect(spouseRelationshipStatus(['1 ENGA', '1 MARR'])).toBe('MARR');
  });
});

describe('siblingAgeTerm', () => {
  test('two births on the same day are twins', () => {
    expect(siblingAgeTerm(birthDate('1 JAN 2000'), birthDate('1 JAN 2000'))).toBe('twin');
  });

  test('person1 born first means person2 is younger', () => {
    expect(siblingAgeTerm(birthDate('1 JAN 1990'), birthDate('1 JAN 2000'))).toBe('younger');
  });

  test('person1 born later means person2 is elder', () => {
    expect(siblingAgeTerm(birthDate('1 JAN 2000'), birthDate('1 JAN 1990'))).toBe('elder');
  });

  test('a missing birth date returns null', () => {
    expect(siblingAgeTerm(null, birthDate('1 JAN 2000'))).toBeNull();
  });

  test('an unusable (not OK) date returns null', () => {
    expect(siblingAgeTerm(birthDate(''), birthDate('1 JAN 2000'))).toBeNull();
  });
});

describe('legacyCousinName', () => {
  test('first through fifteenth have their own word', () => {
    expect(legacyCousinName(1, 'M')).toBe('first cousin');
    expect(legacyCousinName(15, 'F')).toBe('fifteenth cousin');
  });

  test('beyond fifteenth falls back to the numeric form', () => {
    expect(legacyCousinName(16, 'U')).toBe('16 × cousin');
  });
});

describe('legacyCousinName2', () => {
  test('first through fifth have their own word', () => {
    expect(legacyCousinName2(3, 'M', 'great-nephew')).toBe('third great-nephew');
  });

  test('beyond fifth falls back to the numeric form', () => {
    expect(legacyCousinName2(6, 'F', 'great-nephew')).toBe('6 × great-nephew');
  });
});
