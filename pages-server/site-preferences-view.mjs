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

// Views for the site-preferences admin pages. Same conventions as
// tree-management-view.mjs / users-admin-view.mjs: local escapeHtml(),
// renderAdminPage()/renderBreadcrumbs() shell, hand-written CSRF
// hidden fields, plain <select>/<select multiple> in place of real
// PHP's translated/TomSelect widgets (same simplification already
// applied to theme/language pickers elsewhere - data/behavior
// unchanged, widget fidelity simplified).

import { renderAdminPage, renderBreadcrumbs } from './admin-layout-view.mjs';
import { HIDDEN_TAG_KEYS, CUSTOM_FAMILY_TAGS, CUSTOM_INDIVIDUAL_TAGS, MAIL_SSL_OPTIONS, MAIL_TRANSPORT_OPTIONS } from './site-preferences.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function selectOptions(options, selected) {
  const selectedValues = Array.isArray(selected) ? selected.map(String) : [String(selected)];

  return Object.entries(options)
    .map(
      ([value, label]) =>
        `<option value="${escapeHtml(value)}" ${selectedValues.includes(String(value)) ? 'selected' : ''}>${escapeHtml(label)}</option>`,
    )
    .join('');
}

function csrfField(csrfToken) {
  return `<input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">`;
}

function checkbox(name, checked, label) {
  return `<label><input type="checkbox" name="${name}" value="1" ${checked ? 'checked' : ''}> ${escapeHtml(label)}</label>`;
}

const CONTROL_PANEL_LINK = { label: 'Control panel', url: '/admin' };

const THEME_OPTIONS = { '': '<default theme>', clouds: 'clouds', colors: 'colors', fab: 'F.A.B.', minimal: 'minimal', webtrees: 'webtrees', xenea: 'xenea' };

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {Record<string,string>} params.preferences
 * @param {string} params.dataFolder
 * @param {string} [params.error]
 * @returns {string}
 */
export function renderGeneralPreferencesPage({ csrfToken, preferences, dataFolder, error }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, { label: 'Website preferences' }]);
  const pref = (name, fallback = '') => preferences[name] ?? fallback;

  const body = `<h1>Website preferences</h1>
${error ? `<div class="alert alert-danger">${escapeHtml(error)}</div>` : ''}
<form method="post" action="/admin/site-preferences" class="form-horizontal">
  <div class="row mb-3">
    <label for="INDEX_DIRECTORY">Data folder</label>
    <input class="form-control" id="INDEX_DIRECTORY" name="INDEX_DIRECTORY" type="text" value="${escapeHtml(pref('INDEX_DIRECTORY', dataFolder))}">
    <div class="form-text">The data folder is where webtrees stores GEDCOM files, config files, and media.</div>
  </div>
  <div class="row mb-3">
    <label>Who can change the "family tree" preferences</label>
    ${checkbox('ALLOW_CHANGE_GEDCOM', pref('ALLOW_CHANGE_GEDCOM') === '1', 'Allow managers to change tree-specific preferences')}
  </div>
  <div class="row mb-3">
    <label for="LANGUAGE">Default language</label>
    <input class="form-control" id="LANGUAGE" name="LANGUAGE" type="text" value="${escapeHtml(pref('LANGUAGE', 'en-US'))}">
  </div>
  <div class="row mb-3">
    <label for="THEME_DIR">Default theme</label>
    <select id="THEME_DIR" name="THEME_DIR" class="form-select">${selectOptions(THEME_OPTIONS, pref('THEME_DIR'))}</select>
  </div>
  <div class="row mb-3">
    <label for="TIMEZONE">Default timezone</label>
    <input class="form-control" id="TIMEZONE" name="TIMEZONE" type="text" value="${escapeHtml(pref('TIMEZONE', 'UTC'))}">
  </div>
  <div class="row mb-3">
    <button type="submit" class="btn btn-primary">save</button>
  </div>
  ${csrfField(csrfToken)}
</form>`;

  return renderAdminPage({ title: 'Website preferences', csrfToken, breadcrumbsHtml, bodyHtml: body });
}

const REGISTRATION_TEXT_OPTIONS = {
  0: 'No predefined text',
  1: 'Predefined text that states all users can request a user account',
  2: 'Predefined text that states admin will decide on each request for a user account',
  3: 'Predefined text that states only family members can request a user account',
  4: 'Choose user defined welcome text typed below',
};

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {Record<string,string>} params.preferences
 * @returns {string}
 */
