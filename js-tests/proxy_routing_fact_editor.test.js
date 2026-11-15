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
import { isFactEditorPath, isNodeRoute } from '../proxy/routing.mjs';

function urlFor(pathAndQuery) {
  return new URL(pathAndQuery, 'http://localhost');
}

describe('isFactEditorPath', () => {
  test('matches AddNewFact/SelectNewFact', () => {
    expect(isFactEditorPath('/tree/ophir/add-fact/I1/OCCU')).toBe(true);
    expect(isFactEditorPath('/tree/ophir/add-fact/I1')).toBe(true);
  });

  test('matches EditFactPage/EditFactAction (with and without a fact_id)', () => {
    expect(isFactEditorPath('/tree/ophir/edit-fact/I1/abcd1234')).toBe(true);
    expect(isFactEditorPath('/tree/ophir/update-fact/I1/abcd1234')).toBe(true);
    expect(isFactEditorPath('/tree/ophir/update-fact/I1')).toBe(true);
  });

  test('matches DeleteFact/CopyFact', () => {
    expect(isFactEditorPath('/tree/ophir/delete/I1/abcd1234')).toBe(true);
    expect(isFactEditorPath('/tree/ophir/copy/I1/abcd1234')).toBe(true);
  });

  test('matches PasteFact', () => {
    expect(isFactEditorPath('/tree/ophir/paste-fact/I1')).toBe(true);
  });

  test('matches EditRawFactPage/Action and EditRawRecordPage/Action', () => {
    expect(isFactEditorPath('/tree/ophir/edit-raw/I1/abcd1234')).toBe(true);
    expect(isFactEditorPath('/tree/ophir/edit-raw/I1')).toBe(true);
  });

  test('matches EditRecordPage/EditRecordAction', () => {
    expect(isFactEditorPath('/tree/ophir/edit-record/I1')).toBe(true);
    expect(isFactEditorPath('/tree/ophir/update-record/I1')).toBe(true);
  });

  test('matches with a trailing slash', () => {
    expect(isFactEditorPath('/tree/ophir/edit-record/I1/')).toBe(true);
  });

  test('URL-decodes are not needed here - the matcher just checks shape', () => {
    expect(isFactEditorPath('/tree/my%20tree/edit-record/I1')).toBe(true);
  });

  test('returns false for unrelated paths', () => {
    expect(isFactEditorPath('/tree/ophir')).toBe(false);
    expect(isFactEditorPath('/tree/ophir/individual/I1')).toBe(false);
    expect(isFactEditorPath('/tree/ophir/data-fix')).toBe(false);
    expect(isFactEditorPath('/admin/site-preferences')).toBe(false);
    expect(isFactEditorPath('/')).toBe(false);
  });

  test('returns false for paths that merely start with a recognized segment', () => {
    expect(isFactEditorPath('/tree/ophir/edit-records/I1')).toBe(false);
    expect(isFactEditorPath('/tree/ophir/deleted/I1/abcd')).toBe(false);
  });
});

describe('isFactEditorPath integration with isNodeRoute', () => {
  test('/tree/ophir/add-fact/I1/OCCU is a Node route', () => {
    const url = urlFor('/tree/ophir/add-fact/I1/OCCU');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/edit-record/I1 is a Node route', () => {
    const url = urlFor('/tree/ophir/edit-record/I1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/ophir/edit-record/I1', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fedit-record%2FI1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/ophir/delete/I1/abcd1234', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Fdelete%2FI1%2Fabcd1234');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('unrelated /tree paths are not Node routes', () => {
    const url = urlFor('/tree/ophir/location/L1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(false);
  });
});
