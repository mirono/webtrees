import { describe, expect, test } from 'vitest';
import { parseCookies } from '../pages-server/auth.mjs';

describe('parseCookies', () => {
  test('undefined header yields an empty object', () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  test('a single cookie', () => {
    expect(parseCookies('WT2_SESSION=abc123')).toEqual({ WT2_SESSION: 'abc123' });
  });

  test('multiple cookies, PHP-style "; " separated', () => {
    expect(parseCookies('WT2_SESSION=abc123; other=xyz')).toEqual({
      WT2_SESSION: 'abc123',
      other: 'xyz',
    });
  });

  test('percent-encoded values are decoded', () => {
    expect(parseCookies('name=a%20b')).toEqual({ name: 'a b' });
  });

  test('a malformed percent-encoding falls back to the raw value rather than throwing', () => {
    expect(parseCookies('name=%zz')).toEqual({ name: '%zz' });
  });
});
