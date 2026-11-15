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
  matchAddNewFactPath,
  matchSelectNewFactPath,
  matchEditFactPagePath,
  matchEditFactActionPath,
  matchDeleteFactPath,
  matchCopyFactPath,
  matchPasteFactPath,
  matchEditRawFactPath,
  matchEditRawRecordPath,
  matchEditRecordPagePath,
  matchEditRecordActionPath,
} from '../pages-server/routes.mjs';

describe('matchAddNewFactPath', () => {
  test('matches /tree/{tree}/add-fact/{xref}/{fact}', () => {
    expect(matchAddNewFactPath('/tree/ophir/add-fact/I1/OCCU')).toEqual({ tree: 'ophir', xref: 'I1', fact: 'OCCU' });
  });

  test('does not match the 2-segment SelectNewFact path', () => {
    expect(matchAddNewFactPath('/tree/ophir/add-fact/I1')).toBeNull();
  });

  test('URL-decodes all parts', () => {
    expect(matchAddNewFactPath('/tree/my%20tree/add-fact/I%201/OCCU')).toEqual({ tree: 'my tree', xref: 'I 1', fact: 'OCCU' });
  });
});

describe('matchSelectNewFactPath', () => {
  test('matches /tree/{tree}/add-fact/{xref}', () => {
    expect(matchSelectNewFactPath('/tree/ophir/add-fact/I1')).toEqual({ tree: 'ophir', xref: 'I1' });
  });
});

describe('matchEditFactPagePath', () => {
  test('matches /tree/{tree}/edit-fact/{xref}/{fact_id}', () => {
    expect(matchEditFactPagePath('/tree/ophir/edit-fact/I1/abcd1234')).toEqual({ tree: 'ophir', xref: 'I1', factId: 'abcd1234' });
  });
});

describe('matchEditFactActionPath', () => {
  test('matches with a fact_id segment (editing an existing fact)', () => {
    expect(matchEditFactActionPath('/tree/ophir/update-fact/I1/abcd1234')).toEqual({ tree: 'ophir', xref: 'I1', factId: 'abcd1234' });
  });

  test('matches WITHOUT a fact_id segment (creating a new fact)', () => {
    expect(matchEditFactActionPath('/tree/ophir/update-fact/I1')).toEqual({ tree: 'ophir', xref: 'I1', factId: null });
  });
});

describe('matchDeleteFactPath', () => {
  test('matches /tree/{tree}/delete/{xref}/{fact_id}', () => {
    expect(matchDeleteFactPath('/tree/ophir/delete/I1/abcd1234')).toEqual({ tree: 'ophir', xref: 'I1', factId: 'abcd1234' });
  });
});

describe('matchCopyFactPath', () => {
  test('matches /tree/{tree}/copy/{xref}/{fact_id}', () => {
    expect(matchCopyFactPath('/tree/ophir/copy/I1/abcd1234')).toEqual({ tree: 'ophir', xref: 'I1', factId: 'abcd1234' });
  });
});

describe('matchPasteFactPath', () => {
  test('matches /tree/{tree}/paste-fact/{xref}', () => {
    expect(matchPasteFactPath('/tree/ophir/paste-fact/I1')).toEqual({ tree: 'ophir', xref: 'I1' });
  });
});

describe('matchEditRawFactPath / matchEditRawRecordPath', () => {
  test('a fact_id segment matches the fact-level route, not the record-level one', () => {
    expect(matchEditRawFactPath('/tree/ophir/edit-raw/I1/abcd1234')).toEqual({ tree: 'ophir', xref: 'I1', factId: 'abcd1234' });
    expect(matchEditRawRecordPath('/tree/ophir/edit-raw/I1/abcd1234')).toBeNull();
  });

  test('no fact_id segment matches the record-level route, not the fact-level one', () => {
    expect(matchEditRawRecordPath('/tree/ophir/edit-raw/I1')).toEqual({ tree: 'ophir', xref: 'I1' });
    expect(matchEditRawFactPath('/tree/ophir/edit-raw/I1')).toBeNull();
  });
});

describe('matchEditRecordPagePath', () => {
  test('matches /tree/{tree}/edit-record/{xref}', () => {
    expect(matchEditRecordPagePath('/tree/ophir/edit-record/I1')).toEqual({ tree: 'ophir', xref: 'I1' });
  });
});

describe('matchEditRecordActionPath', () => {
  test('matches /tree/{tree}/update-record/{xref}', () => {
    expect(matchEditRecordActionPath('/tree/ophir/update-record/I1')).toEqual({ tree: 'ophir', xref: 'I1' });
  });
});
