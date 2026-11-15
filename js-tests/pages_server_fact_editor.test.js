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
  factId,
  splitFacts,
  level0Line,
  buildRecordGedcom,
  createFactGedcom,
  updateFactGedcom,
  deleteFactGedcom,
  canEditRecord,
  canEditFact,
  recordUrl,
  factSummaryLabel,
  copyFactToClipboard,
  pasteFactFromClipboard,
  RECORD_TYPES_WITH_CHAN,
} from '../pages-server/fact-editor.mjs';
import { createHash } from 'node:crypto';

function md5(text) {
  return createHash('md5').update(text, 'utf8').digest('hex');
}

const INDI_GEDCOM = '0 @I1@ INDI\n1 NAME John /Doe/\n1 SEX M\n1 BIRT\n2 DATE 1 JAN 1900';

describe('fact-editor.mjs', () => {
  describe('factId', () => {
    test('matches a plain md5 of the fact block', () => {
      expect(factId('1 SEX M')).toBe(md5('1 SEX M'));
    });
  });

  describe('splitFacts', () => {
    test('splits level-1 blocks, dropping the level-0 line', () => {
      const facts = splitFacts(INDI_GEDCOM);
      expect(facts).toHaveLength(3);
      expect(facts[0]).toEqual({ id: md5('1 NAME John /Doe/'), tag: 'NAME', gedcom: '1 NAME John /Doe/' });
      expect(facts[1].tag).toBe('SEX');
      expect(facts[2].tag).toBe('BIRT');
      expect(facts[2].gedcom).toBe('1 BIRT\n2 DATE 1 JAN 1900');
    });

    test('a record with no facts (e.g. a bare NOTE) returns an empty list', () => {
      expect(splitFacts('0 @N1@ NOTE Hello world')).toEqual([]);
    });
  });

  describe('level0Line/buildRecordGedcom', () => {
    test('level0Line extracts just the first line', () => {
      expect(level0Line(INDI_GEDCOM)).toBe('0 @I1@ INDI');
    });

    test('buildRecordGedcom joins level0 + facts with newlines', () => {
      expect(buildRecordGedcom('0 @I1@ INDI', ['1 SEX M', '1 OCCU farmer'])).toBe('0 @I1@ INDI\n1 SEX M\n1 OCCU farmer');
    });
  });

  describe('createFactGedcom', () => {
    test('appends a new fact at the end when no beforeFactId is given', () => {
      const result = createFactGedcom(INDI_GEDCOM, '1 OCCU farmer');
      expect(result).toBe(`${INDI_GEDCOM}\n1 OCCU farmer`);
    });

    test('inserts a new fact before a matching existing fact id', () => {
      const sexId = md5('1 SEX M');
      const result = createFactGedcom(INDI_GEDCOM, '1 OCCU farmer', sexId);
      expect(result).toBe('0 @I1@ INDI\n1 NAME John /Doe/\n1 OCCU farmer\n1 SEX M\n1 BIRT\n2 DATE 1 JAN 1900');
    });

    test('appends at the end if beforeFactId does not match anything', () => {
      const result = createFactGedcom(INDI_GEDCOM, '1 OCCU farmer', 'nonexistent');
      expect(result).toBe(`${INDI_GEDCOM}\n1 OCCU farmer`);
    });
  });

  describe('updateFactGedcom', () => {
    test('replaces the matching fact in place', () => {
      const sexId = md5('1 SEX M');
      const result = updateFactGedcom(INDI_GEDCOM, sexId, '1 SEX F');
      expect(result).toBe('0 @I1@ INDI\n1 NAME John /Doe/\n1 SEX F\n1 BIRT\n2 DATE 1 JAN 1900');
    });

    test('leaves the record unchanged (fact just dropped) if no fact matches', () => {
      const result = updateFactGedcom(INDI_GEDCOM, 'nonexistent', '1 SEX F');
      expect(result).toBe(INDI_GEDCOM);
    });
  });

  describe('deleteFactGedcom', () => {
    test('removes the matching fact', () => {
      const sexId = md5('1 SEX M');
      const result = deleteFactGedcom(INDI_GEDCOM, sexId);
      expect(result).toBe('0 @I1@ INDI\n1 NAME John /Doe/\n1 BIRT\n2 DATE 1 JAN 1900');
    });

    test('only removes the first match when two facts are identical', () => {
      const gedcom = '0 @I1@ INDI\n1 OCCU farmer\n1 OCCU farmer';
      const occuId = md5('1 OCCU farmer');
      const result = deleteFactGedcom(gedcom, occuId);
      expect(result).toBe('0 @I1@ INDI\n1 OCCU farmer');
    });
  });

  describe('canEditRecord', () => {
    const facts = splitFacts(INDI_GEDCOM);

    test('denies a pending-deletion record regardless of role', () => {
      expect(canEditRecord({ isPendingDeletion: true, isManager: true, isEditor: true, facts })).toBe(false);
    });

    test('a manager can always edit (bypasses locked/editor checks)', () => {
      const lockedFacts = splitFacts('0 @I1@ INDI\n1 RESN LOCKED');
      expect(canEditRecord({ isPendingDeletion: false, isManager: true, isEditor: false, facts: lockedFacts })).toBe(true);
    });

    test('a non-editor cannot edit', () => {
      expect(canEditRecord({ isPendingDeletion: false, isManager: false, isEditor: false, facts })).toBe(false);
    });

    test('an editor can edit an unlocked record', () => {
      expect(canEditRecord({ isPendingDeletion: false, isManager: false, isEditor: true, facts })).toBe(true);
    });

    test('an editor (non-manager) cannot edit a RESN-LOCKED record', () => {
      const lockedFacts = splitFacts('0 @I1@ INDI\n1 RESN LOCKED');
      expect(canEditRecord({ isPendingDeletion: false, isManager: false, isEditor: true, facts: lockedFacts })).toBe(false);
    });
  });

  describe('canEditFact', () => {
    test('a manager can edit RESN/CHAN facts', () => {
      expect(canEditFact({ isPendingDeletion: false, isManager: true, isEditor: false, tag: 'RESN', factGedcom: '1 RESN NONE' })).toBe(true);
      expect(canEditFact({ isPendingDeletion: false, isManager: true, isEditor: false, tag: 'CHAN', factGedcom: '1 CHAN' })).toBe(true);
    });

    test('a non-manager editor cannot edit RESN or CHAN facts', () => {
      expect(canEditFact({ isPendingDeletion: false, isManager: false, isEditor: true, tag: 'RESN', factGedcom: '1 RESN NONE' })).toBe(false);
      expect(canEditFact({ isPendingDeletion: false, isManager: false, isEditor: true, tag: 'CHAN', factGedcom: '1 CHAN' })).toBe(false);
    });

    test('a non-manager editor cannot edit a fact carrying its own RESN LOCKED subtag', () => {
      expect(
        canEditFact({ isPendingDeletion: false, isManager: false, isEditor: true, tag: 'OCCU', factGedcom: '1 OCCU farmer\n2 RESN LOCKED' }),
      ).toBe(false);
    });

    test('a non-manager editor can edit an ordinary unlocked fact', () => {
      expect(canEditFact({ isPendingDeletion: false, isManager: false, isEditor: true, tag: 'OCCU', factGedcom: '1 OCCU farmer' })).toBe(true);
    });

    test('a non-editor cannot edit anything', () => {
      expect(canEditFact({ isPendingDeletion: false, isManager: false, isEditor: false, tag: 'OCCU', factGedcom: '1 OCCU farmer' })).toBe(false);
    });
  });

  describe('RECORD_TYPES_WITH_CHAN', () => {
    test('includes the main editable types but not FAM-link structural tags', () => {
      expect(RECORD_TYPES_WITH_CHAN.has('INDI')).toBe(true);
      expect(RECORD_TYPES_WITH_CHAN.has('FAM')).toBe(true);
      expect(RECORD_TYPES_WITH_CHAN.has('SUBN')).toBe(false);
    });
  });

  describe('recordUrl', () => {
    test('maps each record type to its own route segment', () => {
      expect(recordUrl('tree1', 'INDI', 'I1')).toBe('/tree/tree1/individual/I1');
      expect(recordUrl('tree1', 'FAM', 'F1')).toBe('/tree/tree1/family/F1');
      expect(recordUrl('tree1', 'OBJE', 'M1')).toBe('/tree/tree1/media/M1');
    });

    test('URL-encodes the tree name and xref', () => {
      expect(recordUrl('my tree', 'NOTE', 'N 1')).toBe('/tree/my%20tree/note/N%201');
    });
  });

  describe('factSummaryLabel', () => {
    test('shows the element label plus a non-empty, non-Y value', () => {
      expect(factSummaryLabel('INDI', 'OCCU', '1 OCCU farmer')).toBe('Occupation: farmer');
    });

    test('shows just the label when the value is empty', () => {
      expect(factSummaryLabel('INDI', 'BIRT', '1 BIRT')).toBe('Birth');
    });

    test('shows just the label when the value is the boolean-y placeholder "Y"', () => {
      expect(factSummaryLabel('FAM', 'MARR', '1 MARR Y')).toBe('Marriage');
    });
  });

  describe('clipboard', () => {
    test('copyFactToClipboard stores a fact keyed by record type and fact id', () => {
      const session = {};
      copyFactToClipboard(session, 'INDI', 'abcd', '1 OCCU farmer');
      expect(session.clipboard).toEqual({ INDI: { abcd: '1 OCCU farmer' } });
    });

    test('pasteFactFromClipboard retrieves a stored fact', () => {
      const session = { clipboard: { INDI: { abcd: '1 OCCU farmer' } } };
      expect(pasteFactFromClipboard(session, 'INDI', 'abcd')).toBe('1 OCCU farmer');
    });

    test('pasteFactFromClipboard returns null when nothing matches', () => {
      expect(pasteFactFromClipboard({}, 'INDI', 'abcd')).toBeNull();
      expect(pasteFactFromClipboard({ clipboard: { FAM: {} } }, 'INDI', 'abcd')).toBeNull();
    });

    test('copying the same fact id again moves it to the end (dedup)', () => {
      const session = { clipboard: { INDI: { a: '1 OCCU x', b: '1 OCCU y' } } };
      copyFactToClipboard(session, 'INDI', 'a', '1 OCCU x-updated');
      expect(Object.keys(session.clipboard.INDI)).toEqual(['b', 'a']);
      expect(session.clipboard.INDI.a).toBe('1 OCCU x-updated');
    });

    test('keeps only the last 10 entries per record type', () => {
      const session = {};
      for (let i = 0; i < 12; i += 1) {
        copyFactToClipboard(session, 'INDI', `fact${i}`, `1 OCCU ${i}`);
      }
      const keys = Object.keys(session.clipboard.INDI);
      expect(keys).toHaveLength(10);
      expect(keys).toEqual(['fact2', 'fact3', 'fact4', 'fact5', 'fact6', 'fact7', 'fact8', 'fact9', 'fact10', 'fact11']);
    });
  });
});
