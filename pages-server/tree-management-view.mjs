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

// Views for the tree-management admin pages. Follows the same
// conventions as users-admin-view.mjs (phase 5 step 40): local
// escapeHtml(), renderAdminPage()/renderBreadcrumbs() shell from
// admin-layout-view.mjs, hand-written CSRF hidden fields on plain
// POST forms, data-wt-post-url/data-wt-reload-url/data-wt-confirm for
// AJAX-style delete actions.
//
// Per this migration's established convention (plain text/number
// inputs and plain <select>/<select multiple> in place of real PHP's
// tom-select multi-pickers and dynamic add-row JS - same
// simplification already applied to theme/language pickers
// elsewhere), the many list-of-tags preference fields (CHART_BOX_TAGS,
// INDI_FACTS_QUICK, etc.) are plain <select multiple> elements, and
// the privacy-restrictions table's "add a new rule" row uses plain
// text inputs for xref/tag type rather than the real page's dynamic
// per-record-type picker widget. Data and behavior are unchanged;
// only the picker widget fidelity is simplified.

import { renderAdminPage, renderBreadcrumbs } from './admin-layout-view.mjs';

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

const CONTROL_PANEL_LINK = { label: 'Control panel', url: '/admin' };
const MANAGE_TREES_LINK = (treeName) => ({ label: 'Manage family trees', url: `/admin/trees/manage/${encodeURIComponent(treeName)}` });

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {Array<{gedcomId: number, name: string, title: string, imported: boolean, importing: boolean, isManager: boolean}>} params.trees
 * @param {string} params.defaultTreeName
 * @param {boolean} params.canDeleteOrSetDefault
 * @returns {string}
 */
export function renderManageTreesPage({ csrfToken, trees, defaultTreeName, canDeleteOrSetDefault }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, { label: 'Manage family trees' }]);

  const body =
    trees.length === 0
      ? '<div class="alert alert-info">You need to create a family tree.</div>'
      : trees
          .filter((tree) => tree.isManager)
          .map((tree) => {
            const isDefault = tree.name === defaultTreeName;
            const links = [
              `<a href="/tree/${encodeURIComponent(tree.name)}">Home page</a>`,
              `<a href="/tree/${encodeURIComponent(tree.name)}/preferences">Preferences</a>`,
              `<a href="/tree/${encodeURIComponent(tree.name)}/privacy">Privacy</a>`,
              `<a href="/tree/${encodeURIComponent(tree.name)}/check">Check for errors</a>`,
              `<a href="/tree/${encodeURIComponent(tree.name)}/renumber">Renumber XREFs</a>`,
            ];

            if (canDeleteOrSetDefault && trees.length > 1) {
              links.push(
                `<a href="#" data-wt-post-url="/admin/trees/delete/${encodeURIComponent(tree.name)}" data-wt-reload-url="/admin/trees/manage" data-wt-confirm="Are you sure you want to delete &ldquo;${escapeHtml(tree.title)}&rdquo;?">Delete</a>`,
              );

              if (isDefault) {
                links.push('<span>Default family tree</span>');
              } else {
                links.push(
                  `<form method="post" action="/admin/trees/default/${encodeURIComponent(tree.name)}" style="display:inline">` +
                    '<button type="submit">Set as default</button>' +
                    csrfField(csrfToken) +
                    '</form>',
                );
              }
            }

            return `<div class="tree-card">
  <h2>${escapeHtml(tree.name)} &mdash; ${escapeHtml(tree.title)}</h2>
  ${tree.importing ? '<p>Importing&hellip;</p>' : `<ul>${links.map((link) => `<li>${link}</li>`).join('')}</ul>`}
</div>`;
          })
          .join('\n');

  return renderAdminPage({ title: 'Manage family trees', csrfToken, breadcrumbsHtml, bodyHtml: `<h1>Manage family trees</h1>${body}` });
}

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {string} params.treeName
 * @param {string} params.treeTitle
 * @returns {string}
 */
