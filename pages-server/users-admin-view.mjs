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

// HTML assembly for /admin/admin-users{,-create,-edit} (phase 5 step
// 40). The list page is the first REAL server-side DataTables page in
// this migration (see pages-server/datatables.mjs's own doc comment) -
// `data-server-side="true"` + `data-ajax` means webtrees.js's already-
// shipped `table.datatables` init code (resources/js/webtrees/init.js)
// drives the whole thing with no new client JS needed, same as every
// other already-ported `datatables`-class table.

import { renderAdminPage, renderBreadcrumbs } from './admin-layout-view.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function selectOptions(options, selected) {
  return Object.entries(options)
    .map(([value, label]) => `<option value="${escapeHtml(value)}"${String(value) === String(selected) ? ' selected' : ''}>${label === '' ? '&nbsp;' : escapeHtml(label)}</option>`)
    .join('\n');
}

function passwordField({ id, required = false, autocomplete = 'new-password' }) {
  return `<div class="input-group">
    <input autocomplete="${autocomplete}" class="form-control" id="${id}" name="${id}" pattern=".{8,}" placeholder="Use at least 8 characters." ${required ? 'required="required"' : ''} type="password">
    <button id="${id}-toggle" class="btn btn-outline-secondary" type="button" title="Show password">show</button>
</div>
<script>
  document.getElementById('${id}-toggle').addEventListener('click', function (event) {
    const field = document.getElementById('${id}');
    const btn = event.target;
    if (field.type === 'password') { field.type = 'text'; btn.textContent = 'hide'; }
    else { field.type = 'password'; btn.textContent = 'show'; }
    field.focus();
  });
</script>`;
}

const CONTROL_PANEL_LINK = { label: 'Control panel', url: '/admin' };
const USER_LIST_LINK = { label: 'User administration', url: '/admin/admin-users' };

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {string} [params.filter]
 * @returns {string}
 */
export function renderUsersListPage({ csrfToken, filter = '' }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, { label: 'User administration' }]);

  const languageJson = JSON.stringify({
    paginate: { first: 'first', last: 'last', next: 'next', previous: 'previous' },
    emptyTable: 'No records to display',
    info: 'Showing _START_ to _END_ of _TOTAL_',
    infoEmpty: 'Showing 0 to 0 of 0',
    infoFiltered: '(filtered from _MAX_ total entries)',
    lengthMenu: 'Display _MENU_',
    loadingRecords: 'Loading…',
    processing: 'Calculating…',
    search: 'Filter',
    zeroRecords: 'No records to display',
  });
  const layoutJson = JSON.stringify({ topStart: 'paging', topEnd: 'search', bottomStart: 'info', bottomEnd: 'pageLength' });
  const lengthMenuJson = JSON.stringify([
    [10, 20, 50, 100, 500, 1000, -1],
    ['10', '20', '50', '100', '500', '1000', 'All'],
  ]);
  const searchJson = JSON.stringify({ search: filter });
  const columnsJson = JSON.stringify([
    { sortable: false },
    { visible: false },
    {},
    {},
    {},
    {},
    { visible: false },
    { dataSort: 6 },
    { visible: false },
    { dataSort: 8 },
    {},
    {},
  ]);
  const ajaxJson = JSON.stringify({ url: '/admin/admin-users-data', type: 'POST' });

  const bodyHtml = `<h1>User administration</h1>
<table
    id="wt-datatables-admin-users"
    class="table table-sm table-bordered table-user-list datatables"
    data-auto-width="false"
    data-language='${languageJson}'
    data-layout='${layoutJson}'
    data-length-menu='${lengthMenuJson}'
    data-state-save="true"
    data-processing="true"
    data-server-side="true"
    data-ajax='${ajaxJson}'
    data-sorting='[[2,"asc"]]'
    data-search='${searchJson}'
    data-columns='${columnsJson}'
>
    <thead>
        <tr>
            <th>Edit</th>
            <th></th>
            <th>Username</th>
            <th>Real name</th>
            <th>Email address</th>
            <th>Language</th>
            <th></th>
            <th>Date registered</th>
            <th></th>
            <th>Last signed in</th>
            <th>Verified</th>
            <th>Approved</th>
        </tr>
    </thead>
    <tbody></tbody>
</table>`;

  return renderAdminPage({ title: 'User administration', csrfToken, breadcrumbsHtml, bodyHtml });
}

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{email: string, realName: string, username: string}} params.values
 * @returns {string}
 */
