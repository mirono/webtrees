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
  matchAddChildToFamilyPagePath,
  matchAddChildToFamilyActionPath,
  matchAddSpouseToFamilyPagePath,
  matchAddSpouseToFamilyActionPath,
  matchAddChildToIndividualPath,
  matchAddParentToIndividualPagePath,
  matchAddParentToIndividualActionPath,
  matchAddSpouseToIndividualPath,
  matchAddUnlinkedIndividualPath,
  matchLinkChildToFamilyPath,
  matchLinkSpouseToIndividualPath,
  matchDeleteRecordPath,
  matchDeleteFactPath,
} from '../pages-server/routes.mjs';

describe('matchAddChildToFamilyPagePath / matchAddChildToFamilyActionPath', () => {
  test('3-segment path matches the page (GET), not the action', () => {
    expect(matchAddChildToFamilyPagePath('/tree/ophir/add-child-to-family/F1/M')).toEqual({ tree: 'ophir', xref: 'F1', sex: 'M' });
    expect(matchAddChildToFamilyActionPath('/tree/ophir/add-child-to-family/F1/M')).toBeNull();
  });

  test('2-segment path matches the action (POST), not the page', () => {
    expect(matchAddChildToFamilyActionPath('/tree/ophir/add-child-to-family/F1')).toEqual({ tree: 'ophir', xref: 'F1' });
    expect(matchAddChildToFamilyPagePath('/tree/ophir/add-child-to-family/F1')).toBeNull();
  });
});

describe('matchAddSpouseToFamilyPagePath / matchAddSpouseToFamilyActionPath', () => {
  test('matches with and without the sex segment', () => {
    expect(matchAddSpouseToFamilyPagePath('/tree/ophir/add-spouse-to-family/F1/F')).toEqual({ tree: 'ophir', xref: 'F1', sex: 'F' });
    expect(matchAddSpouseToFamilyActionPath('/tree/ophir/add-spouse-to-family/F1')).toEqual({ tree: 'ophir', xref: 'F1' });
  });
});

describe('matchAddChildToIndividualPath', () => {
  test('matches /tree/{tree}/add-child-to-individual/{xref}', () => {
    expect(matchAddChildToIndividualPath('/tree/ophir/add-child-to-individual/I1')).toEqual({ tree: 'ophir', xref: 'I1' });
  });
});

describe('matchAddParentToIndividualPagePath / matchAddParentToIndividualActionPath', () => {
  test('matches with and without the sex segment', () => {
    expect(matchAddParentToIndividualPagePath('/tree/ophir/add-parent-to-individual/I1/M')).toEqual({ tree: 'ophir', xref: 'I1', sex: 'M' });
    expect(matchAddParentToIndividualActionPath('/tree/ophir/add-parent-to-individual/I1')).toEqual({ tree: 'ophir', xref: 'I1' });
  });
});

describe('matchAddSpouseToIndividualPath', () => {
  test('matches /tree/{tree}/add-spouse-to-individual/{xref}', () => {
    expect(matchAddSpouseToIndividualPath('/tree/ophir/add-spouse-to-individual/I1')).toEqual({ tree: 'ophir', xref: 'I1' });
  });
});

describe('matchAddUnlinkedIndividualPath', () => {
  test('matches /tree/{tree}/add-unlinked-individual', () => {
    expect(matchAddUnlinkedIndividualPath('/tree/ophir/add-unlinked-individual')).toBe('ophir');
  });
});

describe('matchLinkChildToFamilyPath / matchLinkSpouseToIndividualPath', () => {
  test('match their own /tree/{tree}/.../{xref} shapes', () => {
    expect(matchLinkChildToFamilyPath('/tree/ophir/link-child-to-family/I1')).toEqual({ tree: 'ophir', xref: 'I1' });
    expect(matchLinkSpouseToIndividualPath('/tree/ophir/link-spouse-to-individual/I1')).toEqual({ tree: 'ophir', xref: 'I1' });
  });
});

describe('matchDeleteRecordPath', () => {
  test('matches the 2-segment whole-record delete, not the 3-segment delete-fact path', () => {
    expect(matchDeleteRecordPath('/tree/ophir/delete/I1')).toEqual({ tree: 'ophir', xref: 'I1' });
    expect(matchDeleteFactPath('/tree/ophir/delete/I1')).toBeNull();
  });

  test('does not match the 3-segment delete-fact path', () => {
    expect(matchDeleteRecordPath('/tree/ophir/delete/I1/abcd1234')).toBeNull();
    expect(matchDeleteFactPath('/tree/ophir/delete/I1/abcd1234')).toEqual({ tree: 'ophir', xref: 'I1', factId: 'abcd1234' });
  });
});
