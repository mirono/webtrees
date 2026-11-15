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

// A codec for PHP's session.serialize_handler=php format (the format
// wt_session.session_data is stored in - confirmed via
// `php -i | grep serialize_handler` => "php", not "php_serialize" or
// JSON). Format: repeated "key|serialized_value" fragments
// concatenated with NO separator between entries - key names are raw,
// |-terminated, never serialize()-encoded themselves.
//
// Needed because /login is the one route where Node must WRITE a
// session PHP will recognize, not just read one PHP already wrote (see
// docs/php-to-js-migration/phase5-first-node-route.md and the login
// route's own doc for the full reasoning) - Auth::id() on every real
// PHP page reads $_SESSION['wt_user'] from this exact blob, not the
// denormalized wt_session.user_id column pages-server/auth.mjs reads.
//
// This app's own Session::put() call sites (grepped across app/) only
// ever write int/bool/string/null - but PHP itself writes other value
// kinds into $_SESSION for features this migration hasn't touched yet
// (e.g. ClipboardService stores an array under 'clipboard',
// FlashMessages stores an array of stdClass objects under
// 'flash_messages' - confirmed live: a real session hit during testing
// contained exactly this). A route that decodes an EXISTING session
// (currently just /login, and soon anything else that writes to a
// session that might already be mid-use) must not lose or corrupt
// those values just because it doesn't understand them, or a routine
// action like switching language/theme could silently end an ordinary
// user's real login session. So: int/bool/string/null decode to real
// JS values; float/object decode to an opaque wrapper carrying their
// exact original bytes, which re-encode byte-for-byte unchanged -
// never interpreted, never lost. Arrays ('a') ARE decoded/encoded for
// real (needed by phase 5 step 48's clipboard feature, which stores a
// nested PHP associative array under the session's 'clipboard' key) -
// into a plain JS object (even an int-keyed PHP array, since JS object
// keys are always strings anyway), re-encoded the same way in reverse
// (a JS *Array* passed in also encodes as a dense int-keyed PHP array,
// for convenience, though nothing here currently writes one). Objects
// ('O' - e.g. FlashMessages' array-of-stdClass, which this migration
// doesn't write) remain opaque, same as floats. Only a genuinely
// malformed blob (or a value type this scanner can't even bound - none
// observed in practice; PHP's serialize() only emits i/b/N/d/s/a/O)
// still throws.

const OPAQUE = Symbol('phpSerializeOpaque');

/**
 * Thrown by decodePhpSession() only for a value type this scanner
 * can't bound at all (not one of i/b/N/d/s/a/O) or genuinely malformed
 * input. Exported so callers can catch it specifically and fall back
 * to treating the session as unreadable, rather than crashing the
 * whole request.
 */
export class UnsupportedPhpValueTypeError extends Error {
  constructor(typeTag, fragmentStart) {
    super(`php-serialize: unsupported value type "${typeTag}" at byte offset ${fragmentStart}`);
    this.name = 'UnsupportedPhpValueTypeError';
    this.typeTag = typeTag;
  }
}

/**
 * @param {Record<string, unknown>} session
 * @returns {string}
 */
export function encodePhpSession(session) {
  let out = '';

  for (const [key, value] of Object.entries(session)) {
    out += `${key}|${encodeValue(value)}`;
  }

  return out;
}

function encodeValue(value) {
  if (value !== null && typeof value === 'object' && OPAQUE in value) {
    return value[OPAQUE];
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new TypeError(`php-serialize: only integer numbers are supported, got ${value}`);
    }

    return `i:${value};`;
  }

  if (typeof value === 'boolean') {
    return `b:${value ? 1 : 0};`;
  }

  if (typeof value === 'string') {
    return `s:${Buffer.byteLength(value, 'utf8')}:"${value}";`;
  }

  if (value === null) {
    return 'N;';
  }

  if (Array.isArray(value)) {
    const body = value.map((item, index) => encodeArrayKey(index) + encodeValue(item)).join('');
    return `a:${value.length}:{${body}}`;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    const body = entries.map(([key, item]) => encodeArrayKey(key) + encodeValue(item)).join('');
    return `a:${entries.length}:{${body}}`;
  }

  throw new TypeError(`php-serialize: unsupported value type for encoding: ${typeof value}`);
}

/** PHP arrays canonicalize a decimal-integer-looking string key to an int key. */
function encodeArrayKey(key) {
  if (typeof key === 'number' || /^(0|-?[1-9]\d*)$/.test(String(key))) {
    return `i:${key};`;
  }

  return `s:${Buffer.byteLength(String(key), 'utf8')}:"${key}";`;
}

class Cursor {
  constructor(data) {
    this.data = data;
    this.pos = 0;
  }

  atEnd() {
    return this.pos >= this.data.length;
  }

  /** Reads up to (and consumes) the next occurrence of `char`, not including it. */
  readUntil(char) {
    const index = this.data.indexOf(char, this.pos);

    if (index === -1) {
      throw new Error(`php-serialize: malformed input - expected "${char}" after position ${this.pos}`);
    }

    const value = this.data.slice(this.pos, index);

    this.pos = index + 1;

    return value;
  }

  /** Reads and consumes exactly `n` bytes (measured in UTF-8 bytes, not JS string length). */
  readBytes(n) {
    const bytes = Buffer.from(this.data.slice(this.pos), 'utf8').subarray(0, n);

    if (bytes.length < n) {
      throw new Error('php-serialize: malformed input - declared string length overruns the buffer');
    }

    const text = bytes.toString('utf8');

    this.pos += text.length;

    return text;
  }

