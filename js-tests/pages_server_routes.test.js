import { describe, expect, test } from 'vitest';
import {
  isMyAccountPath,
  isLoginPath,
  isLogoutPath,
  isAccountDeletePath,
  isHomePath,
  matchLanguagePath,
  matchThemePath,
  matchTreePagePath,
  matchIndividualPagePath,
  matchFamilyPagePath,
  matchSourcePagePath,
} from '../pages-server/routes.mjs';

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

describe('isAccountDeletePath', () => {
  test('the plain path matches', () => {
    expect(isAccountDeletePath('/my-account-delete')).toBe(true);
  });

  test('a trailing segment does not match (no {tree} segment on this route)', () => {
    expect(isAccountDeletePath('/my-account-delete/ophir')).toBe(false);
  });

  // The sharpest edge case: this path IS the same-prefix-plus-dash
  // shape isMyAccountPath() already has to reject for the *reverse*
  // case (isMyAccountPath('/my-account-delete') === false) - confirm
  // isAccountDeletePath() doesn't accidentally match /my-account
  // itself either.
  test('does not match plain /my-account', () => {
    expect(isAccountDeletePath('/my-account')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isAccountDeletePath('/login')).toBe(false);
    expect(isAccountDeletePath('/')).toBe(false);
  });
});

describe('isHomePath', () => {
  test('the bare root matches', () => {
    expect(isHomePath('/')).toBe(true);
  });

  test('no other path matches, including a single unrelated segment', () => {
    expect(isHomePath('/login')).toBe(false);
    expect(isHomePath('/tree')).toBe(false);
    expect(isHomePath('')).toBe(false);
  });
});

describe('matchLanguagePath', () => {
  test('extracts the language value', () => {
    expect(matchLanguagePath('/language/en-US')).toBe('en-US');
  });

  test('a trailing slash with nothing after it does not match (PHP\'s {language} token is mandatory)', () => {
    expect(matchLanguagePath('/language/')).toBeNull();
  });

  test('the bare prefix with no trailing slash does not match', () => {
    expect(matchLanguagePath('/language')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchLanguagePath('/theme/clouds')).toBeNull();
    expect(matchLanguagePath('/')).toBeNull();
  });
});

describe('matchThemePath', () => {
  test('extracts the theme value', () => {
    expect(matchThemePath('/theme/clouds')).toBe('clouds');
  });

  test('a trailing slash with nothing after it does not match', () => {
    expect(matchThemePath('/theme/')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchThemePath('/language/en-US')).toBeNull();
  });
});

describe('matchTreePagePath', () => {
  test('extracts the tree name', () => {
    expect(matchTreePagePath('/tree/ophir')).toBe('ophir');
  });

  test('a trailing slash is tolerated', () => {
    expect(matchTreePagePath('/tree/ophir/')).toBe('ophir');
  });

  test('percent-decodes the tree name', () => {
    expect(matchTreePagePath('/tree/my%20tree')).toBe('my tree');
  });

  // The critical negative case: this is an EXACT match on PHP's route
  // (TreePage registers at '' inside the /tree/{tree} attach block) -
  // sibling routes under the same group must stay PHP-routed, not get
  // wrongly forwarded here.
  test('a sibling route under the same /tree/{tree} group does not match', () => {
    expect(matchTreePagePath('/tree/ophir/individual/I1')).toBeNull();
    expect(matchTreePagePath('/tree/ophir/my-page')).toBeNull();
  });

  test('the bare prefix with no tree name does not match', () => {
    expect(matchTreePagePath('/tree/')).toBeNull();
    expect(matchTreePagePath('/tree')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchTreePagePath('/')).toBeNull();
    expect(matchTreePagePath('/login')).toBeNull();
  });
});

describe('matchIndividualPagePath', () => {
  test('extracts the tree and xref from the bare path', () => {
    expect(matchIndividualPagePath('/tree/ophir/individual/X1')).toEqual({ tree: 'ophir', xref: 'X1' });
  });

  test('a trailing slug is accepted and ignored', () => {
    expect(matchIndividualPagePath('/tree/ophir/individual/X1/John-DOE')).toEqual({ tree: 'ophir', xref: 'X1' });
  });

  test('a trailing slash with no slug is tolerated', () => {
    expect(matchIndividualPagePath('/tree/ophir/individual/X1/')).toEqual({ tree: 'ophir', xref: 'X1' });
  });

  test('percent-decodes the tree name and xref', () => {
    expect(matchIndividualPagePath('/tree/my%20tree/individual/I1')).toEqual({ tree: 'my tree', xref: 'I1' });
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(matchIndividualPagePath('/tree/ophir/family/F1')).toBeNull();
    expect(matchIndividualPagePath('/tree/ophir/media/M1')).toBeNull();
  });

  test('the bare prefix with no xref does not match', () => {
    expect(matchIndividualPagePath('/tree/ophir/individual/')).toBeNull();
    expect(matchIndividualPagePath('/tree/ophir/individual')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchIndividualPagePath('/tree/ophir')).toBeNull();
    expect(matchIndividualPagePath('/')).toBeNull();
  });
});

describe('matchFamilyPagePath', () => {
  test('extracts the tree and xref from the bare path', () => {
    expect(matchFamilyPagePath('/tree/ophir/family/F1')).toEqual({ tree: 'ophir', xref: 'F1' });
  });

  test('a trailing slug is accepted and ignored', () => {
    expect(matchFamilyPagePath('/tree/ophir/family/F1/John-DOE-and-Jane-DOE')).toEqual({ tree: 'ophir', xref: 'F1' });
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(matchFamilyPagePath('/tree/ophir/individual/I1')).toBeNull();
    expect(matchFamilyPagePath('/tree/ophir/media/M1')).toBeNull();
  });

  test('the bare prefix with no xref does not match', () => {
    expect(matchFamilyPagePath('/tree/ophir/family/')).toBeNull();
    expect(matchFamilyPagePath('/tree/ophir/family')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchFamilyPagePath('/tree/ophir')).toBeNull();
    expect(matchFamilyPagePath('/')).toBeNull();
  });
});

describe('matchSourcePagePath', () => {
  test('extracts the tree and xref from the bare path', () => {
    expect(matchSourcePagePath('/tree/ophir/source/S1')).toEqual({ tree: 'ophir', xref: 'S1' });
  });

  test('a trailing slug is accepted and ignored', () => {
    expect(matchSourcePagePath('/tree/ophir/source/S1/Census-1900')).toEqual({ tree: 'ophir', xref: 'S1' });
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(matchSourcePagePath('/tree/ophir/individual/I1')).toBeNull();
    expect(matchSourcePagePath('/tree/ophir/family/F1')).toBeNull();
    expect(matchSourcePagePath('/tree/ophir/media/M1')).toBeNull();
  });

  test('the bare prefix with no xref does not match', () => {
    expect(matchSourcePagePath('/tree/ophir/source/')).toBeNull();
    expect(matchSourcePagePath('/tree/ophir/source')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchSourcePagePath('/tree/ophir')).toBeNull();
    expect(matchSourcePagePath('/')).toBeNull();
  });
});
