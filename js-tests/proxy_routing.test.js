import { describe, expect, test } from 'vitest';
import {
  isNodeRoute,
  isTreePagePath,
  isIndividualPagePath,
  isFamilyPagePath,
  isSourcePagePath,
  isRepositoryPagePath,
  isNotePagePath,
  isMediaPagePath,
  isSubmitterPagePath,
  isHeaderPagePath,
  isRepositoryListPagePath,
  isSourceListPagePath,
  isNoteListPagePath,
  isLocationListPagePath,
  isFamilyListPagePath,
  isIndividualListPagePath,
  isMediaListPagePath,
  isAncestorsChartPagePath,
  isDescendancyChartPagePath,
  isHourglassChartPagePath,
  isHourglassChartActionPath,
  isFamilyBookChartPagePath,
  isCompactTreeChartPagePath,
  isFanChartPagePath,
  isLifespansChartPagePath,
  isTimelineChartPagePath,
  isRelationshipsChartPagePath,
  isStatisticsChartActionPath,
  isPedigreeMapChartPagePath,
  isControlPanelPath,
  isUserManagementPath,
  isTreeManagementPath,
  isSitePreferencesPath,
  isGedcomExportPath,
  isGedcomImportPath,
  rewriteForPages,
} from '../proxy/routing.mjs';

function urlFor(pathAndQuery) {
  return new URL(pathAndQuery, 'http://localhost');
}

