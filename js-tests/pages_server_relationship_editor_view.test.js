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
  renderNewIndividualPage,
  renderLinkChildToFamilyPage,
  renderLinkSpouseToIndividualPage,
} from '../pages-server/relationship-editor-view.mjs';

const TREE = { name: 'tree1', title: 'My Tree' };
const USER = { realName: 'Jane Editor' };

describe('renderNewIndividualPage', () => {
  test('renders one card per fact, grouped by prefix', () => {
    const html = renderNewIndividualPage({
      tree: TREE,
      user: USER,
      csrfToken: 'tok',
      title: 'Add a son',
      postUrl: '/tree/tree1/add-child-to-family/F1',
      url: '/tree/tree1/family/F1',
      treeName: 'tree1',
      facts: {
        i: [{ recordType: 'INDI', tag: 'SEX', gedcom: '1 SEX M' }, { recordType: 'INDI', tag: 'NAME', gedcom: '1 NAME John //' }],
      },
    });

    expect(html).toContain('Add a son');
    expect(html).toContain('action="/tree/tree1/add-child-to-family/F1"');
    expect(html).toContain('value="/tree/tree1/family/F1"');
    expect(html).toContain('name="ilevels[]"');
    expect(html).toContain('name="itags[]"');
    expect(html).toContain('name="ivalues[]"');
  });

  test('uses the right field-name prefix for family facts too', () => {
    const html = renderNewIndividualPage({
      tree: TREE,
      user: USER,
      csrfToken: 'tok',
      title: 'Add a wife',
      postUrl: '/a',
      url: '/u',
      treeName: 'tree1',
      facts: {
        i: [{ recordType: 'INDI', tag: 'SEX', gedcom: '1 SEX F' }],
        f: [{ recordType: 'FAM', tag: 'MARR', gedcom: '1 MARR' }],
      },
    });

    expect(html).toContain('name="ivalues[]"');
    expect(html).toContain('name="fvalues[]"');
  });

  test('includes a CSRF field and cancel link', () => {
    const html = renderNewIndividualPage({
      tree: TREE,
      user: USER,
      csrfToken: 'tok',
      title: 't',
      postUrl: '/a',
      url: '/u',
      treeName: 'tree1',
      facts: { i: [] },
    });

    expect(html).toContain('name="_csrf" value="tok"');
    expect(html).toContain('href="/u"');
  });
});

describe('renderLinkChildToFamilyPage', () => {
  test('renders the family select and pedigree options', () => {
    const html = renderLinkChildToFamilyPage({
      tree: TREE,
      user: USER,
      csrfToken: 'tok',
      title: 'Link this individual to an existing family as a child',
      postUrl: '/tree/tree1/link-child-to-family/I1',
      cancelUrl: '/tree/tree1/individual/I1',
      families: [{ xref: 'F1', label: 'Smith family' }],
      pedigreeOptions: [
        { key: '', label: 'Birth' },
        { key: 'ADOPTED', label: 'Adopted' },
      ],
    });

    expect(html).toContain('<option value="F1">Smith family — F1</option>');
    expect(html).toContain('<option value="ADOPTED">Adopted</option>');
    expect(html).toContain('action="/tree/tree1/link-child-to-family/I1"');
  });
});

describe('renderLinkSpouseToIndividualPage', () => {
  test('renders the spouse select, labeled correctly, and a MARR fields card', () => {
    const html = renderLinkSpouseToIndividualPage({
      tree: TREE,
      user: USER,
      csrfToken: 'tok',
      title: 'Add a wife using an existing individual',
      postUrl: '/tree/tree1/link-spouse-to-individual/I1',
      cancelUrl: '/tree/tree1/individual/I1',
      spouseLabel: 'Wife',
      individuals: [{ xref: 'I2', label: 'Jane Doe' }],
      treeName: 'tree1',
      marriageGedcom: '1 MARR',
    });

    expect(html).toContain('Wife');
    expect(html).toContain('<option value="I2">Jane Doe — I2</option>');
    expect(html).toContain('name="spid"');
    expect(html).toContain('action="/tree/tree1/link-spouse-to-individual/I1"');
  });
});
