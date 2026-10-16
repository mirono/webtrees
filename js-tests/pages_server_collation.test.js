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
import { alphabet, compare, initialLetter, normalize, strtoupper, textScript } from '../pages-server/collation.mjs';

describe('normalize', () => {
  test('strips diacritics via NFKD decomposition', () => {
    expect(normalize('café')).toBe('cafe');
    expect(normalize('MÜLLER')).toBe('MULLER');
  });

  test('leaves plain ASCII untouched', () => {
    expect(normalize('Smith')).toBe('Smith');
  });

  test('leaves non-Latin scripts untouched (no diacritics to strip)', () => {
    expect(normalize('בית')).toBe('בית');
  });
});

describe('initialLetter', () => {
  test('returns the first Unicode character, not the first byte', () => {
    expect(initialLetter('Müller')).toBe('M');
    expect(initialLetter('בית')).toBe('ב');
  });

  test('returns empty string for an empty input', () => {
    expect(initialLetter('')).toBe('');
  });
});

describe('alphabet', () => {
  test('is the fixed A-Z array', () => {
    const letters = alphabet();
    expect(letters).toHaveLength(26);
    expect(letters[0]).toBe('A');
    expect(letters[25]).toBe('Z');
  });
});

describe('compare', () => {
  test('sorts case-insensitively like ICU collation', () => {
    expect(compare('apple', 'Banana')).toBeLessThan(0);
    expect(compare('Banana', 'apple')).toBeGreaterThan(0);
    expect(compare('apple', 'apple')).toBe(0);
  });

  test('sorts accented characters near their unaccented equivalent', () => {
    expect(compare('cafe', 'café')).toBeLessThanOrEqual(0);
  });
});

describe('strtoupper', () => {
  test('uppercases plain text', () => {
    expect(strtoupper('smith')).toBe('SMITH');
  });
});

describe('textScript', () => {
  test('detects Latin script', () => {
    expect(textScript('Smith')).toBe('Latn');
  });

  test('detects Hebrew script', () => {
    expect(textScript('בית')).toBe('Hebr');
  });

  test('detects Cyrillic script', () => {
    expect(textScript('Иванов')).toBe('Cyrl');
  });

  test('defaults to Latn when no recognized letter is found', () => {
    expect(textScript('123 !@#')).toBe('Latn');
    expect(textScript('')).toBe('Latn');
  });

  test('skips leading punctuation/digits to find the first real letter', () => {
    expect(textScript('123 בית')).toBe('Hebr');
  });
});
