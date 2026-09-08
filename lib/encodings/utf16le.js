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

import { AbstractUTF16Encoding } from './abstract-utf16-encoding.js';

/**
 * Convert between UTF-16LE and UTF-8.
 * Ported from app/Encodings/UTF16LE.php (task 16).
 */
export class UTF16LE extends AbstractUTF16Encoding {
  static NAME = 'UTF-16LE';

  static BYTE_ORDER_MARK = '\xff\xfe';
  static REPLACEMENT_CHARACTER = '\xfd\xff';

  characterToCodePoint(character) {
    return character.charCodeAt(0) + 256 * character.charCodeAt(1);
  }

  codePointToCharacter(codePoint) {
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) {
      return this.constructor.REPLACEMENT_CHARACTER;
    }

    return String.fromCharCode(codePoint % 256, Math.floor(codePoint / 256));
  }
}
