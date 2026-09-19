import { describe, expect, test } from 'vitest';
import { isNodeRoute, rewriteForPages } from '../proxy/routing.mjs';

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
    const url = urlFor('/my-account-delete');
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
});
