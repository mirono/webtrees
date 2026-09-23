import { describe, expect, test } from 'vitest';
import { phpRouteUrl } from '../pages-server/route-url.mjs';

describe('phpRouteUrl', () => {
  test('ugly-URL form when rewriteUrls is off (this repo\'s dev default)', () => {
    const url = phpRouteUrl('/tree/ophir/my-page', { baseUrl: '', rewriteUrls: false });

    expect(url).toBe('/index.php?route=%2Ftree%2Fophir%2Fmy-page');
  });

  test('pretty-URL form when rewriteUrls is on', () => {
    const url = phpRouteUrl('/tree/ophir/my-page', { baseUrl: '', rewriteUrls: true });

    expect(url).toBe('/tree/ophir/my-page');
  });

  test('a non-empty baseUrl is prepended in both forms', () => {
    expect(phpRouteUrl('/trees/create', { baseUrl: 'http://example.com', rewriteUrls: false })).toBe(
      'http://example.com/index.php?route=%2Ftrees%2Fcreate',
    );
    expect(phpRouteUrl('/trees/create', { baseUrl: 'http://example.com', rewriteUrls: true })).toBe(
      'http://example.com/trees/create',
    );
  });

  // MediaFileThumbnail-shaped case: a route with no path placeholders,
  // every real parameter passed via the query string instead. Real
  // PHP's ugly-URL branch only replaces the PATH (Router.php:54-70) -
  // any other query params survive as siblings of `route=`, not nested
  // inside its value.
  describe('extraParams', () => {
    test('ugly-URL form: extraParams are sibling top-level params next to route=', () => {
      const url = phpRouteUrl('/media-thumbnail', { baseUrl: '', rewriteUrls: false }, { xref: 'M1', w: '200' });

      expect(url).toBe('/index.php?route=%2Fmedia-thumbnail&xref=M1&w=200');
    });

    test('pretty-URL form: extraParams become a normal query string after the path', () => {
      const url = phpRouteUrl('/media-thumbnail', { baseUrl: '', rewriteUrls: true }, { xref: 'M1', w: '200' });

      expect(url).toBe('/media-thumbnail?xref=M1&w=200');
    });

    test('pretty-URL form with no extraParams is unchanged (no trailing "?")', () => {
      expect(phpRouteUrl('/tree/ophir/my-page', { baseUrl: '', rewriteUrls: true })).toBe('/tree/ophir/my-page');
    });
  });
});
