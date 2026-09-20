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

// Deliberately DIVERGES from app/Services/UserService::delete()
// (called by AccountDelete.php), not a faithful port - confirmed live
// (2026-09-19) that PHP's own version has a real, currently-shipped
// bug: it deletes across ~8 tables with NO transaction, and its
// "reassign this user's pending wt_change rows to Auth::id()" step is
// a no-op for the only real caller (this route only ever deletes the
// CURRENTLY LOGGED IN user, so Auth::id() === the user being deleted).
// Any user with a non-rejected wt_change row, or even just an
// auto-created default wt_block (dashboard widget - common for most
// users), gets a 500 (FK violation on the final `DELETE FROM
// wt_user`) that leaves the account HALF-DELETED: session/settings/
// blocks/messages already gone, user row still stuck there, unable to
// log in or retry. Reproduced against the real live app with a
// disposable test user before writing this file.
//
// Fixed here (explicit project-owner decision, not a unilateral
// call): wrap every step in one transaction, so a failure rolls back
// to a fully untouched account instead of a half-deleted one; and
// delete the user's own pending/accepted wt_change rows outright
// (there's no "reassign to a different real admin" without inventing
// a whole new decision this project hasn't made - deleting your own
// account already means abandoning your own pending edits) instead of
// replicating the self-referential no-op.

export async function deleteAccount(pool, userId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query('DELETE FROM wt_session WHERE user_id = $1', [userId]);
    await client.query('UPDATE wt_log SET user_id = NULL WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM wt_change WHERE user_id = $1', [userId]);
    await client.query(
      'DELETE FROM wt_block_setting WHERE block_id IN (SELECT block_id FROM wt_block WHERE user_id = $1)',
      [userId],
    );
    await client.query('DELETE FROM wt_block WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM wt_user_gedcom_setting WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM wt_user_setting WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM wt_message WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM wt_user WHERE user_id = $1', [userId]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
