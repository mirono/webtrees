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
  matchRepositoryPagePath,
  matchNotePagePath,
  matchMediaPagePath,
  matchSubmitterPagePath,
  matchHeaderPagePath,
  matchRepositoryListPagePath,
  matchSourceListPagePath,
  matchNoteListPagePath,
  matchLocationListPagePath,
  matchFamilyListPagePath,
  matchIndividualListPagePath,
  matchMediaListPagePath,
  matchAncestorsChartPagePath,
  matchDescendancyChartPagePath,
  matchHourglassChartPagePath,
  matchHourglassChartActionPath,
  matchFamilyBookChartPagePath,
  matchCompactTreeChartPagePath,
  matchFanChartPagePath,
  matchLifespansChartPagePath,
  matchTimelineChartPagePath,
  matchRelationshipsChartPagePath,
  matchStatisticsChartActionPath,
  matchPedigreeMapChartPagePath,
  matchControlPanelPath,
  matchUserListPagePath,
  matchUserListDataPath,
  matchUserAddPath,
  matchUserEditPath,
  matchDeleteUserPath,
  matchMasqueradePath,
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

describe('matchRepositoryPagePath', () => {
  test('extracts the tree and xref from the bare path', () => {
    expect(matchRepositoryPagePath('/tree/ophir/repository/R1')).toEqual({ tree: 'ophir', xref: 'R1' });
  });

  test('a trailing slug is accepted and ignored', () => {
    expect(matchRepositoryPagePath('/tree/ophir/repository/R1/Israel-State-Archives')).toEqual({ tree: 'ophir', xref: 'R1' });
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(matchRepositoryPagePath('/tree/ophir/individual/I1')).toBeNull();
    expect(matchRepositoryPagePath('/tree/ophir/family/F1')).toBeNull();
    expect(matchRepositoryPagePath('/tree/ophir/source/S1')).toBeNull();
  });

  test('the bare prefix with no xref does not match', () => {
    expect(matchRepositoryPagePath('/tree/ophir/repository/')).toBeNull();
    expect(matchRepositoryPagePath('/tree/ophir/repository')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchRepositoryPagePath('/tree/ophir')).toBeNull();
    expect(matchRepositoryPagePath('/')).toBeNull();
  });
});

describe('matchNotePagePath', () => {
  test('extracts the tree and xref from the bare path', () => {
    expect(matchNotePagePath('/tree/ophir/note/N3')).toEqual({ tree: 'ophir', xref: 'N3' });
  });

  test('a trailing slug is accepted and ignored', () => {
    expect(matchNotePagePath('/tree/ophir/note/N3/some-slug')).toEqual({ tree: 'ophir', xref: 'N3' });
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(matchNotePagePath('/tree/ophir/individual/I1')).toBeNull();
    expect(matchNotePagePath('/tree/ophir/repository/R1')).toBeNull();
  });

  test('the shared-note (SNOTE) variant does not match - real data has no SNOTE records', () => {
    expect(matchNotePagePath('/tree/ophir/shared-note/N3')).toBeNull();
  });

  test('the bare prefix with no xref does not match', () => {
    expect(matchNotePagePath('/tree/ophir/note/')).toBeNull();
    expect(matchNotePagePath('/tree/ophir/note')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchNotePagePath('/tree/ophir')).toBeNull();
    expect(matchNotePagePath('/')).toBeNull();
  });
});

describe('matchMediaPagePath', () => {
  test('extracts the tree and xref from the bare path', () => {
    expect(matchMediaPagePath('/tree/ophir/media/M1')).toEqual({ tree: 'ophir', xref: 'M1' });
  });

  test('a trailing slug is accepted and ignored', () => {
    expect(matchMediaPagePath('/tree/ophir/media/M1/some-slug')).toEqual({ tree: 'ophir', xref: 'M1' });
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(matchMediaPagePath('/tree/ophir/individual/I1')).toBeNull();
    expect(matchMediaPagePath('/tree/ophir/note/N3')).toBeNull();
  });

  test('the bare prefix with no xref does not match (ManageMediaPage)', () => {
    expect(matchMediaPagePath('/tree/ophir/media/')).toBeNull();
    expect(matchMediaPagePath('/tree/ophir/media')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchMediaPagePath('/tree/ophir')).toBeNull();
    expect(matchMediaPagePath('/')).toBeNull();
  });
});

