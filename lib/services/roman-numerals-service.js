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

// Port of app/Services/RomanNumeralsService.php
// See docs/php-to-js-migration/task-14-roman-numerals-service.md

// Ordered as an array of [key, value] pairs, not a plain object — same
// trap as JewishCalendar's Hebrew-numerals table (task 10): the keys
// here (1000, 900, 500, ...) are integer-like, so a plain object would
// have Object.keys() silently reorder them ascending and break the
// greedy-largest-first algorithm. This is not a JS quirk unique to objects —
// any attempt to rely on property iteration order for numeric-looking keys
// will fail the same way.
const ROMAN_NUMERALS = [
  [1000, 'M'],
  [900, 'CM'],
  [500, 'D'],
  [400, 'CD'],
  [100, 'C'],
  [90, 'XC'],
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/**
 * Convert a number to its Roman numeral representation.
 * Numbers less than 1 are returned as their string representation (not converted).
 * There is no upper bound enforced — this algorithm will represent arbitrarily
 * large numbers by repeating the largest symbol ('M' for 1000).
 *
 * @param {number} number
 * @returns {string}
 */
export function numberToRomanNumerals(number) {
  if (number < 1) {
    return String(number);
  }

  let roman = '';
  for (const [key, value] of ROMAN_NUMERALS) {
    while (number >= key) {
      roman += value;
      number -= key;
    }
  }

  return roman;
}

/**
 * Convert a Roman numeral string to its numeric value.
 *
 * This function uses a greedy algorithm: it iterates through the ROMAN_NUMERALS
 * table in descending order of value and strips recognized Roman numeral chunks
 * from the front of the input string, accumulating their values.
 *
 * Important behavioral notes (not bug fixes — this is the actual PHP behavior):
 * - Empty string returns 0.
 * - The algorithm is case-sensitive (PHP's str_starts_with is case-sensitive).
 *   Lowercase input like "mcmxciv" will not match "MCMXCIV" and will return 0.
 * - The algorithm does NOT validate Roman numeral syntax. It does NOT enforce
 *   canonical form rules (e.g., "IIII" is accepted as 4, not rejected).
 *   It does NOT reject subtraction-rule violations (e.g., "VX" is accepted as 5,
 *   not rejected as invalid).
 * - When the algorithm encounters a character (or sequence) it doesn't recognize,
 *   it simply stops processing and returns the accumulated value so far.
 *   Trailing garbage like "XIVfoo" is silently ignored (returns 14 for the "XIV"
 *   part, ignores "foo").
 *
 * @param {string} roman
 * @returns {number}
 */
export function romanNumeralsToNumber(roman) {
  let num = 0;
  for (const [key, value] of ROMAN_NUMERALS) {
    while (roman.startsWith(value)) {
      num += key;
      roman = roman.substring(value.length);
    }
  }
  return num;
}
