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

// Data/logic layer for /admin/admin-users{,-data,-create,-edit},
// /admin/users/delete/{user_id}, /admin/masquerade/{user_id} (phase 5
// step 40, user management - full fidelity per the user's own choice).
//
// Password hashing reuses bcryptjs the same way account-update.mjs
// and login-action.mjs already do (PASSWORD_DEFAULT/bcrypt,
// cross-language-verified since phase 5 step 1). Session handling for
// masquerade reuses session-store.mjs's regenerateSessionForLogin()
// UNCHANGED - "masquerade" is structurally just "log in as this user
// without a password check", the exact same Auth::login() ->
// Session::regenerate(false) PHP itself calls.

import bcrypt from 'bcryptjs';

async function upsertUserSetting(client, userId, settingName, settingValue) {
  await client.query(
    `INSERT INTO wt_user_setting (user_id, setting_name, setting_value)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, setting_name) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [userId, settingName, settingValue],
  );
}

async function upsertUserGedcomSetting(client, gedcomId, userId, settingName, settingValue) {
  await client.query(
    `INSERT INTO wt_user_gedcom_setting (gedcom_id, user_id, setting_name, setting_value)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (gedcom_id, user_id, setting_name) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [gedcomId, userId, settingName, settingValue],
  );
}

/**
 * Mirrors UserService::findByUserName()/findByEmail() - a plain exact
 * match, same convention already established by account-update.mjs's
 * own duplicate checks (no case/accent folding at the SQL level).
 */
export async function findUserByUserName(pool, userName) {
  const result = await pool.query('SELECT user_id FROM wt_user WHERE user_name = $1', [userName]);
  return result.rows[0]?.user_id ?? null;
}

export async function findUserByEmail(pool, email) {
  const result = await pool.query('SELECT user_id FROM wt_user WHERE email = $1', [email]);
  return result.rows[0]?.user_id ?? null;
}

/**
 * Mirrors UserAddAction::handle() - creates the user row plus the 6
 * settings it sets immediately (verified/approved so the account is
 * usable right away - an admin-created account skips the email-
 * verification step real PHP's own registration flow requires).
 * Deliberately does NOT send the real "New user at %s" notification
 * email UserEditAction sends on later approval - this migration has
 * no EmailService/SMTP port at all (see pages-server/control-panel.mjs's
 * own doc comment for the same "no network dependency" reasoning).
 *
 * @param {import('pg').Pool} pool
 * @param {{username: string, realName: string, email: string, password: string}} params
 * @returns {Promise<number>} the new user_id
 */
export async function createUser(pool, { username, realName, email, password }) {
  const passwordHash = bcrypt.hashSync(password, 10);

  const result = await pool.query('INSERT INTO wt_user (user_name, real_name, email, password) VALUES ($1, $2, $3, $4) RETURNING user_id', [
    username,
    realName,
    email,
    passwordHash,
  ]);
  const userId = result.rows[0].user_id;

  const timezoneResult = await pool.query("SELECT setting_value FROM wt_site_setting WHERE setting_name = 'TIMEZONE'");
  const timezone = timezoneResult.rows[0]?.setting_value ?? 'UTC';

  await upsertUserSetting(pool, userId, 'verified', '1');
  await upsertUserSetting(pool, userId, 'verified_by_admin', '1');
  await upsertUserSetting(pool, userId, 'language', 'en-US');
  await upsertUserSetting(pool, userId, 'TIMEZONE', timezone);
  await upsertUserSetting(pool, userId, 'reg_timestamp', String(Math.floor(Date.now() / 1000)));
  await upsertUserSetting(pool, userId, 'sessiontime', '0');

  return userId;
}

/**
 * Mirrors UserEditPage::handle()'s own data load - every preference
 * the edit form needs, plus this user's per-tree role/individual-
 * link/relationship-privacy settings.
 *
 * @param {import('pg').Pool} pool
 * @param {number} userId
 * @returns {Promise<{userId: number, userName: string, realName: string, email: string, preferences: Record<string,string>, treePreferences: Map<number, {role: string, gedcomId: string, pathLength: number}>}|null>}
 */