export function renderCreateTreePage({ csrfToken, treeName, treeTitle }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, { label: 'Create a family tree' }]);

  const body = `<h1>Create a family tree</h1>
<form method="post" action="/admin/trees/create">
  <div>
    <label for="title">Family tree title</label>
    <input class="form-control" id="title" maxlength="255" name="title" required type="text" value="${escapeHtml(treeTitle)}">
  </div>
  <div>
    <label for="name">URL</label>
    <input class="form-control" id="name" maxlength="31" name="name" required type="text" value="${escapeHtml(treeName)}">
    <div class="form-text">Avoid spaces and punctuation. A family name might be a good choice.</div>
  </div>
  <div>
    <button type="submit" class="btn btn-primary">create</button>
    <div class="form-text">After creating the family tree, you will be able to import data from a GEDCOM file.</div>
  </div>
  ${csrfField(csrfToken)}
</form>`;

  return renderAdminPage({ title: 'Create a family tree', csrfToken, breadcrumbsHtml, bodyHtml: body });
}

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {Record<string,string>} params.treeList name -> title
 * @param {string} params.tree1Name
 * @param {string} params.tree2Name
 * @param {number} params.xrefs
 * @returns {string}
 */
export function renderMergeTreesPage({ csrfToken, treeList, tree1Name, tree2Name, xrefs }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, { label: 'Merge family trees' }]);

  const warning =
    xrefs > 0
      ? `<p>The two family trees have ${xrefs} record(s) which use the same &ldquo;XREF&rdquo;.</p>
<p>You must renumber the records in one of the trees before you can merge them.</p>
<p><a href="/tree/${encodeURIComponent(tree1Name)}/renumber">Renumber XREFs</a> &mdash; ${escapeHtml(treeList[tree1Name] ?? tree1Name)}</p>
<p><a href="/tree/${encodeURIComponent(tree2Name)}/renumber">Renumber XREFs</a> &mdash; ${escapeHtml(treeList[tree2Name] ?? tree2Name)}</p>`
      : '';

  const body = `<h1>Merge family trees</h1>
${warning}
<form method="post" action="/admin/trees/merge">
  <div>
    Copy all the records from
    <select name="tree1_name">${selectOptions(treeList, tree1Name)}</select>
    into
    <select name="tree2_name">${selectOptions(treeList, tree2Name)}</select>.
  </div>
  <div>
    <button type="submit" class="btn btn-primary">continue</button>
  </div>
  ${csrfField(csrfToken)}
</form>
<p>Caution! This may take a long time. Be patient.</p>`;

  return renderAdminPage({ title: 'Merge family trees', csrfToken, breadcrumbsHtml, bodyHtml: body });
}

const INDIVIDUAL_FACTS = {
  BIRT: 'Birth',
  BAPM: 'Baptism',
  CHR: 'Christening',
  DEAT: 'Death',
  BURI: 'Burial',
  CREM: 'Cremation',
  ADOP: 'Adoption',
  GRAD: 'Graduation',
  EMIG: 'Emigration',
  IMMI: 'Immigration',
  NATU: 'Naturalization',
  OCCU: 'Occupation',
  RESI: 'Residence',
  EDUC: 'Education',
  RELI: 'Religion',
  SSN: 'Social security number',
};

const FAMILY_FACTS = {
  MARR: 'Marriage',
  MARB: 'Marriage banns',
  ENGA: 'Engagement',
  DIV: 'Divorce',
  ANUL: 'Annulment',
  CENS: 'Census',
};

function multiSelect(name, selected, options) {
  const selectedList = (selected ?? '').split(',').filter((v) => v !== '');

  return `<select name="${name}[]" multiple class="form-select">${selectOptions(options, selectedList)}</select>`;
}

function radiosInline(name, selectedValue, labels) {
  return labels
    .map(
      (label, value) =>
        `<label><input type="radio" name="${name}" value="${value}" ${String(value) === String(selectedValue) ? 'checked' : ''}> ${escapeHtml(label)}</label>`,
    )
    .join(' ');
}

