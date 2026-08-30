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

// Port of app/Services/RomanNumeralsService.php (numberToRomanNumerals()
// only — romanNumeralsToNumber() has no caller in the app/Date/ port,
// see task-11's scope notes). Only used by FrenchDate::formatLongYear().
//
// Ordered as an array of [key, value] pairs, not a plain object — same
// trap as JewishCalendar's Hebrew-numerals table (task 10): the keys
// here (1000, 900, 500, ...) are integer-like, so a plain object would
// have Object.keys() silently reorder them ascending and break the
// greedy-largest-first algorithm.
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