export async function loadUserForEdit(pool, userId) {
  const userResult = await pool.query('SELECT user_id, user_name, real_name, email FROM wt_user WHERE user_id = $1', [userId]);

  if (userResult.rows.length === 0) {
    return null;
  }

  const row = userResult.rows[0];

  const settingsResult = await pool.query('SELECT setting_name, setting_value FROM wt_user_setting WHERE user_id = $1', [userId]);
  const preferences = {};
  for (const settingRow of settingsResult.rows) {
    preferences[settingRow.setting_name] = settingRow.setting_value;
  }

  const treeSettingsResult = await pool.query(
    "SELECT gedcom_id, setting_name, setting_value FROM wt_user_gedcom_setting WHERE user_id = $1 AND setting_name IN ('canedit', 'gedcomid', 'RELATIONSHIP_PATH_LENGTH')",
    [userId],
  );

  const treePreferences = new Map();
  for (const settingRow of treeSettingsResult.rows) {
    const entry = treePreferences.get(settingRow.gedcom_id) ?? { role: 'none', gedcomId: '', pathLength: 0 };
    if (settingRow.setting_name === 'canedit') {
      entry.role = settingRow.setting_value;
    } else if (settingRow.setting_name === 'gedcomid') {
      entry.gedcomId = settingRow.setting_value;
    } else if (settingRow.setting_name === 'RELATIONSHIP_PATH_LENGTH') {
      entry.pathLength = parseInt(settingRow.setting_value, 10) || 0;
    }
    treePreferences.set(settingRow.gedcom_id, entry);
  }

  return { userId: row.user_id, userName: row.user_name, realName: row.real_name, email: row.email, preferences, treePreferences };
}

/**
 * Mirrors UserEditAction::handle() EXACTLY, including its real
 * ordering quirk: every preference (theme/language/timezone/contact-
 * method/comment/auto_accept/visible-online/verified/approved/
 * password/admin-flag/per-tree roles) is written FIRST; the email/
 * username duplicate check happens LAST, so a duplicate submission
 * still applies every other field change and only skips the email/
 * username write itself - not a bug this port should fix, since full
 * fidelity was the user's own explicit choice for this feature.
 *
 * @param {import('pg').Pool} pool
 * @param {number} actingUserId the logged-in admin doing the edit (can't change their own admin flag)
 * @param {Array<{gedcomId: number}>} trees every tree (per-tree fields are named ...{gedcomId})
 * @param {URLSearchParams} formData
 * @returns {Promise<{errors: string[]}>}
 */
export async function updateUser(pool, actingUserId, trees, formData) {
  const userId = parseInt(formData.get('user_id'), 10);
  const username = formData.get('username') ?? '';
  const realName = formData.get('real_name') ?? '';
  const email = formData.get('email') ?? '';
  const password = formData.get('password') ?? '';
  const theme = formData.get('theme') ?? '';
  const language = formData.get('language') ?? '';
  const timezone = formData.get('timezone') ?? '';
  const contactMethod = formData.get('contact-method') ?? '';
  const comment = formData.get('comment') ?? '';
  const autoAccept = formData.get('auto_accept') !== null;
  const canAdmin = formData.get('canadmin') !== null;
  const visibleOnline = formData.get('visible-online') !== null;
  const verified = formData.get('verified') !== null;
  const approved = formData.get('approved') !== null;

  await pool.query('UPDATE wt_user SET real_name = $1 WHERE user_id = $2', [realName, userId]);
  await upsertUserSetting(pool, userId, 'theme', theme);
  await upsertUserSetting(pool, userId, 'language', language);
  await upsertUserSetting(pool, userId, 'TIMEZONE', timezone);
  await upsertUserSetting(pool, userId, 'contactmethod', contactMethod);
  await upsertUserSetting(pool, userId, 'comment', comment);
  await upsertUserSetting(pool, userId, 'auto_accept', autoAccept ? '1' : '');
  await upsertUserSetting(pool, userId, 'visibleonline', visibleOnline ? '1' : '');
  await upsertUserSetting(pool, userId, 'verified', verified ? '1' : '');
  await upsertUserSetting(pool, userId, 'verified_by_admin', approved ? '1' : '');

  if (password !== '') {
    const passwordHash = bcrypt.hashSync(password, 10);
    await pool.query('UPDATE wt_user SET password = $1 WHERE user_id = $2', [passwordHash, userId]);
  }

  // Real PHP: "We cannot change our own admin status."
  if (userId !== actingUserId) {
    await upsertUserSetting(pool, userId, 'canadmin', canAdmin ? '1' : '');
  }

  for (const tree of trees) {
    const pathLengthRaw = parseInt(formData.get(`RELATIONSHIP_PATH_LENGTH${tree.gedcomId}`), 10) || 0;
    const gedcomId = formData.get(`gedcomid${tree.gedcomId}`) ?? '';
    const canEdit = formData.get(`canedit${tree.gedcomId}`) ?? '';
    // "Do not allow a path length to be set if the individual ID is not."
    const pathLength = gedcomId === '' ? 0 : pathLengthRaw;

    await upsertUserGedcomSetting(pool, tree.gedcomId, userId, 'gedcomid', gedcomId);
    await upsertUserGedcomSetting(pool, tree.gedcomId, userId, 'canedit', canEdit);
    await upsertUserGedcomSetting(pool, tree.gedcomId, userId, 'RELATIONSHIP_PATH_LENGTH', String(pathLength));
  }

  const errors = [];

  const currentResult = await pool.query('SELECT user_name, email FROM wt_user WHERE user_id = $1', [userId]);
  const current = currentResult.rows[0];

  if (current.email !== email) {
    const existing = await findUserByEmail(pool, email);

    if (existing !== null && existing !== userId) {
      errors.push('Duplicate email address. A user with that email already exists.');
    } else {
      await pool.query('UPDATE wt_user SET email = $1 WHERE user_id = $2', [email, userId]);
    }
  }

  if (current.user_name !== username) {
    const existing = await findUserByUserName(pool, username);

    if (existing !== null && existing !== userId) {
      errors.push('Duplicate username. A user with that username already exists. Please choose another username.');
    } else {
      await pool.query('UPDATE wt_user SET user_name = $1 WHERE user_id = $2', [username, userId]);
    }
  }

  return { errors };
}