const RELATIVE_EVENTS = [
  ['_BIRT_GCHI', 'Birth of a grandchild'],
  ['_BIRT_CHIL', 'Birth of a child'],
  ['_BIRT_SIBL', 'Birth of a sibling'],
  ['_MARR_GCHI', 'Marriage of a grandchild'],
  ['_MARR_CHIL', 'Marriage of a child'],
  ['_MARR_SIBL', 'Marriage of a sibling'],
  ['_MARR_PARE', 'Marriage of a parent'],
  ['_DEAT_GCHI', 'Death of a grandchild'],
  ['_DEAT_CHIL', 'Death of a child'],
  ['_DEAT_SIBL', 'Death of a sibling'],
  ['_DEAT_PARE', 'Death of a parent'],
  ['_DEAT_SPOU', 'Death of a spouse'],
  ['_DEAT_GPAR', 'Death of a grandparent'],
];

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{gedcomId: number, gedcom_name: string, title: string}} params.tree
 * @param {Record<string,string>} params.preferences
 * @param {Array<{id: number, realName: string, userName: string}>} params.members
 * @param {boolean} params.isAdmin
 * @param {boolean} params.duplicateName
 * @returns {string}
 */
export function renderTreePreferencesPage({ csrfToken, tree, preferences, members, isAdmin, duplicateName }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, MANAGE_TREES_LINK(tree.gedcom_name), { label: 'Preferences' }]);

  const pref = (name, fallback = '') => preferences[name] ?? fallback;
  const memberOptions = { '': '&nbsp;' };

  for (const member of members) {
    memberOptions[member.id] = `${member.realName} - ${member.userName}`;
  }

  const duplicateWarning = duplicateName ? `<div class="alert alert-danger">The family tree &ldquo;${escapeHtml(tree.gedcom_name)}&rdquo; already exists.</div>` : '';

  const body = `<h1>Preferences &mdash; ${escapeHtml(tree.title)}</h1>
${duplicateWarning}
<form method="post" action="/tree/${encodeURIComponent(tree.gedcom_name)}/preferences" class="form-horizontal">
  <h2>General</h2>
  <div class="row mb-3">
    <label for="title">Family tree title</label>
    <input class="form-control" id="title" maxlength="255" name="title" required type="text" value="${escapeHtml(tree.title)}">
  </div>
  ${
    isAdmin
      ? `<div class="row mb-3"><label for="gedcom">URL</label><input class="form-control" id="gedcom" maxlength="255" name="gedcom" required type="text" value="${escapeHtml(tree.gedcom_name)}"></div>`
      : ''
  }
  <div class="row mb-3">
    <label for="PEDIGREE_ROOT_ID">Default individual (XREF)</label>
    <input class="form-control" id="PEDIGREE_ROOT_ID" name="PEDIGREE_ROOT_ID" type="text" value="${escapeHtml(pref('PEDIGREE_ROOT_ID'))}">
  </div>
  <div class="row mb-3">
    <label>Calendar conversion</label>
    <input class="form-control" name="CALENDAR_FORMAT0" type="text" value="${escapeHtml(pref('CALENDAR_FORMAT').split('_and_')[0] ?? '')}" placeholder="none">
    <input class="form-control" name="CALENDAR_FORMAT1" type="text" value="${escapeHtml(pref('CALENDAR_FORMAT').split('_and_')[1] ?? '')}" placeholder="none">
  </div>
  <div class="row mb-3">
    <label>Add unique identifiers</label>
    ${radiosInline('GENERATE_UIDS', pref('GENERATE_UIDS', ''), ['no', 'yes'])}
  </div>

  <h2>Contact information</h2>
  <div class="row mb-3">
    <label for="CONTACT_USER_ID">Genealogy contact</label>
    <select id="CONTACT_USER_ID" name="CONTACT_USER_ID" class="form-select">${selectOptions(memberOptions, '')}</select>
  </div>
  <div class="row mb-3">
    <label for="WEBMASTER_USER_ID">Technical help contact</label>
    <select id="WEBMASTER_USER_ID" name="WEBMASTER_USER_ID" class="form-select">${selectOptions(memberOptions, '')}</select>
  </div>

  <h2>Website</h2>
  <div class="row mb-3">
    <label for="META_TITLE">Add to TITLE header tag</label>
    <input class="form-control" id="META_TITLE" maxlength="255" name="META_TITLE" type="text" value="${escapeHtml(pref('META_TITLE'))}">
  </div>
  <div class="row mb-3">
    <label for="META_DESCRIPTION">Description META tag</label>
    <input class="form-control" id="META_DESCRIPTION" maxlength="255" name="META_DESCRIPTION" type="text" value="${escapeHtml(pref('META_DESCRIPTION'))}">
  </div>

  ${
    isAdmin
      ? `<h2>Media folders</h2><div class="row mb-3"><label for="MEDIA_DIRECTORY">Media folder</label><input class="form-control" id="MEDIA_DIRECTORY" maxlength="255" name="MEDIA_DIRECTORY" type="text" value="${escapeHtml(pref('MEDIA_DIRECTORY', 'media/'))}"></div>`
      : ''
  }

  <h2>Media files</h2>
  <div class="row mb-3">
    <label for="MEDIA_UPLOAD">Who can upload new media files</label>
    <select id="MEDIA_UPLOAD" name="MEDIA_UPLOAD" class="form-select">${selectOptions({ 1: 'Show to members', 0: 'Show to managers', '-1': 'Hide from everyone' }, pref('MEDIA_UPLOAD', '0'))}</select>
  </div>
  <div class="row mb-3">
    <label for="SHOW_MEDIA_DOWNLOAD">Show a download link in the media viewer</label>
    <select id="SHOW_MEDIA_DOWNLOAD" name="SHOW_MEDIA_DOWNLOAD" class="form-select">${selectOptions({ 2: 'Show to visitors', 1: 'Show to members', 0: 'Show to managers', '-1': 'Hide from everyone' }, pref('SHOW_MEDIA_DOWNLOAD', '0'))}</select>
  </div>

  <h2>Thumbnail images</h2>
  <div class="row mb-3"><label>Thumbnail images</label> ${radiosInline('SHOW_HIGHLIGHT_IMAGES', pref('SHOW_HIGHLIGHT_IMAGES', ''), ['hide', 'show'])}</div>
  <div class="row mb-3"><label>Use silhouettes</label> ${radiosInline('USE_SILHOUETTE', pref('USE_SILHOUETTE', ''), ['no', 'yes'])}</div>

  <h2>Watermarks</h2>
  <div class="row mb-3">
    <label for="SHOW_NO_WATERMARK">Images without watermarks</label>
    <select id="SHOW_NO_WATERMARK" name="SHOW_NO_WATERMARK" class="form-select">${selectOptions({ 2: 'Show to visitors', 1: 'Show to members', 0: 'Show to managers', '-1': 'Hide from everyone' }, pref('SHOW_NO_WATERMARK', '0'))}</select>
  </div>

  <h2>Lists</h2>
  <div class="row mb-3">
    <label for="SURNAME_LIST_STYLE">Surname list style</label>
    <select id="SURNAME_LIST_STYLE" name="SURNAME_LIST_STYLE" class="form-select">${selectOptions({ style1: 'list', style2: 'table', style3: 'tag cloud' }, pref('SURNAME_LIST_STYLE', 'style2'))}</select>
  </div>
  <div class="row mb-3">
    <label for="SUBLIST_TRIGGER_I">Maximum number of surnames on individual list</label>
    <input class="form-control" id="SUBLIST_TRIGGER_I" max="99999" min="0" name="SUBLIST_TRIGGER_I" required type="number" value="${escapeHtml(pref('SUBLIST_TRIGGER_I', '0'))}">
  </div>
  <div class="row mb-3"><label>Estimated dates for birth and death</label> ${radiosInline('SHOW_EST_LIST_DATES', pref('SHOW_EST_LIST_DATES', ''), ['hide', 'show'])}</div>
  <div class="row mb-3"><label>The date and time of the last update</label> ${radiosInline('SHOW_LAST_CHANGE', pref('SHOW_LAST_CHANGE', ''), ['hide', 'show'])}</div>

  <h2>Charts</h2>
  <div class="row mb-3"><label>Age of parents next to child's birthdate</label> ${radiosInline('SHOW_PARENTS_AGE', pref('SHOW_PARENTS_AGE', ''), ['hide', 'show'])}</div>
  <div class="row mb-3">
    <label for="CHART_BOX_TAGS">Other facts to show in charts</label>
    ${multiSelect('CHART_BOX_TAGS', pref('CHART_BOX_TAGS'), INDIVIDUAL_FACTS)}
  </div>

  <h2>Individual pages</h2>
  <fieldset class="row mb-3">
    <legend>Show the events of close relatives on the individual page</legend>
    ${RELATIVE_EVENTS.map(
      ([tag, label]) =>
        `<label><input name="SHOW_RELATIVES_EVENTS[]" type="checkbox" value="${tag}" ${
          pref('SHOW_RELATIVES_EVENTS', '').split(',').includes(tag) ? 'checked' : ''
        }> ${escapeHtml(label)}</label>`,
    ).join(' ')}
  </fieldset>
  <div class="row mb-3"><label>Fact icons</label> ${radiosInline('SHOW_FACT_ICONS', pref('SHOW_FACT_ICONS', ''), ['hide', 'show'])}</div>
  <div class="row mb-3"><label>Automatically expand notes</label> ${radiosInline('EXPAND_NOTES', pref('EXPAND_NOTES', ''), ['no', 'yes'])}</div>
  <div class="row mb-3"><label>Automatically expand sources</label> ${radiosInline('EXPAND_SOURCES', pref('EXPAND_SOURCES', ''), ['no', 'yes'])}</div>

  <h2>Places</h2>
  <div class="row mb-3">
    <label>Abbreviate place names</label>
    <select name="SHOW_PEDIGREE_PLACES_SUFFIX" class="form-select">${selectOptions({ 0: 'first', 1: 'last' }, pref('SHOW_PEDIGREE_PLACES_SUFFIX', '0'))}</select>
    <input class="form-control" name="SHOW_PEDIGREE_PLACES" type="number" min="1" max="9" value="${escapeHtml(pref('SHOW_PEDIGREE_PLACES', '1'))}">
  </div>

  <h2>Text</h2>
  <div class="row mb-3"><label>Format text and notes</label> ${radiosInline('FORMAT_TEXT', pref('FORMAT_TEXT', ''), ['', 'markdown']).replace('value="0"', 'value=""').replace('value="1"', 'value="markdown"')}</div>

  <h2>General</h2>
  <div class="row mb-3"><label>Allow users to see raw GEDCOM records</label> ${radiosInline('SHOW_GEDCOM_RECORD', pref('SHOW_GEDCOM_RECORD', ''), ['no', 'yes'])}</div>
  <div class="row mb-3"><label>GEDCOM errors</label> ${radiosInline('HIDE_GEDCOM_ERRORS', pref('HIDE_GEDCOM_ERRORS', ''), ['hide', 'show'])}</div>
  <div class="row mb-3"><label>Hit counters</label> ${radiosInline('SHOW_COUNTER', pref('SHOW_COUNTER', ''), ['hide', 'show'])}</div>

  <h2>Edit preferences</h2>
  <div class="row mb-3">
    <label for="QUICK_REQUIRED_FACTS">Facts for new individuals</label>
    ${multiSelect('QUICK_REQUIRED_FACTS', pref('QUICK_REQUIRED_FACTS'), INDIVIDUAL_FACTS)}
  </div>
  <div class="row mb-3">
    <label for="INDI_FACTS_QUICK">Quick individual facts</label>
    ${multiSelect('INDI_FACTS_QUICK', pref('INDI_FACTS_QUICK'), INDIVIDUAL_FACTS)}
  </div>
  <div class="row mb-3">
    <label for="QUICK_REQUIRED_FAMFACTS">Facts for new families</label>
    ${multiSelect('QUICK_REQUIRED_FAMFACTS', pref('QUICK_REQUIRED_FAMFACTS'), FAMILY_FACTS)}
  </div>
  <div class="row mb-3">
    <label for="FAM_FACTS_QUICK">Quick family facts</label>
    ${multiSelect('FAM_FACTS_QUICK', pref('FAM_FACTS_QUICK'), FAMILY_FACTS)}
  </div>
  <div class="row mb-3"><label>No update CHAN records</label> ${radiosInline('NO_UPDATE_CHAN', pref('NO_UPDATE_CHAN', ''), ['no', 'yes'])}</div>

  <div class="row mb-3">
    <button type="submit" class="btn btn-primary">save</button>
    <a class="btn btn-secondary" href="/admin/trees/manage/${encodeURIComponent(tree.gedcom_name)}">cancel</a>
  </div>
  <input type="hidden" name="SURNAME_TRADITION" value="${escapeHtml(pref('SURNAME_TRADITION', 'paternal'))}">
  ${csrfField(csrfToken)}
</form>`;

  return renderAdminPage({ title: `Preferences — ${tree.title}`, csrfToken, breadcrumbsHtml, bodyHtml: body });
}

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{gedcom_name: string, title: string}} params.tree
 * @param {Record<string,string>} params.xrefs
 * @returns {string}
 */