  expect(char) {
    if (this.data[this.pos] !== char) {
      throw new Error(`php-serialize: malformed input - expected "${char}" at position ${this.pos}`);
    }

    this.pos += 1;
  }

  peek() {
    return this.data[this.pos];
  }
}

/**
 * @param {string} data
 * @returns {Record<string, unknown>}
 */
export function decodePhpSession(data) {
  const cursor = new Cursor(data);
  const session = {};

  while (!cursor.atEnd()) {
    const key = cursor.readUntil('|');
    const value = decodeOneValue(cursor);

    session[key] = value;
  }

  return session;
}

/** Decodes int/bool/null/string/array to real JS values; wraps float/object opaquely. */
function decodeOneValue(cursor) {
  const start = cursor.pos;
  const type = cursor.peek();

  switch (type) {
    case 'i': {
      cursor.pos += 2; // "i:"
      const raw = cursor.readUntil(';');
      return Number.parseInt(raw, 10);
    }
    case 'b': {
      cursor.pos += 2; // "b:"
      const raw = cursor.readUntil(';');
      return raw === '1';
    }
    case 'N': {
      cursor.pos += 1; // "N"
      cursor.expect(';');
      return null;
    }
    case 's': {
      return readStringValue(cursor);
    }
    case 'a': {
      return decodeArrayValue(cursor);
    }
    case 'd':
    case 'O': {
      skipValue(cursor);

      return { [OPAQUE]: cursor.data.slice(start, cursor.pos) };
    }
    default: {
      if (type === undefined) {
        throw new Error('php-serialize: malformed input - unexpected end of data reading a value');
      }

      throw new UnsupportedPhpValueTypeError(type, start);
    }
  }
}

/**
 * Decodes an "a:N:{key;value;...}"-shaped PHP array. Returns a dense
 * JS array if the keys are exactly the sequential ints 0..N-1 in that
 * order (what PHP itself would print for a `list`-style array, and
 * what `encodeValue()` produces for a JS array round-tripped through
 * here), otherwise a plain object keyed by the (always-string, as PHP
 * ints decode to JS numbers but object keys stringify them anyway)
 * original keys.
 */
function decodeArrayValue(cursor) {
  cursor.pos += 2; // "a:"
  const count = Number.parseInt(cursor.readUntil(':'), 10);

  cursor.expect('{');

  const entries = [];
  for (let i = 0; i < count; i += 1) {
    const key = decodeOneValue(cursor);
    const value = decodeOneValue(cursor);
    entries.push([key, value]);
  }

  cursor.expect('}');

  // An empty PHP array is ambiguous (could become either shape once
  // populated) - decoded as a plain object, since every real caller
  // here (ClipboardService's per-record-type sub-array) assigns
  // string keys onto it, not sequential indices.
  const isDenseList = entries.length > 0 && entries.every(([key], index) => key === index);

  if (isDenseList) {
    return entries.map(([, value]) => value);
  }

  const result = {};
  for (const [key, value] of entries) {
    result[key] = value;
  }
  return result;
}

/**
 * Reads a "s:LEN:"...";"-shaped string value, returning its decoded
 * content. Length is a BYTE count (Buffer.byteLength), not a JS
 * character count - the sharpest correctness edge in this whole file,
 * since e.g. 'café' is 4 JS characters but 5 UTF-8 bytes.
 */
function readStringValue(cursor) {
  cursor.pos += 2; // "s:"
  const lengthStr = cursor.readUntil(':');
  const length = Number.parseInt(lengthStr, 10);

  cursor.expect('"');
  const value = cursor.readBytes(length);
  cursor.expect('"');
  cursor.expect(';');

  return value;
}

/**
 * Advances the cursor past ONE value of any kind (scalar or
 * compound), without necessarily extracting its meaning - used both
 * to bound a top-level float/array/object value for opaque capture,
 * and internally for each element of an array/object's own key-value
 * pairs (which can themselves be arbitrarily nested).
 *
 * Confirmed against real PHP output (`php -r 'session_start();
 * $_SESSION[...]=...; echo session_encode();'`) for every case here,
 * including a private property's name-mangled string (still just
 * ordinary length-prefixed bytes - no special-casing needed) and
 * nested arrays.
 */
function skipValue(cursor) {
  const type = cursor.peek();

  switch (type) {
    case 'i':
    case 'b':
    case 'd': {
      cursor.pos += 2; // "i:" / "b:" / "d:"
      cursor.readUntil(';');
      return;
    }
    case 'N': {
      cursor.pos += 1;
      cursor.expect(';');
      return;
    }
    case 's': {
      readStringValue(cursor);
      return;
    }
    case 'a': {
      cursor.pos += 2; // "a:"
      const count = Number.parseInt(cursor.readUntil(':'), 10);

      cursor.expect('{');
      for (let i = 0; i < count * 2; i++) {
        skipValue(cursor); // each of a key and its value is itself a typed value
      }
      cursor.expect('}');
      return;
    }
    case 'O': {
      cursor.pos += 2; // "O:"
      const nameLen = Number.parseInt(cursor.readUntil(':'), 10);

      cursor.expect('"');
      cursor.readBytes(nameLen);
      cursor.expect('"');
      cursor.expect(':');

      const count = Number.parseInt(cursor.readUntil(':'), 10);

      cursor.expect('{');
      for (let i = 0; i < count * 2; i++) {
        skipValue(cursor); // property name, then its value
      }
      cursor.expect('}');
      return;
    }
    default: {
      if (type === undefined) {
        throw new Error('php-serialize: malformed input - unexpected end of data reading a value');
      }

      throw new UnsupportedPhpValueTypeError(type, cursor.pos);
    }
  }
}
