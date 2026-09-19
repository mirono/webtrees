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

// A minimal codec for PHP's session.serialize_handler=php format (the
// format wt_session.session_data is stored in - confirmed via
// `php -i | grep serialize_handler` => "php", not "php_serialize" or
// JSON). This is NOT a general PHP serialize()/unserialize()
// implementation - it only models the 4 value kinds this app's own
// $_SESSION ever actually stores (confirmed by grepping every
// Session::put() call site in app/): int (wt_user), bool (initiated),
// string (CSRF_TOKEN/language/theme), and null. Format: repeated
// "key|serialized_value" fragments concatenated with NO separator
// between entries - key names are raw, |-terminated, never
// serialize()-encoded themselves.
//
// Needed because /login is the one route where Node must WRITE a
// session PHP will recognize, not just read one PHP already wrote (see
// docs/php-to-js-migration/phase5-first-node-route.md and the login
// route's own doc for the full reasoning) - Auth::id() on every real
// PHP page reads $_SESSION['wt_user'] from this exact blob, not the
// denormalized wt_session.user_id column pages-server/auth.mjs reads.

/**
 * Thrown by decodePhpSession() when a value's type tag isn't one of
 * i/b/N/s (see decodeOneValue()'s default case for why this can't be
 * handled more gracefully). Exported so callers can catch it
 * specifically and fall back to treating the session as unreadable,
 * rather than crashing the whole request.
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

  throw new TypeError(`php-serialize: unsupported value type for encoding: ${typeof value}`);
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
    const start = cursor.pos;
    const key = cursor.readUntil('|');
    const [value] = decodeOneValue(cursor, start);

    session[key] = value;
  }

  return session;
}

function decodeOneValue(cursor, fragmentStart) {
  const type = cursor.peek();

  switch (type) {
    case 'i': {
      cursor.pos += 2; // "i:"
      const raw = cursor.readUntil(';');
      return [Number.parseInt(raw, 10)];
    }
    case 'b': {
      cursor.pos += 2; // "b:"
      const raw = cursor.readUntil(';');
      return [raw === '1'];
    }
    case 'N': {
      cursor.pos += 1; // "N"
      if (cursor.data[cursor.pos] !== ';') {
        throw new Error('php-serialize: malformed input - expected ";" after "N"');
      }
      cursor.pos += 1;
      return [null];
    }
    case 's': {
      cursor.pos += 2; // "s:"
      const lengthStr = cursor.readUntil(':');
      const length = Number.parseInt(lengthStr, 10);

      if (cursor.data[cursor.pos] !== '"') {
        throw new Error('php-serialize: malformed input - expected opening quote for string value');
      }
      cursor.pos += 1;

      const value = cursor.readBytes(length);

      if (cursor.data[cursor.pos] !== '"') {
        throw new Error('php-serialize: malformed input - string byte length did not land on closing quote');
      }
      cursor.pos += 1;
      if (cursor.data[cursor.pos] !== ';') {
        throw new Error('php-serialize: malformed input - expected ";" after string value');
      }
      cursor.pos += 1;

      return [value];
    }
    default: {
      // A value type this app never itself writes (arrays, objects,
      // floats, ...) - confirmed via a site-wide grep of every
      // Session::put() call site that only int/bool/string/null are
      // ever stored. An array/object value's own serialization is
      // recursive and variable-length, so - without implementing a
      // full PHP unserialize() (deliberately out of scope) - there is
      // no safe way to determine where such a value ends in order to
      // capture it opaquely; guessing wrong would silently corrupt the
      // rest of the parse. Throw instead, so callers can fall back to
      // treating the session as unreadable (see
      // session-store.mjs::loadOrCreateAnonymousSession(), which starts
      // a fresh anonymous session rather than crashing the request).
      if (type === undefined) {
        throw new Error('php-serialize: malformed input - unexpected end of data reading a value');
      }

      throw new UnsupportedPhpValueTypeError(type, fragmentStart);
    }
  }
}
