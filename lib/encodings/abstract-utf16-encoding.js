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

// Ported from app/Encodings/AbstractUTF16Encoding.php (task 16).
//
// This port faithfully reproduces two real bugs found (and verified
// against live PHP execution) in the original, documented in full in
// docs/php-to-js-migration/task-16-encodings.md:
//
// 1. fromUtf8()'s PHP source has an operator-precedence bug
//    (`$code_point << 6 + $byte2 & 0x3F` parses as
//    `($code_point << (6 + $byte2)) & 0x3F`, not the intended
//    `($code_point << 6) + ($byte2 & 0x3F)`). The resulting shift amount
//    always exceeds 64 bits for any 2- or 3-byte UTF-8 input character, so
//    PHP's "shift by >= width is 0" rule means the decoded code point is
//    *always* exactly 0 — i.e. every non-ASCII character silently becomes
//    NUL. This is live: ExportGedcomClient.php and ClippingsCartModule.php
//    both offer "UTF-16" as a real GEDCOM export encoding choice, so
//    exporting a GEDCOM as UTF-16 today destroys every accented character.
// 2. toUtf8() explicitly treats decoded code points U+0080-U+00FF (the
//    entire Latin-1 Supplement block — ordinary accented Latin letters)
//    as "invalid" and emits U+FFFD instead of decoding them. Any GEDCOM
//    imported as UTF-16 (some legacy Windows genealogy software exports
//    GEDCOM with a "UNICODE" CHAR label, which webtrees maps to
//    UTF-16BE/LE) that contains common accented characters shows them as
//    the replacement character on import.
//
// Also note (a design limitation, not a bug per se): fromUtf8() has no
// branch for 4-byte/astral UTF-8 sequences — a lead byte 0xF0-0xFF falls
// into the generic "invalid" case, and its 3 continuation bytes are then
// each independently visited by the same byte-at-a-time loop and found
// "invalid" too, producing 4 replacement characters for one astral input
// character. toUtf8() likewise never combines a UTF-16 surrogate pair —
// each 16-bit unit is decoded (or rejected) independently.

/**
 * Convert between an encoding and UTF-16. Subclasses implement the
 * byte-order-specific characterToCodePoint()/codePointToCharacter() pair
 * and define REPLACEMENT_CHARACTER (a 2-byte string in that byte order).
 */
export class AbstractUTF16Encoding {
  static REPLACEMENT_CHARACTER = '';

  /**
   * Convert text (a real Unicode string) into this encoding (a byte string).
   */
  fromUtf8(text) {
    const ctor = this.constructor;

    let out = '';
    for (const char of text) {
      const codePoint = char.codePointAt(0);

      if (codePoint <= 0x7f) {
        out += this.codePointToCharacter(codePoint);
      } else if (codePoint <= 0xffff) {
        // 2- or 3-byte UTF-8 range: see bug (1) above. Always zero.
        out += this.codePointToCharacter(0);
      } else {
        // 4-byte/astral range: see the design-limitation note above.
        out += ctor.REPLACEMENT_CHARACTER.repeat(4);
      }
    }

    return out;
  }

  /**
   * Convert a byte string in this encoding into text (a real Unicode string).
   */
  toUtf8(text) {
    let utf8 = '';

    for (let i = 0; i < text.length; i += 2) {
      const character = text.slice(i, i + 2);
      const codePoint = this.characterToCodePoint(character);

      if (codePoint <= 0x7f) {
        utf8 += String.fromCodePoint(codePoint);
      } else if (codePoint <= 0xff) {
        // See bug (2) above: U+0080-U+00FF is treated as invalid.
        utf8 += '�';
      } else if (codePoint <= 0xd7ff || codePoint >= 0xe000) {
        utf8 += String.fromCodePoint(codePoint);
      } else {
        // U+D800-U+DFFF: lone surrogate units are never combined/valid here.
        utf8 += '�';
      }
    }

    return utf8;
  }

  /**
   * When reading multi-byte encodings using a stream, we must avoid
   * incomplete characters.
   */
  convertibleBytes(text) {
    return 2 * Math.floor(text.length / 2);
  }

  /**
   * Convert two raw bytes (a 2-character byte string) to a code point,
   * taking care of byte order.
   */
  // eslint-disable-next-line no-unused-vars
  characterToCodePoint(character) {
    throw new Error('Not implemented');
  }

  /**
   * Convert a code point to two raw bytes (a 2-character byte string),
   * taking care of byte order.
   */
  // eslint-disable-next-line no-unused-vars
  codePointToCharacter(codePoint) {
    throw new Error('Not implemented');
  }
}