describe('matchSubmitterPagePath', () => {
  test('extracts the tree and xref from the bare path', () => {
    expect(matchSubmitterPagePath('/tree/ophir/submitter/S1')).toEqual({ tree: 'ophir', xref: 'S1' });
  });

  test('a trailing slug is accepted and ignored', () => {
    expect(matchSubmitterPagePath('/tree/ophir/submitter/S1/some-slug')).toEqual({ tree: 'ophir', xref: 'S1' });
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(matchSubmitterPagePath('/tree/ophir/individual/I1')).toBeNull();
    expect(matchSubmitterPagePath('/tree/ophir/media/M1')).toBeNull();
  });

  test('the bare prefix with no xref does not match', () => {
    expect(matchSubmitterPagePath('/tree/ophir/submitter/')).toBeNull();
    expect(matchSubmitterPagePath('/tree/ophir/submitter')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchSubmitterPagePath('/tree/ophir')).toBeNull();
    expect(matchSubmitterPagePath('/')).toBeNull();
  });
});

describe('matchHeaderPagePath', () => {
  test('extracts the tree and xref from the bare path', () => {
    expect(matchHeaderPagePath('/tree/ophir/header/HEAD')).toEqual({ tree: 'ophir', xref: 'HEAD' });
  });

  test('a trailing slug is accepted and ignored', () => {
    expect(matchHeaderPagePath('/tree/ophir/header/HEAD/some-slug')).toEqual({ tree: 'ophir', xref: 'HEAD' });
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(matchHeaderPagePath('/tree/ophir/individual/I1')).toBeNull();
    expect(matchHeaderPagePath('/tree/ophir/submitter/S1')).toBeNull();
  });

  test('the bare prefix with no xref does not match', () => {
    expect(matchHeaderPagePath('/tree/ophir/header/')).toBeNull();
    expect(matchHeaderPagePath('/tree/ophir/header')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchHeaderPagePath('/tree/ophir')).toBeNull();
    expect(matchHeaderPagePath('/')).toBeNull();
  });
});

describe('matchRepositoryListPagePath', () => {
  test('extracts the tree name', () => {
    expect(matchRepositoryListPagePath('/tree/ophir/repository-list')).toBe('ophir');
  });

  test('a trailing slash is tolerated', () => {
    expect(matchRepositoryListPagePath('/tree/ophir/repository-list/')).toBe('ophir');
  });

  test('a per-record repository page does not match (no xref here)', () => {
    expect(matchRepositoryListPagePath('/tree/ophir/repository/R1')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchRepositoryListPagePath('/tree/ophir')).toBeNull();
    expect(matchRepositoryListPagePath('/')).toBeNull();
  });
});

describe('matchSourceListPagePath', () => {
  test('extracts the tree name', () => {
    expect(matchSourceListPagePath('/tree/ophir/source-list')).toBe('ophir');
  });

  test('a trailing slash is tolerated', () => {
    expect(matchSourceListPagePath('/tree/ophir/source-list/')).toBe('ophir');
  });

  test('a per-record source page does not match (no xref here)', () => {
    expect(matchSourceListPagePath('/tree/ophir/source/S1')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchSourceListPagePath('/tree/ophir')).toBeNull();
    expect(matchSourceListPagePath('/')).toBeNull();
  });
});

describe('matchNoteListPagePath', () => {
  test('extracts the tree name', () => {
    expect(matchNoteListPagePath('/tree/ophir/note-list')).toBe('ophir');
  });

  test('a trailing slash is tolerated', () => {
    expect(matchNoteListPagePath('/tree/ophir/note-list/')).toBe('ophir');
  });

  test('a per-record note page does not match (no xref here)', () => {
    expect(matchNoteListPagePath('/tree/ophir/note/N1')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchNoteListPagePath('/tree/ophir')).toBeNull();
    expect(matchNoteListPagePath('/')).toBeNull();
  });
});

describe('matchLocationListPagePath', () => {
  test('extracts the tree name', () => {
    expect(matchLocationListPagePath('/tree/ophir/location-list')).toBe('ophir');
  });

  test('a trailing slash is tolerated', () => {
    expect(matchLocationListPagePath('/tree/ophir/location-list/')).toBe('ophir');
  });

  test('a per-record location page does not match (no xref here)', () => {
    expect(matchLocationListPagePath('/tree/ophir/location/L1')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchLocationListPagePath('/tree/ophir')).toBeNull();
    expect(matchLocationListPagePath('/')).toBeNull();
  });
});

