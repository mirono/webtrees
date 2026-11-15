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
import { surnameTraditionFor, toNameFacts } from '../pages-server/surname-tradition.mjs';

describe('surnameTraditionFor', () => {
  test('maps each known key to the right class', () => {
    expect(surnameTraditionFor('paternal').constructor.name).toBe('PaternalSurnameTradition');
    expect(surnameTraditionFor('patrilineal').constructor.name).toBe('PatrilinealSurnameTradition');
    expect(surnameTraditionFor('matrilineal').constructor.name).toBe('MatrilinealSurnameTradition');
    expect(surnameTraditionFor('portuguese').constructor.name).toBe('PortugueseSurnameTradition');
    expect(surnameTraditionFor('spanish').constructor.name).toBe('SpanishSurnameTradition');
    expect(surnameTraditionFor('polish').constructor.name).toBe('PolishSurnameTradition');
    expect(surnameTraditionFor('lithuanian').constructor.name).toBe('LithuanianSurnameTradition');
    expect(surnameTraditionFor('icelandic').constructor.name).toBe('IcelandicSurnameTradition');
    expect(surnameTraditionFor('').constructor.name).toBe('DefaultSurnameTradition');
  });

  test('an unrecognized key falls back to Default, matching real PHP', () => {
    expect(surnameTraditionFor('not-a-real-tradition').constructor.name).toBe('DefaultSurnameTradition');
  });

  test('a paternal tradition actually computes a child name from the father', () => {
    const tradition = surnameTraditionFor('paternal');
    const father = [{ tag: 'NAME', type: '', value: 'John /Smith/' }];
    const names = tradition.newChildNames(father, null, 'M');
    expect(names[0]).toContain('/Smith/');
  });
});

describe('toNameFacts', () => {
  test('extracts NAME facts with their TYPE subtag', () => {
    const gedcom = '0 @I1@ INDI\n1 NAME John /Smith/\n2 TYPE birth\n1 SEX M';
    expect(toNameFacts(gedcom)).toEqual([{ tag: 'NAME', type: 'birth', value: 'John /Smith/' }]);
  });

  test('a NAME fact with no TYPE subtag gets an empty type', () => {
    const gedcom = '0 @I1@ INDI\n1 NAME John /Smith/';
    expect(toNameFacts(gedcom)).toEqual([{ tag: 'NAME', type: '', value: 'John /Smith/' }]);
  });

  test('multiple NAME facts are all extracted', () => {
    const gedcom = '0 @I1@ INDI\n1 NAME John /Smith/\n1 NAME Jack /Smith/\n2 TYPE AKA';
    expect(toNameFacts(gedcom)).toHaveLength(2);
  });

  test('null/undefined gedcom returns an empty array', () => {
    expect(toNameFacts(null)).toEqual([]);
    expect(toNameFacts(undefined)).toEqual([]);
  });

  test('a record with no NAME fact returns an empty array', () => {
    expect(toNameFacts('0 @F1@ FAM\n1 HUSB @I1@')).toEqual([]);
  });
});