export function renderUserAddPage({ csrfToken, values }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, USER_LIST_LINK, { label: 'Add a user' }]);

  const bodyHtml = `<h1>Add a user</h1>
<form method="post" action="/admin/admin-users-create" class="form-horizontal" autocomplete="off">
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="real_name">Real name</label>
        <div class="col-sm-9">
            <input class="form-control" type="text" id="real_name" name="real_name" required="required" maxlength="64" value="${escapeHtml(values.realName)}" dir="auto">
        </div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="username">Username</label>
        <div class="col-sm-9">
            <input class="form-control" type="text" id="username" name="username" required="required" maxlength="32" value="${escapeHtml(values.username)}" dir="auto">
        </div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="password">Password</label>
        <div class="col-sm-9">${passwordField({ id: 'password', required: true })}</div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="email">Email address</label>
        <div class="col-sm-9">
            <input class="form-control" type="email" id="email" name="email" required="required" maxlength="64" value="${escapeHtml(values.email)}">
        </div>
    </div>
    <div class="row mb-3">
        <div class="offset-sm-3 col-sm-9"><button type="submit" class="btn btn-primary">save</button></div>
    </div>
    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
</form>`;

  return renderAdminPage({ title: 'Add a user', csrfToken, breadcrumbsHtml, bodyHtml });
}

const ROLE_OPTIONS = { none: 'Visitor', access: 'Member', edit: 'Editor', accept: 'Moderator', admin: 'Manager' };

function treeRoleRows(trees, user) {
  return trees
    .map((tree) => {
      const entry = user.treePreferences.get(tree.gedcomId) ?? { role: 'none', gedcomId: '', pathLength: 0 };
      const pathOptions = Array.from({ length: 11 }, (_, n) => `<option value="${n}"${entry.pathLength === n ? ' selected' : ''}>${n === 0 ? 'No' : n}</option>`).join('');

      return `<tr>
        <td>${escapeHtml(tree.title)}</td>
        <td><select class="form-select" name="canedit${tree.gedcomId}">${selectOptions(ROLE_OPTIONS, entry.role)}</select></td>
        <td><input class="form-control" type="text" name="gedcomid${tree.gedcomId}" value="${escapeHtml(entry.gedcomId)}"></td>
        <td><select class="form-select" name="RELATIONSHIP_PATH_LENGTH${tree.gedcomId}" id="RELATIONSHIP_PATH_LENGTH${tree.gedcomId}">${pathOptions}</select></td>
    </tr>`;
    })
    .join('\n');
}

/**
 * @param {object} params
 * @param {string} params.csrfToken
 * @param {{userId: number, userName: string, realName: string, email: string, preferences: Record<string,string>, treePreferences: Map}} params.user
 * @param {Array<{gedcomId: number, title: string}>} params.trees
 * @param {boolean} params.isSelf whether the acting admin is editing their own account (hides the admin checkbox)
 * @param {string[]} [params.errors]
 * @returns {string}
 */