export function renderRegistrationPreferencesPage({ csrfToken, preferences }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, { label: 'Sign-in and registration' }]);
  const pref = (name, fallback = '') => preferences[name] ?? fallback;

  const body = `<h1>Sign-in and registration</h1>
<form method="post" action="/admin/site-registration" class="form-horizontal">
  <div class="row mb-3">
    ${checkbox('USE_REGISTRATION_MODULE', pref('USE_REGISTRATION_MODULE') === '1', 'Allow visitors to request a new user account')}
  </div>
  <div class="row mb-3">
    ${checkbox('SHOW_REGISTER_CAUTION', pref('SHOW_REGISTER_CAUTION') === '1', 'Show a "caution" message on the sign-in page')}
  </div>
  <div class="row mb-3">
    <label for="WELCOME_TEXT_AUTH_MODE">Welcome text on sign-in page</label>
    <select id="WELCOME_TEXT_AUTH_MODE" name="WELCOME_TEXT_AUTH_MODE" class="form-select">${selectOptions(REGISTRATION_TEXT_OPTIONS, pref('WELCOME_TEXT_AUTH_MODE', '0'))}</select>
  </div>
  <div class="row mb-3">
    <label for="WELCOME_TEXT_AUTH_MODE_4">User defined welcome text</label>
    <textarea class="form-control" id="WELCOME_TEXT_AUTH_MODE_4" name="WELCOME_TEXT_AUTH_MODE_4" rows="5">${escapeHtml(pref('WELCOME_TEXT_AUTH_MODE_en-US'))}</textarea>
  </div>
  <div class="row mb-3">
    <button type="submit" class="btn btn-primary">save</button>
  </div>
  ${csrfField(csrfToken)}
</form>`;

  return renderAdminPage({ title: 'Sign-in and registration', csrfToken, breadcrumbsHtml, bodyHtml: body });
}

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {object} params.preferences (loadEmailPreferences() output)
 * @param {string} [params.testMessage]
 * @param {boolean} [params.testSuccess]
 * @returns {string}
 */
export function renderEmailPreferencesPage({ csrfToken, preferences, testMessage, testSuccess }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, { label: 'Sending email' }]);
  const pref = (name, fallback = '') => preferences[name] ?? fallback;

  const testBanner =
    testMessage !== undefined
      ? `<div class="alert alert-${testSuccess ? 'success' : 'danger'}">${escapeHtml(testMessage)}</div>`
      : '';

  const body = `<h1>Sending email</h1>
${testBanner}
<form method="post" action="/admin/email" class="form-horizontal">
  <div class="row mb-3">
    <label for="SMTP_ACTIVE">Send emails with</label>
    <select id="SMTP_ACTIVE" name="SMTP_ACTIVE" class="form-select">${selectOptions(MAIL_TRANSPORT_OPTIONS, pref('SMTP_ACTIVE'))}</select>
  </div>
  <div class="row mb-3">
    <label for="SMTP_FROM_NAME">"From" address</label>
    <input class="form-control" id="SMTP_FROM_NAME" name="SMTP_FROM_NAME" type="text" value="${escapeHtml(pref('SMTP_FROM_NAME'))}">
    ${preferences.smtpFromNameValid === false ? '<div class="text-danger">This email address does not appear to resolve.</div>' : ''}
  </div>
  <div class="row mb-3">
    <label for="SMTP_DISP_NAME">"From" name</label>
    <input class="form-control" id="SMTP_DISP_NAME" name="SMTP_DISP_NAME" type="text" value="${escapeHtml(pref('SMTP_DISP_NAME'))}">
  </div>
  <div class="row mb-3">
    <label for="SMTP_HOST">SMTP server host</label>
    <input class="form-control" id="SMTP_HOST" name="SMTP_HOST" type="text" value="${escapeHtml(pref('SMTP_HOST'))}">
  </div>
  <div class="row mb-3">
    <label for="SMTP_PORT">SMTP server port</label>
    <input class="form-control" id="SMTP_PORT" name="SMTP_PORT" type="number" value="${escapeHtml(pref('SMTP_PORT', '25'))}">
  </div>
  <div class="row mb-3">
    <label for="SMTP_SSL">Secure connection</label>
    <select id="SMTP_SSL" name="SMTP_SSL" class="form-select">${selectOptions(MAIL_SSL_OPTIONS, pref('SMTP_SSL', 'none'))}</select>
  </div>
  <div class="row mb-3">
    <label for="SMTP_HELO">SMTP HELO/EHLO domain</label>
    <input class="form-control" id="SMTP_HELO" name="SMTP_HELO" type="text" value="${escapeHtml(pref('SMTP_HELO'))}">
    ${preferences.smtpHeloValid === false ? '<div class="text-danger">This domain does not look valid.</div>' : ''}
  </div>
  <div class="row mb-3">
    ${checkbox('SMTP_AUTH', pref('SMTP_AUTH') === '1', 'Use SMTP authentication')}
  </div>
  <div class="row mb-3">
    <label for="SMTP_AUTH_USER">SMTP username</label>
    <input class="form-control" id="SMTP_AUTH_USER" name="SMTP_AUTH_USER" type="text" value="${escapeHtml(pref('SMTP_AUTH_USER'))}">
  </div>
  <div class="row mb-3">
    <label for="SMTP_AUTH_PASS">SMTP password</label>
    <input class="form-control" id="SMTP_AUTH_PASS" name="SMTP_AUTH_PASS" type="password" value="" autocomplete="new-password">
    <div class="form-text">Leave blank to keep the existing password.</div>
  </div>
  <h2>DKIM signature</h2>
  <div class="row mb-3">
    <label for="DKIM_DOMAIN">DKIM domain name</label>
    <input class="form-control" id="DKIM_DOMAIN" name="DKIM_DOMAIN" type="text" value="${escapeHtml(pref('DKIM_DOMAIN'))}">
  </div>
  <div class="row mb-3">
    <label for="DKIM_SELECTOR">DKIM selector</label>
    <input class="form-control" id="DKIM_SELECTOR" name="DKIM_SELECTOR" type="text" value="${escapeHtml(pref('DKIM_SELECTOR'))}">
  </div>
  <div class="row mb-3">
    <label for="DKIM_KEY">DKIM private key</label>
    <textarea class="form-control" id="DKIM_KEY" name="DKIM_KEY" rows="5">${escapeHtml(pref('DKIM_KEY'))}</textarea>
  </div>
  <div class="row mb-3">
    <button type="submit" class="btn btn-primary" name="save" value="1">save</button>
    <button type="submit" class="btn btn-secondary" name="test" value="1">save and send a test email to yourself</button>
  </div>
  ${csrfField(csrfToken)}
</form>`;

  return renderAdminPage({ title: 'Sending email', csrfToken, breadcrumbsHtml, bodyHtml: body });
}

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {object} params.preferences (loadSiteTagsPreferences() output)
 * @returns {string}
 */
