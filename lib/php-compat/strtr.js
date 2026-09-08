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

/**
 * PHP's strtr($text, $table) (the array-argument form): a single left-to-
 * right, non-overlapping scan of $text, where at each position the
 * *longest* matching key in $table is replaced (this matters whenever one
 * key is a prefix of another — e.g. ANSEL's PRECOMPOSED_CHARACTERS has
 * both "ă" and "ắ" as keys). Used instead of chained
 * String.replaceAll() calls, which apply one pattern at a time rather than
 * scanning once with all patterns considered together — the two only
 * coincide by accident, not by construction.
 */
export function phpStrtr(text, table) {
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);

  let out = '';
  let i = 0;
  outer: while (i < text.length) {
    for (const key of keys) {
      if (key !== '' && text.startsWith(key, i)) {
        out += table[key];
        i += key.length;
        continue outer;
      }
    }
    out += text[i];
    i += 1;
  }

  return out;
}

/**
 * PHP's array_flip(): swap keys and values. A duplicate value keeps the
 * *last* key that produced it, matching PHP's overwrite-on-collision
 * behavior for a simple left-to-right build.
 */
export function phpArrayFlip(table) {
  const flipped = {};

  for (const [key, value] of Object.entries(table)) {
    flipped[value] = key;
  }

  return flipped;
}