/**
 * Mirrors UserListData::handle()'s own query (app/Http/RequestHandlers/UserListData.php:67-107) -
 * a wide left-joined row per user, column order matching
 * resources/views/admin/users.phtml's own `data-columns` config
 * exactly (edit-menu placeholder, user_id, user_name, real_name,
 * email, language, registered_at(x2), active_at(x2), verified,
 * verified_by_admin).
 *
 * @returns {{sql: string, params: Array}}
 */
export function buildUserListQuery() {
  const sql = `SELECT
      u.user_id AS edit_menu,
      u.user_id,
      u.user_name,
      u.real_name,
      u.email,
      us1.setting_value AS language,
      us2.setting_value AS registered_at,
      us3.setting_value AS active_at,
      us4.setting_value AS verified,
      us5.setting_value AS verified_by_admin,
      us6.setting_value AS canadmin
    FROM wt_user u
    LEFT JOIN wt_user_setting us1 ON us1.user_id = u.user_id AND us1.setting_name = 'language'
    LEFT JOIN wt_user_setting us2 ON us2.user_id = u.user_id AND us2.setting_name = 'reg_timestamp'
    LEFT JOIN wt_user_setting us3 ON us3.user_id = u.user_id AND us3.setting_name = 'sessiontime'
    LEFT JOIN wt_user_setting us4 ON us4.user_id = u.user_id AND us4.setting_name = 'verified'
    LEFT JOIN wt_user_setting us5 ON us5.user_id = u.user_id AND us5.setting_name = 'verified_by_admin'
    LEFT JOIN wt_user_setting us6 ON us6.user_id = u.user_id AND us6.setting_name = 'canadmin'
    WHERE u.user_id > 0`;

  return { sql, params: [] };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatTimestampDiff(unixSeconds) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (seconds < 60) return 'a few seconds ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minute(s) ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hour(s) ago`;
  return `${Math.floor(seconds / 86400)} day(s) ago`;
}

/**
 * Mirrors resources/views/admin/users-table-options.phtml - the per-
 * row dropdown menu (edit / masquerade / delete), privacy-gated
 * exactly like the real template: masquerade/delete are hidden
 * entirely for your OWN row, and delete is additionally hidden for
 * any other administrator's row.
 *
 * @param {{userId: number, realName: string, isAdmin: boolean}} rowUser
 * @param {number} selfUserId
 * @returns {string}
 */
