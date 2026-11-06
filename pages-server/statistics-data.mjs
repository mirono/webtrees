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

// Raw SQL query functions for statistics data layer
// (Phase 5 step 37) - ports app/StatisticsData.php
// All functions take (pool, gedcomId) as first two params.
// Privacy handling is NOT done here - caller (statistics.mjs wrapper)
// is responsible for privacy checks if needed.

import { COUNTRY_NAMES, COUNTRY_NUMERIC_CODES } from '../lib/iso3166.js';

// Mirrors StatisticsData::getCountryToNumericMap() (app/StatisticsData.php:1177) -
// real PHP maps BOTH the 3-letter code AND its (locale-translated)
// display name to the numeric code, since `wt_places.p_place` rows
// hold the display name a user actually typed, not the 3-letter code.
// This migration has no i18n layer (English-only), so only the
// English name needs this reverse lookup - built once at module load.
const countryNumericCodeByName = new Map();
for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
  const numericCode = COUNTRY_NUMERIC_CODES[code];
  if (numericCode !== undefined) {
    countryNumericCodeByName.set(name, numericCode);
  }
}

// Mirrors StatisticsData::mapNumericToName()'s array_search() - the
// FIRST 3-letter code wins when several share one numeric code (e.g.
// GBR/ENG/SCT/WLS/NIR all = 826); iterating COUNTRY_NUMERIC_CODES in
// its own declaration order (not COUNTRY_NAMES') matches real PHP's
// `iso3166Numeric()` iteration order, which is the one the "GBR must
// come before ENG/NIR/SCT/WLS" comment in that function refers to.
const countryNameByNumericCode = new Map();
for (const [code, numericCode] of Object.entries(COUNTRY_NUMERIC_CODES)) {
  if (!countryNameByNumericCode.has(numericCode) && COUNTRY_NAMES[code] !== undefined) {
    countryNameByNumericCode.set(numericCode, COUNTRY_NAMES[code]);
  }
}

/** Mirrors StatisticsData::mapNumericToName(). */
export function countryNameForNumericCode(numericCode) {
  return countryNameByNumericCode.get(numericCode) ?? '???';
}

