import { describe, expect, test } from 'vitest';
import { encodePhpSession, decodePhpSession, UnsupportedPhpValueTypeError } from '../pages-server/php-serialize.mjs';

describe('encodePhpSession / decodePhpSession round trips', () => {
  test('int', () => {
    expect(encodePhpSession({ wt_user: 5 })).toBe('wt_user|i:5;');
    expect(decodePhpSession('wt_user|i:5;')).toEqual({ wt_user: 5 });
  });

  test('bool true and false', () => {
    expect(encodePhpSession({ initiated: true })).toBe('initiated|b:1;');
    expect(encodePhpSession({ initiated: false })).toBe('initiated|b:0;');
    expect(decodePhpSession('initiated|b:1;')).toEqual({ initiated: true });
    expect(decodePhpSession('initiated|b:0;')).toEqual({ initiated: false });
  });

  test('string', () => {
    expect(encodePhpSession({ language: 'en-US' })).toBe('language|s:5:"en-US";');
    expect(decodePhpSession('language|s:5:"en-US";')).toEqual({ language: 'en-US' });
  });

  test('null', () => {
    expect(encodePhpSession({ theme: null })).toBe('theme|N;');
    expect(decodePhpSession('theme|N;')).toEqual({ theme: null });
  });

  test('empty string', () => {
    expect(encodePhpSession({ theme: '' })).toBe('theme|s:0:"";');
    expect(decodePhpSession('theme|s:0:"";')).toEqual({ theme: '' });
  });

  test('a realistic full session object', () => {
    const session = {
      initiated: true,
      CSRF_TOKEN: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
      wt_user: 5,
      language: 'en-US',
      theme: '',
    };
    const encoded = encodePhpSession(session);

    expect(decodePhpSession(encoded)).toEqual(session);
  });

  // The sharpest edge case: PHP's "s:N:" length is a BYTE count, not a
  // character count - multi-byte UTF-8 must use Buffer.byteLength, not
  // .length, or PHP's own unserialize() would desync reading the value.
  test('multi-byte UTF-8 byte-length: café (4 chars, 5 bytes)', () => {
    const encoded = encodePhpSession({ name: 'café' });

    expect(encoded).toBe('name|s:5:"café";');
    expect('café'.length).toBe(4); // sanity: JS char length differs from byte length
    expect(decodePhpSession(encoded)).toEqual({ name: 'café' });
  });

  test('multi-byte UTF-8 byte-length: an emoji (surrogate pair in UTF-16, 4 bytes in UTF-8)', () => {
    const encoded = encodePhpSession({ name: '😀' });

    expect(encoded).toBe('name|s:4:"😀";');
    expect(decodePhpSession(encoded)).toEqual({ name: '😀' });
  });

  test('multi-byte UTF-8 byte-length: CJK text', () => {
    const encoded = encodePhpSession({ name: '日本語' });

    expect(decodePhpSession(encoded)).toEqual({ name: '日本語' });
  });

  test('a string value containing literal quote and semicolon characters decodes correctly', () => {
    const value = 'a "quoted" value; with a semicolon';
    const encoded = encodePhpSession({ real_name: value });

    expect(decodePhpSession(encoded)).toEqual({ real_name: value });
  });

  test('multiple keys concatenate with no separator between entries', () => {
    const encoded = encodePhpSession({ a: 1, b: true, c: 'x' });

    expect(encoded).toBe('a|i:1;b|b:1;c|s:1:"x";');
  });
});

describe('decodePhpSession error handling', () => {
  test('throws on truncated/malformed input rather than silently returning {}', () => {
    expect(() => decodePhpSession('wt_user|i:5')).toThrow(); // missing trailing ";"
    expect(() => decodePhpSession('wt_user|s:10:"short";')).toThrow(); // declared length overruns buffer
  });

  test('throws UnsupportedPhpValueTypeError for a genuinely unrecognized type tag', () => {
    // "X" is not a real PHP serialize() type tag (real ones: i/b/N/d/s/a/O) -
    // this scanner can't bound an unknown type's length, so it must throw
    // rather than guess.
    expect(() => decodePhpSession('some_key|X:0:{}')).toThrow(UnsupportedPhpValueTypeError);
  });
});

