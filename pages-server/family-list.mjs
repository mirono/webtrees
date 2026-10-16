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

// Data layer shared by /tree/{tree}/family-list (FamilyListModule) AND
// /tree/{tree}/individual-list (IndividualListModule) -
// AbstractIndividualListModule.php's own surname-index/given-name-sublist
// machinery (app/Module/AbstractIndividualListModule.php, 759 lines),
// parameterized on `fams` the same way real PHP's own
// `whereFamily(bool $fams, ...)` is: true joins `wt_link` on
// `l_type='FAMS'` (only names belonging to a SPOUSE count, for the
// family list); false (individual-list) applies no such join at all
// (every individual's own names count, spouse or not).
//
// Full fidelity, per explicit user decision over the "simple list"
// family's deliberate DataTables-to-plain-table simplification: both
// routes keep the real surname-collation grouping (allSurns/
// allSurnames/surnameInitials/givenNameInitials) and their own real
// *-table.phtml markup (see family-list-view.mjs/individual-list-view.mjs),
// not a simplified plain table.

import { alphabet, compare, initialLetter, normalize, strtoupper } from './collation.mjs';

/**
 * Mirrors AbstractIndividualListModule::surnameData() (app/Module/AbstractIndividualListModule.php:566-590):
 * every (n_surn, n_surname) pair with its row count. `fams=true`
 * (family-list) joins `wt_link` on FAMS - only names belonging to an
 * individual who is a spouse in some family count at all, matching
 * `whereFamily(true, ...)`; `fams=false` (individual-list) applies no
 * such join - every individual's own names count.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {boolean} marnm include married (_MARNM) names
 * @param {boolean} fams
 * @returns {Promise<{n_surn: string, n_surname: string, total: number}[]>}
 */
export async function surnameData(pool, gedcomId, marnm, fams) {
  const conditions = ['n.n_file = $1', 'n.n_surn IS NOT NULL', 'n.n_surname IS NOT NULL'];
  const params = [gedcomId];

  if (!marnm) {
    conditions.push("n.n_type <> '_MARNM'");
  }

  const famsJoin = fams ? "JOIN wt_link l ON l.l_from = n.n_id AND l.l_file = n.n_file AND l.l_type = 'FAMS'" : '';

  const result = await pool.query(
    `SELECT n.n_surn, n.n_surname, COUNT(*) AS total
     FROM wt_name n
     ${famsJoin}
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
 * Mirrors AbstractIndividualListModule::givenNameInitials() (app/Module/AbstractIndividualListModule.php:523-561):
 * a count per given-name initial letter, among individuals with one of
 * the given surnames (or everyone, if `surns` is empty), seeded with
 * every alphabet() letter at 0, with the "unrecognized initial" bucket
 * moved to '@' at the end (no ','/no-given-name remapping here - unlike
 * surnameInitials(), real PHP doesn't do that for given names). `fams`
 * same meaning as surnameData() above.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string[]} surns if non-empty, only consider these exact n_surn values
 * @param {boolean} marnm include married (_MARNM) names
 * @param {boolean} fams
 * @returns {Promise<Map<string, number>>}
 */
export async function givenNameInitials(pool, gedcomId, surns, marnm, fams) {
  const conditions = ["n.n_file = $1"];
  const params = [gedcomId];

  if (!marnm) {
    conditions.push("n.n_type <> '_MARNM'");
  }

  if (surns.length > 0) {
    params.push(surns);
    conditions.push(`n.n_surn = ANY($${params.length})`);
  }

  const famsJoin = fams ? "JOIN wt_link l ON l.l_from = n.n_id AND l.l_file = n.n_file AND l.l_type = 'FAMS'" : '';

  const result = await pool.query(
    `SELECT n.n_givn, COUNT(*) AS total
     FROM wt_name n
     ${famsJoin}
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

/**
 * Mirrors the two tree preferences AbstractIndividualListModule::handle()
 * reads directly (app/Module/AbstractIndividualListModule.php:339,375) -
 * their real defaults ('style2', '200' - app/Tree.php:88-89) apply the
 * same way `loadTreePrivacyPrefs()`'s own HIDE_LIVE_PEOPLE default does:
 * no `wt_gedcom_setting` row at all means the PHP default, since
 * `Tree::getPreference()` falls back to `self::DEFAULT_PREFERENCES`.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<{surnameListStyle: 'style1'|'style2'|'style3', sublistTrigger: number}>}
 */
export async function loadFamilyListPrefs(pool, gedcomId) {
  const result = await pool.query(
    "SELECT setting_name, setting_value FROM wt_gedcom_setting WHERE gedcom_id = $1 AND setting_name IN ('SURNAME_LIST_STYLE', 'SUBLIST_TRIGGER_I')",
    [gedcomId],
  );
  const byName = Object.fromEntries(result.rows.map((row) => [row.setting_name, row.setting_value]));

  return {
    // `??` (not `||`) deliberately: a MISSING row falls back to the
    // real PHP default, but a row that explicitly stores '' would stay
    // '' in real PHP too (Tree::getPreference() only substitutes its
    // DEFAULT_PREFERENCES fallback when no row exists at all) - same
    // distinction loadShowLastChangePref() elsewhere in this migration
    // already has to make.
    surnameListStyle: byName.SURNAME_LIST_STYLE ?? 'style2',
    sublistTrigger: Number(byName.SUBLIST_TRIGGER_I ?? '200'),
  };
}

const NOMEN_NESCIO = '@N.N.';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Mirrors AbstractIndividualListModule::listUrl() (app/Module/AbstractIndividualListModule.php:84-102)
 * for the no-xref case (every internal redirect/nav link on the list
 * page itself - the xref-prefill branch only matters when LINKING TO
 * the list from elsewhere, e.g. an individual's own page, not ported
 * here). Omits any param whose value is null/''/undefined, matching
 * `route()`'s own query-string building.
 *
 * @param {string} treeName
 * @param {Record<string, string|null|undefined>} params
 * @returns {string}
 */
export function familyListUrl(treeName, params = {}) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      query.set(key, value);
    }
  }

  const queryString = query.toString();

  return `/tree/${treeName}/family-list${queryString ? `?${queryString}` : ''}`;
}