export function renderRenumberTreePage({ csrfToken, tree, xrefs }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, MANAGE_TREES_LINK(tree.gedcom_name), { label: 'Renumber XREFs' }]);

  const count = Object.keys(xrefs).length;
  const body = `<h1>Renumber XREFs &mdash; ${escapeHtml(tree.title)}</h1>
<p>In a family tree, each record has an internal reference number (called an &ldquo;XREF&rdquo;) such as &ldquo;F123&rdquo; or &ldquo;R14&rdquo;.</p>
<p>You can renumber the records in a family tree, so that these internal reference numbers are not duplicated in any other family tree.</p>
<p>This family tree has ${count} record(s) which use the same &ldquo;XREF&rdquo; as another family tree.</p>
${
  count > 0
    ? `<form method="post" action="/tree/${encodeURIComponent(tree.gedcom_name)}/renumber">
  <button type="submit" class="btn btn-primary">continue</button>
  <span>Caution! This may take a long time. Be patient.</span>
  ${csrfField(csrfToken)}
</form>`
    : ''
}`;

  return renderAdminPage({ title: `Renumber XREFs — ${tree.title}`, csrfToken, breadcrumbsHtml, bodyHtml: body });
}

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{gedcom_name: string, title: string, private: number}} params.tree
 * @param {Record<string,string>} params.preferences
 * @param {Array<{default_resn_id: number, xref: string|null, tag_type: string|null, resn: string}>} params.restrictions
 * @returns {string}
 */
