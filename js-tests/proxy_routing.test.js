import { describe, expect, test } from 'vitest';
import { isNodeRoute, isTreePagePath, isIndividualPagePath, isFamilyPagePath, rewriteForPages } from '../proxy/routing.mjs';

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
  // be wrongly forwarded to Node - EXCEPT /tree/{tree}/individual/{xref}
  // and /tree/{tree}/family/{xref}, which became their own Node routes
  // in later steps (below).
  test('a sibling route under /tree/{tree} that is not individual/{xref} or family/{xref} is not a Node route', () => {
    const url = urlFor('/tree/ophir/media/M1');
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
  test('a sibling record type (not individual, not family) is not a Node route', () => {
    const url = urlFor('/tree/ophir/media/M1');
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
