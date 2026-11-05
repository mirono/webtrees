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

// Data/logic layer for /tree/{tree}/relationships-{ancestors}-{recursion}/{xref}{/xref2}
// (RelationshipsChartModule, phase 5 step 36) - the NINTH chart
// route, and the first that's a real graph search (Dijkstra shortest
// path over the tree's own FAMC/FAMS link graph) rather than a
// traversal from one root. Mirrors
// RelationshipsChartModule::calculateRelationships() and its three
// private helpers EXACTLY - see each function's own doc comment below
// for the real PHP it replicates.
//
// Unlike every other chart, the graph search itself runs on RAW
// structural data (wt_link rows, and a family's bare HUSB/WIFE/CHIL
// role lines) with NO privacy filtering at all - matching real PHP
// exactly (Dijkstra and oldStyleRelationshipPath() both load records
// directly, with no canShow() gate). Privacy still applies normally
// at the DISPLAY layer: every individual box goes through
// buildChartBoxViewModel() same as every other chart, showing
// "Private" for a hidden individual - the graph search only ever
// touches xrefs and HUSB/WIFE/CHIL role tags, never a name or date.

import { loadFamily } from './family.mjs';

/**
 * Mirrors the first part of `calculateRelationships()`
 * (app/Module/RelationshipsChartModule.php:328-336): every FAMC/FAMS
 * row in the tree, as an undirected individual<->family adjacency
 * list (`l_from` is always an individual, `l_to` always a family, for
 * both link types - the whole graph is just "which individuals belong
 * to which families").
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<Array<{from: string, to: string}>>}
 */
export async function loadLinkGraphRows(pool, gedcomId) {
  const result = await pool.query("SELECT l_from, l_to, l_type FROM wt_link WHERE l_file = $1 AND l_type IN ('FAMS', 'FAMC')", [
    gedcomId,
  ]);

  return result.rows.map((row) => ({ from: row.l_from, to: row.l_to, type: row.l_type }));
}

/**
 * Mirrors `calculateRelationships()`'s own graph-building loop
 * (app/Module/RelationshipsChartModule.php:338-345): build the
 * adjacency map from the raw link rows, optionally restricted to
 * edges FROM an ancestor-or-starting individual and NOT TO an
 * excluded family (the "ancestors only" search mode) - see
 * `collectAncestors()`/`collectExcludedFamilies()` below for how
 * those two sets are built.
 *
 * @param {Array<{from: string, to: string}>} rows
 * @param {Set<string>|null} allowedFromXrefs null = no restriction
 * @param {Set<string>|null} excludedToXrefs null = no restriction
 * @returns {Map<string, Set<string>>}
 */
export function buildLinkGraph(rows, allowedFromXrefs = null, excludedToXrefs = null) {
  const graph = new Map();

  const addEdge = (a, b) => {
    if (!graph.has(a)) {
      graph.set(a, new Set());
    }

    graph.get(a).add(b);
  };

  for (const { from, to } of rows) {
    if (allowedFromXrefs !== null && !allowedFromXrefs.has(from)) {
      continue;
    }

    if (excludedToXrefs !== null && excludedToXrefs.has(to)) {
      continue;
    }

    addEdge(from, to);
    addEdge(to, from);
  }

  return graph;
}

/**
 * Mirrors `allAncestors()` (app/Module/RelationshipsChartModule.php:390-417):
 * both starting individuals, plus every one of their own ancestors
 * (walking FAMC -> that family's own FAMS spouses, repeatedly) -
 * despite the name, this returns INDIVIDUAL xrefs throughout (the
 * "ancestors" restriction filters the graph's `l_from` side, which is
 * always an individual). Takes TYPED rows (`type: 'FAMS'|'FAMC'`)
 * rather than the untyped `{from, to}` pairs `buildLinkGraph()` uses,
 * since this needs to tell the two link types apart.
 *
 * @param {Array<{from: string, to: string, type: 'FAMS'|'FAMC'}>} typedRows
 * @param {string} xref1
 * @param {string} xref2
 * @returns {Set<string>}
 */
export function collectAncestors(typedRows, xref1, xref2) {
  const famcFamilyOf = new Map(); // individual -> [their own parent family xrefs]
  const spousesOf = new Map(); // family -> [spouse individual xrefs]

  for (const { from, to, type } of typedRows) {
    if (type === 'FAMC') {
      if (!famcFamilyOf.has(from)) {
        famcFamilyOf.set(from, []);
      }

      famcFamilyOf.get(from).push(to);
    } else {
      if (!spousesOf.has(to)) {
        spousesOf.set(to, []);
      }

      spousesOf.get(to).push(from);
    }
  }

  const ancestors = new Set([xref1, xref2]);
  let queue = [xref1, xref2];

  while (queue.length > 0) {
    const nextQueue = [];

    for (const xref of queue) {
      for (const familyXref of famcFamilyOf.get(xref) ?? []) {
        for (const parentXref of spousesOf.get(familyXref) ?? []) {
          if (!ancestors.has(parentXref)) {
            ancestors.add(parentXref);
            nextQueue.push(parentXref);
          }
        }
      }
    }

    queue = nextQueue;
  }

  return ancestors;
}

