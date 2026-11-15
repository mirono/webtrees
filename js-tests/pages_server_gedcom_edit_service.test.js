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
  elementFor,
  isHiddenTag,
  canonicalValue,
  defaultValueFor,
  editLinesToGedcom,
  insertMissingFactSubtags,
  insertMissingRecordSubtags,
  factsToAdd,
  newFamilyFacts,
  newIndividualFacts,
} from '../pages-server/gedcom-edit-service.mjs';

describe('gedcom-edit-service.mjs', () => {
  describe('elementFor', () => {
    test('exact match returns the registered element', () => {
      const element = elementFor('INDI:BIRT');
      expect(element.label).toBe('Birth');
      expect(element.subtags).toBeDefined();
    });

    test('wildcard match resolves INDI:BIRT:SOUR via INDI:*:SOUR', () => {
      const element = elementFor('INDI:BIRT:SOUR');
      expect(element.widget).toBe('xref:SOUR');
    });

    test('wildcard match also resolves a different fact, FAM:MARR:SOUR', () => {
      const element = elementFor('FAM:MARR:SOUR');
      expect(element.widget).toBe('xref:SOUR');
    });

    test('unknown tag falls back to a plain-text unknown element', () => {
      const element = elementFor('INDI:NOT_A_REAL_TAG');
      expect(element).toEqual({ label: '', widget: 'text', values: {}, subtags: {}, collapseChildren: false });
    });

    test('SEX resolves to the sex-radio widget', () => {
      expect(elementFor('INDI:SEX').widget).toBe('sex-radio');
    });

    test('EmptyElement tags resolve to the empty widget', () => {
      expect(elementFor('FAM:MARR:HUSB').widget).toBe('empty');
      expect(elementFor('SOUR:DATA').widget).toBe('empty');
    });
  });

  describe('isHiddenTag', () => {
    test('returns false when the flag is off', () => {
      expect(isHiddenTag('INDI:NAME:NPFX', { NAME_NPFX: false })).toBe(false);
    });

    test('returns true when the flag is on and the tag matches', () => {
      expect(isHiddenTag('INDI:NAME:NPFX', { NAME_NPFX: true })).toBe(true);
    });

    test('unrelated flags being on does not hide an unrelated tag', () => {
      expect(isHiddenTag('INDI:OCCU', { NAME_NPFX: true, SSN: true })).toBe(false);
    });

    test('a substring match still requires its own flag, not just any truthy flag', () => {
      expect(isHiddenTag('INDI:BAPM', { CHR: true })).toBe(false);
      expect(isHiddenTag('INDI:BAPM', { BAPM: true })).toBe(true);
    });
  });

  describe('canonicalValue', () => {
    test('collapses whitespace and trims', () => {
      expect(canonicalValue('INDI:OCCU', '  farmer   and   fisher  ')).toBe('farmer and fisher');
    });

    test('converts newlines/tabs to single spaces before collapsing', () => {
      expect(canonicalValue('INDI:OCCU', 'line1\nline2\tline3')).toBe('line1 line2 line3');
    });

    test('uppercases sex values', () => {
      expect(canonicalValue('INDI:SEX', 'm')).toBe('M');
    });

    test('normalizes a lowercase boolean-y "y" to "Y"', () => {
      expect(canonicalValue('FAM:MARR', 'y')).toBe('Y');
    });

    test('normalizes place commas and spacing', () => {
      expect(canonicalValue('INDI:BIRT:PLAC', 'London ,England ,  UK')).toBe('London, England, UK');
    });

    test('drops a bare "//" NAME value to empty', () => {
      expect(canonicalValue('INDI:NAME', '//')).toBe('');
    });
  });

  describe('defaultValueFor', () => {
    test('sex defaults to U', () => {
      expect(defaultValueFor('INDI:SEX')).toBe('U');
    });

    test('everything else defaults to empty', () => {
      expect(defaultValueFor('INDI:OCCU')).toBe('');
      expect(defaultValueFor('INDI:BIRT:DATE')).toBe('');
    });
  });

  describe('editLinesToGedcom', () => {
    test('assembles a simple fact with a date and place', () => {
      const gedcom = editLinesToGedcom('INDI', ['1', '2', '2'], ['BIRT', 'DATE', 'PLAC'], ['', '1 JAN 1900', 'London'], true);
      expect(gedcom).toBe('\n1 BIRT\n2 DATE 1 JAN 1900\n2 PLAC London');
    });

    test('omits a line and its childless siblings when every value is empty', () => {
      const gedcom = editLinesToGedcom('INDI', ['1', '2'], ['OCCU', 'TYPE'], ['', ''], true);
      expect(gedcom).toBe('');
    });

    test('keeps a parent line when a child has a value even if the parent is blank', () => {
      const gedcom = editLinesToGedcom('INDI', ['1', '2'], ['BIRT', 'DATE'], ['', '1900'], true);
      expect(gedcom).toBe('\n1 BIRT\n2 DATE 1900');
    });

    test('does not prefix with a newline when append is false', () => {
      const gedcom = editLinesToGedcom('INDI', ['1'], ['SEX'], ['M'], false);
      expect(gedcom).toBe('1 SEX M');
    });

    test('blanks "1 FACT Y" when a DATE or PLAC child has a value', () => {
      const gedcom = editLinesToGedcom('FAM', ['1', '2'], ['MARR', 'DATE'], ['Y', '1900'], true);
      expect(gedcom).toBe('\n1 MARR\n2 DATE 1900');
    });

    test('keeps "1 FACT Y" when no DATE/PLAC child has a value', () => {
      const gedcom = editLinesToGedcom('FAM', ['1'], ['MARR'], ['Y'], true);
      expect(gedcom).toBe('\n1 MARR Y');
    });

    test('splits a multi-line value into CONT continuation lines (via the NOTE:CONC textarea element)', () => {
      const gedcom = editLinesToGedcom('NOTE', ['1'], ['CONC'], ['line one\nline two'], false);
      expect(gedcom).toBe('1 CONC line one\n1 CONT line two');
    });

    test('a generic (non-textarea) element collapses embedded newlines to spaces instead of splitting', () => {
      const gedcom = editLinesToGedcom('INDI', ['1'], ['OCCU'], ['line one\nline two'], false);
      expect(gedcom).toBe('1 OCCU line one line two');
    });
  });

  describe('insertMissingFactSubtags', () => {
    test('leaves an existing DATE subtag untouched and adds missing optional ones as blank', () => {
      const result = insertMissingFactSubtags('INDI:BIRT', '1 BIRT\n2 DATE 1 JAN 1900', false, {});
      expect(result).toContain('2 DATE 1 JAN 1900');
      expect(result).toContain('2 PLAC');
    });

    test('a fresh fact gets every non-hidden subtag inserted blank', () => {
      const result = insertMissingFactSubtags('INDI:SEX', '1 SEX', false, {});
      expect(result).toBe('1 SEX');
    });

    test('hidden subtags are skipped when includeHidden is false', () => {
      const result = insertMissingFactSubtags('INDI:NAME', '1 NAME John /Doe/', false, { NAME_NPFX: true });
      expect(result).not.toContain('2 NPFX');
    });

    test('hidden subtags are included when includeHidden is true', () => {
      const result = insertMissingFactSubtags('INDI:NAME', '1 NAME John /Doe/', true, { NAME_NPFX: true });
      expect(result).toContain('2 NPFX');
    });
  });

  describe('insertMissingRecordSubtags', () => {
    test('strips the level-0 line from a normal record', () => {
      const result = insertMissingRecordSubtags('FAM', '0 @F1@ FAM', false, {});
      expect(result.startsWith('0')).toBe(false);
    });

    test('NOTE records get the level-0 line converted to a CONC line instead of stripped', () => {
      const result = insertMissingRecordSubtags('NOTE', '0 @N1@ NOTE Hello', false, {});
      expect(result.startsWith('1 CONC')).toBe(true);
    });
  });

  describe('factsToAdd', () => {
    test('excludes structural link tags (FAMC/FAMS/CHIL/HUSB/WIFE/CHAN)', () => {
      const tags = factsToAdd('INDI', () => false, false, {});
      expect(tags).not.toContain('FAMC');
      expect(tags).not.toContain('FAMS');
      expect(tags).not.toContain('CHAN');
    });

    test('excludes a single-occurrence fact that already exists', () => {
      const tags = factsToAdd('INDI', (tag) => tag === 'SEX', false, {});
      expect(tags).not.toContain('SEX');
    });

    test('keeps a repeatable fact even if one already exists', () => {
      const tags = factsToAdd('INDI', (tag) => tag === 'OCCU', false, {});
      expect(tags).toContain('OCCU');
    });

    test('excludes tags hidden via the record-level filter regardless of includeHidden', () => {
      const tagsVisible = factsToAdd('INDI', () => false, true, { RELI: true });
      expect(tagsVisible).not.toContain('RELI');
    });

    test('includeHidden has no effect on the result either way (real-PHP quirk: the hidden-tag filter is unconditional)', () => {
      const withHiddenTrue = factsToAdd('INDI', () => false, true, { RELI: true, SSN: true });
      const withHiddenFalse = factsToAdd('INDI', () => false, false, { RELI: true, SSN: true });
      expect(withHiddenTrue).toEqual(withHiddenFalse);
      expect(withHiddenTrue).not.toContain('RELI');
      expect(withHiddenTrue).not.toContain('SSN');
    });
  });

  describe('newFamilyFacts/newIndividualFacts', () => {
    test('newFamilyFacts builds one entry per configured quick-fact tag', () => {
      const tree = { getPreference: (key) => (key === 'QUICK_REQUIRED_FAMFACTS' ? 'MARR,DIV' : '') };
      const facts = newFamilyFacts(tree);
      expect(facts.map((f) => f.tag)).toEqual(['MARR', 'DIV']);
      expect(facts[0].gedcom).toBe('1 MARR');
    });

    test('newFamilyFacts ignores an empty preference', () => {
      const tree = { getPreference: () => '' };
      expect(newFamilyFacts(tree)).toEqual([]);
    });

    test('newIndividualFacts always leads with SEX then the supplied names, then quick facts', () => {
      const tree = { getPreference: (key) => (key === 'QUICK_REQUIRED_FACTS' ? 'OCCU' : '') };
      const facts = newIndividualFacts(tree, 'M', ['1 NAME John /Doe/']);
      expect(facts).toEqual([
        { tag: 'SEX', gedcom: '1 SEX M' },
        { tag: 'NAME', gedcom: '1 NAME John /Doe/' },
        { tag: 'OCCU', gedcom: '1 OCCU' },
      ]);
    });
  });
});