describe('matchFamilyListPagePath', () => {
  test('extracts the tree name', () => {
    expect(matchFamilyListPagePath('/tree/ophir/family-list')).toBe('ophir');
  });

  test('a trailing slash is tolerated', () => {
    expect(matchFamilyListPagePath('/tree/ophir/family-list/')).toBe('ophir');
  });

  test('a per-record family page does not match (no xref here)', () => {
    expect(matchFamilyListPagePath('/tree/ophir/family/F1')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchFamilyListPagePath('/tree/ophir')).toBeNull();
    expect(matchFamilyListPagePath('/')).toBeNull();
  });
});

describe('matchIndividualListPagePath', () => {
  test('extracts the tree name', () => {
    expect(matchIndividualListPagePath('/tree/ophir/individual-list')).toBe('ophir');
  });

  test('a trailing slash is tolerated', () => {
    expect(matchIndividualListPagePath('/tree/ophir/individual-list/')).toBe('ophir');
  });

  test('a per-record individual page does not match (no xref here)', () => {
    expect(matchIndividualListPagePath('/tree/ophir/individual/I1')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchIndividualListPagePath('/tree/ophir')).toBeNull();
    expect(matchIndividualListPagePath('/')).toBeNull();
  });
});

describe('matchMediaListPagePath', () => {
  test('extracts the tree name', () => {
    expect(matchMediaListPagePath('/tree/ophir/media-list')).toBe('ophir');
  });

  test('a trailing slash is tolerated', () => {
    expect(matchMediaListPagePath('/tree/ophir/media-list/')).toBe('ophir');
  });

  test('a per-record media page does not match (no xref here)', () => {
    expect(matchMediaListPagePath('/tree/ophir/media/M1')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchMediaListPagePath('/tree/ophir')).toBeNull();
    expect(matchMediaListPagePath('/')).toBeNull();
  });
});

describe('matchAncestorsChartPagePath', () => {
  test('extracts tree, style, generations, and xref', () => {
    expect(matchAncestorsChartPagePath('/tree/ophir/ancestors-tree-4/I1')).toEqual({
      tree: 'ophir',
      style: 'tree',
      generations: 4,
      xref: 'I1',
    });
  });

  test('accepts each real style value', () => {
    expect(matchAncestorsChartPagePath('/tree/ophir/ancestors-individuals-4/I1')?.style).toBe('individuals');
    expect(matchAncestorsChartPagePath('/tree/ophir/ancestors-families-4/I1')?.style).toBe('families');
  });

  test('rejects an unrecognized style value', () => {
    expect(matchAncestorsChartPagePath('/tree/ophir/ancestors-bogus-4/I1')).toBeNull();
  });

  test('rejects a non-numeric generations segment', () => {
    expect(matchAncestorsChartPagePath('/tree/ophir/ancestors-tree-four/I1')).toBeNull();
  });

  test('a trailing slash is tolerated', () => {
    expect(matchAncestorsChartPagePath('/tree/ophir/ancestors-tree-4/I1/')).toEqual({
      tree: 'ophir',
      style: 'tree',
      generations: 4,
      xref: 'I1',
    });
  });

  test('an unrelated path does not match', () => {
    expect(matchAncestorsChartPagePath('/tree/ophir')).toBeNull();
    expect(matchAncestorsChartPagePath('/tree/ophir/individual/I1')).toBeNull();
  });
});

describe('matchDescendancyChartPagePath', () => {
  test('extracts tree, style, generations, and xref', () => {
    expect(matchDescendancyChartPagePath('/tree/ophir/descendants-tree-3/I1')).toEqual({
      tree: 'ophir',
      style: 'tree',
      generations: 3,
      xref: 'I1',
    });
  });

  test('accepts each real style value', () => {
    expect(matchDescendancyChartPagePath('/tree/ophir/descendants-individuals-3/I1')?.style).toBe('individuals');
    expect(matchDescendancyChartPagePath('/tree/ophir/descendants-families-3/I1')?.style).toBe('families');
  });

  test('rejects an unrecognized style value', () => {
    expect(matchDescendancyChartPagePath('/tree/ophir/descendants-bogus-3/I1')).toBeNull();
  });

  test('an unrelated path does not match', () => {
    expect(matchDescendancyChartPagePath('/tree/ophir')).toBeNull();
    expect(matchDescendancyChartPagePath('/tree/ophir/ancestors-tree-3/I1')).toBeNull();
  });
});

