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

// Mirrors app/Http/RequestHandlers/SelectLanguage.php and
// SelectTheme.php - both are literally the same 3 lines with a
// different field name ('language' vs 'theme', which happen to be
// identical strings for the session key, the wt_user_setting
// setting_name, AND the URL segment - confirmed against
// UserInterface::PREF_LANGUAGE/PREF_THEME's actual constant values,
// not assumed from the names). Deliberately NOT validated against a
// real language/theme whitelist here, matching PHP: neither handler
// nor its route registration constrains {language}/{theme} to known
// values (no ->tokens() constraint, unlike some other routes in
// WebRoutes.php) - porting that looseness faithfully, not "improving"
// on it, since it carries no crash/corruption risk (unlike the
// AccountDelete case) - just an unrecognized value stored as-is.
//
// PHP's User::setPreference() writes to wt_user_setting for a real
// logged-in user, but GuestUser::setPreference() (app/GuestUser.php:80-83)
// writes to the SESSION instead, under a '_GUEST_'-prefixed key - so an
// anonymous visitor's language/theme choice is remembered for their
// session only, never the database. Both cases are replicated exactly.

/**
 * @param {import('pg').Pool} pool
 * @param {object} params
 * @param {'language'|'theme'} params.field
 * @param {string} params.value
 * @param {Record<string, unknown>} params.session mutated in place
 * @param {{userId: number}|null} params.user
 */
export async function selectPreference(pool, { field, value, session, user }) {
  session[field] = value;

  if (user === null) {
    session[`_GUEST_${field}`] = value;
    return;
  }

  await pool.query(
    `INSERT INTO wt_user_setting (user_id, setting_name, setting_value)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, setting_name) DO UPDATE SET setting_value = EXCLUDED.setting_value`,
    [user.userId, field, value],
  );
}