/**
 * Mirrors the query-param resolution half of
 * AbstractIndividualListModule::handle() (app/Module/AbstractIndividualListModule.php:112-251) -
 * everything EXCEPT the actual surname-index DB queries (the caller
 * already ran surnameData()/allSurns()/allSurnames()/surnameInitials()
 * and passes the results in) and the given-name-sublist threshold
 * check (SUBLIST_TRIGGER_I needs a total-matched-individual count the
 * caller computes from its own query results - see
 * resolveGivenNameSublist() below).
 *
 * @param {{surnameParam: string, alpha: string, falpha: string, show: string, showAll: string, showMarnm: string, showAllFirstnames: string}} rawParams
 * @param {Map<string, string[]>} allSurns
 * @param {Map<string, Map<string, number>>} allSurnames
 * @param {boolean} showFamilies true for FamilyListModule, false for
 *   IndividualListModule (not yet ported - included for the exact
 *   title wording this function already has to produce)
 * @returns {
 *   | {kind: 'redirect', url: string}
 *   | {kind: 'not-found', surname: string, url: string}
 *   | {
 *       kind: 'ok',
 *       alpha: string, falpha: string, surname: string,
 *       showAll: string, show: string, showMarnm: string, showAllFirstnames: string,
 *       legendHtml: string, title: string, listParams: Record<string, string>,
 *     }
 * }
 */
export function resolveListRequest(rawParams, allSurns, allSurnames, showFamilies) {
  const { surnameParam, alpha: alphaParam, falpha: falphaParam, showMarnm } = rawParams;
  let show = rawParams.show === '' || rawParams.show === undefined ? 'surn' : rawParams.show;
  let showAll = rawParams.showAll;
  let falpha = falphaParam;
  let alpha = alphaParam;

  const surname = strtoupper(normalize(surnameParam));

  const redirectParams = { alpha, falpha, show, show_all: showAll, show_all_firstnames: rawParams.showAllFirstnames, show_marnm: showMarnm, surname };

  if (surnameParam !== surname) {
    return { kind: 'redirect', url: familyListUrl(rawParams.treeName, redirectParams) };
  }

  if (rawParams.showAllFirstnames === 'yes') {
    falpha = '';
  }

  if (showAll === 'yes') {
    alpha = '';
  }

  let effectiveSurname = showAll === 'yes' ? '' : surname;

  if (effectiveSurname !== '') {
    alpha = initialLetter(effectiveSurname);
  }

  if (effectiveSurname !== '' && !allSurns.has(effectiveSurname)) {
    return { kind: 'not-found', surname: effectiveSurname, url: familyListUrl(rawParams.treeName, {}) };
  }

  let legend;
  let listParams;
  const treeName = rawParams.treeName;

  if (showAll === 'yes') {
    if (rawParams.showAllFirstnames === 'yes') {
      legend = 'All';
      listParams = { show_all: 'yes', show_marnm: showMarnm };
      show = 'indi';
    } else if (falpha !== '') {
      legend = `All, ${escapeHtml(falpha)}…`;
      listParams = { show_all: 'yes', show_marnm: showMarnm };
      show = 'indi';
    } else {
      legend = 'All';
      listParams = { show_all: 'yes', show_marnm: showMarnm };
    }
  } else if (effectiveSurname !== '') {
    showAll = 'no';
    show = 'indi';
    listParams = { surname: effectiveSurname, falpha, show_marnm: showMarnm };

    if (effectiveSurname === NOMEN_NESCIO) {
      legend = '…';
    } else {
      const variants = [...(allSurnames.get(effectiveSurname)?.keys() ?? [effectiveSurname])];
      variants.sort(compare);
      legend = variants.map((x) => (x === '' ? 'No surname' : escapeHtml(x))).join('/');
    }

    if (falpha === '@') {
      legend += ', …';
    } else if (falpha !== '') {
      legend += `, ${escapeHtml(falpha)}…`;
    }
  } else if (alpha === '@') {
    showAll = 'no';
    legend = '…';
    listParams = { alpha, show_marnm: showMarnm };
    effectiveSurname = NOMEN_NESCIO;
    show = 'indi';
  } else if (alpha === ',') {
    showAll = 'no';
    legend = 'No surname';
    listParams = { alpha, show_marnm: showMarnm };
    show = 'indi';
  } else if (alpha !== '') {
    showAll = 'no';
    legend = `${escapeHtml(alpha)}…`;
    listParams = { alpha, show_marnm: showMarnm };
  } else {
    showAll = 'no';
    legend = '…';
    listParams = { show_marnm: showMarnm };
    show = 'none';
  }

  const legendHtml = `<bdi>${legend}</bdi>`;
  const title = `${showFamilies ? 'Families' : 'Individuals'} — ${legendHtml}`;

  return {
    kind: 'ok',
    alpha,
    falpha,
    surname: effectiveSurname,
    showAll,
    show,
    showMarnm,
    showAllFirstnames: rawParams.showAllFirstnames,
    legendHtml,
    title,
    listParams: { ...listParams, tree: treeName },
  };
}