export function renderSiteTagsPage({ csrfToken, preferences }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, { label: 'GEDCOM tags' }]);

  const hiddenRows = HIDDEN_TAG_KEYS.map(
    (key) => `<label class="d-inline-block me-3">${checkbox(`HIDE_${key}`, preferences.hiddenTags[key] === true, key)}</label>`,
  ).join('\n');

  const familyTagOptions = {};
  for (const tag of CUSTOM_FAMILY_TAGS) {
    familyTagOptions[tag] = tag;
  }
  const individualTagOptions = {};
  for (const tag of CUSTOM_INDIVIDUAL_TAGS) {
    individualTagOptions[tag] = tag;
  }

  const body = `<h1>GEDCOM tags</h1>
<form method="post" action="/admin/tags" class="form-horizontal">
  <h2>Hide GEDCOM tags</h2>
  <div class="row mb-3">${hiddenRows}</div>

  <h2>Non-standard GEDCOM tags</h2>
  <div class="row mb-3">
    <label for="custom_family_tags">Add custom family tags</label>
    <select id="custom_family_tags" name="custom_family_tags[]" multiple class="form-select">${selectOptions(familyTagOptions, preferences.customFamilyTags)}</select>
  </div>
  <div class="row mb-3">
    <label for="custom_individual_tags">Add custom individual tags</label>
    <select id="custom_individual_tags" name="custom_individual_tags[]" multiple class="form-select">${selectOptions(individualTagOptions, preferences.customIndividualTags)}</select>
  </div>

  <h2>GEDCOM 7 extensions</h2>
  <div class="row mb-3">${checkbox('custom_gedcom_l_tags', preferences.customGedcomLTags, 'GEDCOM-L (German genealogy standard) tags')}</div>
  <div class="row mb-3">${checkbox('custom_fam_fact', preferences.customFamFact, 'FAM:FACT')}</div>
  <div class="row mb-3">${checkbox('custom_fam_nchi', preferences.customFamNchi, 'FAM:NCHI')}</div>
  <div class="row mb-3">${checkbox('custom_resi_value', preferences.customResiValue, 'RESI value (not just a note)')}</div>
  <div class="row mb-3">${checkbox('custom_time_tags', preferences.customTimeTags, 'TIME tags under dates')}</div>

  <div class="row mb-3">
    <button type="submit" class="btn btn-primary">save</button>
  </div>
  ${csrfField(csrfToken)}
</form>`;

  return renderAdminPage({ title: 'GEDCOM tags', csrfToken, breadcrumbsHtml, bodyHtml: body });
}
