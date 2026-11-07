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

// Generic port of DatatablesService::handleQuery()
// (app/Services/DatatablesService.php:118-181) - the real server-side
// DataTables protocol (https://www.datatables.net/usage/server-side):
// the client POSTs draw/start/length/search[value]/order[N][column]/
// order[N][dir], the server replies {draw, recordsTotal,
// recordsFiltered, data}. First use: UserListData (phase 5 step 40) -
// written generically since every future admin list this migration
// ports (and there are several - pending changes log, site logs, ...)
// uses the exact same real PHP service, not a one-off.
//
// Unlike real PHP's Eloquent query builder, there's no query-builder
// object to clone/re-filter here - instead every stage (count, search,
// sort, paginate) runs against one shared `SELECT * FROM (${baseSql})
// AS base_query` wrapper, so ORDER BY/WHERE can reference the base
// query's own OUTPUT column names (aliases) directly, exactly like
// Eloquent's $query->orderBy($sort_columns[...]) does.

/**
 * Parses the bracketed-array form fields DataTables' own default
 * jQuery.ajax POST body uses (`order[0][column]=2&order[0][dir]=asc`,
 * `search[value]=foo`) - URLSearchParams has no native nesting, so
 * this reads them back out by name pattern.
 *
 * @param {URLSearchParams} formData
 * @returns {{draw: number, start: number, length: number, searchValue: string, order: Array<{column: number, dir: 'asc'|'desc'}>}}
 */
export function parseDatatablesRequest(formData) {
  const draw = parseInt(formData.get('draw') ?? '0', 10) || 0;
  const start = parseInt(formData.get('start') ?? '0', 10) || 0;
  const length = parseInt(formData.get('length') ?? '0', 10) || 0;
  const searchValue = formData.get('search[value]') ?? '';

  const order = [];
  for (let i = 0; formData.has(`order[${i}][column]`); i++) {
    const column = parseInt(formData.get(`order[${i}][column]`), 10);
    const dir = formData.get(`order[${i}][dir]`) === 'desc' ? 'desc' : 'asc';
    order.push({ column, dir });
  }

  return { draw, start, length, searchValue, order };
}

/**
 * Mirrors DatatablesService's own LIKE-pattern construction exactly
 * (app/Services/DatatablesService.php:130-132): backslash-escape the
 * SQL LIKE metacharacters, then turn every space into a wildcard, so
 * "jo smith" matches "John Smithson" - not just a literal substring.
 *
 * @param {string} search
 * @returns {string}
 */
function likePattern(search) {
  const escaped = search.replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${escaped.replaceAll(' ', '%')}%`;
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} baseSql a SELECT with named output columns, no ORDER BY/LIMIT
 * @param {Array} baseParams
 * @param {string[]} searchColumns output column names to search (ILIKE OR'd together)
 * @param {Record<number, string>} sortColumns DataTables column index -> output column name
 * @param {URLSearchParams} formData the POST body
 * @param {(row: object) => Array} rowMapper converts one DB row into a DataTables row (array of cell values)
 * @returns {Promise<{draw: number, recordsTotal: number, recordsFiltered: number, data: Array}>}
 */
export async function handleDatatablesQuery(pool, baseSql, baseParams, searchColumns, sortColumns, formData, rowMapper) {
  const { draw, start, length, searchValue, order } = parseDatatablesRequest(formData);

  const base = `SELECT * FROM (${baseSql}) AS base_query`;

  const totalResult = await pool.query(`SELECT COUNT(*) AS count FROM (${baseSql}) AS base_query`, baseParams);
  const recordsTotal = parseInt(totalResult.rows[0].count, 10);

  let filteredSql = base;
  let filteredParams = [...baseParams];

  if (searchValue !== '') {
    const pattern = likePattern(searchValue);
    const conditions = searchColumns.map((column, i) => `${column} ILIKE $${baseParams.length + i + 1}`);
    filteredSql = `${base} WHERE (${conditions.join(' OR ')})`;
    filteredParams = [...baseParams, ...searchColumns.map(() => pattern)];
  }

  const filteredCountResult = await pool.query(`SELECT COUNT(*) AS count FROM (${filteredSql}) AS filtered_query`, filteredParams);
  const recordsFiltered = parseInt(filteredCountResult.rows[0].count, 10);

  let orderClause;
  if (order.length > 0) {
    orderClause = order.map(({ column, dir }) => `${sortColumns[column] ?? String(column + 1)} ${dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ');
  } else {
    orderClause = '1';
  }

  let dataSql = `${filteredSql} ORDER BY ${orderClause}`;
  const dataParams = [...filteredParams];

  if (length > 0) {
    dataSql += ` LIMIT $${dataParams.length + 1} OFFSET $${dataParams.length + 2}`;
    dataParams.push(length, start);
  }

  const dataResult = await pool.query(dataSql, dataParams);
  const data = dataResult.rows.map(rowMapper);

  return { draw, recordsTotal, recordsFiltered, data };
}
