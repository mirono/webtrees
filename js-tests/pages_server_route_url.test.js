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
});
