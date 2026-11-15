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
import { renderEditControl, renderEditGedcomFields } from '../pages-server/gedcom-edit-widgets.mjs';

describe('gedcom-edit-widgets.mjs', () => {
  describe('renderEditControl', () => {
    test('a plain text element with no controlled vocabulary renders a text input', () => {
      const html = renderEditControl({ id: 'f1', name: 'values[]', value: 'farmer', tag: 'INDI:OCCU', treeName: 'tree1' });
      expect(html).toContain('type="text"');
      expect(html).toContain('id="f1"');
      expect(html).toContain('value="farmer"');
    });

    test('an element with controlled values renders a select with the value included', () => {
      const html = renderEditControl({ id: 'f1', name: 'values[]', value: 'Y', tag: 'INDI:ADOP:FAMC:ADOP', treeName: 'tree1' });
      expect(html).toContain('<select');
      expect(html).toContain('selected="selected"');
    });

    test('sex renders inline radio buttons with the current value checked', () => {
      const html = renderEditControl({ id: 'f1', name: 'values[]', value: 'F', tag: 'INDI:SEX', treeName: 'tree1' });
      expect(html).toContain('type="radio"');
      expect(html).toMatch(/value="F"[^>]*checked="checked"/);
    });

    test('boolean-y event renders a hidden input plus a checkbox, checked when there is a value', () => {
      const html = renderEditControl({ id: 'f1', name: 'values[]', value: 'Y', tag: 'FAM:MARR', treeName: 'tree1' });
      expect(html).toContain('type="hidden"');
      expect(html).toContain('type="checkbox"');
      expect(html).toContain('checked="checked"');
    });

    test('boolean-y event unchecked when there is no value', () => {
      const html = renderEditControl({ id: 'f1', name: 'values[]', value: '', tag: 'FAM:MARR', treeName: 'tree1' });
      expect(html).not.toContain('checked="checked"');
    });

    test('date renders a text input inside an input-group with a calendar affordance', () => {
      const html = renderEditControl({ id: 'f1', name: 'values[]', value: '1 JAN 1900', tag: 'INDI:BIRT:DATE', treeName: 'tree1' });
      expect(html).toContain('input-group');
      expect(html).toContain('value="1 JAN 1900"');
    });

    test('place renders a text input with the autocomplete URL for the given tree', () => {
      const html = renderEditControl({ id: 'f1', name: 'values[]', value: 'London', tag: 'INDI:BIRT:PLAC', treeName: 'my tree' });
      expect(html).toContain('data-wt-autocomplete-url="/tree/my%20tree/autocomplete/place"');
    });

    test('an xref element renders a select populated from the pre-fetched records for that type', () => {
      const html = renderEditControl({
        id: 'f1',
        name: 'values[]',
        value: '@I1@',
        tag: 'INDI:BIRT:FAMC',
        treeName: 'tree1',
        xrefOptions: { FAM: [{ xref: 'F1', label: 'Smith family' }] },
      });
      expect(html).toContain('<select');
      expect(html).toContain('Smith family');
    });

    test('xref select marks the matching record selected', () => {
      const html = renderEditControl({
        id: 'f1',
        name: 'values[]',
        value: '@F1@',
        tag: 'INDI:BIRT:FAMC',
        treeName: 'tree1',
        xrefOptions: { FAM: [{ xref: 'F1', label: 'Smith family' }, { xref: 'F2', label: 'Jones family' }] },
      });
      expect(html).toMatch(/value="@F1@"\s*selected="selected"/);
      expect(html).not.toMatch(/value="@F2@"\s*selected="selected"/);
    });

    test('an existing inline note renders a textarea', () => {
      const html = renderEditControl({ id: 'f1', name: 'values[]', value: 'Some note text', tag: 'INDI:NOTE', treeName: 'tree1' });
      expect(html).toContain('<textarea');
      expect(html).toContain('Some note text');
    });

    test('an existing shared-note xref renders the xref select, not a textarea', () => {
      const html = renderEditControl({
        id: 'f1',
        name: 'values[]',
        value: '@N1@',
        tag: 'INDI:NOTE',
        treeName: 'tree1',
        xrefOptions: { NOTE: [{ xref: 'N1', label: 'Shared note one' }] },
      });
      expect(html).toContain('<select');
      expect(html).toContain('Shared note one');
    });

    test('a fresh empty note renders the inline/shared radio toggle', () => {
      const html = renderEditControl({ id: 'f1', name: 'values[]', value: '', tag: 'INDI:NOTE', treeName: 'tree1' });
      expect(html).toContain('note-structure');
      expect(html).toContain('type="radio"');
    });

    test('EmptyElement renders a single hidden input, nothing else', () => {
      const html = renderEditControl({ id: 'f1', name: 'values[]', value: '', tag: 'FAM:MARR:HUSB', treeName: 'tree1' });
      expect(html).toBe('<input class="form-control" type="hidden" id="f1" name="values[]" value="" />');
    });

    test('unknown tags fall back to a plain text input', () => {
      const html = renderEditControl({ id: 'f1', name: 'values[]', value: 'x', tag: 'INDI:NOT_A_REAL_TAG', treeName: 'tree1' });
      expect(html).toContain('type="text"');
    });

    test('values are HTML-escaped', () => {
      const html = renderEditControl({ id: 'f1', name: 'values[]', value: '<script>alert(1)</script>', tag: 'INDI:OCCU', treeName: 'tree1' });
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('renderEditGedcomFields', () => {
    test('renders one row per GEDCOM line with level/tag hidden fields', () => {
      const html = renderEditGedcomFields({
        gedcom: '1 BIRT\n2 DATE 1 JAN 1900\n2 PLAC London',
        hierarchy: ['INDI'],
        treeName: 'tree1',
      });
      expect(html).toContain('value="1"');
      expect(html).toContain('value="BIRT"');
      expect(html).toContain('value="DATE"');
      expect(html).toContain('value="1 JAN 1900"');
      expect(html).toContain('value="PLAC"');
      expect(html).toContain('value="London"');
    });

    test('an EmptyElement line with no value renders only 3 hidden inputs, no labelled row', () => {
      const html = renderEditGedcomFields({
        gedcom: '1 MARR\n2 HUSB\n3 AGE',
        hierarchy: ['FAM'],
        treeName: 'tree1',
      });
      // HUSB (EmptyElement, empty value) should not get a "col-form-label" row.
      const husbIndex = html.indexOf('value="HUSB"');
      const beforeHusb = html.slice(Math.max(0, husbIndex - 200), husbIndex);
      expect(beforeHusb).not.toContain('col-form-label');
    });

    test('a fact with real subtag values produces label rows for each', () => {
      const html = renderEditGedcomFields({
        gedcom: '1 OCCU farmer',
        hierarchy: ['INDI'],
        treeName: 'tree1',
      });
      expect(html).toContain('col-form-label');
      expect(html).toContain('value="farmer"');
    });

    test('nests subtags with a collapsible-children parent inside a wt-nested-edit-fields wrapper', () => {
      const html = renderEditGedcomFields({
        gedcom: '1 BIRT\n2 PLAC London\n3 FORM City, Country',
        hierarchy: ['INDI'],
        treeName: 'tree1',
      });
      expect(html).toContain('wt-nested-edit-fields');
    });

    test('passes xrefOptions through to xref-widget subtags', () => {
      const html = renderEditGedcomFields({
        gedcom: '1 BIRT\n2 FAMC @F1@',
        hierarchy: ['INDI'],
        treeName: 'tree1',
        xrefOptions: { FAM: [{ xref: 'F1', label: 'Smith family' }] },
      });
      expect(html).toContain('Smith family');
    });
  });
});