export function renderTreePrivacyPage({ csrfToken, tree, preferences, restrictions }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, MANAGE_TREES_LINK(tree.gedcom_name), { label: 'Privacy' }]);
  const pref = (name, fallback = '') => preferences[name] ?? fallback;

  const restrictionRows = restrictions
    .map(
      (r) => `<tr>
  <td>${r.xref === null ? 'All records' : escapeHtml(r.xref)}</td>
  <td>${r.tag_type === null ? 'All facts and events' : escapeHtml(r.tag_type)}</td>
  <td>${escapeHtml(r.resn)}</td>
  <td><label><input name="delete[]" type="checkbox" value="${r.default_resn_id}"> Delete</label></td>
</tr>`,
    )
    .join('\n');

  const body = `<h1>${escapeHtml(tree.gedcom_name)} &mdash; Privacy</h1>
<form method="post" action="/tree/${encodeURIComponent(tree.gedcom_name)}/privacy">
  <div class="row mb-3">
    <label for="REQUIRE_AUTHENTICATION">Show the family tree</label>
    <select id="REQUIRE_AUTHENTICATION" name="REQUIRE_AUTHENTICATION" class="form-select">${selectOptions({ 0: 'Show to visitors', 1: 'Show to members' }, String(tree.private))}</select>
  </div>
  <div class="row mb-3">
    <label for="SHOW_DEAD_PEOPLE">Show dead individuals</label>
    <select id="SHOW_DEAD_PEOPLE" name="SHOW_DEAD_PEOPLE" class="form-select">${selectOptions({ 2: 'Show to visitors', 1: 'Show to members' }, pref('SHOW_DEAD_PEOPLE', '2'))}</select>
  </div>
  <div class="row mb-3">
    <label for="MAX_ALIVE_AGE">Age at which to assume an individual is dead</label>
    <input class="form-control" id="MAX_ALIVE_AGE" min="1" max="9999" name="MAX_ALIVE_AGE" required type="number" value="${escapeHtml(pref('MAX_ALIVE_AGE', '100'))}">
  </div>
  <div class="row mb-3">
    <label for="HIDE_LIVE_PEOPLE">Show living individuals</label>
    <select id="HIDE_LIVE_PEOPLE" name="HIDE_LIVE_PEOPLE" class="form-select">${selectOptions({ 0: 'Show to visitors', 1: 'Show to members' }, pref('HIDE_LIVE_PEOPLE', '1'))}</select>
  </div>
  <div class="row mb-3">
    <label>Extend privacy to dead individuals: born in the last</label>
    <input class="form-control" name="KEEP_ALIVE_YEARS_BIRTH" type="number" value="${escapeHtml(pref('KEEP_ALIVE_YEARS_BIRTH', '0'))}"> years, or died in the last
    <input class="form-control" name="KEEP_ALIVE_YEARS_DEATH" type="number" value="${escapeHtml(pref('KEEP_ALIVE_YEARS_DEATH', '0'))}"> years
  </div>
  <div class="row mb-3">
    <label for="SHOW_LIVING_NAMES">Show names of private individuals</label>
    <select id="SHOW_LIVING_NAMES" name="SHOW_LIVING_NAMES" class="form-select">${selectOptions({ 2: 'Show to visitors', 1: 'Show to members', 0: 'Show to managers' }, pref('SHOW_LIVING_NAMES', '1'))}</select>
  </div>
  <div class="row mb-3">
    <label for="SHOW_PRIVATE_RELATIONSHIPS">Show private relationships</label>
    <select id="SHOW_PRIVATE_RELATIONSHIPS" name="SHOW_PRIVATE_RELATIONSHIPS" class="form-select">${selectOptions({ 0: 'Hide from everyone', 1: 'Show to visitors' }, pref('SHOW_PRIVATE_RELATIONSHIPS', '1'))}</select>
  </div>

  <h2>Privacy restrictions</h2>
  <p>You can set the access for a specific record, fact, or event by adding a restriction to it. If a record, fact, or event does not have a restriction, the following default restrictions will be used.</p>
  <table class="table table-bordered table-sm" id="default-resn">
    <thead><tr><th>Record (XREF)</th><th>Fact or event (tag)</th><th>Access level</th><th>Delete</th></tr></thead>
    <tbody>${restrictionRows}</tbody>
  </table>
  <p>Add a new restriction:</p>
  <div class="row mb-3">
    <input class="form-control" name="xref[]" type="text" placeholder="XREF (blank = all records)">
    <input class="form-control" name="tag_type[]" type="text" placeholder="Tag (blank = all facts)">
    <select name="resn[]" class="form-select">${selectOptions({ none: 'Show to visitors', privacy: 'Show to members', confidential: 'Show to managers', hidden: 'Hide from everyone' }, 'privacy')}</select>
  </div>

  <div class="row mb-3">
    <button type="submit" class="btn btn-primary">save</button>
  </div>
  ${csrfField(csrfToken)}
</form>`;

  return renderAdminPage({ title: `${tree.gedcom_name} — Privacy`, csrfToken, breadcrumbsHtml, bodyHtml: body });
}

/**
 * @param {object} params
 * @param {{gedcom_name: string, title: string}} params.tree
 * @param {string[]} params.errors
 * @param {string[]} params.warnings
 * @returns {string}
 */
export function renderCheckTreePage({ csrfToken, tree, errors, warnings }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, MANAGE_TREES_LINK(tree.gedcom_name), { label: 'Check for errors' }]);

  const items =
    errors.length === 0 && warnings.length === 0
      ? '<li class="list-group-item">No errors have been found.</li>'
      : [...errors.map((m) => `<li class="list-group-item list-group-item-danger">${escapeHtml(m)}</li>`), ...warnings.map((m) => `<li class="list-group-item list-group-item-warning">${escapeHtml(m)}</li>`)].join('\n');

  const body = `<h1>Check for errors &mdash; ${escapeHtml(tree.title)}</h1>
<h2>GEDCOM errors</h2>
<ul class="list-group">${items}</ul>`;

  return renderAdminPage({ title: `Check for errors — ${tree.title}`, csrfToken, breadcrumbsHtml, bodyHtml: body });
}