/**
 * Mirrors `excludeFamilies()` (app/Module/RelationshipsChartModule.php:419-434):
 * every family where BOTH individuals are themselves spouses (i.e.
 * their own marriage family, if they have one) - excluded from the
 * "ancestors only" graph so that search mode can't just find the
 * trivial direct-spouse edge.
 *
 * @param {Array<{from: string, to: string, type: 'FAMS'|'FAMC'}>} typedRows
 * @param {string} xref1
 * @param {string} xref2
 * @returns {Set<string>}
 */
export function collectExcludedFamilies(typedRows, xref1, xref2) {
  const famsFamiliesOf = new Map();

  for (const { from, to, type } of typedRows) {
    if (type !== 'FAMS') {
      continue;
    }

    if (!famsFamiliesOf.has(from)) {
      famsFamiliesOf.set(from, new Set());
    }

    famsFamiliesOf.get(from).add(to);
  }

  const families1 = famsFamiliesOf.get(xref1) ?? new Set();
  const families2 = famsFamiliesOf.get(xref2) ?? new Set();
  const excluded = new Set();

  for (const familyXref of families1) {
    if (families2.has(familyXref)) {
      excluded.add(familyXref);
    }
  }

  return excluded;
}

/**
 * Every shortest path between `from` and `to` in an unweighted graph
 * (BFS distance, then DFS/backtracking over edges that make forward
 * progress) - the JS equivalent of `Dijkstra::shortestPaths()`
 * (fisharebest/algorithm) for a graph where every edge has weight 1,
 * which this one always is. `excludeXrefs` removes those nodes from
 * the graph entirely for this one search - mirrors
 * `shortestPaths($xref1, $xref2, $exclude)`'s own exclusion-list
 * parameter.
 *
 * @param {Map<string, Set<string>>} graph
 * @param {string} from
 * @param {string} to
 * @param {string[]} excludeXrefs
 * @returns {Array<string[]>} each path is alternating individual/family xrefs, starting and ending with an individual
 */
export function allShortestPaths(graph, from, to, excludeXrefs = []) {
  const excluded = new Set(excludeXrefs);

  if (excluded.has(from) || excluded.has(to)) {
    return [];
  }

  const distance = new Map([[from, 0]]);
  const queue = [from];

  for (let i = 0; i < queue.length; i++) {
    const u = queue[i];

    for (const v of graph.get(u) ?? []) {
      if (excluded.has(v) || distance.has(v)) {
        continue;
      }

      distance.set(v, distance.get(u) + 1);
      queue.push(v);
    }
  }

  if (!distance.has(to)) {
    return [];
  }

  const paths = [];
  const stack = [[from]];

  while (stack.length > 0) {
    const path = stack.pop();
    const u = path[path.length - 1];

    if (u === to) {
      paths.push(path);
      continue;
    }

    for (const v of graph.get(u) ?? []) {
      if (!excluded.has(v) && distance.get(v) === distance.get(u) + 1) {
        stack.push([...path, v]);
      }
    }
  }

  return paths;
}

/**
 * Mirrors `calculateRelationships()`'s own queue-based path-exclusion
 * expansion (app/Module/RelationshipsChartModule.php:347-384) EXACTLY:
 * starting from every shortest path, repeatedly exclude one family
 * ALONG an already-found path and search again, up to `recursion`
 * exclusions deep, to surface alternative (necessarily longer or
 * equal) paths through different ancestors. `queue.push()` during the
 * `for` loop below is deliberate - real PHP's own `for ($next =
 * current($queue); ...; $next = next($queue))` walks an array that
 * keeps growing as new paths are appended, and a plain JS `for` loop
 * re-reads `queue.length` every iteration, reproducing that exactly.
 *
 * @param {Map<string, Set<string>>} graph
 * @param {string} xref1
 * @param {string} xref2
 * @param {number} recursion
 * @returns {Array<string[]>} every distinct path found, deduplicated
 */
export function calculateRelationshipPaths(graph, xref1, xref2, recursion) {
  const queue = allShortestPaths(graph, xref1, xref2, []).map((path) => ({ path, exclude: [] }));
  const excludedSeen = new Set();

  for (let i = 0; i < queue.length; i++) {
    const { path, exclude } = queue[i];

    for (let n = path.length - 2; n >= 1; n -= 2) {
      if (exclude.length >= recursion) {
        continue;
      }

      const newExclude = [...exclude, path[n]].sort();
      const key = newExclude.join('-');

      if (excludedSeen.has(key)) {
        continue;
      }

      excludedSeen.add(key);

      for (const newPath of allShortestPaths(graph, xref1, xref2, newExclude)) {
        queue.push({ path: newPath, exclude: newExclude });
      }
    }
  }

  const byKey = new Map();

  for (const { path } of queue) {
    byKey.set(path.join('-'), path);
  }

  return [...byKey.values()];
}