// Real PHP writes float/array/object values into $_SESSION for
// features this migration hasn't ported yet - e.g. ClipboardService's
// 'clipboard' key (an array) and FlashMessages' 'flash_messages' key
// (an array of stdClass objects), both confirmed live during actual
// testing of this codebase. A route that decodes an EXISTING session
// must preserve these byte-for-byte even though it doesn't understand
// them, or an ordinary action (switching language/theme) could
// silently corrupt/lose a real user's session. These are NOT decoded
// into JS values - just opaquely round-tripped.
describe('opaque round-tripping of float/array/object values', () => {
  test('a float value round-trips byte-identically', () => {
    const encoded = 'pi|d:3.14;';
    const decoded = decodePhpSession(encoded);

    expect(encodePhpSession(decoded)).toBe(encoded);
  });

  test('a flat array round-trips byte-identically', () => {
    const encoded = 'clipboard|a:2:{s:4:"fact";s:4:"NAME";s:6:"gedcom";s:4:"1234";}';
    const decoded = decodePhpSession(encoded);

    expect(encodePhpSession(decoded)).toBe(encoded);
  });

  test('a nested array round-trips byte-identically', () => {
    const encoded = 'nested|a:1:{s:1:"a";a:1:{s:1:"b";a:1:{s:1:"c";i:1;}}}';
    const decoded = decodePhpSession(encoded);

    expect(encodePhpSession(decoded)).toBe(encoded);
  });

  test('an object (including a private property\'s name-mangled string) round-trips byte-identically', () => {
    // Real PHP output for `class Foo { private $secret = "hidden"; public $visible = "shown"; }`
    const encoded = 'obj|O:3:"Foo":2:{s:11:" Foo secret";s:6:"hidden";s:7:"visible";s:5:"shown";}';
    const decoded = decodePhpSession(encoded);

    expect(encodePhpSession(decoded)).toBe(encoded);
  });

  test('an array of objects round-trips byte-identically (matches FlashMessages\' real shape)', () => {
    const encoded = 'flash_messages|a:1:{i:0;O:8:"stdClass":2:{s:4:"text";s:2:"Hi";s:6:"status";s:4:"info";}}';
    const decoded = decodePhpSession(encoded);

    expect(encodePhpSession(decoded)).toBe(encoded);
  });

  test('a full realistic session with mixed real and opaque values round-trips exactly, and a mutation to a real field leaves opaque fields untouched', () => {
    // Confirmed against actual `php -r '... echo session_encode();'` output.
    const encoded =
      'initiated|b:1;CSRF_TOKEN|s:6:"abc123";wt_user|i:4;' +
      'clipboard|a:2:{s:5:"fact1";a:2:{s:4:"fact";s:4:"NAME";s:6:"gedcom";s:19:"1 NAME John /Smith/";}s:5:"fact2";s:12:"plain string";}' +
      'a_float|d:3.14;' +
      'nested|a:1:{s:1:"a";a:1:{s:1:"b";a:1:{s:1:"c";i:1;}}}' +
      'obj|O:3:"Foo":2:{s:11:" Foo secret";s:6:"hidden";s:7:"visible";s:5:"shown";}' +
      'flash_messages|a:1:{i:0;O:8:"stdClass":2:{s:4:"text";s:2:"Hi";s:6:"status";s:4:"info";}}';

    const decoded = decodePhpSession(encoded);

    expect(decoded.initiated).toBe(true);
    expect(decoded.CSRF_TOKEN).toBe('abc123');
    expect(decoded.wt_user).toBe(4);
    expect(encodePhpSession(decoded)).toBe(encoded);

    decoded.language = 'en-US';
    expect(encodePhpSession(decoded)).toBe(`${encoded}language|s:5:"en-US";`);
  });

  test('opaque values are not exposed as plain JS values (no accidental collision with a real string/number)', () => {
    const decoded = decodePhpSession('clipboard|a:0:{}');

    expect(typeof decoded.clipboard).toBe('object');
    expect(decoded.clipboard).not.toBeNull();
    expect(typeof decoded.clipboard).not.toBe('string');
    expect(typeof decoded.clipboard).not.toBe('number');
  });
});
