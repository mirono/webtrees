import { describe, expect, test } from 'vitest';
import { isLocalPath, renderLoginPage } from '../pages-server/login-view.mjs';

describe('isLocalPath', () => {
  test('accepts a bare local path', () => {
    expect(isLocalPath('/')).toBe(true);
    expect(isLocalPath('/foo/bar')).toBe(true);
  });

  test('accepts a local path with a query string', () => {
    expect(isLocalPath('/foo?x=1')).toBe(true);
  });

  test('rejects a protocol-relative URL (different host)', () => {
    expect(isLocalPath('//evil.com')).toBe(false);
    expect(isLocalPath('//evil.com/path')).toBe(false);
  });

  test('rejects an absolute URL with a scheme', () => {
    expect(isLocalPath('http://evil.com')).toBe(false);
    expect(isLocalPath('https://evil.com/path')).toBe(false);
  });

  test('rejects a javascript: URL', () => {
    expect(isLocalPath('javascript:alert(1)')).toBe(false);
  });

  test('rejects empty string and null', () => {
    expect(isLocalPath('')).toBe(false);
    expect(isLocalPath(null)).toBe(false);
  });

  test('rejects a path not starting with "/"', () => {
    expect(isLocalPath('foo/bar')).toBe(false);
  });
});

describe('renderLoginPage', () => {
  test('includes dir="ltr" on <html> (Bootstrap/[dir]-scoped CSS regression, see account-view.mjs)', () => {
    const html = renderLoginPage({ csrfToken: 'tok', url: '/', username: '', canRegister: false, error: null });

    expect(html).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('renders the register link only when canRegister is true', () => {
    const withRegister = renderLoginPage({ csrfToken: 'tok', url: '/', username: '', canRegister: true, error: null });
    const withoutRegister = renderLoginPage({ csrfToken: 'tok', url: '/', username: '', canRegister: false, error: null });

    expect(withRegister).toContain('href="/register"');
    expect(withoutRegister).not.toContain('href="/register"');
  });

  test('renders the error message inline when present', () => {
    const html = renderLoginPage({ csrfToken: 'tok', url: '/', username: '', canRegister: false, error: 'Bad login' });

    expect(html).toContain('Bad login');
    expect(html).toContain('alert-danger');
  });

  test('renders the csrf token and prefilled username into the form', () => {
    const html = renderLoginPage({ csrfToken: 'abc123', url: '/', username: 'mirono', canRegister: false, error: null });

    expect(html).toContain('name="_csrf" value="abc123"');
    expect(html).toContain('value="mirono"');
  });
});