// Mirrors oldStyleRelationshipPath()'s own four code tables
// (app/Module/RelationshipsChartModule.php:~2360-2380, inlined there).
const SPOUSE_CODES = { M: 'hus', F: 'wif', U: 'spo' };
const PARENT_CODES = { M: 'fat', F: 'mot', U: 'par' };
const CHILD_CODES = { M: 'son', F: 'dau', U: 'chi' };
const SIBLING_CODES = { M: 'bro', F: 'sis', U: 'sib' };

function familyRoleOf(familyGedcom, xref) {
  const match = new RegExp(`\\n\\d (HUSB|WIFE|CHIL) @${xref}@`).exec(familyGedcom);

  return match ? match[1] : null;
}

/**
 * Mirrors `oldStyleRelationshipPath()` (app/Module/RelationshipsChartModule.php:~2340-2390)
 * EXACTLY: for each family step in the path, look up each neighboring
 * individual's own role (HUSB/WIFE/CHIL) in that family, then combine
 * the two roles (+ the "next" individual's own sex) into one of the
 * 12 relationship codes the grid/title renderers both key off of.
 * Returns `null` (matching real PHP's own `return []` early exit) if
 * ANY step's role can't be determined - the whole path's relationship
 * name is unknowable, even though the individual boxes themselves
 * still render fine (same split already established for every other
 * "can't be NAMED but can still be SHOWN" case elsewhere).
 *
 * @param {string[]} path alternating individual/family xrefs
 * @param {Map<string, string>} familyGedcomByXref pre-loaded, one entry per family in the path
 * @param {Map<string, string>} sexByIndividualXref pre-loaded, one entry per individual in the path
 * @returns {string[]|null} one code per family position (sparse - indices 1,3,5,...)
 */
export function relationshipCodesForPath(path, familyGedcomByXref, sexByIndividualXref) {
  const codes = [];

  for (let i = 1; i < path.length; i += 2) {
    const familyGedcom = familyGedcomByXref.get(path[i]);
    const prevRole = familyRoleOf(familyGedcom, path[i - 1]);
    const nextRole = familyRoleOf(familyGedcom, path[i + 1]);

    if (prevRole === null || nextRole === null) {
      return null;
    }

    const nextSex = sexByIndividualXref.get(path[i + 1]) ?? 'U';
    const isSpouseRole = (role) => role === 'HUSB' || role === 'WIFE';

    let code;

    if (isSpouseRole(prevRole) && isSpouseRole(nextRole)) {
      code = SPOUSE_CODES[nextSex] ?? SPOUSE_CODES.U;
    } else if (isSpouseRole(prevRole) && nextRole === 'CHIL') {
      code = CHILD_CODES[nextSex] ?? CHILD_CODES.U;
    } else if (prevRole === 'CHIL' && isSpouseRole(nextRole)) {
      code = PARENT_CODES[nextSex] ?? PARENT_CODES.U;
    } else if (prevRole === 'CHIL' && nextRole === 'CHIL') {
      code = SIBLING_CODES[nextSex] ?? SIBLING_CODES.U;
    } else {
      // Real PHP's own if/elseif chain has no final `else` - an
      // unreachable combination (role is always HUSB/WIFE/CHIL on both
      // sides) leaves $relationships[$i] simply unset; a concatenated
      // path built from one would silently drop that segment's code
      // (PHP string concatenation of a missing array offset throws a
      // warning but continues). Treated the same way here - skip it.
      continue;
    }

    codes[i] = code;
  }

  return codes;
}

/**
 * Loads every family's gedcom and every individual's sex that a set
 * of paths actually references - one query per distinct xref, not
 * per path (paths from the same search very often share nodes).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {Array<string[]>} paths
 * @returns {Promise<{familyGedcomByXref: Map<string,string>, sexByIndividualXref: Map<string,string>, individualGedcomByXref: Map<string,string>}>}
 */
export async function loadPathRecords(pool, gedcomId, paths) {
  const individualXrefs = new Set();
  const familyXrefs = new Set();

  for (const path of paths) {
    for (let i = 0; i < path.length; i++) {
      (i % 2 === 0 ? individualXrefs : familyXrefs).add(path[i]);
    }
  }

  const sexByIndividualXref = new Map();
  const individualGedcomByXref = new Map();

  if (individualXrefs.size > 0) {
    const result = await pool.query('SELECT i_id, i_gedcom FROM wt_individuals WHERE i_file = $1 AND i_id = ANY($2)', [
      gedcomId,
      [...individualXrefs],
    ]);

    for (const row of result.rows) {
      individualGedcomByXref.set(row.i_id, row.i_gedcom);
      const sexMatch = /\n1 SEX ([MFX])/.exec(row.i_gedcom);
      sexByIndividualXref.set(row.i_id, sexMatch ? sexMatch[1] : 'U');
    }
  }

  const familyGedcomByXref = new Map();

  for (const xref of familyXrefs) {
    const family = await loadFamily(pool, gedcomId, xref);

    if (family !== null) {
      familyGedcomByXref.set(xref, family.gedcom);
    }
  }

  return { familyGedcomByXref, sexByIndividualXref, individualGedcomByXref };
}