export function renderUserEditPage({ csrfToken, user, trees, isSelf, errors = [] }) {
  const breadcrumbsHtml = renderBreadcrumbs([CONTROL_PANEL_LINK, USER_LIST_LINK, { label: 'Edit the user' }]);
  const p = user.preferences;

  const errorsHtml = errors.map((error) => `<div class="alert alert-danger">${escapeHtml(error)}</div>`).join('\n');

  const themeOptions = { '': '<default theme>', clouds: 'clouds', colors: 'colors', fab: 'F.A.B.', minimal: 'minimal', webtrees: 'webtrees', xenea: 'xenea' };
  const contactMethodOptions = {
    internal: 'Internal messaging',
    'internal and email': 'Internal messaging with emails',
    email: 'webtrees sends emails with no storage',
    mailto: 'Mailto link',
    none: 'No contact',
  };

  const bodyHtml = `<h1>Edit the user</h1>
${errorsHtml}
<form method="post" action="/admin/admin-users-edit" class="form-horizontal" autocomplete="off">
    <input type="hidden" name="user_id" value="${user.userId}">
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="real_name">Real name</label>
        <div class="col-sm-9"><input class="form-control" type="text" id="real_name" name="real_name" required="required" maxlength="64" value="${escapeHtml(user.realName)}" dir="auto"></div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="username">Username</label>
        <div class="col-sm-9"><input class="form-control" type="text" id="username" name="username" required="required" maxlength="32" value="${escapeHtml(user.userName)}" dir="auto"></div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="password">Password</label>
        <div class="col-sm-9">${passwordField({ id: 'password' })}</div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="email">Email address</label>
        <div class="col-sm-9"><input class="form-control" type="email" id="email" name="email" required="required" maxlength="64" value="${escapeHtml(user.email)}"></div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label">Account approval and email verification</label>
        <div class="col-sm-9">
            <div class="form-check">
                <label><input type="checkbox" name="verified" value="1" ${p.verified === '1' ? 'checked' : ''}> Email verified</label>
                <label><input type="checkbox" name="approved" value="1" ${p.verified_by_admin === '1' ? 'checked' : ''}> Approved by administrator</label>
            </div>
        </div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="language">Language</label>
        <div class="col-sm-9"><input class="form-control" type="text" id="language" name="language" value="${escapeHtml(p.language ?? 'en-US')}" maxlength="8"></div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="timezone">Time zone</label>
        <div class="col-sm-9"><input class="form-control" type="text" id="timezone" name="timezone" value="${escapeHtml(p.TIMEZONE ?? 'UTC')}"></div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label">Changes</label>
        <div class="col-sm-9">
            <div class="form-check"><label><input type="checkbox" name="auto_accept" value="1" ${p.auto_accept === '1' ? 'checked' : ''}> Automatically accept changes made by this user</label></div>
        </div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label">Visible online</label>
        <div class="col-sm-9">
            <div class="form-check"><label><input type="checkbox" id="visible-online" name="visible-online" value="1" ${p.visibleonline === '1' ? 'checked' : ''}> Visible to other users when online</label></div>
        </div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="contact-method">Preferred contact method</label>
        <div class="col-sm-9"><select class="form-select" id="contact-method" name="contact-method">${selectOptions(contactMethodOptions, p.contactmethod ?? '')}</select></div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="theme">Theme</label>
        <div class="col-sm-9"><select class="form-select" id="theme" name="theme">${selectOptions(themeOptions, p.theme ?? '')}</select></div>
    </div>
    <div class="row mb-3">
        <label class="col-sm-3 col-form-label" for="comment">Administrator comments on user</label>
        <div class="col-sm-9"><textarea class="form-control" id="comment" name="comment" rows="4" dir="auto" maxlength="255">${escapeHtml(p.comment ?? '')}</textarea></div>
    </div>
    ${
      isSelf
        ? ''
        : `<div class="row mb-3">
        <label class="col-sm-3 col-form-label"></label>
        <div class="col-sm-9">
            <div class="form-check"><label><input type="checkbox" id="admin" name="canadmin" value="1" ${p.canadmin === '1' ? 'checked' : ''}> Administrator</label></div>
        </div>
    </div>`
    }

    <h3>Access to family trees</h3>
    <table class="table table-bordered table-sm">
        <thead>
            <tr><th>Family tree</th><th>Role</th><th>Individual record</th><th>Restrict to immediate family</th></tr>
        </thead>
        <tbody>${treeRoleRows(trees, user)}</tbody>
    </table>

    <div class="row mb-3">
        <div class="offset-sm-3 col-sm-9"><button type="submit" class="btn btn-primary">save</button></div>
    </div>
    <input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">
</form>`;

  return renderAdminPage({ title: 'Edit the user', csrfToken, breadcrumbsHtml, bodyHtml });
}
