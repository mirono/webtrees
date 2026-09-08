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

// Ported from app/Encodings/AbstractEncoding.php (task 16). See
// docs/php-to-js-migration/task-16-encodings.md for the byte-string vs.
// real-Unicode-string convention this whole lib/encodings/ tree uses:
// a "byte string" is a JS string where each UTF-16 code unit represents
// one raw byte (value 0-255) of the source/target legacy encoding — the
// same convention Node's Buffer.toString('latin1') uses. "text" is a real,
// fully-decoded JS Unicode string. Each subclass's toUtf8() takes a byte
// string and returns text; fromUtf8() takes text and returns a byte string.

/**
 * Convert between an encoding and UTF-8. Subclasses override TO_UTF8 (a
 * map of single raw source byte -> decoded UTF-8 text) and, optionally,
 * REPLACEMENT_CHARACTER (the byte substituted for text with no mapping —
 * PHP's default is '?').
 */
export class AbstractEncoding {
  static REPLACEMENT_CHARACTER = '?';

  static TO_UTF8 = {};

  /**
   * Convert text (a real Unicode string) into this encoding (a byte string).
   */
  fromUtf8(text) {
    const ctor = this.constructor;

    // array_flip(TO_UTF8): decoded text -> raw byte. PHP's array_flip keeps
    // the *last* key for a duplicate value; iterating TO_UTF8's entries in
    // declaration order and overwriting on collision reproduces that.
    const utf8 = {};
    for (const [byte, char] of Object.entries(ctor.TO_UTF8)) {
      utf8[char] = byte;
    }
    utf8['�'] = ctor.REPLACEMENT_CHARACTER;

    let out = '';
    for (const char of text) {
      if (char.codePointAt(0) < 128) {
        out += char;
      } else {
        out += utf8[char] ?? ctor.REPLACEMENT_CHARACTER;
      }
    }

    return out;
  }

  /**
   * Convert a byte string in this encoding into text (a real Unicode string).
   */
  toUtf8(text) {
    const table = this.constructor.TO_UTF8;

    let out = '';
    for (let i = 0; i < text.length; i++) {
      const byte = text[i];
      out += table[byte] ?? byte;
    }

    return out;
  }

  /**
   * When reading multi-byte encodings using a stream, we must avoid
   * incomplete characters. Returns how many leading bytes of `text` (a byte
   * string in this encoding) are safe to consume.
   */
  convertibleBytes(text) {
    const safeChars = [this.fromUtf8('\n'), this.fromUtf8('\r'), this.fromUtf8(' ')];

    for (const char of safeChars) {
      const pos = text.lastIndexOf(char);

      if (pos !== -1) {
        return pos + char.length;
      }
    }

    return 0;
  }
}
