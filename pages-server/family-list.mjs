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

// Data layer for /tree/{tree}/family-list (FamilyListModule), the
// first of the two AbstractIndividualListModule.php-based routes
// (app/Module/AbstractIndividualListModule.php, 759 lines) - the
// surname index/given-name-sublist machinery shared with
// IndividualListModule (not yet ported). Only the `showFamilies()`
// true path is implemented here (`whereFamily($fams=true, ...)`
// joins `wt_link` on `l_type='FAMS'` throughout) - IndividualListModule
// would need its own `fams=false` variant of every query below.
//
// Full fidelity, per explicit user decision over the "simple list"
// family's deliberate DataTables-to-plain-table simplification: this
// route keeps the real surname-collation grouping (allSurns/
// allSurnames/surnameInitials/givenNameInitials) and the real
// families-table.phtml 14-column markup (see family-list-view.mjs),
// not a simplified plain table.

import { alphabet, compare, initialLetter, normalize, strtoupper } from './collation.mjs';

/**
 * Mirrors AbstractIndividualListModule::surnameData() (app/Module/AbstractIndividualListModule.php:566-590)
 * for the `fams=true` (family-list) case: every (n_surn, n_surname)
 * pair with its row count, joined to `wt_link` on FAMS (only names
 * belonging to an individual who is a spouse in some family count at
 * all - matching real PHP's `whereFamily(true, ...)` join exactly).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {boolean} marnm include married (_MARNM) names
 * @returns {Promise<{n_surn: string, n_surname: string, total: number}[]>}
 */
export async function surnameData(pool, gedcomId, marnm) {
  const conditions = ['n.n_file = $1', 'n.n_surn IS NOT NULL', 'n.n_surname IS NOT NULL'];
  const params = [gedcomId];

  if (!marnm) {
    conditions.push("n.n_type <> '_MARNM'");
  }

  const result = await pool.query(
    `SELECT n.n_surn, n.n_surname, COUNT(*) AS total
     FROM wt_name n
     JOIN wt_link l ON l.l_from = n.n_id AND l.l_file = n.n_file AND l.l_type = 'FAMS'
     WHERE ${conditions.join(' AND ')}
     GROUP BY n.n_surn, n.n_surname`,
    params,
  );

  return result.rows.map((row) => ({ n_surn: row.n_surn, n_surname: row.n_surname, total: Number(row.total) }));
}

/**
 * Mirrors AbstractIndividualListModule::allSurns() (app/Module/AbstractIndividualListModule.php:600-612):
 * groups raw n_surn spellings by their normalized/uppercased form -
 * the lookup used to resolve a canonical `surname` query param back to
 * every real spelling that collates the same way - sorted by locale
 * collation (not insertion order).
 *
 * @param {{n_surn: string, n_surname: string, total: number}[]} data
 * @returns {Map<string, string[]>}
 */
export function allSurns(data) {
  const list = new Map();

  for (const row of data) {
    const key = strtoupper(normalize(row.n_surn));

    if (!list.has(key)) {
      list.set(key, []);
    }

    list.get(key).push(row.n_surn);
  }

  return new Map([...list.entries()].sort((a, b) => compare(a[0], b[0])));
}

/**
 * Mirrors AbstractIndividualListModule::allSurnames() (app/Module/AbstractIndividualListModule.php:622-637):
 * groups DISPLAY surnames (n_surname - falls back to n_surn when
 * n_surname is empty, matching real PHP) under their normalized
 * canonical form, with a per-spelling total, sorted by locale collation.
 *
 * @param {{n_surn: string, n_surname: string, total: number}[]} data
 * @returns {Map<string, Map<string, number>>}
 */
export function allSurnames(data) {
  const list = new Map();

  for (const row of data) {
    const displaySurname = row.n_surn === '' ? row.n_surname : row.n_surn;
    const key = strtoupper(normalize(displaySurname));

    if (!list.has(key)) {
      list.set(key, new Map());
    }

    const inner = list.get(key);
    inner.set(row.n_surname, (inner.get(row.n_surname) ?? 0) + row.total);
  }

  return new Map([...list.entries()].sort((a, b) => compare(a[0], b[0])));
}

/**
 * Mirrors AbstractIndividualListModule::surnameInitials() (app/Module/AbstractIndividualListModule.php:646-678):
 * a count per initial letter, seeded with every alphabet() letter at 0
 * (so the UI always shows the full alphabet, not just letters with
 * data), with the "no surname" bucket moved to the ',' key and the
 * "unrecognized initial" bucket moved to '@' at the very end.
 *
 * @param {{n_surn: string, n_surname: string, total: number}[]} data
 * @returns {Map<string, number>}
 */
