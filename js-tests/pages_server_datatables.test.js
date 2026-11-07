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

import { describe, expect, test, vi } from 'vitest';
import { parseDatatablesRequest, handleDatatablesQuery } from '../pages-server/datatables.mjs';

describe('parseDatatablesRequest', () => {
  test('parses draw/start/length/search/order', () => {
    const formData = new URLSearchParams({
      draw: '3',
      start: '20',
      length: '10',
      'search[value]': 'foo',
      'order[0][column]': '2',
      'order[0][dir]': 'desc',
      'order[1][column]': '0',
      'order[1][dir]': 'asc',
    });

    expect(parseDatatablesRequest(formData)).toEqual({
      draw: 3,
      start: 20,
      length: 10,
      searchValue: 'foo',
      order: [
        { column: 2, dir: 'desc' },
        { column: 0, dir: 'asc' },
      ],
    });
  });

  test('defaults to zero/empty when absent', () => {
    expect(parseDatatablesRequest(new URLSearchParams())).toEqual({ draw: 0, start: 0, length: 0, searchValue: '', order: [] });
  });
});

describe('handleDatatablesQuery', () => {
  const ALL_ROWS = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Carol Ann' },
  ];

  function fakePool() {
    return {
      query: vi.fn(async (sql, params) => {
        if (sql.startsWith('SELECT COUNT(*)')) {
          // Crude but adequate fake: filter the in-memory rows by
          // simulating the same ILIKE predicate the real query would run.
          if (sql.includes('WHERE')) {
            const pattern = params.at(-1).replaceAll('%', '').toLowerCase();
            const filtered = ALL_ROWS.filter((r) => r.name.toLowerCase().includes(pattern));
            return { rows: [{ count: String(filtered.length) }] };
          }
          return { rows: [{ count: String(ALL_ROWS.length) }] };
        }

        // The final data-fetch query - apply search/order/limit "by hand"
        // against the in-memory fixture, matching what the real SQL
        // (base query + WHERE + ORDER BY + LIMIT/OFFSET) would return.
        let rows = [...ALL_ROWS];

        if (sql.includes('WHERE')) {
          const pattern = params[0].replaceAll('%', '').toLowerCase();
          rows = rows.filter((r) => r.name.toLowerCase().includes(pattern));
        }

        if (sql.includes('ORDER BY name DESC')) {
          rows.sort((a, b) => b.name.localeCompare(a.name));
        } else if (sql.includes('ORDER BY 1')) {
          rows.sort((a, b) => a.id - b.id);
        }

        const limitMatch = /LIMIT \$\d+ OFFSET \$\d+/.exec(sql);
        if (limitMatch) {
          const length = params.at(-2);
          const start = params.at(-1);
          rows = rows.slice(start, start + length);
        }

        return { rows };
      }),
    };
  }

  const BASE_SQL = 'SELECT id, name FROM fake_table';

  test('returns every row, unfiltered, when no search/order/pagination is requested', async () => {
    const pool = fakePool();
    const formData = new URLSearchParams({ draw: '1' });

    const result = await handleDatatablesQuery(pool, BASE_SQL, [], ['name'], {}, formData, (row) => [row.id, row.name]);

    expect(result.draw).toBe(1);
    expect(result.recordsTotal).toBe(3);
    expect(result.recordsFiltered).toBe(3);
    expect(result.data).toEqual([
      [1, 'Alice'],
      [2, 'Bob'],
      [3, 'Carol Ann'],
    ]);
  });

  test('filters by the search value across the given columns', async () => {
    const pool = fakePool();
    const formData = new URLSearchParams({ draw: '1', 'search[value]': 'carol' });

    const result = await handleDatatablesQuery(pool, BASE_SQL, [], ['name'], {}, formData, (row) => [row.id, row.name]);

    expect(result.recordsTotal).toBe(3);
    expect(result.recordsFiltered).toBe(1);
    expect(result.data).toEqual([[3, 'Carol Ann']]);
  });

  test('sorts by the mapped column name and direction', async () => {
    const pool = fakePool();
    const formData = new URLSearchParams({ draw: '1', 'order[0][column]': '1', 'order[0][dir]': 'desc' });

    const result = await handleDatatablesQuery(pool, BASE_SQL, [], ['name'], { 1: 'name' }, formData, (row) => row.name);

    expect(result.data).toEqual(['Carol Ann', 'Bob', 'Alice']);
  });

  test('paginates with start/length', async () => {
    const pool = fakePool();
    const formData = new URLSearchParams({ draw: '1', start: '1', length: '1' });

    const result = await handleDatatablesQuery(pool, BASE_SQL, [], ['name'], {}, formData, (row) => row.name);

    expect(result.data).toEqual(['Bob']);
  });
});
