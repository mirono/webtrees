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

import { AbstractEncoding } from './abstract-encoding.js';

// Ported from app/Encodings/UTF8.php (task 16).
//
// Unlike every other class in lib/encodings/, this one does NOT fit the
// "fromUtf8: text -> byte string, toUtf8: byte string -> text" convention
// documented in abstract-encoding.js. Its real job (in both directions —
// the PHP source's toUtf8() just calls fromUtf8()) is to validate and
// repair a byte string that's *supposed* to be UTF-8 but might not be:
// PHP calls mb_convert_encoding($text, 'UTF-8', 'UTF-8') with the
// substitute character forced to U+FFFD, which repairs invalid byte
// sequences in place. Both methods here therefore take AND return a byte
// string, not text.
//
// Verified against real PHP execution across a wide range of malformed
// inputs (lone continuation bytes, truncated multi-byte sequences,
// invalid lead bytes, overlong encodings, encoded surrogates, valid
// 4-byte/astral sequences): PHP's mb_convert_encoding cleanup and Node's
// built-in TextDecoder('utf-8', { fatal: false }) implement the same
// algorithm (the WHATWG Encoding Standard's UTF-8 decoder) and produced
// byte-for-byte identical output on every case tried. See
// docs/php-to-js-migration/task-16-encodings.md and
// golden/encodings_utf8_cleanup.json.
// ignoreBOM: true is required — TextDecoder strips a leading BOM by
// default, but PHP's mb_convert_encoding does not (a BOM is already valid
// UTF-8, so PHP's fast "already valid, return unchanged" path leaves it
// in place). Verified against real PHP execution.
const DECODER = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
const ENCODER = new TextEncoder();

function byteStringToBytes(byteString) {
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    bytes[i] = byteString.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function bytesToByteString(bytes) {
  let out = '';
  for (const byte of bytes) {
    out += String.fromCharCode(byte);
  }
  return out;
}

/**
 * Validate/repair (potentially invalid) UTF-8, in place.
 */
export class UTF8 extends AbstractEncoding {
  static NAME = 'UTF-8';

  static BYTE_ORDER_MARK = '\xef\xbb\xbf';
  static REPLACEMENT_CHARACTER = '\xef\xbf\xbd';

  /**
   * Repair a byte string that is supposed to be UTF-8. Takes and returns a
   * byte string (not text) — see the file-level note above.
   */
  fromUtf8(text) {
    const cleaned = DECODER.decode(byteStringToBytes(text));

    return bytesToByteString(ENCODER.encode(cleaned));
  }

  /**
   * Identical to fromUtf8() — the PHP source's toUtf8() just delegates to
   * fromUtf8() for this class.
   */
  toUtf8(text) {
    return this.fromUtf8(text);
  }
}