describe('isNodeRoute', () => {
  test('plain /my-account', () => {
    const url = urlFor('/my-account');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/my-account with a sub-path', () => {
    const url = urlFor('/my-account/something');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/my-account', () => {
    const url = urlFor('/index.php?route=%2Fmy-account');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('every other page goes to PHP', () => {
    const url = urlFor('/index.php?route=%2Fregister');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(false);
  });

  test('a path that merely starts with the same prefix is not a match', () => {
    const url = urlFor('/my-account-settings');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(false);
  });

  test('no route param and an unrelated path', () => {
    const url = urlFor('/public/css/vendor.min.css');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(false);
  });

  test('plain /login', () => {
    const url = urlFor('/login');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/login with a tree sub-path', () => {
    const url = urlFor('/login/my-tree');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/login', () => {
    const url = urlFor('/index.php?route=%2Flogin');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('a path that merely starts with the same prefix as /login is not a match', () => {
    const url = urlFor('/login-help');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(false);
  });

  test('plain /logout', () => {
    const url = urlFor('/logout');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/logout', () => {
    const url = urlFor('/index.php?route=%2Flogout');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('plain /my-account-delete', () => {
    const url = urlFor('/my-account-delete');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/my-account-delete', () => {
    const url = urlFor('/index.php?route=%2Fmy-account-delete');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('the bare root /', () => {
    const url = urlFor('/');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/ for the home page', () => {
    const url = urlFor('/index.php?route=%2F');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  // "/" must not accidentally swallow every other path just because
  // every path technically "starts with a slash".
  test('"/" as a Node route does not match unrelated paths', () => {
    const url = urlFor('/public/css/vendor.min.css');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(false);
  });

  test('the exact-match /tree/{tree} page', () => {
    const url = urlFor('/tree/ophir');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  // A sibling route under the same /tree/{tree} attach block (PHP
  // registers TreePage at '' - an exact match, not a prefix) must NOT
  // be wrongly forwarded to Node - EXCEPT the record types that became
  // their own Node routes in later steps (below). Location has no Node
  // route yet, so it's still a safe "not a Node route" example.
  test('a sibling route under /tree/{tree} with no Node route yet is not a Node route', () => {
    const url = urlFor('/tree/ophir/location/L1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(false);
  });

  test('/tree/{tree}/individual/{xref} is a Node route', () => {
    const url = urlFor('/tree/ophir/individual/X1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/individual/{xref}/{slug} is a Node route', () => {
    const url = urlFor('/tree/ophir/individual/X1/John-DOE');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/individual/{xref}', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Findividual%2FX1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  // A different record type under the same /tree/{tree}/individual/
  // prefix shape must not accidentally match.
  test('a sibling record type with no Node route yet is not a Node route', () => {
    const url = urlFor('/tree/ophir/location/L1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(false);
  });

  test('/tree/{tree}/family/{xref} is a Node route', () => {
    const url = urlFor('/tree/ophir/family/F1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/family/{xref}/{slug} is a Node route', () => {
    const url = urlFor('/tree/ophir/family/F1/John-and-Jane-DOE');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/family/{xref}', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Ffamily%2FF1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/source/{xref} is a Node route', () => {
    const url = urlFor('/tree/ophir/source/S1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/source/{xref}/{slug} is a Node route', () => {
    const url = urlFor('/tree/ophir/source/S1/Census-1900');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/source/{xref}', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fsource%2FS1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/repository/{xref} is a Node route', () => {
    const url = urlFor('/tree/ophir/repository/R1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/repository/{xref}/{slug} is a Node route', () => {
    const url = urlFor('/tree/ophir/repository/R1/Israel-State-Archives');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/repository/{xref}', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Frepository%2FR1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/note/{xref} is a Node route', () => {
    const url = urlFor('/tree/ophir/note/N3');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/note/{xref}/{slug} is a Node route', () => {
    const url = urlFor('/tree/ophir/note/N3/some-slug');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/media/{xref} is a Node route', () => {
    const url = urlFor('/tree/ophir/media/M1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/media/{xref}/{slug} is a Node route', () => {
    const url = urlFor('/tree/ophir/media/M1/some-slug');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/media/{xref}', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fmedia%2FM1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/media (ManageMediaPage, no xref) stays on PHP', () => {
    const url = urlFor('/tree/ophir/media');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(false);
  });

  test('/tree/{tree}/media-upload stays on PHP', () => {
    const url = urlFor('/tree/ophir/media-upload');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(false);
  });

  test('ugly-URL form ?route=/tree/{tree}/note/{xref}', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fnote%2FN3');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/submitter/{xref} is a Node route', () => {
    const url = urlFor('/tree/ophir/submitter/S1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/submitter/{xref}/{slug} is a Node route', () => {
    const url = urlFor('/tree/ophir/submitter/S1/some-slug');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/submitter/{xref}', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fsubmitter%2FS1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/header/{xref} is a Node route', () => {
    const url = urlFor('/tree/ophir/header/HEAD');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/header/{xref}/{slug} is a Node route', () => {
    const url = urlFor('/tree/ophir/header/HEAD/some-slug');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/header/{xref}', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fheader%2FHEAD');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/repository-list is a Node route', () => {
    const url = urlFor('/tree/ophir/repository-list');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/repository-list', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Frepository-list');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/location-list is a Node route', () => {
    const url = urlFor('/tree/ophir/location-list');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/location-list', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Flocation-list');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/family-list is a Node route', () => {
    const url = urlFor('/tree/ophir/family-list');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/family-list', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Ffamily-list');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/individual-list is a Node route', () => {
    const url = urlFor('/tree/ophir/individual-list');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/individual-list', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Findividual-list');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/media-list is a Node route', () => {
    const url = urlFor('/tree/ophir/media-list');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/media-list', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fmedia-list');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/ancestors-{style}-{generations}/{xref} is a Node route', () => {
    const url = urlFor('/tree/ophir/ancestors-tree-4/I1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/ancestors-{style}-{generations}/{xref}', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fancestors-tree-4%2FI1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/{tree}/descendants-{style}-{generations}/{xref} is a Node route', () => {
    const url = urlFor('/tree/ophir/descendants-tree-3/I1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/{tree}/descendants-{style}-{generations}/{xref}', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fdescendants-tree-3%2FI1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('plain /language/{value}', () => {
    const url = urlFor('/language/en-US');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/language/{value}', () => {
    const url = urlFor('/index.php?route=%2Flanguage%2Fen-US');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('plain /theme/{value}', () => {
    const url = urlFor('/theme/clouds');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/theme/{value}', () => {
    const url = urlFor('/index.php?route=%2Ftheme%2Fclouds');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });
});

describe('isTreePagePath', () => {
  test('matches the exact tree-page path', () => {
    expect(isTreePagePath('/tree/ophir')).toBe(true);
  });

  test('tolerates a trailing slash', () => {
    expect(isTreePagePath('/tree/ophir/')).toBe(true);
  });

  test('does not match a sibling route under the same group', () => {
    expect(isTreePagePath('/tree/ophir/individual/I1')).toBe(false);
    expect(isTreePagePath('/tree/ophir/my-page')).toBe(false);
  });

  test('does not match the bare prefix', () => {
    expect(isTreePagePath('/tree')).toBe(false);
    expect(isTreePagePath('/tree/')).toBe(false);
  });
});

describe('isIndividualPagePath', () => {
  test('matches the bare path', () => {
    expect(isIndividualPagePath('/tree/ophir/individual/X1')).toBe(true);
  });

  test('a trailing slug is tolerated', () => {
    expect(isIndividualPagePath('/tree/ophir/individual/X1/John-DOE')).toBe(true);
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(isIndividualPagePath('/tree/ophir/family/F1')).toBe(false);
    expect(isIndividualPagePath('/tree/ophir/media/M1')).toBe(false);
  });

  test('does not match the bare prefix', () => {
    expect(isIndividualPagePath('/tree/ophir/individual')).toBe(false);
    expect(isIndividualPagePath('/tree/ophir/individual/')).toBe(false);
  });
});

describe('isFamilyPagePath', () => {
  test('matches the bare path', () => {
    expect(isFamilyPagePath('/tree/ophir/family/F1')).toBe(true);
  });

  test('a trailing slug is tolerated', () => {
    expect(isFamilyPagePath('/tree/ophir/family/F1/John-and-Jane-DOE')).toBe(true);
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(isFamilyPagePath('/tree/ophir/individual/I1')).toBe(false);
    expect(isFamilyPagePath('/tree/ophir/media/M1')).toBe(false);
  });

  test('does not match the bare prefix', () => {
    expect(isFamilyPagePath('/tree/ophir/family')).toBe(false);
    expect(isFamilyPagePath('/tree/ophir/family/')).toBe(false);
  });
});

describe('isSourcePagePath', () => {
  test('matches the bare path', () => {
    expect(isSourcePagePath('/tree/ophir/source/S1')).toBe(true);
  });

  test('a trailing slug is tolerated', () => {
    expect(isSourcePagePath('/tree/ophir/source/S1/Census-1900')).toBe(true);
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(isSourcePagePath('/tree/ophir/individual/I1')).toBe(false);
    expect(isSourcePagePath('/tree/ophir/family/F1')).toBe(false);
    expect(isSourcePagePath('/tree/ophir/media/M1')).toBe(false);
  });

  test('does not match the bare prefix', () => {
    expect(isSourcePagePath('/tree/ophir/source')).toBe(false);
    expect(isSourcePagePath('/tree/ophir/source/')).toBe(false);
  });
});

describe('isRepositoryPagePath', () => {
  test('matches the bare path', () => {
    expect(isRepositoryPagePath('/tree/ophir/repository/R1')).toBe(true);
  });

  test('a trailing slug is tolerated', () => {
    expect(isRepositoryPagePath('/tree/ophir/repository/R1/Israel-State-Archives')).toBe(true);
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(isRepositoryPagePath('/tree/ophir/individual/I1')).toBe(false);
    expect(isRepositoryPagePath('/tree/ophir/family/F1')).toBe(false);
    expect(isRepositoryPagePath('/tree/ophir/source/S1')).toBe(false);
  });

  test('does not match the bare prefix', () => {
    expect(isRepositoryPagePath('/tree/ophir/repository')).toBe(false);
    expect(isRepositoryPagePath('/tree/ophir/repository/')).toBe(false);
  });
});

describe('isNotePagePath', () => {
  test('matches the bare path', () => {
    expect(isNotePagePath('/tree/ophir/note/N3')).toBe(true);
  });

  test('a trailing slug is tolerated', () => {
    expect(isNotePagePath('/tree/ophir/note/N3/some-slug')).toBe(true);
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(isNotePagePath('/tree/ophir/individual/I1')).toBe(false);
    expect(isNotePagePath('/tree/ophir/repository/R1')).toBe(false);
  });

  test('the shared-note (SNOTE) variant does not match', () => {
    expect(isNotePagePath('/tree/ophir/shared-note/N3')).toBe(false);
  });

  test('does not match the bare prefix', () => {
    expect(isNotePagePath('/tree/ophir/note')).toBe(false);
    expect(isNotePagePath('/tree/ophir/note/')).toBe(false);
  });
});

describe('isMediaPagePath', () => {
  test('matches the bare path', () => {
    expect(isMediaPagePath('/tree/ophir/media/M1')).toBe(true);
  });

  test('a trailing slug is tolerated', () => {
    expect(isMediaPagePath('/tree/ophir/media/M1/some-slug')).toBe(true);
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(isMediaPagePath('/tree/ophir/individual/I1')).toBe(false);
    expect(isMediaPagePath('/tree/ophir/note/N3')).toBe(false);
  });

  test('does not match the bare prefix (ManageMediaPage) or media-upload', () => {
    expect(isMediaPagePath('/tree/ophir/media')).toBe(false);
    expect(isMediaPagePath('/tree/ophir/media/')).toBe(false);
    expect(isMediaPagePath('/tree/ophir/media-upload')).toBe(false);
  });

  test('does not match the media-thumbnail/media-download PHP routes', () => {
    expect(isMediaPagePath('/tree/ophir/media-thumbnail')).toBe(false);
    expect(isMediaPagePath('/tree/ophir/media-download')).toBe(false);
  });
});

describe('isSubmitterPagePath', () => {
  test('matches the bare path', () => {
    expect(isSubmitterPagePath('/tree/ophir/submitter/S1')).toBe(true);
  });

  test('a trailing slug is tolerated', () => {
    expect(isSubmitterPagePath('/tree/ophir/submitter/S1/some-slug')).toBe(true);
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(isSubmitterPagePath('/tree/ophir/individual/I1')).toBe(false);
    expect(isSubmitterPagePath('/tree/ophir/media/M1')).toBe(false);
  });

  test('does not match the bare prefix', () => {
    expect(isSubmitterPagePath('/tree/ophir/submitter')).toBe(false);
    expect(isSubmitterPagePath('/tree/ophir/submitter/')).toBe(false);
  });
});

describe('isHeaderPagePath', () => {
  test('matches the bare path', () => {
    expect(isHeaderPagePath('/tree/ophir/header/HEAD')).toBe(true);
  });

  test('a trailing slug is tolerated', () => {
    expect(isHeaderPagePath('/tree/ophir/header/HEAD/some-slug')).toBe(true);
  });

  test('a sibling record type under the same /tree/{tree} group does not match', () => {
    expect(isHeaderPagePath('/tree/ophir/individual/I1')).toBe(false);
    expect(isHeaderPagePath('/tree/ophir/submitter/S1')).toBe(false);
  });

  test('does not match the bare prefix', () => {
    expect(isHeaderPagePath('/tree/ophir/header')).toBe(false);
    expect(isHeaderPagePath('/tree/ophir/header/')).toBe(false);
  });
});

describe('isRepositoryListPagePath', () => {
  test('matches the exact path', () => {
    expect(isRepositoryListPagePath('/tree/ophir/repository-list')).toBe(true);
  });

  test('a trailing slash is tolerated', () => {
    expect(isRepositoryListPagePath('/tree/ophir/repository-list/')).toBe(true);
  });

  test('the per-record repository page does not match', () => {
    expect(isRepositoryListPagePath('/tree/ophir/repository/R1')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isRepositoryListPagePath('/tree/ophir')).toBe(false);
  });
});

describe('isSourceListPagePath', () => {
  test('matches the exact path', () => {
    expect(isSourceListPagePath('/tree/ophir/source-list')).toBe(true);
  });

  test('a trailing slash is tolerated', () => {
    expect(isSourceListPagePath('/tree/ophir/source-list/')).toBe(true);
  });

  test('the per-record source page does not match', () => {
    expect(isSourceListPagePath('/tree/ophir/source/S1')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isSourceListPagePath('/tree/ophir')).toBe(false);
  });
});

describe('isNoteListPagePath', () => {
  test('matches the exact path', () => {
    expect(isNoteListPagePath('/tree/ophir/note-list')).toBe(true);
  });

  test('a trailing slash is tolerated', () => {
    expect(isNoteListPagePath('/tree/ophir/note-list/')).toBe(true);
  });

  test('the per-record note page does not match', () => {
    expect(isNoteListPagePath('/tree/ophir/note/N1')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isNoteListPagePath('/tree/ophir')).toBe(false);
  });
});

describe('isLocationListPagePath', () => {
  test('matches the exact path', () => {
    expect(isLocationListPagePath('/tree/ophir/location-list')).toBe(true);
  });

  test('a trailing slash is tolerated', () => {
    expect(isLocationListPagePath('/tree/ophir/location-list/')).toBe(true);
  });

  test('the per-record location page does not match', () => {
    expect(isLocationListPagePath('/tree/ophir/location/L1')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isLocationListPagePath('/tree/ophir')).toBe(false);
  });
});

describe('isFamilyListPagePath', () => {
  test('matches the exact path', () => {
    expect(isFamilyListPagePath('/tree/ophir/family-list')).toBe(true);
  });

  test('a trailing slash is tolerated', () => {
    expect(isFamilyListPagePath('/tree/ophir/family-list/')).toBe(true);
  });

  test('the per-record family page does not match', () => {
    expect(isFamilyListPagePath('/tree/ophir/family/F1')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isFamilyListPagePath('/tree/ophir')).toBe(false);
  });
});

describe('isIndividualListPagePath', () => {
  test('matches the exact path', () => {
    expect(isIndividualListPagePath('/tree/ophir/individual-list')).toBe(true);
  });

  test('a trailing slash is tolerated', () => {
    expect(isIndividualListPagePath('/tree/ophir/individual-list/')).toBe(true);
  });

  test('the per-record individual page does not match', () => {
    expect(isIndividualListPagePath('/tree/ophir/individual/I1')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isIndividualListPagePath('/tree/ophir')).toBe(false);
  });
});

describe('isMediaListPagePath', () => {
  test('matches the exact path', () => {
    expect(isMediaListPagePath('/tree/ophir/media-list')).toBe(true);
  });

  test('a trailing slash is tolerated', () => {
    expect(isMediaListPagePath('/tree/ophir/media-list/')).toBe(true);
  });

  test('the per-record media page does not match', () => {
    expect(isMediaListPagePath('/tree/ophir/media/M1')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isMediaListPagePath('/tree/ophir')).toBe(false);
  });
});

describe('isAncestorsChartPagePath', () => {
  test('matches the real path shape', () => {
    expect(isAncestorsChartPagePath('/tree/ophir/ancestors-tree-4/I1')).toBe(true);
  });

  test('accepts each real style value', () => {
    expect(isAncestorsChartPagePath('/tree/ophir/ancestors-individuals-4/I1')).toBe(true);
    expect(isAncestorsChartPagePath('/tree/ophir/ancestors-families-4/I1')).toBe(true);
  });

  test('rejects an unrecognized style value', () => {
    expect(isAncestorsChartPagePath('/tree/ophir/ancestors-bogus-4/I1')).toBe(false);
  });

  test('the per-record individual page does not match', () => {
    expect(isAncestorsChartPagePath('/tree/ophir/individual/I1')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isAncestorsChartPagePath('/tree/ophir')).toBe(false);
  });
});

describe('isDescendancyChartPagePath', () => {
  test('matches the real path shape', () => {
    expect(isDescendancyChartPagePath('/tree/ophir/descendants-tree-3/I1')).toBe(true);
  });

  test('rejects an unrecognized style value', () => {
    expect(isDescendancyChartPagePath('/tree/ophir/descendants-bogus-3/I1')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isDescendancyChartPagePath('/tree/ophir')).toBe(false);
    expect(isDescendancyChartPagePath('/tree/ophir/ancestors-tree-3/I1')).toBe(false);
  });
});

describe('isHourglassChartPagePath', () => {
  test('matches the real path shape', () => {
    expect(isHourglassChartPagePath('/tree/ophir/hourglass-3-0/I1')).toBe(true);
    expect(isHourglassChartPagePath('/tree/ophir/hourglass-3-1/I1')).toBe(true);
  });

  test('rejects a spouses value other than 0 or 1', () => {
    expect(isHourglassChartPagePath('/tree/ophir/hourglass-3-2/I1')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isHourglassChartPagePath('/tree/ophir')).toBe(false);
    expect(isHourglassChartPagePath('/tree/ophir/ancestors-tree-3/I1')).toBe(false);
  });
});

describe('isHourglassChartActionPath', () => {
  test('matches both real actions', () => {
    expect(isHourglassChartActionPath('/module/hourglass_chart/Ancestors/ophir')).toBe(true);
    expect(isHourglassChartActionPath('/module/hourglass_chart/Descendants/ophir')).toBe(true);
  });

  test('rejects an unrecognized action or a different module', () => {
    expect(isHourglassChartActionPath('/module/hourglass_chart/Bogus/ophir')).toBe(false);
    expect(isHourglassChartActionPath('/module/relationships_chart/Ancestors/ophir')).toBe(false);
  });
});

describe('isFamilyBookChartPagePath', () => {
  test('matches the real path shape', () => {
    expect(isFamilyBookChartPagePath('/tree/ophir/family-book-3-5-0/I1')).toBe(true);
    expect(isFamilyBookChartPagePath('/tree/ophir/family-book-3-5-1/I1')).toBe(true);
  });

  test('rejects a spouses value other than 0 or 1', () => {
    expect(isFamilyBookChartPagePath('/tree/ophir/family-book-3-5-2/I1')).toBe(false);
  });

  test('an unrelated path does not match', () => {
    expect(isFamilyBookChartPagePath('/tree/ophir')).toBe(false);
    expect(isFamilyBookChartPagePath('/tree/ophir/hourglass-3-0/I1')).toBe(false);
  });
});

describe('isCompactTreeChartPagePath', () => {
  test('matches the real path shape', () => {
    expect(isCompactTreeChartPagePath('/tree/ophir/compact/I1')).toBe(true);
  });

  test('an unrelated path does not match', () => {
    expect(isCompactTreeChartPagePath('/tree/ophir')).toBe(false);
    expect(isCompactTreeChartPagePath('/tree/ophir/hourglass-3-0/I1')).toBe(false);
  });
});

describe('isFanChartPagePath', () => {
  test('matches the real path shape', () => {
    expect(isFanChartPagePath('/tree/ophir/fan-chart-3-4-100/I1')).toBe(true);
  });

  test('an unrelated path does not match', () => {
    expect(isFanChartPagePath('/tree/ophir')).toBe(false);
    expect(isFanChartPagePath('/tree/ophir/compact/I1')).toBe(false);
  });
});

describe('isLifespansChartPagePath', () => {
  test('matches the real path shape', () => {
    expect(isLifespansChartPagePath('/tree/ophir/lifespans')).toBe(true);
  });

  test('an unrelated path does not match', () => {
    expect(isLifespansChartPagePath('/tree/ophir')).toBe(false);
    expect(isLifespansChartPagePath('/tree/ophir/lifespans/I1')).toBe(false);
  });
});

describe('isTimelineChartPagePath', () => {
  test('matches the real path shape', () => {
    expect(isTimelineChartPagePath('/tree/ophir/timeline-10')).toBe(true);
  });

  test('an unrelated path does not match', () => {
    expect(isTimelineChartPagePath('/tree/ophir')).toBe(false);
    expect(isTimelineChartPagePath('/tree/ophir/lifespans')).toBe(false);
  });
});

describe('isRelationshipsChartPagePath', () => {
  test('matches with and without xref2', () => {
    expect(isRelationshipsChartPagePath('/tree/ophir/relationships-0-99/I1')).toBe(true);
    expect(isRelationshipsChartPagePath('/tree/ophir/relationships-0-99/I1/I2')).toBe(true);
  });

  test('an unrelated path does not match', () => {
    expect(isRelationshipsChartPagePath('/tree/ophir')).toBe(false);
    expect(isRelationshipsChartPagePath('/tree/ophir/timeline-10')).toBe(false);
  });
});

describe('isStatisticsChartActionPath', () => {
  test('matches every known action', () => {
    for (const action of ['Chart', 'Individuals', 'Families', 'Other', 'Custom', 'CustomChart']) {
      expect(isStatisticsChartActionPath(`/module/statistics_chart/${action}/ophir`)).toBe(true);
    }
  });

  test('an unknown action, or a different module, does not match', () => {
    expect(isStatisticsChartActionPath('/module/statistics_chart/Bogus/ophir')).toBe(false);
    expect(isStatisticsChartActionPath('/module/hourglass_chart/Chart/ophir')).toBe(false);
  });
});

describe('isPedigreeMapChartPagePath', () => {
  test('matches the pedigree map chart route', () => {
    expect(isPedigreeMapChartPagePath('/tree/ophir/pedigree-map-4/I1')).toBe(true);
    expect(isPedigreeMapChartPagePath('/tree/ophir/pedigree-map-4/I1/')).toBe(true);
  });

  test('an unrelated path does not match', () => {
    expect(isPedigreeMapChartPagePath('/tree/ophir')).toBe(false);
    expect(isPedigreeMapChartPagePath('/tree/ophir/ancestors-tree-4/I1')).toBe(false);
  });
});

describe('isControlPanelPath', () => {
  test('matches /admin exactly', () => {
    expect(isControlPanelPath('/admin')).toBe(true);
    expect(isControlPanelPath('/admin/')).toBe(true);
  });

  test('does not match any other /admin/... path', () => {
    expect(isControlPanelPath('/admin/admin-users')).toBe(false);
    expect(isControlPanelPath('/admin/modules')).toBe(false);
  });
});

describe('isUserManagementPath', () => {
  test('matches every user-management route', () => {
    expect(isUserManagementPath('/admin/admin-users')).toBe(true);
    expect(isUserManagementPath('/admin/admin-users-data')).toBe(true);
    expect(isUserManagementPath('/admin/admin-users-create')).toBe(true);
    expect(isUserManagementPath('/admin/admin-users-edit')).toBe(true);
    expect(isUserManagementPath('/admin/users/delete/42')).toBe(true);
    expect(isUserManagementPath('/admin/masquerade/42')).toBe(true);
  });

  test('an unrelated path does not match', () => {
    expect(isUserManagementPath('/admin/modules')).toBe(false);
    expect(isUserManagementPath('/admin')).toBe(false);
  });
});

describe('isTreeManagementPath', () => {
  test('matches every tree-management route', () => {
    expect(isTreeManagementPath('/admin/trees/manage')).toBe(true);
    expect(isTreeManagementPath('/admin/trees/manage/ophir')).toBe(true);
    expect(isTreeManagementPath('/admin/trees/create')).toBe(true);
    expect(isTreeManagementPath('/admin/trees/default/ophir')).toBe(true);
    expect(isTreeManagementPath('/admin/trees/delete/ophir')).toBe(true);
    expect(isTreeManagementPath('/admin/trees/merge')).toBe(true);
    expect(isTreeManagementPath('/tree/ophir/preferences')).toBe(true);
    expect(isTreeManagementPath('/tree/ophir/renumber')).toBe(true);
    expect(isTreeManagementPath('/tree/ophir/privacy')).toBe(true);
    expect(isTreeManagementPath('/tree/ophir/check')).toBe(true);
  });

  test('does not match deliberately excluded routes', () => {
    expect(isTreeManagementPath('/admin/trees/default-blocks')).toBe(false);
    expect(isTreeManagementPath('/admin/trees/sync')).toBe(false);
  });

  test('does not match other admin routes', () => {
    expect(isTreeManagementPath('/admin')).toBe(false);
    expect(isTreeManagementPath('/admin/admin-users')).toBe(false);
    expect(isTreeManagementPath('/admin/modules')).toBe(false);
  });

  test('does not match other tree routes', () => {
    expect(isTreeManagementPath('/tree/ophir')).toBe(false);
    expect(isTreeManagementPath('/tree/ophir/individual/I1')).toBe(false);
  });

  test('does not match unrelated paths', () => {
    expect(isTreeManagementPath('/login')).toBe(false);
    expect(isTreeManagementPath('/')).toBe(false);
  });
});

describe('isSitePreferencesPath', () => {
  test('matches /admin/site-preferences', () => {
    expect(isSitePreferencesPath('/admin/site-preferences')).toBe(true);
  });

  test('matches /admin/site-preferences with trailing slash', () => {
    expect(isSitePreferencesPath('/admin/site-preferences/')).toBe(true);
  });

  test('matches /admin/site-registration', () => {
    expect(isSitePreferencesPath('/admin/site-registration')).toBe(true);
  });

  test('matches /admin/site-registration with trailing slash', () => {
    expect(isSitePreferencesPath('/admin/site-registration/')).toBe(true);
  });

  test('matches /admin/email', () => {
    expect(isSitePreferencesPath('/admin/email')).toBe(true);
  });

  test('matches /admin/email with trailing slash', () => {
    expect(isSitePreferencesPath('/admin/email/')).toBe(true);
  });

  test('matches /admin/tags', () => {
    expect(isSitePreferencesPath('/admin/tags')).toBe(true);
  });

  test('matches /admin/tags with trailing slash', () => {
    expect(isSitePreferencesPath('/admin/tags/')).toBe(true);
  });

  test('does not match other admin paths', () => {
    expect(isSitePreferencesPath('/admin')).toBe(false);
    expect(isSitePreferencesPath('/admin/admin-users')).toBe(false);
    expect(isSitePreferencesPath('/admin/trees')).toBe(false);
    expect(isSitePreferencesPath('/admin/modules')).toBe(false);
  });

  test('does not match unrelated paths', () => {
    expect(isSitePreferencesPath('/login')).toBe(false);
    expect(isSitePreferencesPath('/')).toBe(false);
    expect(isSitePreferencesPath('/tree/ophir')).toBe(false);
  });
});

describe('isGedcomExportPath', () => {
  test('matches /tree/{tree}/export', () => {
    expect(isGedcomExportPath('/tree/ophir/export')).toBe(true);
    expect(isGedcomExportPath('/tree/ophir/export/')).toBe(true);
  });

  test('matches /tree/{tree}/export-client', () => {
    expect(isGedcomExportPath('/tree/ophir/export-client')).toBe(true);
    expect(isGedcomExportPath('/tree/ophir/export-client/')).toBe(true);
  });

  test('matches /tree/{tree}/export-server', () => {
    expect(isGedcomExportPath('/tree/ophir/export-server')).toBe(true);
    expect(isGedcomExportPath('/tree/ophir/export-server/')).toBe(true);
  });

  test('works with special tree names that require encoding', () => {
    expect(isGedcomExportPath('/tree/my%20tree/export')).toBe(true);
    expect(isGedcomExportPath('/tree/my%2Ftree/export-client')).toBe(true);
    expect(isGedcomExportPath('/tree/special%3Fchar/export-server')).toBe(true);
  });

  test('does not match partial paths', () => {
    expect(isGedcomExportPath('/tree/ophir')).toBe(false);
    expect(isGedcomExportPath('/tree/ophir/export-')).toBe(false);
  });

  test('does not match with extra path segments', () => {
    expect(isGedcomExportPath('/tree/ophir/export/something')).toBe(false);
    expect(isGedcomExportPath('/tree/ophir/export-client/extra')).toBe(false);
  });

  test('does not match unrelated paths', () => {
    expect(isGedcomExportPath('/tree/ophir/individual/I1')).toBe(false);
    expect(isGedcomExportPath('/tree/ophir/preferences')).toBe(false);
    expect(isGedcomExportPath('/admin/site-preferences')).toBe(false);
    expect(isGedcomExportPath('/')).toBe(false);
  });
});

describe('isGedcomImportPath', () => {
  test('matches /tree/{tree}/import', () => {
    expect(isGedcomImportPath('/tree/ophir/import')).toBe(true);
  });

  test('matches /tree/{tree}/import with trailing slash', () => {
    expect(isGedcomImportPath('/tree/ophir/import/')).toBe(true);
  });

  test('works with special tree names that require encoding', () => {
    expect(isGedcomImportPath('/tree/my%20tree/import')).toBe(true);
    expect(isGedcomImportPath('/tree/my%2Ftree/import')).toBe(true);
    expect(isGedcomImportPath('/tree/special%3Fchar/import')).toBe(true);
  });

  test('does not match partial paths', () => {
    expect(isGedcomImportPath('/tree/ophir')).toBe(false);
    expect(isGedcomImportPath('/tree/ophir/import-')).toBe(false);
  });

  test('does not match with extra path segments', () => {
    expect(isGedcomImportPath('/tree/ophir/import/something')).toBe(false);
  });

  test('does not match unrelated paths', () => {
    expect(isGedcomImportPath('/tree/ophir/individual/I1')).toBe(false);
    expect(isGedcomImportPath('/tree/ophir/export')).toBe(false);
    expect(isGedcomImportPath('/tree/ophir/preferences')).toBe(false);
    expect(isGedcomImportPath('/admin/site-preferences')).toBe(false);
    expect(isGedcomImportPath('/')).toBe(false);
  });
});

describe('rewriteForPages', () => {
  test('plain /my-account is unchanged', () => {
    expect(rewriteForPages(urlFor('/my-account'))).toBe('/my-account');
  });

  test('ugly-URL form is rewritten to the plain path, route dropped', () => {
    expect(rewriteForPages(urlFor('/index.php?route=%2Fmy-account'))).toBe('/my-account');
  });

  test('other query params survive the rewrite, route is still dropped', () => {
    const result = rewriteForPages(urlFor('/index.php?route=%2Fmy-account&tree=foo'));
    expect(result).toBe('/my-account?tree=foo');
  });

  test('plain /login is unchanged', () => {
    expect(rewriteForPages(urlFor('/login'))).toBe('/login');
  });

  test('ugly-URL form for /login is rewritten to the plain path', () => {
    expect(rewriteForPages(urlFor('/index.php?route=%2Flogin'))).toBe('/login');
  });

  test('ugly-URL form for /login with a tree segment', () => {
    expect(rewriteForPages(urlFor('/index.php?route=%2Flogin%2Fmy-tree'))).toBe('/login/my-tree');
  });

  test('ugly-URL form for the home page rewrites to the bare root', () => {
    expect(rewriteForPages(urlFor('/index.php?route=%2F'))).toBe('/');
  });
});