export function userEditMenuHtml(rowUser, selfUserId) {
  const isSelf = rowUser.userId === selfUserId;

  const masqueradeItem = isSelf
    ? ''
    : `<div class="dropdown-item">
            <a href="#" data-wt-post-url="/admin/masquerade/${rowUser.userId}" data-wt-reload-url="/">Masquerade as this user</a>
        </div>`;

  const deleteItem =
    !isSelf && !rowUser.isAdmin
      ? `<div class="dropdown-item">
            <a href="#" data-wt-confirm="Are you sure you want to delete “${escapeHtml(rowUser.realName)}”?" data-wt-post-url="/admin/users/delete/${rowUser.userId}">Delete</a>
        </div>`
      : '';

  return `<div class="dropdown">
    <button type="button" class="btn btn-primary dropdown-toggle" data-bs-toggle="dropdown" id="edit-user-button-${rowUser.userId}" aria-haspopup="true" aria-expanded="false">
        <span class="wt-icon-menu"><i class="fa-solid fa-bars"></i></span>
    </button>
    <div class="dropdown-menu" aria-labelledby="edit-user-button-${rowUser.userId}">
        <div class="dropdown-item"><a href="/admin/admin-users-edit?user_id=${rowUser.userId}">Edit</a></div>
        <div class="divider"></div>
        ${masqueradeItem}
        ${deleteItem}
    </div>
</div>`;
}

/**
 * Mirrors UserListData::handle()'s own per-row $callback - including
 * the "highlight old registrations" rule (real PHP:
 * `!$verified_by_admin && now - registered_at > 604800`, i.e. a still-
 * unapproved registration older than 7 days gets a red registration-
 * date cell).
 *
 * @param {object} row
 * @param {number} selfUserId
 * @returns {Array} one DataTables row (12 cells, matching real PHP's own column count)
 */
export function userListRow(row, selfUserId) {
  const registeredAt = row.registered_at !== null ? parseInt(row.registered_at, 10) : null;
  const activeAt = row.active_at !== null ? parseInt(row.active_at, 10) : null;
  const verifiedByAdmin = row.verified_by_admin === '1';

  let registeredCell = registeredAt !== null ? formatTimestampDiff(registeredAt) : '';

  if (!verifiedByAdmin && registeredAt !== null && Math.floor(Date.now() / 1000) - registeredAt > 604800) {
    registeredCell = `<span class="text-danger">${registeredCell}</span>`;
  }

  const rowUser = { userId: row.user_id, realName: row.real_name, isAdmin: row.canadmin === '1' };

  return [
    userEditMenuHtml(rowUser, selfUserId),
    row.user_id,
    `<bdi>${escapeHtml(row.user_name)}</bdi>`,
    `<bdi>${escapeHtml(row.real_name)}</bdi>`,
    `<a href="mailto:${escapeHtml(row.email)}">${escapeHtml(row.email)}</a>`,
    row.language ?? '',
    registeredAt ?? '',
    registeredCell,
    activeAt ?? '',
    activeAt !== null ? formatTimestampDiff(activeAt) : 'Never',
    row.verified === '1' ? 'yes' : 'no',
    verifiedByAdmin ? 'yes' : 'no',
  ];
}

/**
 * Mirrors DeleteUser::handle() -> UserService::delete(), but FIXED the
 * same way account-delete.mjs already fixed the self-delete path
 * (phase 5 step 5): real PHP deletes across ~8 tables with NO
 * transaction, so a mid-delete failure leaves the account half-
 * deleted. Wrapped in one transaction here instead.
 *
 * Unlike account-delete.mjs's own self-delete case, the pending-
 * change reassignment is NOT a no-op here - `actingAdminUserId` is a
 * DIFFERENT user than the one being deleted, so "take over the user's
 * pending changes" (real PHP's own comment) does something real: the
 * acting admin inherits every non-rejected change row.
 *
 * @param {import('pg').Pool} pool
 * @param {number} targetUserId
 * @param {number} actingAdminUserId
 */
export async function deleteUserTransactional(pool, targetUserId, actingAdminUserId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM wt_session WHERE user_id = $1', [targetUserId]);
    await client.query('UPDATE wt_log SET user_id = NULL WHERE user_id = $1', [targetUserId]);
    await client.query("DELETE FROM wt_change WHERE user_id = $1 AND status = 'rejected'", [targetUserId]);
    await client.query('UPDATE wt_change SET user_id = $1 WHERE user_id = $2', [actingAdminUserId, targetUserId]);
    await client.query('DELETE FROM wt_block_setting WHERE block_id IN (SELECT block_id FROM wt_block WHERE user_id = $1)', [targetUserId]);
    await client.query('DELETE FROM wt_block WHERE user_id = $1', [targetUserId]);
    await client.query('DELETE FROM wt_user_gedcom_setting WHERE user_id = $1', [targetUserId]);
    await client.query('DELETE FROM wt_user_setting WHERE user_id = $1', [targetUserId]);
    await client.query('DELETE FROM wt_message WHERE user_id = $1', [targetUserId]);
    await client.query('DELETE FROM wt_user WHERE user_id = $1', [targetUserId]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
