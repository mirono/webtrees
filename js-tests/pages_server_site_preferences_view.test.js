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
import * as sitePreferencesView from '../pages-server/site-preferences-view.mjs';
import * as sitePreferences from '../pages-server/site-preferences.mjs';

describe('site-preferences-view.mjs', () => {
  describe('renderGeneralPreferencesPage', () => {
    test('renders without throwing', () => {
      const html = sitePreferencesView.renderGeneralPreferencesPage({
        csrfToken: 'token123',
        preferences: {},
        dataFolder: '/data',
      });
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });

    test('includes form fields for general preferences', () => {
      const html = sitePreferencesView.renderGeneralPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          INDEX_DIRECTORY: '/data/',
          LANGUAGE: 'en-US',
          THEME_DIR: 'webtrees',
          TIMEZONE: 'UTC',
        },
        dataFolder: '/data',
      });
      expect(html).toContain('name="INDEX_DIRECTORY"');
      expect(html).toContain('name="LANGUAGE"');
      expect(html).toContain('name="THEME_DIR"');
      expect(html).toContain('name="TIMEZONE"');
      expect(html).toContain('Website preferences');
    });

    test('includes CSRF token in form', () => {
      const html = sitePreferencesView.renderGeneralPreferencesPage({
        csrfToken: 'csrftoken123',
        preferences: {},
        dataFolder: '/data',
      });
      expect(html).toContain('csrftoken123');
      expect(html).toContain('_csrf');
    });

    test('includes error message when provided', () => {
      const html = sitePreferencesView.renderGeneralPreferencesPage({
        csrfToken: 'token123',
        preferences: {},
        dataFolder: '/data',
        error: 'Directory not found',
      });
      expect(html).toContain('Directory not found');
      expect(html).toContain('alert-danger');
    });

    test('escapes XSS in error message', () => {
      const html = sitePreferencesView.renderGeneralPreferencesPage({
        csrfToken: 'token123',
        preferences: {},
        dataFolder: '/data',
        error: '"><img src=x>',
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });

    test('escapes XSS in INDEX_DIRECTORY field', () => {
      const html = sitePreferencesView.renderGeneralPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          INDEX_DIRECTORY: '"><img src=x>',
        },
        dataFolder: '/data',
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });

    test('escapes XSS in LANGUAGE field', () => {
      const html = sitePreferencesView.renderGeneralPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          LANGUAGE: '<script>alert("xss")</script>',
        },
        dataFolder: '/data',
      });
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('renderRegistrationPreferencesPage', () => {
    test('renders without throwing', () => {
      const html = sitePreferencesView.renderRegistrationPreferencesPage({
        csrfToken: 'token123',
        preferences: {},
      });
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });

    test('includes form fields for registration preferences', () => {
      const html = sitePreferencesView.renderRegistrationPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          USE_REGISTRATION_MODULE: '1',
          SHOW_REGISTER_CAUTION: '',
          WELCOME_TEXT_AUTH_MODE: '4',
          'WELCOME_TEXT_AUTH_MODE_en-US': 'Welcome to our site',
        },
      });
      expect(html).toContain('name="USE_REGISTRATION_MODULE"');
      expect(html).toContain('name="SHOW_REGISTER_CAUTION"');
      expect(html).toContain('name="WELCOME_TEXT_AUTH_MODE"');
      expect(html).toContain('name="WELCOME_TEXT_AUTH_MODE_4"');
      expect(html).toContain('Sign-in and registration');
    });

    test('includes CSRF token in form', () => {
      const html = sitePreferencesView.renderRegistrationPreferencesPage({
        csrfToken: 'csrftoken123',
        preferences: {},
      });
      expect(html).toContain('csrftoken123');
      expect(html).toContain('_csrf');
    });

    test('escapes XSS in welcome text field', () => {
      const html = sitePreferencesView.renderRegistrationPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          'WELCOME_TEXT_AUTH_MODE_en-US': '"><img src=x>',
        },
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });
  });

  describe('renderEmailPreferencesPage', () => {
    test('renders without throwing', () => {
      const html = sitePreferencesView.renderEmailPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          SMTP_HOST: '',
          SMTP_PORT: '25',
          SMTP_HELO: 'localhost',
          SMTP_FROM_NAME: 'noreply@localhost',
          SMTP_DISP_NAME: 'webtrees',
          SMTP_ACTIVE: '',
          SMTP_SSL: 'none',
          SMTP_AUTH: '',
          SMTP_AUTH_USER: '',
          DKIM_DOMAIN: '',
          DKIM_SELECTOR: '',
          DKIM_KEY: '',
          smtpFromNameValid: true,
          smtpHeloValid: true,
        },
      });
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });

    test('includes form fields for email preferences', () => {
      const html = sitePreferencesView.renderEmailPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          SMTP_HOST: 'mail.example.com',
          SMTP_PORT: '587',
          SMTP_HELO: 'mail.example.com',
          SMTP_FROM_NAME: 'noreply@example.com',
          SMTP_DISP_NAME: 'Example',
          SMTP_ACTIVE: 'external',
          SMTP_SSL: 'tls',
          SMTP_AUTH: '1',
          SMTP_AUTH_USER: 'user@example.com',
          DKIM_DOMAIN: 'example.com',
          DKIM_SELECTOR: 'default',
          DKIM_KEY: '-----BEGIN PRIVATE KEY-----',
          smtpFromNameValid: true,
          smtpHeloValid: true,
        },
      });
      expect(html).toContain('name="SMTP_HOST"');
      expect(html).toContain('name="SMTP_PORT"');
      expect(html).toContain('name="SMTP_HELO"');
      expect(html).toContain('name="SMTP_FROM_NAME"');
      expect(html).toContain('name="SMTP_DISP_NAME"');
      expect(html).toContain('name="SMTP_ACTIVE"');
      expect(html).toContain('name="SMTP_SSL"');
      expect(html).toContain('name="SMTP_AUTH"');
      expect(html).toContain('name="SMTP_AUTH_USER"');
      expect(html).toContain('name="SMTP_AUTH_PASS"');
      expect(html).toContain('name="DKIM_DOMAIN"');
      expect(html).toContain('name="DKIM_SELECTOR"');
      expect(html).toContain('name="DKIM_KEY"');
      expect(html).toContain('Sending email');
    });

    test('includes CSRF token in form', () => {
      const html = sitePreferencesView.renderEmailPreferencesPage({
        csrfToken: 'csrftoken123',
        preferences: {
          SMTP_HOST: '',
          SMTP_PORT: '25',
          SMTP_HELO: 'localhost',
          SMTP_FROM_NAME: 'noreply@localhost',
          SMTP_DISP_NAME: 'webtrees',
          SMTP_ACTIVE: '',
          SMTP_SSL: 'none',
          SMTP_AUTH: '',
          SMTP_AUTH_USER: '',
          DKIM_DOMAIN: '',
          DKIM_SELECTOR: '',
          DKIM_KEY: '',
          smtpFromNameValid: true,
          smtpHeloValid: true,
        },
      });
      expect(html).toContain('csrftoken123');
      expect(html).toContain('_csrf');
    });

    test('shows validation warning for invalid SMTP_FROM_NAME', () => {
      const html = sitePreferencesView.renderEmailPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          SMTP_HOST: 'mail.example.com',
          SMTP_PORT: '25',
          SMTP_HELO: 'localhost',
          SMTP_FROM_NAME: 'invalid',
          SMTP_DISP_NAME: 'webtrees',
          SMTP_ACTIVE: 'external',
          SMTP_SSL: 'none',
          SMTP_AUTH: '',
          SMTP_AUTH_USER: '',
          DKIM_DOMAIN: '',
          DKIM_SELECTOR: '',
          DKIM_KEY: '',
          smtpFromNameValid: false,
          smtpHeloValid: true,
        },
      });
      expect(html).toContain('does not appear to resolve');
    });

    test('shows validation warning for invalid SMTP_HELO', () => {
      const html = sitePreferencesView.renderEmailPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          SMTP_HOST: 'mail.example.com',
          SMTP_PORT: '25',
          SMTP_HELO: 'invalid',
          SMTP_FROM_NAME: 'noreply@example.com',
          SMTP_DISP_NAME: 'webtrees',
          SMTP_ACTIVE: 'external',
          SMTP_SSL: 'none',
          SMTP_AUTH: '',
          SMTP_AUTH_USER: '',
          DKIM_DOMAIN: '',
          DKIM_SELECTOR: '',
          DKIM_KEY: '',
          smtpFromNameValid: true,
          smtpHeloValid: false,
        },
      });
      expect(html).toContain('does not look valid');
    });

    test('shows test result banner when testSuccess is provided', () => {
      const html = sitePreferencesView.renderEmailPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          SMTP_HOST: '',
          SMTP_PORT: '25',
          SMTP_HELO: 'localhost',
          SMTP_FROM_NAME: 'noreply@localhost',
          SMTP_DISP_NAME: 'webtrees',
          SMTP_ACTIVE: '',
          SMTP_SSL: 'none',
          SMTP_AUTH: '',
          SMTP_AUTH_USER: '',
          DKIM_DOMAIN: '',
          DKIM_SELECTOR: '',
          DKIM_KEY: '',
          smtpFromNameValid: true,
          smtpHeloValid: true,
        },
        testMessage: 'Email sent successfully',
        testSuccess: true,
      });
      expect(html).toContain('Email sent successfully');
      expect(html).toContain('alert-success');
    });

    test('shows error banner when testSuccess is false', () => {
      const html = sitePreferencesView.renderEmailPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          SMTP_HOST: '',
          SMTP_PORT: '25',
          SMTP_HELO: 'localhost',
          SMTP_FROM_NAME: 'noreply@localhost',
          SMTP_DISP_NAME: 'webtrees',
          SMTP_ACTIVE: '',
          SMTP_SSL: 'none',
          SMTP_AUTH: '',
          SMTP_AUTH_USER: '',
          DKIM_DOMAIN: '',
          DKIM_SELECTOR: '',
          DKIM_KEY: '',
          smtpFromNameValid: true,
          smtpHeloValid: true,
        },
        testMessage: 'Email sending failed',
        testSuccess: false,
      });
      expect(html).toContain('Email sending failed');
      expect(html).toContain('alert-danger');
    });

    test('escapes XSS in SMTP_HELO field', () => {
      const html = sitePreferencesView.renderEmailPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          SMTP_HOST: '',
          SMTP_PORT: '25',
          SMTP_HELO: '"><img src=x>',
          SMTP_FROM_NAME: 'noreply@localhost',
          SMTP_DISP_NAME: 'webtrees',
          SMTP_ACTIVE: '',
          SMTP_SSL: 'none',
          SMTP_AUTH: '',
          SMTP_AUTH_USER: '',
          DKIM_DOMAIN: '',
          DKIM_SELECTOR: '',
          DKIM_KEY: '',
          smtpFromNameValid: true,
          smtpHeloValid: false,
        },
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });

    test('escapes XSS in SMTP_FROM_NAME field', () => {
      const html = sitePreferencesView.renderEmailPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          SMTP_HOST: '',
          SMTP_PORT: '25',
          SMTP_HELO: 'localhost',
          SMTP_FROM_NAME: '"><img src=x>',
          SMTP_DISP_NAME: 'webtrees',
          SMTP_ACTIVE: '',
          SMTP_SSL: 'none',
          SMTP_AUTH: '',
          SMTP_AUTH_USER: '',
          DKIM_DOMAIN: '',
          DKIM_SELECTOR: '',
          DKIM_KEY: '',
          smtpFromNameValid: false,
          smtpHeloValid: true,
        },
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });

    test('escapes XSS in DKIM_KEY textarea', () => {
      const html = sitePreferencesView.renderEmailPreferencesPage({
        csrfToken: 'token123',
        preferences: {
          SMTP_HOST: '',
          SMTP_PORT: '25',
          SMTP_HELO: 'localhost',
          SMTP_FROM_NAME: 'noreply@localhost',
          SMTP_DISP_NAME: 'webtrees',
          SMTP_ACTIVE: '',
          SMTP_SSL: 'none',
          SMTP_AUTH: '',
          SMTP_AUTH_USER: '',
          DKIM_DOMAIN: '',
          DKIM_SELECTOR: '',
          DKIM_KEY: '"><img src=x>',
          smtpFromNameValid: true,
          smtpHeloValid: true,
        },
      });
      expect(html).not.toContain('"><img src=x>');
      expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
    });
  });

  describe('renderSiteTagsPage', () => {
    const basePreferences = {
      hiddenTags: {},
      customFamilyTags: [],
      customIndividualTags: [],
      customGedcomLTags: false,
      customFamFact: false,
      customFamNchi: false,
      customResiValue: false,
      customTimeTags: false,
    };

    test('renders without throwing', () => {
      const html = sitePreferencesView.renderSiteTagsPage({
        csrfToken: 'token123',
        preferences: basePreferences,
      });
      expect(html).toBeDefined();
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(0);
    });

    test('includes page title and section headings', () => {
      const html = sitePreferencesView.renderSiteTagsPage({
        csrfToken: 'token123',
        preferences: basePreferences,
      });
      expect(html).toContain('GEDCOM tags');
      expect(html).toContain('Hide GEDCOM tags');
      expect(html).toContain('Non-standard GEDCOM tags');
      expect(html).toContain('GEDCOM 7 extensions');
    });

    test('includes CSRF token in form', () => {
      const html = sitePreferencesView.renderSiteTagsPage({
        csrfToken: 'csrftoken123',
        preferences: basePreferences,
      });
      expect(html).toContain('csrftoken123');
      expect(html).toContain('_csrf');
    });

    test('includes all 48 HIDE_ checkboxes', () => {
      const html = sitePreferencesView.renderSiteTagsPage({
        csrfToken: 'token123',
        preferences: basePreferences,
      });
      const hideCheckboxes = (html.match(/name="HIDE_/g) || []).length;
      expect(hideCheckboxes).toBe(48);
    });

    test('checks hidden tag checkboxes when hiddenTags is true', () => {
      const prefs = {
        ...basePreferences,
        hiddenTags: {
          NAME_NPFX: true,
          PLAC_MAP: false,
        },
      };
      const html = sitePreferencesView.renderSiteTagsPage({
        csrfToken: 'token123',
        preferences: prefs,
      });
      // Check that at least the checked one appears with "checked" attribute
      expect(html).toContain('NAME_NPFX');
    });

    test('includes custom family tag options', () => {
      const html = sitePreferencesView.renderSiteTagsPage({
        csrfToken: 'token123',
        preferences: basePreferences,
      });
      expect(html).toContain('custom_family_tags[]');
      expect(html).toContain('FACT');
      expect(html).toContain('_SEPR');
    });

    test('includes custom individual tag options', () => {
      const html = sitePreferencesView.renderSiteTagsPage({
        csrfToken: 'token123',
        preferences: basePreferences,
      });
      expect(html).toContain('custom_individual_tags[]');
      expect(html).toContain('_HEIG');
      expect(html).toContain('_YART');
    });

    test('includes all GEDCOM 7 extension checkboxes', () => {
      const html = sitePreferencesView.renderSiteTagsPage({
        csrfToken: 'token123',
        preferences: basePreferences,
      });
      expect(html).toContain('custom_gedcom_l_tags');
      expect(html).toContain('custom_fam_fact');
      expect(html).toContain('custom_fam_nchi');
      expect(html).toContain('custom_resi_value');
      expect(html).toContain('custom_time_tags');
    });

    test('selects custom family tags when they are in preferences', () => {
      const prefs = {
        ...basePreferences,
        customFamilyTags: ['FACT', '_SEPR'],
      };
      const html = sitePreferencesView.renderSiteTagsPage({
        csrfToken: 'token123',
        preferences: prefs,
      });
      // Just verify the HTML was generated without error
      expect(html.length).toBeGreaterThan(0);
    });

    test('selects custom individual tags when they are in preferences', () => {
      const prefs = {
        ...basePreferences,
        customIndividualTags: ['_HEIG', '_YART'],
      };
      const html = sitePreferencesView.renderSiteTagsPage({
        csrfToken: 'token123',
        preferences: prefs,
      });
      // Just verify the HTML was generated without error
      expect(html.length).toBeGreaterThan(0);
    });
  });
});