export function surnameInitials(data) {
  const initials = new Map();

  for (const letter of alphabet()) {
    initials.set(letter, 0);
  }

  for (const row of data) {
    const initial = initialLetter(normalize(strtoupper(row.n_surn)));
    initials.set(initial, (initials.get(initial) ?? 0) + row.total);
  }

  const countNone = initials.get('') ?? 0;

  if (countNone > 0) {
    initials.delete('');
    initials.set(',', countNone);
  }

  const countUnknown = initials.get('@') ?? 0;

  if (countUnknown > 0) {
    initials.delete('@');
    initials.set('@', countUnknown);
  }

  return initials;
}

/**
 * Mirrors AbstractIndividualListModule::givenNameInitials() (app/Module/AbstractIndividualListModule.php:523-561)
 * for the `fams=true` case: a count per given-name initial letter,
 * among individuals with one of the given surnames (or everyone, if
 * `surns` is empty), seeded with every alphabet() letter at 0, with the
 * "unrecognized initial" bucket moved to '@' at the end (no ','/no-given-name
 * remapping here - unlike surnameInitials(), real PHP doesn't do that
 * for given names).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string[]} surns if non-empty, only consider these exact n_surn values
 * @param {boolean} marnm include married (_MARNM) names
 * @returns {Promise<Map<string, number>>}
 */
export async function givenNameInitials(pool, gedcomId, surns, marnm) {
  const conditions = ["n.n_file = $1"];
  const params = [gedcomId];

  if (!marnm) {
    conditions.push("n.n_type <> '_MARNM'");
  }

  if (surns.length > 0) {
    params.push(surns);
    conditions.push(`n.n_surn = ANY($${params.length})`);
  }

  const result = await pool.query(
    `SELECT n.n_givn, COUNT(*) AS total
     FROM wt_name n
     JOIN wt_link l ON l.l_from = n.n_id AND l.l_file = n.n_file AND l.l_type = 'FAMS'
     WHERE ${conditions.join(' AND ')}
     GROUP BY n.n_givn`,
    params,
  );

  const initials = new Map();

  for (const letter of alphabet()) {
    initials.set(letter, 0);
  }

  for (const row of result.rows) {
    const initial = initialLetter(normalize(strtoupper(row.n_givn ?? '')));
    initials.set(initial, (initials.get(initial) ?? 0) + Number(row.total));
  }

  const countUnknown = initials.get('@') ?? 0;

  if (countUnknown > 0) {
    initials.delete('@');
    initials.set('@', countUnknown);
  }

  return initials;
}

/**
 * Mirrors AbstractIndividualListModule::individuals()+families()
 * (app/Module/AbstractIndividualListModule.php:692-758) collapsed into
 * one query for the `fams=true` case: real PHP finds matching
 * INDIVIDUALS first, then expands to their spouseFamilies() and
 * de-duplicates - this queries `wt_link` (FAMS) directly for the same
 * end result (every family where SOME spouse has a matching name),
 * since FamilyListModule's own row rendering (husband()/wife(), via
 * families-table.phtml) never needs to know which specific NAME fact
 * matched - unlike IndividualListModule, which sets each individual's
 * *primary* name to the matched one for display (not replicated here -
 * out of scope for a family list, which always shows every one of each
 * spouse's own names via getAllNames(), independent of the match).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string[]} surnsToShow if empty, every real surname (excluding
 *   '' and '@N.N.' - matching real PHP's own `whereNotIn` default)
 * @param {string} galpha if set, only match a given name starting with
 *   this initial letter
 * @param {boolean} marnm include married (_MARNM) names
 * @returns {Promise<string[]>} distinct family xrefs, unsorted (the
 *   caller sorts, same as real PHP's own families-table.phtml does via
 *   its `data-sorting` default)
 */
export async function familyXrefsForSurnames(pool, gedcomId, surnsToShow, galpha, marnm) {
  const conditions = ['n.n_file = $1'];
  const params = [gedcomId];

  if (!marnm) {
    conditions.push("n.n_type <> '_MARNM'");
  }

  if (surnsToShow.length === 0) {
    conditions.push("n.n_surn NOT IN ('', '@N.N.')");
  } else {
    params.push(surnsToShow);
    conditions.push(`n.n_surn = ANY($${params.length})`);
  }

  const result = await pool.query(
    `SELECT DISTINCT l.l_to AS family_xref, n.n_givn
     FROM wt_name n
     JOIN wt_link l ON l.l_from = n.n_id AND l.l_file = n.n_file AND l.l_type = 'FAMS'
     WHERE ${conditions.join(' AND ')}`,
    params,
  );

  if (galpha === '') {
    return [...new Set(result.rows.map((row) => row.family_xref))];
  }

  // galpha filtering happens in JS (not SQL) - it's locale-aware
  // (initialLetter(normalize(strtoupper(...)))), the same collation
  // layer used everywhere else in this file, not a plain SQL LIKE.
  const xrefs = new Set();

  for (const row of result.rows) {
    if (initialLetter(normalize(strtoupper(row.n_givn ?? ''))) === galpha) {
      xrefs.add(row.family_xref);
    }
  }

  return [...xrefs];
}
