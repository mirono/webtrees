import { describe, expect, test } from 'vitest';
import { sessionSetCookieHeader, newCsrfToken } from '../pages-server/session-store.mjs';

describe('sessionSetCookieHeader', () => {
  test('non-secure: uses the plain WT2_SESSION cookie name, no Secure attribute', () => {
    const header = sessionSetCookieHeader(false, 'abc123');

    expect(header).toBe('WT2_SESSION=abc123; Path=/; HttpOnly; SameSite=Lax');
  });

  test('secure: uses the __Secure- prefixed name (app/Session.php:52) and adds Secure', () => {
    const header = sessionSetCookieHeader(true, 'abc123');

    expect(header).toBe('__Secure-WT-ID=abc123; Path=/; HttpOnly; SameSite=Lax; Secure');
  });
});

describe('newCsrfToken', () => {
  test('generates a non-empty, sufficiently random-looking hex string', () => {
    const a = newCsrfToken();
    const b = newCsrfToken();

    expect(a).toMatch(/^[0-9a-f]{48}$/);
    expect(a).not.toBe(b);
  });
});