describe('matchHourglassChartPagePath', () => {
  test('extracts tree, generations, spouses, and xref', () => {
    expect(matchHourglassChartPagePath('/tree/ophir/hourglass-3-0/I1')).toEqual({
      tree: 'ophir',
      generations: 3,
      spouses: false,
      xref: 'I1',
    });
  });

  test('spouses=1 is a real boolean, not the string "1"', () => {
    expect(matchHourglassChartPagePath('/tree/ophir/hourglass-3-1/I1')?.spouses).toBe(true);
  });

  test('rejects a spouses value other than 0 or 1', () => {
    expect(matchHourglassChartPagePath('/tree/ophir/hourglass-3-2/I1')).toBeNull();
    expect(matchHourglassChartPagePath('/tree/ophir/hourglass-3-true/I1')).toBeNull();
  });

  test('rejects a non-numeric generations segment', () => {
    expect(matchHourglassChartPagePath('/tree/ophir/hourglass-three-0/I1')).toBeNull();
  });

  test('a trailing slash is tolerated', () => {
    expect(matchHourglassChartPagePath('/tree/ophir/hourglass-3-0/I1/')).toEqual({
      tree: 'ophir',
      generations: 3,
      spouses: false,
      xref: 'I1',
    });
  });

  test('an unrelated path does not match', () => {
    expect(matchHourglassChartPagePath('/tree/ophir')).toBeNull();
    expect(matchHourglassChartPagePath('/tree/ophir/ancestors-tree-3/I1')).toBeNull();
  });
});

describe('matchHourglassChartActionPath', () => {
  test('matches the Ancestors action', () => {
    expect(matchHourglassChartActionPath('/module/hourglass_chart/Ancestors/ophir')).toEqual({
      action: 'Ancestors',
      tree: 'ophir',
    });
  });

  test('matches the Descendants action', () => {
    expect(matchHourglassChartActionPath('/module/hourglass_chart/Descendants/ophir')).toEqual({
      action: 'Descendants',
      tree: 'ophir',
    });
  });

  test('rejects an unrecognized action', () => {
    expect(matchHourglassChartActionPath('/module/hourglass_chart/Bogus/ophir')).toBeNull();
  });

  test('rejects a different module', () => {
    expect(matchHourglassChartActionPath('/module/relationships_chart/Ancestors/ophir')).toBeNull();
  });

  test('a trailing slash is tolerated', () => {
    expect(matchHourglassChartActionPath('/module/hourglass_chart/Ancestors/ophir/')).toEqual({
      action: 'Ancestors',
      tree: 'ophir',
    });
  });
});

describe('matchFamilyBookChartPagePath', () => {
  test('extracts tree, bookSize, generations, spouses, and xref', () => {
    expect(matchFamilyBookChartPagePath('/tree/ophir/family-book-3-5-0/I1')).toEqual({
      tree: 'ophir',
      bookSize: 3,
      generations: 5,
      spouses: false,
      xref: 'I1',
    });
  });

  test('spouses=1 is a real boolean, not the string "1"', () => {
    expect(matchFamilyBookChartPagePath('/tree/ophir/family-book-3-5-1/I1')?.spouses).toBe(true);
  });

  test('rejects a spouses value other than 0 or 1', () => {
    expect(matchFamilyBookChartPagePath('/tree/ophir/family-book-3-5-2/I1')).toBeNull();
    expect(matchFamilyBookChartPagePath('/tree/ophir/family-book-3-5-true/I1')).toBeNull();
  });

  test('rejects non-numeric bookSize/generations segments', () => {
    expect(matchFamilyBookChartPagePath('/tree/ophir/family-book-three-5-0/I1')).toBeNull();
    expect(matchFamilyBookChartPagePath('/tree/ophir/family-book-3-five-0/I1')).toBeNull();
  });

  test('a trailing slash is tolerated', () => {
    expect(matchFamilyBookChartPagePath('/tree/ophir/family-book-3-5-0/I1/')).toEqual({
      tree: 'ophir',
      bookSize: 3,
      generations: 5,
      spouses: false,
      xref: 'I1',
    });
  });

  test('an unrelated path does not match', () => {
    expect(matchFamilyBookChartPagePath('/tree/ophir')).toBeNull();
    expect(matchFamilyBookChartPagePath('/tree/ophir/hourglass-3-0/I1')).toBeNull();
  });
});

