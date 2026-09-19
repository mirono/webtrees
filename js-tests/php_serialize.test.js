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

  test('throws UnsupportedPhpValueTypeError for a value type this codec does not model (e.g. array)', () => {
    // A minimal PHP array serialization: a:0:{}
    expect(() => decodePhpSession('some_key|a:0:{}')).toThrow(UnsupportedPhpValueTypeError);
  });
});
