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

// Mirrors app/Http/RequestHandlers/AccountUpdate.php: duplicate email/
// username checks, wt_user update, bcrypt password hash (bcryptjs,
// matching PHP's password_hash($password, PASSWORD_DEFAULT) - already
// proven cross-language-verifiable in phase 5 step 1), and the same 4
// wt_user_setting upserts (contactmethod/language/TIMEZONE/visibleonline).
// The tree-scoped default-xref field (AccountUpdate.php:96-99) is out
// of scope - this is the no-tree variant only, see the phase 5 doc.

import bcrypt from 'bcryptjs';

const PREF_LANGUAGE = 'language';
const PREF_CONTACT_METHOD = 'contactmethod';
const PREF_TIME_ZONE = 'TIMEZONE';
const PREF_IS_VISIBLE_ONLINE = 'visibleonline';

async function upsertSetting(pool, userId, settingName, settingValue) {
  await pool.query(
    `INSERT INTO wt_user_setting (user_id, setting_name, setting_value)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, setting_name) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [userId, settingName, settingValue],
  );
}

/**
 * @param {import('pg').Pool} pool
 * @param {{userId: number, userName: string, email: string}} user
 * @param {URLSearchParams} formData
 * @returns {Promise<{errors: string[]}>}
 */
export async function updateAccount(pool, user, formData) {
  const contactMethod = formData.get('contact-method') ?? '';
  const email = formData.get('email') ?? '';
  const language = formData.get('language') ?? '';
  const realName = formData.get('real_name') ?? '';
  const password = formData.get('password') ?? '';
  const timeZone = formData.get('timezone') ?? '';
  const userName = formData.get('user_name') ?? '';
  const visibleOnline = formData.get('visible-online') !== null;

  const errors = [];

  if (password !== '') {
    const passwordHash = bcrypt.hashSync(password, 10);

    await pool.query('UPDATE wt_user SET password = $1 WHERE user_id = $2', [passwordHash, user.userId]);
  }

  if (email !== user.email) {
    const existing = await pool.query('SELECT user_id FROM wt_user WHERE email = $1', [email]);

    if (existing.rows.length > 0 && existing.rows[0].user_id !== user.userId) {
      errors.push('Duplicate email address. A user with that email already exists.');
    } else {
      await pool.query('UPDATE wt_user SET email = $1 WHERE user_id = $2', [email, user.userId]);
    }
  }

  if (userName !== user.userName) {
    const existing = await pool.query('SELECT user_id FROM wt_user WHERE user_name = $1', [userName]);

    if (existing.rows.length > 0 && existing.rows[0].user_id !== user.userId) {
      errors.push('Duplicate username. A user with that username already exists. Please choose another username.');
    } else {
      await pool.query('UPDATE wt_user SET user_name = $1 WHERE user_id = $2', [userName, user.userId]);
    }
  }

  await pool.query('UPDATE wt_user SET real_name = $1 WHERE user_id = $2', [realName, user.userId]);

  await upsertSetting(pool, user.userId, PREF_CONTACT_METHOD, contactMethod);
  await upsertSetting(pool, user.userId, PREF_LANGUAGE, language);
  await upsertSetting(pool, user.userId, PREF_TIME_ZONE, timeZone);
  await upsertSetting(pool, user.userId, PREF_IS_VISIBLE_ONLINE, visibleOnline ? '1' : '');

  return { errors };
}