describe('matchCompactTreeChartPagePath', () => {
  test('extracts tree and xref', () => {
    expect(matchCompactTreeChartPagePath('/tree/ophir/compact/I1')).toEqual({
      tree: 'ophir',
      xref: 'I1',
    });
  });

  test('a trailing slash is tolerated', () => {
    expect(matchCompactTreeChartPagePath('/tree/ophir/compact/I1/')).toEqual({
      tree: 'ophir',
      xref: 'I1',
    });
  });

  test('an unrelated path does not match', () => {
    expect(matchCompactTreeChartPagePath('/tree/ophir')).toBeNull();
    expect(matchCompactTreeChartPagePath('/tree/ophir/hourglass-3-0/I1')).toBeNull();
  });
});

describe('matchFanChartPagePath', () => {
  test('extracts tree, style, generations, width and xref', () => {
    expect(matchFanChartPagePath('/tree/ophir/fan-chart-3-4-100/I1')).toEqual({
      tree: 'ophir',
      style: 3,
      generations: 4,
      width: 100,
      xref: 'I1',
    });
  });

  test('a trailing slash is tolerated', () => {
    expect(matchFanChartPagePath('/tree/ophir/fan-chart-2-9-500/I1/')).toEqual({
      tree: 'ophir',
      style: 2,
      generations: 9,
      width: 500,
      xref: 'I1',
    });
  });

  test('an unrelated path does not match', () => {
    expect(matchFanChartPagePath('/tree/ophir')).toBeNull();
    expect(matchFanChartPagePath('/tree/ophir/compact/I1')).toBeNull();
  });
});

describe('matchLifespansChartPagePath', () => {
  test('extracts tree, with no other path segments', () => {
    expect(matchLifespansChartPagePath('/tree/ophir/lifespans')).toEqual({ tree: 'ophir' });
  });

  test('a trailing slash is tolerated', () => {
    expect(matchLifespansChartPagePath('/tree/ophir/lifespans/')).toEqual({ tree: 'ophir' });
  });

  test('an unrelated path does not match', () => {
    expect(matchLifespansChartPagePath('/tree/ophir')).toBeNull();
    expect(matchLifespansChartPagePath('/tree/ophir/lifespans/I1')).toBeNull();
  });
});

describe('matchTimelineChartPagePath', () => {
  test('extracts tree and scale', () => {
    expect(matchTimelineChartPagePath('/tree/ophir/timeline-10')).toEqual({ tree: 'ophir', scale: 10 });
  });

  test('a trailing slash is tolerated', () => {
    expect(matchTimelineChartPagePath('/tree/ophir/timeline-200/')).toEqual({ tree: 'ophir', scale: 200 });
  });

  test('an unrelated path does not match', () => {
    expect(matchTimelineChartPagePath('/tree/ophir')).toBeNull();
    expect(matchTimelineChartPagePath('/tree/ophir/lifespans')).toBeNull();
  });
});

describe('matchRelationshipsChartPagePath', () => {
  test('extracts tree, ancestors, recursion, xref - xref2 defaults to empty', () => {
    expect(matchRelationshipsChartPagePath('/tree/ophir/relationships-0-99/I1')).toEqual({
      tree: 'ophir',
      ancestors: 0,
      recursion: 99,
      xref: 'I1',
      xref2: '',
    });
  });

  test('extracts xref2 when present', () => {
    expect(matchRelationshipsChartPagePath('/tree/ophir/relationships-1-3/I1/I2')).toEqual({
      tree: 'ophir',
      ancestors: 1,
      recursion: 3,
      xref: 'I1',
      xref2: 'I2',
    });
  });

  test('a trailing slash is tolerated', () => {
    expect(matchRelationshipsChartPagePath('/tree/ophir/relationships-0-99/I1/I2/')).toEqual({
      tree: 'ophir',
      ancestors: 0,
      recursion: 99,
      xref: 'I1',
      xref2: 'I2',
    });
  });

  test('an unrelated path does not match', () => {
    expect(matchRelationshipsChartPagePath('/tree/ophir')).toBeNull();
    expect(matchRelationshipsChartPagePath('/tree/ophir/timeline-10')).toBeNull();
  });
});

