/**
 * webtrees: online genealogy
 * Copyright (C) 2026 webtrees development team
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import { describe, expect, test } from 'vitest';
import {
  isDataFixPath,
  isNodeRoute,
} from '../proxy/routing.mjs';

function urlFor(pathAndQuery) {
  return new URL(pathAndQuery, 'http://localhost');
}

describe('isDataFixPath', () => {
  test('matches /tree/{tree}/data-fix', () => {
    expect(isDataFixPath('/tree/ophir/data-fix')).toBe(true);
  });

  test('matches /tree/{tree}/data-fix with trailing slash', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/')).toBe(true);
  });

  test('matches /tree/{tree}/data-fix/{name}', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death')).toBe(true);
  });

  test('matches /tree/{tree}/data-fix/{name} with trailing slash', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/')).toBe(true);
  });

  test('matches /tree/{tree}/data-fix/{name}/update', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/update')).toBe(true);
  });

  test('matches /tree/{tree}/data-fix/{name}/update with trailing slash', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/update/')).toBe(true);
  });

  test('matches /tree/{tree}/data-fix/{name}/update-all', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/update-all')).toBe(true);
  });

  test('matches /tree/{tree}/data-fix/{name}/update-all with trailing slash', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/update-all/')).toBe(true);
  });

  test('matches /tree/{tree}/data-fix/{name}/data', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/data')).toBe(true);
  });

  test('matches /tree/{tree}/data-fix/{name}/data with trailing slash', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/data/')).toBe(true);
  });

  test('matches /tree/{tree}/data-fix/{name}/preview', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/preview')).toBe(true);
  });

  test('matches /tree/{tree}/data-fix/{name}/preview with trailing slash', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/preview/')).toBe(true);
  });

  test('URL-decodes tree name', () => {
    expect(isDataFixPath('/tree/my%20tree/data-fix')).toBe(true);
    expect(isDataFixPath('/tree/my%2Ftree/data-fix/fix-add-death')).toBe(true);
  });

  test('URL-decodes data-fix name', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix%20add%20death')).toBe(true);
  });

  test('returns false for unrelated paths', () => {
    expect(isDataFixPath('/tree/ophir')).toBe(false);
    expect(isDataFixPath('/tree/ophir/individual/I1')).toBe(false);
    expect(isDataFixPath('/tree/ophir/export')).toBe(false);
    expect(isDataFixPath('/tree/ophir/preferences')).toBe(false);
    expect(isDataFixPath('/admin/site-preferences')).toBe(false);
    expect(isDataFixPath('/')).toBe(false);
  });

  test('returns false for invalid sub-paths', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/invalid')).toBe(false);
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/update/extra')).toBe(false);
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/update-all/extra')).toBe(false);
  });

  test('returns false for paths that start with data-fix but are not exact', () => {
    expect(isDataFixPath('/tree/ophir/data-fix-something')).toBe(false);
    expect(isDataFixPath('/tree/ophir/data-fix-something/fix-add-death')).toBe(false);
  });

  test('returns false for typos in sub-paths', () => {
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/updat')).toBe(false);
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/updates')).toBe(false);
    expect(isDataFixPath('/tree/ophir/data-fix/fix-add-death/update-alls')).toBe(false);
  });
});

describe('isDataFixPath integration with isNodeRoute', () => {
  test('/tree/ophir/data-fix is a Node route', () => {
    const url = urlFor('/tree/ophir/data-fix');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/data-fix/ is a Node route', () => {
    const url = urlFor('/tree/ophir/data-fix/');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/data-fix/fix-add-death is a Node route', () => {
    const url = urlFor('/tree/ophir/data-fix/fix-add-death');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/data-fix/fix-add-death/ is a Node route', () => {
    const url = urlFor('/tree/ophir/data-fix/fix-add-death/');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/data-fix/fix-add-death/update is a Node route', () => {
    const url = urlFor('/tree/ophir/data-fix/fix-add-death/update');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/data-fix/fix-add-death/update/ is a Node route', () => {
    const url = urlFor('/tree/ophir/data-fix/fix-add-death/update/');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/data-fix/fix-add-death/update-all is a Node route', () => {
    const url = urlFor('/tree/ophir/data-fix/fix-add-death/update-all');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/data-fix/fix-add-death/update-all/ is a Node route', () => {
    const url = urlFor('/tree/ophir/data-fix/fix-add-death/update-all/');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/data-fix/fix-add-death/data is a Node route', () => {
    const url = urlFor('/tree/ophir/data-fix/fix-add-death/data');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/data-fix/fix-add-death/data/ is a Node route', () => {
    const url = urlFor('/tree/ophir/data-fix/fix-add-death/data/');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/data-fix/fix-add-death/preview is a Node route', () => {
    const url = urlFor('/tree/ophir/data-fix/fix-add-death/preview');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/data-fix/fix-add-death/preview/ is a Node route', () => {
    const url = urlFor('/tree/ophir/data-fix/fix-add-death/preview/');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/ophir/data-fix', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fdata-fix');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/ophir/data-fix/fix-add-death', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fdata-fix%2Ffix-add-death');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/ophir/data-fix/fix-add-death/update', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fdata-fix%2Ffix-add-death%2Fupdate');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('unrelated /tree paths are not Node routes', () => {
    const url = urlFor('/tree/ophir/location/L1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(false);
  });

  test('paths with typos are not Node routes', () => {
    const url = urlFor('/tree/ophir/data-fixes');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(false);
  });
});
