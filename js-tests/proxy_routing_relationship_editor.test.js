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
import { isRelationshipEditorPath, isFactEditorPath, isNodeRoute } from '../proxy/routing.mjs';

function urlFor(pathAndQuery) {
  return new URL(pathAndQuery, 'http://localhost');
}

describe('isRelationshipEditorPath', () => {
  test('matches AddChildToFamily with and without the sex segment', () => {
    expect(isRelationshipEditorPath('/tree/ophir/add-child-to-family/F1/M')).toBe(true);
    expect(isRelationshipEditorPath('/tree/ophir/add-child-to-family/F1')).toBe(true);
  });

  test('matches AddSpouseToFamily with and without the sex segment', () => {
    expect(isRelationshipEditorPath('/tree/ophir/add-spouse-to-family/F1/F')).toBe(true);
    expect(isRelationshipEditorPath('/tree/ophir/add-spouse-to-family/F1')).toBe(true);
  });

  test('matches AddChildToIndividual', () => {
    expect(isRelationshipEditorPath('/tree/ophir/add-child-to-individual/I1')).toBe(true);
  });

  test('matches AddParentToIndividual with and without the sex segment', () => {
    expect(isRelationshipEditorPath('/tree/ophir/add-parent-to-individual/I1/M')).toBe(true);
    expect(isRelationshipEditorPath('/tree/ophir/add-parent-to-individual/I1')).toBe(true);
  });

  test('matches AddSpouseToIndividual', () => {
    expect(isRelationshipEditorPath('/tree/ophir/add-spouse-to-individual/I1')).toBe(true);
  });

  test('matches AddUnlinkedIndividual', () => {
    expect(isRelationshipEditorPath('/tree/ophir/add-unlinked-individual')).toBe(true);
  });

  test('matches LinkChildToFamily / LinkSpouseToIndividual', () => {
    expect(isRelationshipEditorPath('/tree/ophir/link-child-to-family/I1')).toBe(true);
    expect(isRelationshipEditorPath('/tree/ophir/link-spouse-to-individual/I1')).toBe(true);
  });

  test('matches the 2-segment whole-record delete, not the 3-segment delete-fact path', () => {
    expect(isRelationshipEditorPath('/tree/ophir/delete/I1')).toBe(true);
    expect(isRelationshipEditorPath('/tree/ophir/delete/I1/abcd1234')).toBe(false);
  });

  test('isFactEditorPath covers the 3-segment delete-fact path, not the whole-record one', () => {
    expect(isFactEditorPath('/tree/ophir/delete/I1/abcd1234')).toBe(true);
    expect(isFactEditorPath('/tree/ophir/delete/I1')).toBe(false);
  });

  test('returns false for unrelated paths', () => {
    expect(isRelationshipEditorPath('/tree/ophir/individual/I1')).toBe(false);
    expect(isRelationshipEditorPath('/tree/ophir')).toBe(false);
    expect(isRelationshipEditorPath('/')).toBe(false);
  });
});

describe('isRelationshipEditorPath integration with isNodeRoute', () => {
  test('/tree/ophir/add-unlinked-individual is a Node route', () => {
    const url = urlFor('/tree/ophir/add-unlinked-individual');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('/tree/ophir/delete/I1 is a Node route', () => {
    const url = urlFor('/tree/ophir/delete/I1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });

  test('ugly-URL form ?route=/tree/ophir/link-child-to-family/I1', () => {
    const url = urlFor('/index.php?route=%2Ftree%2Fophir%2Flink-child-to-family%2FI1');
    expect(isNodeRoute(url.pathname, url.searchParams)).toBe(true);
  });
});
