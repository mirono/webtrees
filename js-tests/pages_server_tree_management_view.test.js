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
import * as treeView from '../pages-server/tree-management-view.mjs';

describe('tree-management-view.mjs', () => {
  describe('renderManageTreesPage', () => {
    test('renders without throwing', () => {
      const html = treeView.renderManageTreesPage({
        csrfToken: 'tok123',
        trees: [],
        defaultTreeName: '',
        canDeleteOrSetDefault: false,
      });
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });

    test('includes the tree title when trees exist', () => {
      const html = treeView.renderManageTreesPage({
        csrfToken: 'tok123',
        trees: [
          { gedcomId: 1, name: 'mytree', title: 'My Test Tree', imported: true, importing: false, isManager: true },
        ],
        defaultTreeName: 'mytree',
        canDeleteOrSetDefault: true,
      });
      expect(html).toContain('My Test Tree');
      expect(html).toContain('mytree');
    });

    test('includes CSRF token in meta tag', () => {
      const html = treeView.renderManageTreesPage({
        csrfToken: 'secrettoken123',
        trees: [],
        defaultTreeName: '',
        canDeleteOrSetDefault: false,
      });
      expect(html).toContain('secrettoken123');
      expect(html).toContain('csrf');
    });

    test('escapes XSS in tree title', () => {
      const html = treeView.renderManageTreesPage({
        csrfToken: 'tok123',
        trees: [
          { gedcomId: 1, name: 'mytree', title: '"><img src=x>', imported: true, importing: false, isManager: true },
        ],
        defaultTreeName: '',
        canDeleteOrSetDefault: false,
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });
  });

  describe('renderCreateTreePage', () => {
    test('renders without throwing', () => {
      const html = treeView.renderCreateTreePage({
        csrfToken: 'tok123',
        treeName: 'tree1',
        treeTitle: 'Tree Title',
      });
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });

    test('includes form fields for tree creation', () => {
      const html = treeView.renderCreateTreePage({
        csrfToken: 'tok123',
        treeName: 'mytree',
        treeTitle: 'My Tree',
      });
      expect(html).toContain('name="title"');
      expect(html).toContain('name="name"');
      expect(html).toContain('Create a family tree');
    });

    test('includes CSRF token in form', () => {
      const html = treeView.renderCreateTreePage({
        csrfToken: 'csrftest123',
        treeName: 'tree1',
        treeTitle: 'Title',
      });
      expect(html).toContain('csrftest123');
    });

    test('escapes XSS in tree title input', () => {
      const html = treeView.renderCreateTreePage({
        csrfToken: 'tok123',
        treeName: 'mytree',
        treeTitle: '"><img src=x>',
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });
  });

  describe('renderMergeTreesPage', () => {
    test('renders without throwing', () => {
      const html = treeView.renderMergeTreesPage({
        csrfToken: 'tok123',
        treeList: { tree1: 'Tree One' },
        tree1Name: 'tree1',
        tree2Name: 'tree2',
        xrefs: 0,
      });
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
    });

    test('includes tree selects and merge form', () => {
      const html = treeView.renderMergeTreesPage({
        csrfToken: 'tok123',
        treeList: { tree1: 'Tree One', tree2: 'Tree Two' },
        tree1Name: 'tree1',
        tree2Name: 'tree2',
        xrefs: 0,
      });
      expect(html).toContain('name="tree1_name"');
      expect(html).toContain('name="tree2_name"');
      expect(html).toContain('Merge family trees');
    });

    test('shows warning when xrefs conflict', () => {
      const html = treeView.renderMergeTreesPage({
        csrfToken: 'tok123',
        treeList: { tree1: 'Tree One', tree2: 'Tree Two' },
        tree1Name: 'tree1',
        tree2Name: 'tree2',
        xrefs: 5,
      });
      expect(html).toContain('5');
      expect(html).toContain('renumber');
    });

    test('includes CSRF token', () => {
      const html = treeView.renderMergeTreesPage({
        csrfToken: 'mergecsrf123',
        treeList: {},
        tree1Name: 'tree1',
        tree2Name: 'tree2',
        xrefs: 0,
      });
      expect(html).toContain('mergecsrf123');
    });
  });

  describe('renderTreePreferencesPage', () => {
    test('renders without throwing', () => {
      const html = treeView.renderTreePreferencesPage({
        csrfToken: 'tok123',
        tree: { gedcom_id: 1, gedcom_name: 'mytree', title: 'My Tree' },
        preferences: {},
        members: [],
        isAdmin: false,
        duplicateName: false,
      });
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
    });

    test('includes tree preferences form fields', () => {
      const html = treeView.renderTreePreferencesPage({
        csrfToken: 'tok123',
        tree: { gedcom_id: 1, gedcom_name: 'mytree', title: 'My Tree' },
        preferences: { CALENDAR_FORMAT: 'gregorian' },
        members: [],
        isAdmin: false,
        duplicateName: false,
      });
      expect(html).toContain('name="title"');
      expect(html).toContain('name="PEDIGREE_ROOT_ID"');
      expect(html).toContain('name="SUBLIST_TRIGGER_I"');
      expect(html).toContain('Preferences');
    });

    test('escapes XSS in tree title', () => {
      const html = treeView.renderTreePreferencesPage({
        csrfToken: 'tok123',
        tree: { gedcom_id: 1, gedcom_name: 'mytree', title: '"><img src=x>' },
        preferences: {},
        members: [],
        isAdmin: false,
        duplicateName: false,
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });

    test('includes member dropdown for contact users', () => {
      const html = treeView.renderTreePreferencesPage({
        csrfToken: 'tok123',
        tree: { gedcom_id: 1, gedcom_name: 'mytree', title: 'My Tree' },
        preferences: {},
        members: [{ id: 5, realName: 'Bob', userName: 'bob' }],
        isAdmin: false,
        duplicateName: false,
      });
      expect(html).toContain('name="CONTACT_USER_ID"');
      expect(html).toContain('WEBMASTER_USER_ID');
    });

    test('includes duplicate name warning when duplicateName is true', () => {
      const html = treeView.renderTreePreferencesPage({
        csrfToken: 'tok123',
        tree: { gedcom_id: 1, gedcom_name: 'duplicate', title: 'My Tree' },
        preferences: {},
        members: [],
        isAdmin: true,
        duplicateName: true,
      });
      expect(html).toContain('already exists');
      expect(html).toContain('alert-danger');
    });
  });

  describe('renderRenumberTreePage', () => {
    test('renders without throwing', () => {
      const html = treeView.renderRenumberTreePage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: 'My Tree' },
        xrefs: {},
      });
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
    });

    test('includes renumber form when duplicates exist', () => {
      const html = treeView.renderRenumberTreePage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: 'My Tree' },
        xrefs: { I5: 'INDI', F1: 'FAM' },
      });
      expect(html).toContain('Renumber XREFs');
      expect(html).toContain('2');
    });

    test('shows count of duplicate xrefs', () => {
      const html = treeView.renderRenumberTreePage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: 'My Tree' },
        xrefs: { I1: 'INDI', I2: 'INDI', I3: 'INDI' },
      });
      expect(html).toContain('3');
    });

    test('escapes XSS in tree title', () => {
      const html = treeView.renderRenumberTreePage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: '"><img src=x>' },
        xrefs: {},
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });
  });

  describe('renderTreePrivacyPage', () => {
    test('renders without throwing', () => {
      const html = treeView.renderTreePrivacyPage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: 'My Tree', private: 0 },
        preferences: {},
        restrictions: [],
      });
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
    });

    test('includes privacy form fields', () => {
      const html = treeView.renderTreePrivacyPage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: 'My Tree', private: 0 },
        preferences: { MAX_ALIVE_AGE: '100' },
        restrictions: [],
      });
      expect(html).toContain('name="REQUIRE_AUTHENTICATION"');
      expect(html).toContain('name="MAX_ALIVE_AGE"');
      expect(html).toContain('name="HIDE_LIVE_PEOPLE"');
      expect(html).toContain('Privacy');
    });

    test('includes restriction rows from preferences', () => {
      const html = treeView.renderTreePrivacyPage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: 'My Tree', private: 0 },
        preferences: {},
        restrictions: [{ default_resn_id: 1, xref: 'I5', tag_type: 'BIRT', resn: 'confidential' }],
      });
      expect(html).toContain('I5');
      expect(html).toContain('BIRT');
      expect(html).toContain('confidential');
    });

    test('includes new restriction form fields', () => {
      const html = treeView.renderTreePrivacyPage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: 'My Tree', private: 0 },
        preferences: {},
        restrictions: [],
      });
      expect(html).toContain('name="xref[]"');
      expect(html).toContain('name="tag_type[]"');
      expect(html).toContain('name="resn[]"');
    });

    test('escapes XSS in tree name', () => {
      const html = treeView.renderTreePrivacyPage({
        csrfToken: 'tok123',
        tree: { gedcom_name: '"><img src=x>', title: 'My Tree', private: 0 },
        preferences: {},
        restrictions: [],
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });
  });

  describe('renderCheckTreePage', () => {
    test('renders without throwing', () => {
      const html = treeView.renderCheckTreePage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: 'My Tree' },
        errors: [],
        warnings: [],
      });
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
    });

    test('shows no errors message when clean', () => {
      const html = treeView.renderCheckTreePage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: 'My Tree' },
        errors: [],
        warnings: [],
      });
      expect(html).toContain('No errors have been found');
    });

    test('displays errors and warnings', () => {
      const html = treeView.renderCheckTreePage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: 'My Tree' },
        errors: ['I5 does not exist', 'F1 has too many HUSB'],
        warnings: ['Some warning'],
      });
      expect(html).toContain('I5 does not exist');
      expect(html).toContain('F1 has too many HUSB');
      expect(html).toContain('Some warning');
    });

    test('escapes XSS in error messages', () => {
      const html = treeView.renderCheckTreePage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: 'My Tree' },
        errors: ['"><img src=x>'],
        warnings: [],
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });

    test('escapes XSS in tree title', () => {
      const html = treeView.renderCheckTreePage({
        csrfToken: 'tok123',
        tree: { gedcom_name: 'mytree', title: '"><img src=x>' },
        errors: [],
        warnings: [],
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });
  });
});
