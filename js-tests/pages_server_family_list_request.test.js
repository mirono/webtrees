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
import { resolveListRequest, needsGivenNameSublist, listUrl } from '../pages-server/family-list.mjs';

function baseParams(overrides = {}) {
  return {
    treeName: 'ophir',
    routeSegment: 'family-list',
    surnameParam: '',
    alpha: '',
    falpha: '',
    show: '',
    showAll: '',
    showMarnm: '',
    showAllFirstnames: '',
    ...overrides,
  };
}

describe('listUrl', () => {
  test('omits empty/null/undefined params', () => {
    expect(listUrl('family-list', 'ophir', { surname: 'SMITH', falpha: '', show_marnm: null, alpha: undefined })).toBe(
      '/tree/ophir/family-list?surname=SMITH',
    );
  });

  test('with no params at all, just the bare route', () => {
    expect(listUrl('family-list', 'ophir', {})).toBe('/tree/ophir/family-list');
  });
});

describe('resolveListRequest', () => {
  const allSurns = new Map([['SMITH', ['Smith', 'SMITH']]]);
  const allSurnames = new Map([['SMITH', new Map([['Smith', 5]])]]);

  test('redirects when the raw surname param does not match its normalized/uppercased form', () => {
    const result = resolveListRequest(baseParams({ surnameParam: 'smith' }), allSurns, allSurnames, true);
    expect(result.kind).toBe('redirect');
    expect(result.url).toContain('surname=SMITH');
  });

  test('a surname not present in allSurns is "not-found", redirecting to the bare list', () => {
    const result = resolveListRequest(baseParams({ surnameParam: 'NOPE' }), allSurns, allSurnames, true);
    expect(result.kind).toBe('not-found');
    expect(result.url).toBe('/tree/ophir/family-list');
  });

  test('a real surname resolves to the "indi" show mode with a variants-joined legend', () => {
    const result = resolveListRequest(baseParams({ surnameParam: 'SMITH' }), allSurns, allSurnames, true);
    expect(result.kind).toBe('ok');
    expect(result.show).toBe('indi');
    expect(result.surname).toBe('SMITH');
    expect(result.legendHtml).toBe('<bdi>Smith</bdi>');
    expect(result.title).toBe('Families — <bdi>Smith</bdi>');
  });

  test('IndividualListModule title wording (showFamilies=false)', () => {
    const result = resolveListRequest(baseParams({ surnameParam: 'SMITH' }), allSurns, allSurnames, false);
    expect(result.title).toBe('Individuals — <bdi>Smith</bdi>');
  });

  test('multiple real spellings under one canonical surname are joined with "/", collation-sorted', () => {
    const surnames = new Map([['SMITH', new Map([['Smythe', 1], ['Smith', 5]])]]);
    const result = resolveListRequest(baseParams({ surnameParam: 'SMITH' }), allSurns, surnames, true);
    expect(result.legendHtml).toBe('<bdi>Smith/Smythe</bdi>');
  });

  test('alpha="@" (unknown surname) resolves surname to the NOMEN_NESCIO sentinel', () => {
    const result = resolveListRequest(baseParams({ alpha: '@' }), allSurns, allSurnames, true);
    expect(result.kind).toBe('ok');
    expect(result.surname).toBe('@N.N.');
    expect(result.show).toBe('indi');
    expect(result.legendHtml).toBe('<bdi>…</bdi>');
  });

  test('alpha="," (no surname) resolves to "No surname" legend, forces show="indi" ("SURN list makes no sense here")', () => {
    const result = resolveListRequest(baseParams({ alpha: ',' }), allSurns, allSurnames, true);
    expect(result.kind).toBe('ok');
    expect(result.legendHtml).toBe('<bdi>No surname</bdi>');
    expect(result.show).toBe('indi');
  });

  test('a plain alpha letter resolves to a "<letter>…" legend', () => {
    const result = resolveListRequest(baseParams({ alpha: 'S' }), allSurns, allSurnames, true);
    expect(result.legendHtml).toBe('<bdi>S…</bdi>');
  });

  test('no params at all -> show="none", legend is just an ellipsis', () => {
    const result = resolveListRequest(baseParams(), allSurns, allSurnames, true);
    expect(result.show).toBe('none');
    expect(result.legendHtml).toBe('<bdi>…</bdi>');
  });

  test('show_all=yes resolves to the "All" legend, show stays whatever was passed unless show_all_firstnames', () => {
    const result = resolveListRequest(baseParams({ showAll: 'yes' }), allSurns, allSurnames, true);
    expect(result.legendHtml).toBe('<bdi>All</bdi>');
  });

  test('show_all=yes + show_all_firstnames=yes forces show="indi"', () => {
    const result = resolveListRequest(baseParams({ showAll: 'yes', showAllFirstnames: 'yes' }), allSurns, allSurnames, true);
    expect(result.show).toBe('indi');
  });

  test('a surname containing HTML-significant characters is escaped in the legend', () => {
    const surns = new Map([['<B>', ['<B>']]]);
    const surnames = new Map([['<B>', new Map([['<B>', 1]])]]);
    const result = resolveListRequest(baseParams({ surnameParam: '<B>' }), surns, surnames, true);
    expect(result.kind).toBe('ok');
    expect(result.legendHtml).toBe('<bdi>&lt;B&gt;</bdi>');
  });
});

describe('needsGivenNameSublist', () => {
  test('false when the trigger is 0 (disabled)', () => {
    expect(needsGivenNameSublist(0, 1000)).toBe(false);
  });

  test('false when below the trigger', () => {
    expect(needsGivenNameSublist(200, 199)).toBe(false);
  });

  test('true at or above the trigger', () => {
    expect(needsGivenNameSublist(200, 200)).toBe(true);
    expect(needsGivenNameSublist(200, 201)).toBe(true);
  });
});
