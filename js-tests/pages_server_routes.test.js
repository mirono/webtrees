import { describe, expect, test } from 'vitest';
import { isMyAccountPath } from '../pages-server/routes.mjs';

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
