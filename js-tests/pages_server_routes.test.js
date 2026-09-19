import { describe, expect, test } from 'vitest';
import { isMyAccountPath, isLoginPath, isLogoutPath } from '../pages-server/routes.mjs';

describe('isMyAccountPath', () => {
  test('the plain, no-tree path matches', () => {
    expect(isMyAccountPath('/my-account')).toBe(true);
  });

  test('a path with a trailing tree-name segment matches (PHP route: /my-account{/tree})', () => {
    expect(isMyAccountPath('/my-account/ophir')).toBe(true);
    expect(isMyAccountPath('/my-account/some-other-tree')).toBe(true);
  });

  // A real regression: pages-server used to 404 this exact shape, which
  // is what every logged-in user with any tree at all actually hits for
  // the ordinary "My account" link (the current tree's name is always
  // appended) - not a hypothetical edge case.
  test('does not require a TTY or special characters in the tree name to match', () => {
    expect(isMyAccountPath('/my-account/a')).toBe(true);
  });

  test('a same-prefix but different route does not match', () => {
    expect(isMyAccountPath('/my-account-delete')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isMyAccountPath('/login')).toBe(false);
    expect(isMyAccountPath('/')).toBe(false);
  });
});

describe('isLoginPath', () => {
  test('the plain, no-tree path matches', () => {
    expect(isLoginPath('/login')).toBe(true);
  });

  test('a path with a trailing tree-name segment matches (PHP route: /login{/tree})', () => {
    expect(isLoginPath('/login/ophir')).toBe(true);
  });

  test('a same-prefix but different route does not match', () => {
    expect(isLoginPath('/login-help')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isLoginPath('/my-account')).toBe(false);
    expect(isLoginPath('/')).toBe(false);
  });
});

describe('isLogoutPath', () => {
  test('the plain path matches', () => {
    expect(isLogoutPath('/logout')).toBe(true);
  });

  // Unlike /my-account and /login, PHP's route for logout has no
  // optional {tree} segment at all (app/Http/Routes/WebRoutes.php:
  // $router->post(Logout::class, '/logout');) - a trailing segment is
  // not a real route and should not match.
  test('a trailing segment does not match (no {tree} segment on this route)', () => {
    expect(isLogoutPath('/logout/ophir')).toBe(false);
  });

  test('a same-prefix but different route does not match', () => {
    expect(isLogoutPath('/logout-help')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isLogoutPath('/login')).toBe(false);
    expect(isLogoutPath('/')).toBe(false);
  });
});
