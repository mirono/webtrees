import { describe, expect, test } from 'vitest';
import { generateCsrfToken, isValidCsrf } from '../pages-server/csrf.mjs';

describe('generateCsrfToken', () => {
  test('produces a non-empty hex string, different each call', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();

    expect(a).toMatch(/^[0-9a-f]+$/);
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});

describe('isValidCsrf', () => {
  test('matching cookie and form token is valid', () => {
    expect(isValidCsrf({ wt_node_csrf: 'abc123' }, 'abc123')).toBe(true);
  });

  test('mismatched tokens are invalid', () => {
    expect(isValidCsrf({ wt_node_csrf: 'abc123' }, 'wrong')).toBe(false);
  });

  test('missing cookie is invalid, even with a form token', () => {
    expect(isValidCsrf({}, 'abc123')).toBe(false);
  });

  test('missing form token is invalid', () => {
    expect(isValidCsrf({ wt_node_csrf: 'abc123' }, null)).toBe(false);
  });

  test('empty cookie value is invalid', () => {
    expect(isValidCsrf({ wt_node_csrf: '' }, '')).toBe(false);
  });
});