/**
 * Mirrors the given-name-sublist decision inside
 * AbstractIndividualListModule::handle()'s `$show === 'indi'` branch
 * (app/Module/AbstractIndividualListModule.php:374-414): don't break a
 * list down by given-name initial at all unless SUBLIST_TRIGGER_I is
 * both nonzero AND the matched-individual count reaches it.
 *
 * @param {number} sublistTrigger tree's SUBLIST_TRIGGER_I preference (default 200)
 * @param {number} matchedCount
 * @returns {boolean}
 */
export function needsGivenNameSublist(sublistTrigger, matchedCount) {
  return sublistTrigger !== 0 && matchedCount >= sublistTrigger;
}

/**
 * Mirrors the `switch ($alpha)` surname-selection filter inside
 * AbstractIndividualListModule::handle()'s `$show === 'indi' || $show === 'surn'`
 * block (app/Module/AbstractIndividualListModule.php:311-335) - the
 * SAME filter decides both which canonical surnames the surnames-table
 * body shows AND (via its total) whether a given-name sublist is
 * needed, using the FINAL post-branching alpha/surname/showAll values
 * (resolveListRequest()'s own `alpha`/`surname`/`showAll` fields).
 *
 * @param {Map<string, Map<string, number>>} allSurnamesMap
 * @param {{alpha: string, surname: string, showAll: string}} selection
 * @returns {Map<string, Map<string, number>>}
 */
export function filterSurnamesForAlpha(allSurnamesMap, { alpha, surname, showAll }) {
  let predicate;

  if (alpha === '@') {
    predicate = (key) => key === NOMEN_NESCIO;
  } else if (alpha === ',') {
    predicate = (key) => key === '';
  } else if (alpha === '') {
    predicate = showAll === 'yes' ? (key) => key !== '' && key !== NOMEN_NESCIO : (key) => key === surname;
  } else if (surname === '') {
    predicate = (key) => initialLetter(key) === alpha;
  } else {
    predicate = (key) => key === surname;
  }

  const filtered = new Map();

  for (const [key, value] of allSurnamesMap) {
    if (predicate(key)) {
      filtered.set(key, value);
    }
  }

  return filtered;
}

/**
 * Mirrors the `$surns_to_show` resolution inside
 * AbstractIndividualListModule::handle()'s `$show === 'indi'` branch
 * (app/Module/AbstractIndividualListModule.php:416-432) - the REAL
 * n_surn spellings (not canonical keys) to pass to a surname-filtered
 * individuals/families query. An empty return means "every real
 * surname" (familyXrefsForSurnames()'s own `NOT IN ('', '@N.N.')`
 * default handles that case).
 *
 * @param {Map<string, string[]>} allSurnsMap
 * @param {{alpha: string, surname: string}} selection
 * @returns {string[]}
 */
export function computeSurnsToShow(allSurnsMap, { alpha, surname }) {
  if (alpha === '@') {
    return [NOMEN_NESCIO];
  }

  if (alpha === ',') {
    return [''];
  }

  if (surname !== '') {
    return allSurnsMap.get(surname) ?? [];
  }

  if (alpha !== '') {
    const matches = [];

    for (const [key, spellings] of allSurnsMap) {
      if (initialLetter(key) === alpha) {
        matches.push(...spellings);
      }
    }

    return matches;
  }

  return [];
}