export async function countIndividuals(pool, gedcomId) {
  const result = await pool.query('SELECT COUNT(*) as count FROM wt_individuals WHERE i_file = $1', [
    gedcomId,
  ]);
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countFamilies(pool, gedcomId) {
  const result = await pool.query('SELECT COUNT(*) as count FROM wt_families WHERE f_file = $1', [
    gedcomId,
  ]);
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countAllRecords(pool, gedcomId) {
  const result = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM wt_individuals WHERE i_file = $1) +
      (SELECT COUNT(*) FROM wt_families WHERE f_file = $1) +
      (SELECT COUNT(*) FROM wt_media WHERE m_file = $1) +
      (SELECT COUNT(*) FROM wt_other WHERE o_file = $1) +
      (SELECT COUNT(*) FROM wt_sources WHERE s_file = $1) as count`,
    [gedcomId]
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countIndividualsWithEvents(pool, gedcomId, events) {
  const placeholders = events.map((_, i) => `$${i + 2}`).join(',');
  const query = `
    SELECT COUNT(DISTINCT d_gid) as count
    FROM wt_dates
    WHERE d_file = $1 AND d_fact IN (${placeholders})
  `;
  const result = await pool.query(query, [gedcomId, ...events]);
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countFamiliesWithEvents(pool, gedcomId, events) {
  const placeholders = events.map((_, i) => `$${i + 2}`).join(',');
  const query = `
    SELECT COUNT(DISTINCT d_gid) as count
    FROM wt_dates
    JOIN wt_families ON f_id = d_gid AND f_file = d_file
    WHERE d_file = $1 AND d_fact IN (${placeholders})
  `;
  const result = await pool.query(query, [gedcomId, ...events]);
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countIndividualsDeceased(pool, gedcomId) {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM wt_individuals
     WHERE i_file = $1 AND i_gedcom LIKE '%\n1 DEAT%'`,
    [gedcomId]
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countIndividualsLiving(pool, gedcomId) {
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM wt_individuals
     WHERE i_file = $1 AND i_gedcom NOT LIKE '%\n1 DEAT%'`,
    [gedcomId]
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countIndividualsBySex(pool, gedcomId, sex) {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM wt_individuals WHERE i_file = $1 AND i_sex = $2',
    [gedcomId, sex]
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countIndividualsWithSources(pool, gedcomId) {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT i_id) as count
     FROM wt_individuals
     JOIN wt_link ON i_id = l_from AND i_file = l_file
     WHERE i_file = $1 AND l_type = 'SOUR'`,
    [gedcomId]
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countFamiliesWithSources(pool, gedcomId) {
  const result = await pool.query(
    `SELECT COUNT(DISTINCT f_id) as count
     FROM wt_families
     JOIN wt_link ON f_id = l_from AND f_file = l_file
     WHERE f_file = $1 AND l_type = 'SOUR'`,
    [gedcomId]
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countMedia(pool, gedcomId, type = null) {
  if (type === null || type === 'all') {
    const result = await pool.query('SELECT COUNT(*) as count FROM wt_media WHERE m_file = $1', [
      gedcomId,
    ]);
    return parseInt(result.rows[0].count, 10) || 0;
  }

  // Count by media type (from m_type/m_filename)
  const result = await pool.query(
    `SELECT COUNT(*) as count FROM wt_media
     WHERE m_file = $1 AND (
       m_type LIKE $2 OR
       (m_type = '' AND m_filename LIKE $3)
     )`,
    [gedcomId, `%${type}%`, `%.${type}`]
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

/**
 * Mirrors StatisticsData::countMediaByType() (app/StatisticsData.php:603) -
 * media type lives on `wt_media_file.source_media_type`, NOT on
 * `wt_media` (which has no type column at all - `wt_media` is one row
 * per OBJE record, `wt_media_file` one row per FILE sub-record). Real
 * PHP maps the raw GEDCOM type code (e.g. "photo", "certificate") to a
 * translated label via Registry::elementFactory(); this port uses the
 * raw code directly (or "Other" when blank), matching this
 * migration's established no-I18N convention rather than porting that
 * translation table.
 */
export async function countMediaByType(pool, gedcomId) {
  const result = await pool.query(
    `SELECT source_media_type as type, COUNT(*) as count
     FROM wt_media_file
     WHERE m_file = $1
     GROUP BY source_media_type
     ORDER BY count DESC`,
    [gedcomId]
  );

  return result.rows.map((row) => [row.type || 'Other', parseInt(row.count, 10)]);
}

export async function countNotes(pool, gedcomId) {
  const result = await pool.query('SELECT COUNT(*) as count FROM wt_other WHERE o_file = $1 AND o_type = \'NOTE\'', [
    gedcomId,
  ]);
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countAllPlaces(pool, gedcomId) {
  const result = await pool.query('SELECT COUNT(*) as count FROM wt_places WHERE p_file = $1', [
    gedcomId,
  ]);
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countRepositories(pool, gedcomId) {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM wt_other WHERE o_file = $1 AND o_type = \'REPO\'',
    [gedcomId]
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countSources(pool, gedcomId) {
  const result = await pool.query('SELECT COUNT(*) as count FROM wt_sources WHERE s_file = $1', [
    gedcomId,
  ]);
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countSurnames(pool, gedcomId, names) {
  if (!names || names.length === 0) {
    const result = await pool.query(
      `SELECT COUNT(DISTINCT n_surn) as count FROM wt_name
       WHERE n_file = $1 AND n_surn != '' AND n_surn != '@N.N.'`,
      [gedcomId]
    );
    return parseInt(result.rows[0].count, 10) || 0;
  }

  const placeholders = names.map((_, i) => `$${i + 2}`).join(',');
  const query = `
    SELECT COUNT(*) as count FROM wt_name
    WHERE n_file = $1 AND n_surn IN (${placeholders})
  `;
  const result = await pool.query(query, [gedcomId, ...names]);
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countGivenNames(pool, gedcomId, names) {
  if (!names || names.length === 0) {
    const result = await pool.query(
      `SELECT COUNT(DISTINCT n_givn) as count FROM wt_name
       WHERE n_file = $1 AND n_givn != '' AND n_givn != '@P.N.'`,
      [gedcomId]
    );
    return parseInt(result.rows[0].count, 10) || 0;
  }

  const placeholders = names.map((_, i) => `$${i + 2}`).join(',');
  const query = `
    SELECT COUNT(n_givn) as count FROM wt_name
    WHERE n_file = $1 AND n_givn IN (${placeholders})
  `;
  const result = await pool.query(query, [gedcomId, ...names]);
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countOtherEvents(pool, gedcomId, excludeEvents) {
  const placeholders = excludeEvents.map((_, i) => `$${i + 2}`).join(',');
  const query = `
    SELECT COUNT(*) as count FROM wt_dates
    WHERE d_file = $1 AND d_fact NOT IN (${placeholders})
  `;
  const result = await pool.query(query, [gedcomId, ...excludeEvents]);
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function countFamiliesWithNoChildren(pool, gedcomId) {
  const result = await pool.query(
    'SELECT COUNT(*) as count FROM wt_families WHERE f_file = $1 AND f_numchil = 0',
    [gedcomId]
  );
  return parseInt(result.rows[0].count, 10) || 0;
}

export async function averageChildrenPerFamily(pool, gedcomId) {
  const result = await pool.query(
    'SELECT AVG(f_numchil) as avg FROM wt_families WHERE f_file = $1',
    [gedcomId]
  );
  return parseFloat(result.rows[0].avg || 0);
}

export async function averageLifespanDays(pool, gedcomId, sex) {
  const sexFilter = sex === 'ALL' ? '' : 'AND i_sex = $2';
  const query = `
    SELECT AVG(birth_death.d_julianday2 - birth_death.d_julianday1) as days
    FROM (
      SELECT i_id, birth.d_julianday1, death.d_julianday2
      FROM wt_individuals
      JOIN wt_dates birth ON i_file = birth.d_file AND i_id = birth.d_gid AND birth.d_fact = 'BIRT'
      JOIN wt_dates death ON i_file = death.d_file AND i_id = death.d_gid AND death.d_fact = 'DEAT'
      WHERE i_file = $1 ${sexFilter} AND birth.d_julianday1 > 0 AND death.d_julianday2 > 0
    ) birth_death
  `;

  const params = sex === 'ALL' ? [gedcomId] : [gedcomId, sex];
  const result = await pool.query(query, params);
  return parseInt(result.rows[0].days || 0);
}

export async function countEventsByCentury(pool, gedcomId, fact) {
  const result = await pool.query(
    `SELECT ROUND((d_year + 49) / 100.0, 0)::int as century, COUNT(*) as total
     FROM wt_dates
     WHERE d_file = $1 AND d_fact = $2 AND d_year > 0 AND d_type IN ('@#DGREGORIAN@', '@#DJULIAN@')
     GROUP BY century
     ORDER BY century`,
    [gedcomId, fact]
  );

  return result.rows.map((row) => [row.century, parseInt(row.total, 10)]);
}

/**
 * Mirrors StatisticsData::firstEventRecord() via its shared
 * firstEvent() helper (app/StatisticsData.php:800) -
 * Registry::gedcomRecordFactory()->make() there resolves EITHER an
 * individual or a family record polymorphically from a bare `d_gid`,
 * since `wt_dates` rows can reference either (BIRT/DEAT are
 * individual-level facts, MARR/DIV/etc. are family-level). The first
 * delegated attempt only fixed this for the "any event" (empty
 * `facts`) case and left the specific-facts case joined to
 * `wt_individuals` unconditionally - which silently returns nothing
 * at all for MARR/DIV (`firstMarriage`/`lastMarriage`/`firstDivorce`/
 * `lastDivorce` - family-level facts, never matching
 * `wt_individuals.i_id`). Rewritten as one shared implementation that
 * resolves the owning table for ANY fact list.
 *
 * @returns {Promise<{xref: string, gedcom: string, isFamily: boolean}|null>}
 */
export async function firstEventRecord(pool, gedcomId, facts, ascending) {
  const direction = ascending ? 'ASC' : 'DESC';
  let query;
  let params;

  if (!facts || facts.length === 0) {
    query = `SELECT d_gid AS xref FROM wt_dates WHERE d_file = $1 AND d_julianday1 > 0 ORDER BY d_julianday1 ${direction}, d_year ${direction} LIMIT 1`;
    params = [gedcomId];
  } else {
    const placeholders = facts.map((_, i) => `$${i + 2}`).join(',');
    query = `SELECT d_gid AS xref FROM wt_dates WHERE d_file = $1 AND d_fact IN (${placeholders}) AND d_julianday1 > 0 ORDER BY d_julianday1 ${direction}, d_year ${direction} LIMIT 1`;
    params = [gedcomId, ...facts];
  }

  const result = await pool.query(query, params);

  if (result.rows.length === 0) {
    return null;
  }

  const xref = result.rows[0].xref;

  const indResult = await pool.query('SELECT i_gedcom FROM wt_individuals WHERE i_id = $1 AND i_file = $2', [xref, gedcomId]);
  if (indResult.rows.length > 0) {
    return { xref, gedcom: indResult.rows[0].i_gedcom, isFamily: false };
  }

  const famResult = await pool.query('SELECT f_gedcom FROM wt_families WHERE f_id = $1 AND f_file = $2', [xref, gedcomId]);
  if (famResult.rows.length > 0) {
    return { xref, gedcom: famResult.rows[0].f_gedcom, isFamily: true };
  }

  return null;
}

export async function firstEventYear(pool, gedcomId, facts, ascending) {
  if (!facts || facts.length === 0) {
    const query = `
      SELECT d_year FROM wt_dates
      WHERE d_file = $1 AND d_julianday1 > 0 AND d_year > 0
      ORDER BY d_year ${ascending ? 'ASC' : 'DESC'}
      LIMIT 1
    `;
    const result = await pool.query(query, [gedcomId]);
    return result.rows[0]?.d_year ?? null;
  }

  const placeholders = facts.map((_, i) => `$${i + 2}`).join(',');
  const query = `
    SELECT d_year FROM wt_dates
    WHERE d_file = $1 AND d_fact IN (${placeholders}) AND d_julianday1 > 0 AND d_year > 0
    ORDER BY d_year ${ascending ? 'ASC' : 'DESC'}
    LIMIT 1
  `;
  const result = await pool.query(query, [gedcomId, ...facts]);
  return result.rows[0]?.d_year ?? null;
}

export async function firstEventPlace(pool, gedcomId, facts, ascending) {
  if (!facts || facts.length === 0) {
    const query = `
      SELECT d_place FROM wt_dates
      WHERE d_file = $1 AND d_julianday1 > 0
      ORDER BY d_julianday1 ${ascending ? 'ASC' : 'DESC'}, d_year ${ascending ? 'ASC' : 'DESC'}
      LIMIT 1
    `;
    const result = await pool.query(query, [gedcomId]);
    return result.rows[0]?.d_place ?? null;
  }

  const placeholders = facts.map((_, i) => `$${i + 2}`).join(',');
  const query = `
    SELECT d_place FROM wt_dates
    WHERE d_file = $1 AND d_fact IN (${placeholders}) AND d_julianday1 > 0
    ORDER BY d_julianday1 ${ascending ? 'ASC' : 'DESC'}, d_year ${ascending ? 'ASC' : 'DESC'}
    LIMIT 1
  `;
  const result = await pool.query(query, [gedcomId, ...facts]);
  return result.rows[0]?.d_place ?? null;
}

export async function firstEventType(pool, gedcomId, facts, ascending) {
  if (!facts || facts.length === 0) {
    const query = `
      SELECT d_fact FROM wt_dates
      WHERE d_file = $1 AND d_julianday1 > 0
      ORDER BY d_julianday1 ${ascending ? 'ASC' : 'DESC'}, d_year ${ascending ? 'ASC' : 'DESC'}
      LIMIT 1
    `;
    const result = await pool.query(query, [gedcomId]);
    return result.rows[0]?.d_fact ?? null;
  }

  const placeholders = facts.map((_, i) => `$${i + 2}`).join(',');
  const query = `
    SELECT d_fact FROM wt_dates
    WHERE d_file = $1 AND d_fact IN (${placeholders}) AND d_julianday1 > 0
    ORDER BY d_julianday1 ${ascending ? 'ASC' : 'DESC'}, d_year ${ascending ? 'ASC' : 'DESC'}
    LIMIT 1
  `;
  const result = await pool.query(query, [gedcomId, ...facts]);
  return result.rows[0]?.d_fact ?? null;
}

/**
 * Mirrors StatisticsData::countPlaces() (app/StatisticsData.php:644) -
 * `wt_dates` has NO place column at all (confirmed against the live
 * schema - it only carries day/month/year/julianday/fact/gid/file/
 * type). Real PHP never queries dates for places either: it regex-scans
 * each matching record's raw GEDCOM text for `1 <EVENT>` followed by a
 * `2 PLAC <value>` sub-record (allowing other level-2+ sub-tags
 * between them, same as the real `(?:\n[2-9].*)*` pattern), tallies
 * occurrences, and returns the top N. Ported directly rather than via
 * a nonexistent SQL column.
 *
 * @param {string[]} gedcomRows
 * @param {string} event
 * @param {number} limit
 * @returns {Array<{place: string, count: number}>}
 */
function countPlacesFromGedcom(gedcomRows, event, limit) {
  const regex = new RegExp(`\\n1 ${event}(?:\\n[2-9].*)*\\n2 PLAC (.+)`);
  const places = new Map();

  for (const gedcom of gedcomRows) {
    const match = regex.exec(gedcom);

    if (match !== null) {
      places.set(match[1], (places.get(match[1]) ?? 0) + 1);
    }
  }

  return [...places.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([place, count]) => ({ place, count }));
}

export async function countPlacesForIndividuals(pool, gedcomId, fact, limit) {
  const result = await pool.query(`SELECT i_gedcom FROM wt_individuals WHERE i_file = $1 AND i_gedcom LIKE '%\n2 PLAC %'`, [gedcomId]);

  return countPlacesFromGedcom(result.rows.map((row) => row.i_gedcom), fact, limit);
}

export async function countPlacesForFamilies(pool, gedcomId, fact, limit) {
  const result = await pool.query(`SELECT f_gedcom FROM wt_families WHERE f_file = $1 AND f_gedcom LIKE '%\n2 PLAC %'`, [gedcomId]);

  return countPlacesFromGedcom(result.rows.map((row) => row.f_gedcom), fact, limit);
}

export async function commonGivenNames(pool, gedcomId, sex, threshold, limit) {
  let query = `
    SELECT n_givn as name, COUNT(DISTINCT n_id) as count
    FROM wt_name
  `;

  if (sex !== 'ALL') {
    query += `
      JOIN wt_individuals ON n_file = i_file AND n_id = i_id
    `;
  }

  query += `
    WHERE n_file = $1
    AND n_type != '_MARNM'
    AND n_givn != ''
    AND n_givn != '@P.N.'
    AND LENGTH(n_givn) > 1
  `;

  const params = [gedcomId];

  if (sex !== 'ALL') {
    query += ' AND i_sex = $2';
    params.push(sex);
  }

  query += `
    GROUP BY n_givn
    HAVING COUNT(DISTINCT n_id) >= $${params.length + 1}
    ORDER BY count DESC, n_givn
    LIMIT $${params.length + 2}
  `;

  params.push(threshold);
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows.map((row) => ({
    name: row.name,
    count: parseInt(row.count, 10),
  }));
}

export async function commonSurnames(pool, gedcomId, limit, threshold, sort) {
  const result = await pool.query(
    `SELECT n_surn as name, COUNT(n_surn) as count
     FROM wt_name
     WHERE n_file = $1 AND n_type != '_MARNM' AND n_surn != '' AND n_surn != '@N.N.'
     GROUP BY n_surn
     HAVING COUNT(n_surn) >= $2
     ORDER BY ${sort === 'alpha' ? 'name' : 'count DESC, name'}
     LIMIT $3`,
    [gedcomId, threshold, limit]
  );

  return result.rows.map((row) => ({
    name: row.name,
    count: parseInt(row.count, 10),
  }));
}

export async function countChildren(pool, gedcomId) {
  const result = await pool.query(
    'SELECT SUM(f_numchil) as total FROM wt_families WHERE f_file = $1',
    [gedcomId]
  );
  return parseInt(result.rows[0].total || 0, 10);
}

export async function countCountries(pool, gedcomId, limit) {
  const result = await pool.query(
    `SELECT p_place as place, COUNT(*) as count
     FROM wt_places
     JOIN wt_placelinks ON pl_file = p_file AND pl_p_id = p_id
     WHERE p_file = $1 AND p_parent_id = 0
     GROUP BY p_place
     ORDER BY count DESC, p_place
     LIMIT $2`,
    [gedcomId, limit]
  );

  return result.rows.map((row) => ({
    place: row.place,
    count: parseInt(row.count, 10),
  }));
}

export async function statsAge(pool, gedcomId) {
  const result = await pool.query(
    `SELECT
       ROUND((death.d_year + 49) / 100.0, 0)::int as century,
       i_sex as sex,
       AVG(death.d_julianday2 - birth.d_julianday1) as age
     FROM wt_individuals
     JOIN wt_dates birth ON i_file = birth.d_file AND i_id = birth.d_gid AND birth.d_fact = 'BIRT'
     JOIN wt_dates death ON i_file = death.d_file AND i_id = death.d_gid AND death.d_fact = 'DEAT'
     WHERE i_file = $1 AND birth.d_julianday1 > 0 AND death.d_julianday2 > 0
       AND death.d_type IN ('@#DGREGORIAN@', '@#DJULIAN@')
     GROUP BY century, sex
     ORDER BY century`,
    [gedcomId]
  );

  return result.rows.map((row) => ({
    century: parseInt(row.century, 10),
    sex: row.sex,
    age: Math.round(row.age / 365.25),
  }));
}

export async function topTenOldestQuery(pool, gedcomId, sex, limit) {
  let query = `
    SELECT i_id, i_gedcom,
           death.d_julianday2 - birth.d_julianday1 as days
    FROM wt_individuals
    JOIN wt_dates birth ON i_file = birth.d_file AND i_id = birth.d_gid AND birth.d_fact = 'BIRT'
    JOIN wt_dates death ON i_file = death.d_file AND i_id = death.d_gid AND death.d_fact = 'DEAT'
    WHERE i_file = $1
  `;

  const params = [gedcomId];

  if (sex !== 'ALL') {
    query += ' AND i_sex = $2';
    params.push(sex);
  }

  query += `
    AND birth.d_julianday1 > 0 AND death.d_julianday2 > 0
    ORDER BY days DESC
    LIMIT $${params.length + 1}
  `;

  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows.map((row) => ({
    xref: row.i_id,
    gedcom: row.i_gedcom,
    days: parseInt(row.days, 10),
  }));
}

/**
 * Mirrors StatisticsData::parentsQuery() (app/StatisticsData.php:1643) -
 * finds the oldest/youngest a parent was at ANY child's birth. Rewritten
 * directly against the real PHP (the first delegated attempt assumed
 * `wt_link.l_from`/`l_to` meant "individual"/"family" uniformly, but
 * `wt_link` stores BOTH directions - for a family's own HUSB/WIFE/CHIL
 * pointer lines, `l_from` is the FAMILY and `l_to` is the INDIVIDUAL,
 * the opposite of an individual's own FAMS/FAMC lines - and caused an
 * ambiguous-column error plus a join that could never match any row).
 *
 * @param {'M'|'F'} sex
 * @param {'ASC'|'DESC'} order
 * @returns {Promise<{xref: string, gedcom: string, age: number}|null>}
 */
export async function parentsQuery(pool, gedcomId, sex, order) {
  const sexField = sex === 'F' ? 'WIFE' : 'HUSB';
  const direction = order === 'ASC' ? 'ASC' : 'DESC';

  const result = await pool.query(
    `SELECT parentfamily.l_to AS xref, i.i_gedcom AS gedcom,
            (childbirth.d_julianday2 - birth.d_julianday1) AS age
       FROM wt_link parentfamily
       JOIN wt_link childfamily
         ON childfamily.l_file = parentfamily.l_file
        AND childfamily.l_from = parentfamily.l_from
        AND childfamily.l_type = 'CHIL'
       JOIN wt_dates birth
         ON birth.d_file = parentfamily.l_file
        AND birth.d_gid = parentfamily.l_to
        AND birth.d_fact = 'BIRT'
        AND birth.d_julianday1 <> 0
       JOIN wt_dates childbirth
         ON childbirth.d_file = parentfamily.l_file
        AND childbirth.d_gid = childfamily.l_to
        AND childbirth.d_fact = 'BIRT'
       JOIN wt_individuals i
         ON i.i_file = parentfamily.l_file
        AND i.i_id = parentfamily.l_to
      WHERE childfamily.l_file = $1
        AND parentfamily.l_type = $2
        AND childbirth.d_julianday2 > birth.d_julianday1
      ORDER BY age ${direction}
      LIMIT 1`,
    [gedcomId, sexField],
  );

  const row = result.rows[0];
  return row ? { xref: row.xref, gedcom: row.gedcom, age: parseInt(row.age, 10) } : null;
}

/**
 * Mirrors StatisticsData::marriageQuery() (app/StatisticsData.php:2014) -
 * the oldest/youngest a husband/wife was AT their own marriage. Unlike
 * parentsQuery(), this one's join shape was already correct in the
 * first delegated attempt; rewritten here only to also select the
 * family's own xref/gedcom (real PHP's 'full' case shows the FAMILY,
 * not the individual - see oldestMarriageMale() et al. in
 * Statistics.php, all of which call this with show='full').
 *
 * @param {'M'|'F'} sex
 * @param {'ASC'|'DESC'} order
 * @returns {Promise<{familyXref: string, familyGedcom: string, age: number}|null>}
 */
export async function marriageQuery(pool, gedcomId, sex, order) {
  const sexField = sex === 'F' ? 'f_wife' : 'f_husb';
  const direction = order === 'ASC' ? 'ASC' : 'DESC';

  const result = await pool.query(
    `SELECT f.f_id AS family_xref, f.f_gedcom AS family_gedcom,
            (married.d_julianday2 - birth.d_julianday1) AS age
       FROM wt_families f
       JOIN wt_dates married ON married.d_file = f.f_file AND married.d_gid = f.f_id AND married.d_fact = 'MARR'
       JOIN wt_individuals i ON i.i_file = f.f_file AND i.i_id = f.${sexField} AND i.i_sex = $2
       JOIN wt_dates birth ON birth.d_file = i.i_file AND birth.d_gid = i.i_id AND birth.d_fact = 'BIRT' AND birth.d_julianday1 <> 0
      WHERE f.f_file = $1
        AND married.d_julianday2 > birth.d_julianday1
      ORDER BY age ${direction}
      LIMIT 1`,
    [gedcomId, sex],
  );

  const row = result.rows[0];
  return row ? { familyXref: row.family_xref, familyGedcom: row.family_gedcom, age: parseInt(row.age, 10) } : null;
}

/**
 * Mirrors StatisticsData::ageOfMarriageQuery() (app/StatisticsData.php:1724) -
 * NOT "age at marriage" despite the name (that's parentsQuery/
 * marriageQuery's job) - this computes LENGTH OF MARRIAGE: days from
 * the wedding until whichever came first of husband's death, wife's
 * death, or divorce. (The first delegated attempt computed age-at-
 * marriage for a single matched spouse instead - wrong metric
 * entirely; the real tags here are minAgeOfMarriageFamily/
 * topAgeOfMarriageFamily, shown as "Shortest marriage"/"Longest
 * marriage" in modules/statistics-chart/marriage-length.phtml.)
 *
 * Real PHP merges three per-family MIN(gap) queries (husband-death,
 * wife-death, divorce) in PHP, preferring the divorce gap when present
 * and otherwise the smaller of the two death gaps - ported as three
 * SQL aggregates + the same JS merge.
 *
 * @param {'ASC'|'DESC'} order
 * @returns {Promise<Array<{xref: string, gedcom: string, age: number}>>}
 */
export async function ageOfMarriageQuery(pool, gedcomId, order, limit) {
  const direction = order === 'DESC' ? 'DESC' : 'ASC';

  const [husbandRows, wifeRows, divorceRows] = await Promise.all([
    pool.query(
      `SELECT f.f_id AS xref, MIN(husbdeath.d_julianday2 - married.d_julianday1) AS age
         FROM wt_families f
         JOIN wt_dates married ON married.d_file = f.f_file AND married.d_gid = f.f_id AND married.d_fact = 'MARR' AND married.d_julianday1 <> 0
         JOIN wt_dates husbdeath ON husbdeath.d_gid = f.f_husb AND husbdeath.d_file = f.f_file AND husbdeath.d_fact = 'DEAT'
        WHERE f.f_file = $1 AND married.d_julianday1 < husbdeath.d_julianday2
        GROUP BY f.f_id`,
      [gedcomId],
    ),
    pool.query(
      `SELECT f.f_id AS xref, MIN(wifedeath.d_julianday2 - married.d_julianday1) AS age
         FROM wt_families f
         JOIN wt_dates married ON married.d_file = f.f_file AND married.d_gid = f.f_id AND married.d_fact = 'MARR' AND married.d_julianday1 <> 0
         JOIN wt_dates wifedeath ON wifedeath.d_gid = f.f_wife AND wifedeath.d_file = f.f_file AND wifedeath.d_fact = 'DEAT'
        WHERE f.f_file = $1 AND married.d_julianday1 < wifedeath.d_julianday2
        GROUP BY f.f_id`,
      [gedcomId],
    ),
    pool.query(
      `SELECT f.f_id AS xref, MIN(divorced.d_julianday2 - married.d_julianday1) AS age
         FROM wt_families f
         JOIN wt_dates married ON married.d_file = f.f_file AND married.d_gid = f.f_id AND married.d_fact = 'MARR' AND married.d_julianday1 <> 0
         JOIN wt_dates divorced ON divorced.d_gid = f.f_id AND divorced.d_file = f.f_file AND divorced.d_fact IN ('DIV', 'ANUL', '_SEPR')
        WHERE f.f_file = $1 AND married.d_julianday1 < divorced.d_julianday2
        GROUP BY f.f_id`,
      [gedcomId],
    ),
  ]);

  const ages = new Map();

  for (const row of divorceRows.rows) {
    ages.set(row.xref, parseInt(row.age, 10));
  }
  for (const row of husbandRows.rows) {
    if (!ages.has(row.xref)) {
      ages.set(row.xref, parseInt(row.age, 10));
    }
  }
  for (const row of wifeRows.rows) {
    const age = parseInt(row.age, 10);
    if (!ages.has(row.xref) || ages.get(row.xref) > age) {
      ages.set(row.xref, age);
    }
  }

  const sorted = [...ages.entries()].sort((a, b) => (direction === 'DESC' ? b[1] - a[1] : a[1] - b[1])).slice(0, limit);

  if (sorted.length === 0) {
    return [];
  }

  const xrefs = sorted.map(([xref]) => xref);
  const familyResult = await pool.query('SELECT f_id, f_gedcom FROM wt_families WHERE f_file = $1 AND f_id = ANY($2)', [gedcomId, xrefs]);
  const gedcomByXref = new Map(familyResult.rows.map((row) => [row.f_id, row.f_gedcom]));

  return sorted.map(([xref, age]) => ({ xref, gedcom: gedcomByXref.get(xref) ?? '', age }));
}

export async function topTenLargestFamilyList(pool, gedcomId, limit) {
  const result = await pool.query(
    `SELECT f_id, f_gedcom, f_numchil FROM wt_families
     WHERE f_file = $1
     ORDER BY f_numchil DESC
     LIMIT $2`,
    [gedcomId, limit]
  );

  return result.rows.map((row) => ({
    xref: row.f_id,
    gedcom: row.f_gedcom,
    children: parseInt(row.f_numchil, 10),
  }));
}

export async function topAgeBetweenSiblingsList(pool, gedcomId, limit, one) {
  const query = `
    SELECT
      family.f_id,
      family.f_gedcom,
      child1.i_id as child1_id,
      child1.i_gedcom as child1_gedcom,
      child2.i_id as child2_id,
      child2.i_gedcom as child2_gedcom,
      ABS(birth2.d_julianday1 - birth1.d_julianday1) as age_diff
    FROM wt_families family
    JOIN wt_link link1 ON family.f_file = link1.l_file AND family.f_id = link1.l_from AND link1.l_type = 'CHIL'
    JOIN wt_individuals child1 ON link1.l_file = child1.i_file AND link1.l_to = child1.i_id
    JOIN wt_dates birth1 ON child1.i_file = birth1.d_file AND child1.i_id = birth1.d_gid AND birth1.d_fact = 'BIRT'
    JOIN wt_link link2 ON family.f_file = link2.l_file AND family.f_id = link2.l_from AND link2.l_type = 'CHIL'
    JOIN wt_individuals child2 ON link2.l_file = child2.i_file AND link2.l_to = child2.i_id
    JOIN wt_dates birth2 ON child2.i_file = birth2.d_file AND child2.i_id = birth2.d_gid AND birth2.d_fact = 'BIRT'
    WHERE family.f_file = $1
      AND birth1.d_julianday1 > 0
      AND birth2.d_julianday1 > 0
      AND child1.i_id != child2.i_id
      AND birth1.d_julianday1 < birth2.d_julianday1
    ORDER BY age_diff DESC
    LIMIT $2
  `;

  const result = await pool.query(query, [gedcomId, limit]);
  return result.rows.map((row) => ({
    family: { xref: row.f_id, gedcom: row.f_gedcom },
    child1: { xref: row.child1_id, gedcom: row.child1_gedcom },
    child2: { xref: row.child2_id, gedcom: row.child2_gedcom },
    ageDiff: parseInt(row.age_diff, 10),
  }));
}

export async function topTenLargestGrandFamilyList(pool, gedcomId, limit) {
  const result = await pool.query(
    `SELECT f_id, f_gedcom,
            (SELECT SUM(f_numchil) FROM wt_families f2
             WHERE f2.f_file = f.f_file AND (f2.f_husb IN
               (SELECT l_to FROM wt_link WHERE l_from = f.f_id AND l_type = 'CHIL')
             OR f2.f_wife IN
               (SELECT l_to FROM wt_link WHERE l_from = f.f_id AND l_type = 'CHIL')
             )) as grandchildren
     FROM wt_families f
     WHERE f.f_file = $1
     ORDER BY grandchildren DESC
     LIMIT $2`,
    [gedcomId, limit]
  );

  return result.rows.map((row) => ({
    xref: row.f_id,
    gedcom: row.f_gedcom,
    grandchildren: parseInt(row.grandchildren || 0, 10),
  }));
}

export async function topTenOldestAliveQuery(pool, gedcomId, sex, limit) {
  let query = `
    SELECT i_id, i_gedcom, birth.d_julianday1
    FROM wt_individuals
    JOIN wt_dates birth ON i_file = birth.d_file AND i_id = birth.d_gid AND birth.d_fact = 'BIRT'
    WHERE i_file = $1 AND birth.d_julianday1 > 0
      AND i_gedcom NOT LIKE '%\n1 DEAT%'
      AND i_gedcom NOT LIKE '%\n1 BURI%'
      AND i_gedcom NOT LIKE '%\n1 CREM%'
  `;

  const params = [gedcomId];
  let paramIndex = 2;

  if (sex === 'F' || sex === 'M' || sex === 'U' || sex === 'X') {
    query += ` AND i_sex = $${paramIndex}`;
    params.push(sex);
    paramIndex++;
  }

  query += `
    GROUP BY i_id, i_file, birth.d_julianday1
    ORDER BY birth.d_julianday1 ASC
    LIMIT $${paramIndex}
  `;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows.map((row) => ({
    xref: row.i_id,
    gedcom: row.i_gedcom,
    birthJulianDay: parseInt(row.d_julianday1, 10),
  }));
}

export async function ageBetweenSpousesQuery(pool, gedcomId, ageDir, limit) {
  const query = `
    SELECT f_id, f_gedcom, f_husb, f_wife,
           wife.d_julianday1 as wife_birt_jd,
           husb.d_julianday1 as husb_birt_jd
    FROM wt_families
    JOIN wt_dates wife ON wife.d_gid = f_wife AND wife.d_file = f_file
      AND wife.d_fact = 'BIRT' AND wife.d_julianday1 > 0
    JOIN wt_dates husb ON husb.d_gid = f_husb AND husb.d_file = f_file
      AND husb.d_fact = 'BIRT' AND husb.d_julianday1 > 0
    WHERE f_file = $1
  `;

  const params = [gedcomId];

  if (ageDir === 'desc') {
    // Wife older than husband
    const fullQuery = query + `
      AND wife.d_julianday1 >= husb.d_julianday1
      GROUP BY f_id, f_file, f_husb, f_wife, wife.d_julianday1, husb.d_julianday1
      ORDER BY (wife.d_julianday1 - husb.d_julianday1) DESC
      LIMIT $2
    `;
    params.push(limit);
    const result = await pool.query(fullQuery, params);
    return result.rows.map((row) => ({
      familyXref: row.f_id,
      familyGedcom: row.f_gedcom,
      husbandXref: row.f_husb,
      wifeXref: row.f_wife,
      husbandBirtJd: parseInt(row.husb_birt_jd, 10),
      wifeBirtJd: parseInt(row.wife_birt_jd, 10),
    }));
  } else {
    // Husband older than wife
    const fullQuery = query + `
      AND husb.d_julianday1 >= wife.d_julianday1
      GROUP BY f_id, f_file, f_husb, f_wife, wife.d_julianday1, husb.d_julianday1
      ORDER BY (husb.d_julianday1 - wife.d_julianday1) DESC
      LIMIT $2
    `;
    params.push(limit);
    const result = await pool.query(fullQuery, params);
    return result.rows.map((row) => ({
      familyXref: row.f_id,
      familyGedcom: row.f_gedcom,
      husbandXref: row.f_husb,
      wifeXref: row.f_wife,
      husbandBirtJd: parseInt(row.husb_birt_jd, 10),
      wifeBirtJd: parseInt(row.wife_birt_jd, 10),
    }));
  }
}

export async function statsMarrAgeByCentury(pool, gedcomId) {
  const maleQuery = `
    SELECT
      ROUND((married.d_year + 49) / 100.0, 0)::int as century,
      'M' as sex,
      AVG((married.d_julianday2 - birth.d_julianday1 - 182.5) / 365.25) as age
    FROM wt_dates married
    JOIN wt_families fam ON fam.f_id = married.d_gid AND fam.f_file = married.d_file
    JOIN wt_dates birth ON birth.d_gid = fam.f_husb AND birth.d_file = fam.f_file
      AND birth.d_fact = 'BIRT' AND birth.d_julianday1 > 0
    WHERE married.d_file = $1 AND married.d_fact = 'MARR'
      AND married.d_type IN ('@#DGREGORIAN@', '@#DJULIAN@')
      AND birth.d_type IN ('@#DGREGORIAN@', '@#DJULIAN@')
      AND married.d_julianday1 > birth.d_julianday1
    GROUP BY century, sex
  `;

  const femaleQuery = `
    SELECT
      ROUND((married.d_year + 49) / 100.0, 0)::int as century,
      'F' as sex,
      AVG((married.d_julianday2 - birth.d_julianday1 - 182.5) / 365.25) as age
    FROM wt_dates married
    JOIN wt_families fam ON fam.f_id = married.d_gid AND fam.f_file = married.d_file
    JOIN wt_dates birth ON birth.d_gid = fam.f_wife AND birth.d_file = fam.f_file
      AND birth.d_fact = 'BIRT' AND birth.d_julianday1 > 0
    WHERE married.d_file = $1 AND married.d_fact = 'MARR'
      AND married.d_type IN ('@#DGREGORIAN@', '@#DJULIAN@')
      AND birth.d_type IN ('@#DGREGORIAN@', '@#DJULIAN@')
      AND married.d_julianday1 > birth.d_julianday1
    GROUP BY century, sex
  `;

  const result = await pool.query(
    `${maleQuery} UNION ALL ${femaleQuery} ORDER BY century, sex`,
    [gedcomId]
  );

  return result.rows.map((row) => ({
    century: parseInt(row.century, 10),
    sex: row.sex,
    age: parseFloat(row.age),
  }));
}

export async function statsChildrenByCentury(pool, gedcomId) {
  const result = await pool.query(
    `SELECT
       ROUND((d_year + 49) / 100.0, 0)::int as century,
       AVG(f_numchil) as total
     FROM wt_families
     JOIN wt_dates ON d_file = f_file AND d_gid = f_id
     WHERE f_file = $1 AND d_julianday1 > 0 AND d_fact = 'MARR'
       AND d_type IN ('@#DGREGORIAN@', '@#DJULIAN@')
     GROUP BY century
     ORDER BY century`,
    [gedcomId]
  );

  return result.rows.map((row) => ({
    century: parseInt(row.century, 10),
    total: parseFloat(row.total),
  }));
}

/**
 * Mirrors StatisticsData::countIndividualsByCountry() (app/StatisticsData.php:1220) -
 * the first delegated attempt put its WHERE clause BEFORE its JOINs
 * (a SQL syntax error - WHERE must follow every JOIN) and never used
 * the ISO-3166 numeric codes GeoChartData/the client-side geo chart
 * renderer actually need as feature ids (`geoFeatureForNumericId()` in
 * resources/js/statistics.js) - it returned raw place-name strings as
 * `place` instead. Rewritten directly against the real PHP, keyed by
 * ISO numeric code via lib/iso3166.js's COUNTRY_NUMERIC_CODES (built
 * by the same delegated-and-independently-spot-checked transcription
 * pattern used for the relationship-naming service in an earlier step).
 *
 * @returns {Promise<Array<{numericCode: number, count: number}>>}
 */
export async function countIndividualsByCountry(pool, gedcomId) {
  const result = await pool.query(
    `SELECT p_place, COUNT(*) as count
       FROM wt_places
       JOIN wt_placelinks ON pl_file = p_file AND pl_p_id = p_id
       JOIN wt_individuals ON pl_file = i_file AND pl_gid = i_id
      WHERE p_file = $1 AND p_parent_id = 0
      GROUP BY p_place`,
    [gedcomId],
  );

  return aggregateByCountryCode(result.rows.map((row) => [row.p_place, parseInt(row.count, 10)]));
}

/** Mirrors StatisticsData::countSurnamesByCountry() (app/StatisticsData.php:1258). */
export async function countSurnamesByCountry(pool, gedcomId, surname) {
  const result = await pool.query(
    `SELECT p_place, COUNT(*) as count
       FROM wt_places
       JOIN wt_placelinks ON pl_file = p_file AND pl_p_id = p_id
       JOIN wt_name ON n_file = pl_file AND n_id = pl_gid
      WHERE p_file = $1 AND p_parent_id = 0 AND n_surn = $2
      GROUP BY p_place`,
    [gedcomId, surname],
  );

  return aggregateByCountryCode(result.rows.map((row) => [row.p_place, parseInt(row.count, 10)]));
}

/**
 * Shared by countIndividualsByCountry()/countSurnamesByCountry() -
 * folds raw `[placeName, count]` pairs into the ISO numeric code they
 * resolve to (via lib/iso3166.js, built from the same two PHP
 * country-name/numeric-code tables StatisticsData::getCountryToNumericMap()
 * reads), summing counts for places that map to the same country.
 *
 * @param {Array<[string, number]>} placeCounts
 * @returns {Array<{numericCode: number, count: number}>}
 */
function aggregateByCountryCode(placeCounts) {
  const totals = new Map();

  for (const [place, count] of placeCounts) {
    const numericCode = COUNTRY_NUMERIC_CODES[place] ?? countryNumericCodeByName.get(place);

    if (numericCode !== undefined) {
      totals.set(numericCode, (totals.get(numericCode) ?? 0) + count);
    }
  }

  return [...totals.entries()].map(([numericCode, count]) => ({ numericCode, count }));
}

/**
 * Mirrors StatisticsData::filterEventPlaces() (app/StatisticsData.php:1343) -
 * for each place-linked individual/family record, re-confirms (by
 * regex over the raw GEDCOM) that the place actually belongs to THIS
 * specific fact's own PLAC sub-record, not merely that the record is
 * linked to that place through some other fact - `wt_placelinks` has
 * no fact-type column of its own, so this check is the only way to
 * attribute a place to one specific event type. (The first delegated
 * attempt ignored the `fact` parameter entirely and never filtered at
 * all - every place linked to any individual/family counted toward
 * every event type.)
 *
 * @param {Array<{place: string, gedcom: string}>} rows
 * @param {string} fact
 * @returns {Array<{numericCode: number, count: number}>}
 */
function filterEventPlaces(rows, fact) {
  const totals = new Map();

  for (const { place, gedcom } of rows) {
    const numericCode = COUNTRY_NUMERIC_CODES[place] ?? countryNumericCodeByName.get(place);

    if (numericCode === undefined) {
      continue;
    }

    const escapedPlace = place.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\n1 ${fact}(?:\\n[2-9].*)*\\n2 PLAC.*[, ]${escapedPlace}(?:\\n|$)`, 'i');

    if (regex.test(gedcom)) {
      totals.set(numericCode, (totals.get(numericCode) ?? 0) + 1);
    }
  }

  return [...totals.entries()].map(([numericCode, count]) => ({ numericCode, count }));
}

/** Mirrors StatisticsData::countFamilyEventsByCountry() (app/StatisticsData.php:1297). */
export async function countFamilyEventsByCountry(pool, gedcomId, fact) {
  const result = await pool.query(
    `SELECT p_place, f_gedcom
       FROM wt_places
       JOIN wt_placelinks ON pl_file = p_file AND pl_p_id = p_id
       JOIN wt_families ON pl_file = f_file AND pl_gid = f_id
      WHERE p_file = $1 AND p_parent_id = 0`,
    [gedcomId],
  );

  return filterEventPlaces(result.rows.map((row) => ({ place: row.p_place, gedcom: row.f_gedcom })), fact);
}

/** Mirrors StatisticsData::countIndividualEventsByCountry() (app/StatisticsData.php:1320). */
export async function countIndividualEventsByCountry(pool, gedcomId, fact) {
  const result = await pool.query(
    `SELECT p_place, i_gedcom
       FROM wt_places
       JOIN wt_placelinks ON pl_file = p_file AND pl_p_id = p_id
       JOIN wt_individuals ON pl_file = i_file AND pl_gid = i_id
      WHERE p_file = $1 AND p_parent_id = 0`,
    [gedcomId],
  );

  return filterEventPlaces(result.rows.map((row) => ({ place: row.p_place, gedcom: row.i_gedcom })), fact);
}