describe('matchStatisticsChartActionPath', () => {
  test('extracts the action and tree for each known action', () => {
    for (const action of ['Chart', 'Individuals', 'Families', 'Other', 'Custom', 'CustomChart']) {
      expect(matchStatisticsChartActionPath(`/module/statistics_chart/${action}/ophir`)).toEqual({ action, tree: 'ophir' });
    }
  });

  test('a trailing slash is tolerated', () => {
    expect(matchStatisticsChartActionPath('/module/statistics_chart/Chart/ophir/')).toEqual({ action: 'Chart', tree: 'ophir' });
  });

  test('an unknown action, or a different module, does not match', () => {
    expect(matchStatisticsChartActionPath('/module/statistics_chart/Bogus/ophir')).toBeNull();
    expect(matchStatisticsChartActionPath('/module/hourglass_chart/Chart/ophir')).toBeNull();
    expect(matchStatisticsChartActionPath('/tree/ophir')).toBeNull();
  });
});

describe('matchPedigreeMapChartPagePath', () => {
  test('extracts tree, generations, and xref', () => {
    expect(matchPedigreeMapChartPagePath('/tree/ophir/pedigree-map-4/I1')).toEqual({ tree: 'ophir', generations: 4, xref: 'I1' });
  });

  test('a trailing slash is tolerated', () => {
    expect(matchPedigreeMapChartPagePath('/tree/ophir/pedigree-map-4/I1/')).toEqual({ tree: 'ophir', generations: 4, xref: 'I1' });
  });

  test('an unrelated path does not match', () => {
    expect(matchPedigreeMapChartPagePath('/tree/ophir')).toBeNull();
    expect(matchPedigreeMapChartPagePath('/tree/ophir/pedigree-map/I1')).toBeNull();
    expect(matchPedigreeMapChartPagePath('/tree/ophir/ancestors-tree-4/I1')).toBeNull();
  });
});

describe('matchControlPanelPath', () => {
  test('matches /admin exactly', () => {
    expect(matchControlPanelPath('/admin')).toBe(true);
    expect(matchControlPanelPath('/admin/')).toBe(true);
  });

  test('does not match any other /admin/... path', () => {
    expect(matchControlPanelPath('/admin/admin-users')).toBe(false);
    expect(matchControlPanelPath('/admin/modules')).toBe(false);
    expect(matchControlPanelPath('/tree/ophir')).toBe(false);
  });
});

describe('user management route matchers', () => {
  test('matchUserListPagePath', () => {
    expect(matchUserListPagePath('/admin/admin-users')).toBe(true);
    expect(matchUserListPagePath('/admin/admin-users-data')).toBe(false);
  });

  test('matchUserListDataPath', () => {
    expect(matchUserListDataPath('/admin/admin-users-data')).toBe(true);
    expect(matchUserListDataPath('/admin/admin-users')).toBe(false);
  });

  test('matchUserAddPath', () => {
    expect(matchUserAddPath('/admin/admin-users-create')).toBe(true);
    expect(matchUserAddPath('/admin/admin-users-edit')).toBe(false);
  });

  test('matchUserEditPath', () => {
    expect(matchUserEditPath('/admin/admin-users-edit')).toBe(true);
    expect(matchUserEditPath('/admin/admin-users-create')).toBe(false);
  });

  test('matchDeleteUserPath extracts the user_id', () => {
    expect(matchDeleteUserPath('/admin/users/delete/42')).toBe(42);
    expect(matchDeleteUserPath('/admin/users/delete/42/')).toBe(42);
    expect(matchDeleteUserPath('/admin/users/delete/abc')).toBeNull();
    expect(matchDeleteUserPath('/admin/masquerade/42')).toBeNull();
  });

  test('matchMasqueradePath extracts the user_id', () => {
    expect(matchMasqueradePath('/admin/masquerade/7')).toBe(7);
    expect(matchMasqueradePath('/admin/users/delete/7')).toBeNull();
  });
});
