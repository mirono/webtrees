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

// Port of app/Report/AbstractTextMeasurer.php (task 20).
//
// Works on real Unicode text (codepoint indexing via Array.from, matching
// PHP's mb_strlen()/mb_substr()), same convention used in lib/gedcom-date.js
// and lib/services/gedcom-export-service.js.

// app/Encodings/UTF8.php's named constants for these three characters —
// not re-exported from lib/encodings/utf8.js, which only ports the byte-
// level conversion logic, not its ~200 named Unicode-character constants.
const HORIZONTAL_ELLIPSIS = '…';
const FIRST_STRONG_ISOLATE = '⁨';
const POP_DIRECTIONAL_ISOLATE = '⁩';

function countOccurrences(text, char) {
  let count = 0;
  for (const c of text) {
    if (c === char) {
      count++;
    }
  }

  return count;
}

/**
 * Base class for text measurers, providing shared truncation logic.
 * Subclasses must implement getStringWidth(text, style).
 */
export class AbstractTextMeasurer {
  // eslint-disable-next-line no-unused-vars
  getStringWidth(text, style) {
    throw new Error('Not implemented');
  }

  truncate(text, width, style, ellipsis = HORIZONTAL_ELLIPSIS) {
    return text
      .split('\n')
      .map((line) => this.truncateLine(line, width, style, ellipsis))
      .join('\n');
  }

  truncateLine(text, width, style, ellipsis = HORIZONTAL_ELLIPSIS) {
    if (this.getStringWidth(text, style) <= width) {
      return text;
    }

    const targetWidth = width - this.getStringWidth(ellipsis, style);
    const chars = Array.from(text);

    for (let length = chars.length; length > 0; length--) {
      const substring = chars.slice(0, length).join('');

      if (this.getStringWidth(substring, style) < targetWidth) {
        const countFsi = countOccurrences(substring, FIRST_STRONG_ISOLATE);
        const countPdi = countOccurrences(substring, POP_DIRECTIONAL_ISOLATE);

        return substring + POP_DIRECTIONAL_ISOLATE.repeat(countFsi - countPdi) + ellipsis;
      }
    }

    // Nothing fits?
    return ellipsis;
  }
}
