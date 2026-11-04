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

// The top "genealogy menu" bar - resources/views/layouts/default.phtml's
// `<nav class="col wt-primary-navigation">`, built from
// `$theme->genealogyMenu($tree)` (ModuleThemeTrait.php:412-425): every
// enabled `ModuleMenuInterface` module for this tree, each contributing
// its own `getMenu($tree)`. Reported live as missing from every
// Node-rendered page (user noticed it first on chart pages, but it was
// never built anywhere) - this was a whole shared piece of
// infrastructure, not a chart-specific gap.
//
// Ported here: Family tree(s), Charts, Lists, Calendar, Reports,
// Search - the six menus present in every stock install. Scope cut:
// ClippingsCartModule/FrequentlyAskedQuestionsModule/StoriesModule
// (the three other ModuleMenuInterface modules) are NOT included -
// each needs its own per-feature data (cart contents, FAQ articles,
// stories), none of which anything ported so far has touched.
//
// Every submenu link is a real, correct URL even for chart/list/report
// modules that AREN'T ported to Node yet (Pedigree/Relationships/
// PedigreeMap/InteractiveTree/Lifespans/Timeline/Statistics charts;
// every report) - clicking one just falls through the proxy to PHP,
// exactly as the strangler-fig migration intends.

import { accessibleTrees } from './trees.mjs';
import { loadIndividual } from './individual.mjs';
import { significantIndividualXref } from './welcome-block.mjs';

// AbstractModule::$access_level default (app/Module/AbstractModule.php:41)
// is Auth::PRIV_PRIVATE (2, visible to visitors); only the overrides
// below differ (confirmed by reading each module class directly).
const MODULE_DEFAULT_LEVEL = {
  'source_list': 1,
  'location_list': 1,
  'submitter_list': 0,
  'calendar-menu': 1,
  'bdm_report': 1,
  'individual_ext_report': 1,
  'missing_facts_report': 1,
  'occupation_report': 1,
  'fact_sources': 1,
};

function defaultLevel(moduleName) {
  return MODULE_DEFAULT_LEVEL[moduleName] ?? 2;
}

/**
 * One batched pass over wt_module/wt_module_privacy for every module
 * name this menu might need, instead of one query per module (this
 * menu touches ~35 modules on every single page load).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string[]} moduleNames
 * @returns {Promise<Map<string, {enabled: boolean, level: number}>>}
 */
async function loadModuleLevels(pool, gedcomId, moduleNames) {
  const statusResult = await pool.query('SELECT module_name, status FROM wt_module WHERE module_name = ANY($1)', [
    moduleNames,
  ]);
  const privacyResult = await pool.query(
    'SELECT module_name, access_level FROM wt_module_privacy WHERE gedcom_id = $1 AND module_name = ANY($2)',
    [gedcomId, moduleNames],
  );

  const privacyByName = new Map(privacyResult.rows.map((row) => [row.module_name, Number(row.access_level)]));
  const levels = new Map();

  for (const row of statusResult.rows) {
    levels.set(row.module_name, {
      enabled: row.status === 'enabled',
      level: privacyByName.has(row.module_name) ? privacyByName.get(row.module_name) : defaultLevel(row.module_name),
    });
  }

  return levels;
}

function isVisible(levels, moduleName, viewerAccessLevel) {
  const entry = levels.get(moduleName);
  return entry !== undefined && entry.enabled && entry.level >= viewerAccessLevel;
}

// Chart modules' own default-parameter URLs (ModuleChartTrait::chartUrl()
// with no extra $parameters) - see docs/php-to-js-migration/phase5-genealogy-menu.md
// for where each of these literal defaults/route shapes was confirmed.
const CHART_ENTRIES = [
  { module: 'ancestors_chart', label: 'Ancestors', url: (t, x) => `/tree/${t}/ancestors-tree-4/${x}` },
  { module: 'compact-chart', label: 'Compact tree', url: (t, x) => `/tree/${t}/compact/${x}` },
  { module: 'descendancy_chart', label: 'Descendants', url: (t, x) => `/tree/${t}/descendants-tree-3/${x}` },
  { module: 'family_book_chart', label: 'Family book', url: (t, x) => `/tree/${t}/family-book-2-5-0/${x}` },
  { module: 'fan_chart', label: 'Fan chart', url: (t, x) => `/tree/${t}/fan-chart-3-4-100/${x}` },
  { module: 'hourglass_chart', label: 'Hourglass chart', url: (t, x) => `/tree/${t}/hourglass-3-0/${x}` },
  { module: 'lifespans_chart', label: 'Lifespans', url: (t, x) => `/tree/${t}/lifespans?xrefs=${x}` },
  { module: 'pedigree_chart', label: 'Pedigree', url: (t, x) => `/tree/${t}/pedigree-right-4/${x}` },
  { module: 'pedigree-map', label: 'Pedigree map', url: (t, x) => `/tree/${t}/pedigree-map-4/${x}` },
  { module: 'relationships_chart', label: 'Relationships', url: (t, x) => `/tree/${t}/relationships-0-99/${x}` },
  { module: 'statistics_chart', label: 'Statistics', url: (t, _x) => `/module/statistics_chart/Chart/${t}` },
  { module: 'timeline_chart', label: 'Timeline', url: (t, x) => `/tree/${t}/timeline-10?xrefs%5B%5D=${x}` },
  { module: 'tree', label: 'Interactive tree', url: (t, x) => `/module/tree/Chart/${t}?xref=${x}` },
];

// ModuleListTrait's own real ROUTE_URLs (list modules without their own
// chart-style URL have been confirmed directly from each module class).
const LIST_ENTRIES = [
  { module: 'branches_list', label: 'Branches', url: (t) => `/tree/${t}/branches` },
  { module: 'family_list', label: 'Families', url: (t) => `/tree/${t}/family-list` },
  { module: 'individual_list', label: 'Individuals', url: (t) => `/tree/${t}/individual-list` },
  { module: 'location_list', label: 'Places', url: (t) => `/tree/${t}/location-list` },
  { module: 'media_list', label: 'Media objects', url: (t) => `/tree/${t}/media-list` },
  { module: 'note_list', label: 'Shared notes', url: (t) => `/tree/${t}/note-list` },
  { module: 'repository_list', label: 'Repositories', url: (t) => `/tree/${t}/repository-list` },
  { module: 'source_list', label: 'Sources', url: (t) => `/tree/${t}/source-list` },
  { module: 'submitter_list', label: 'Submitters', url: (t) => `/tree/${t}/submitter-list` },
];

// ModuleReportTrait::getReportMenu()'s own URL (app/Module/ModuleReportTrait.php:49-60):
// `/tree/{tree}/report/{report}?xref={xref}`, `report` = the module's
// own name() (confirmed against the real enabled module_name values).
const REPORT_ENTRIES = [
  { module: 'ahnentafel_report', label: 'Ancestors' },
  { module: 'bdm_report', label: 'Vital records' },
  { module: 'birth_report', label: 'Births' },
  { module: 'cemetery_report', label: 'Burials' },
  { module: 'change_report', label: 'Changes' },
  { module: 'death_report', label: 'Deaths' },
  { module: 'descendancy_report', label: 'Descendants' },
  { module: 'fact_sources', label: 'Source' },
  { module: 'family_group_report', label: 'Family' },
  { module: 'individual_ext_report', label: 'Related families' },
  { module: 'individual_report', label: 'Individual' },
  { module: 'marriage_report', label: 'Marriages' },
  { module: 'missing_facts_report', label: 'Missing data' },
  { module: 'occupation_report', label: 'Occupations' },
  { module: 'pedigree_report', label: 'Pedigree' },
  { module: 'relative_ext_report', label: 'Related individuals' },
];

const ALL_MODULE_NAMES = [
  'trees-menu',
  'charts-menu',
  'lists-menu',
  'calendar-menu',
  'reports-menu',
  'search-menu',
  ...CHART_ENTRIES.map((e) => e.module),
  ...LIST_ENTRIES.map((e) => e.module),
  ...REPORT_ENTRIES.map((e) => e.module),
];

function sortByLabel(items) {
  return [...items].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Mirrors Tree::significantIndividual($user, $xref) for the case where
 * a menu-building call site has an explicit `xref` to prefer (every
 * menu module that needs one calls it this way) - the explicit xref is
 * used as-is (just an existence check, no privacy check - matching
 * real PHP exactly) when present, else falls back to
 * significantIndividualXref()'s own no-xref chain. The Family
 * fallback branch (an explicit xref that names a FAMILY, not an
 * INDIVIDUAL) is not ported - no menu-building call site here can ever
 * supply one (the `xref` query param always names whatever record the
 * current page itself is about).
 *
 * @param {import('pg').Pool} pool
 * @param {{gedcomId: number}} tree
 * @param {{userId: number|null}} user
 * @param {string|null} xrefParam
 * @returns {Promise<string|null>}
 */
async function significantIndividual(pool, tree, user, xrefParam) {
  if (xrefParam !== null && xrefParam !== '') {
    const individual = await loadIndividual(pool, tree.gedcomId, xrefParam);

    if (individual !== null) {
      return individual.xref;
    }
  }

  return significantIndividualXref(pool, tree, user);
}

/**
 * Builds the top genealogy-menu bar for one page render, mirroring
 * `$theme->genealogyMenu($tree)` - called once per request (every
 * already-ported full-page render function takes the result's
 * rendered HTML as `genealogyMenuHtml`).
 *
 * @param {import('pg').Pool} pool
 * @param {object} params
 * @param {{gedcomId: number, name: string}} params.tree
 * @param {number|null} params.userId
 * @param {boolean} params.isAdmin
 * @param {0|1|2} params.accessLevel viewerAccessLevel() for this tree/user
 * @param {string|null} params.xrefParam the current page's own `xref`, if it has one - used to seed Charts/Reports links, same as real PHP's own `Validator::attributes($request)->isXref()->string('xref', '')`
 * @returns {Promise<Array<{label: string, link: string, class: string, submenus: Array<{label: string, link: string, class: string}>}>>}
 */
export async function buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel, xrefParam }) {
  const levels = await loadModuleLevels(pool, tree.gedcomId, ALL_MODULE_NAMES);
  const menus = [];

  // Family tree(s) - TreesMenuModule::getMenu(). This migration's own
  // dev instance only ever has the one "ophir" tree, but the
  // multi-tree dropdown branch is still ported for correctness.
  if (isVisible(levels, 'trees-menu', accessLevel)) {
    const trees = await accessibleTrees(pool, { userId, isAdmin });

    if (trees.length === 1) {
      menus.push({ label: 'Family tree', link: `/tree/${tree.name}`, class: 'menu-tree', submenus: [] });
    } else if (trees.length > 1) {
      menus.push({
        label: 'Family trees',
        link: '#',
        class: 'menu-tree',
        submenus: trees.map((t) => ({
          label: t.title,
          link: `/tree/${t.name}`,
          class: t.gedcomId === tree.gedcomId ? 'active menu-tree-' + t.gedcomId : 'menu-tree-' + t.gedcomId,
        })),
      });
    }
  }

  // Charts - ChartsMenuModule::getMenu().
  if (isVisible(levels, 'charts-menu', accessLevel)) {
    const visibleCharts = CHART_ENTRIES.filter((entry) => isVisible(levels, entry.module, accessLevel));

    if (visibleCharts.length > 0) {
      const xref = await significantIndividual(pool, tree, { userId }, xrefParam);

      if (xref !== null) {
        menus.push({
          label: 'Charts',
          link: '#',
          class: 'menu-chart',
          submenus: sortByLabel(visibleCharts.map((entry) => ({ label: entry.label, link: entry.url(tree.name, xref), class: '' }))),
        });
      }
    }
  }

  // Lists - ListsMenuModule::getMenu().
  if (isVisible(levels, 'lists-menu', accessLevel)) {
    const visibleLists = LIST_ENTRIES.filter((entry) => isVisible(levels, entry.module, accessLevel));

    if (visibleLists.length > 0) {
      menus.push({
        label: 'Lists',
        link: '#',
        class: 'menu-list',
        submenus: sortByLabel(visibleLists.map((entry) => ({ label: entry.label, link: entry.url(tree.name), class: '' }))),
      });
    }
  }

  // Calendar - CalendarMenuModule::getMenu(). Fixed Day/Month/Year
  // order (not alphabetical, matching real PHP).
  if (isVisible(levels, 'calendar-menu', accessLevel)) {
    menus.push({
      label: 'Calendar',
      link: '#',
      class: 'menu-calendar',
      submenus: [
        { label: 'Day', link: `/tree/${tree.name}/calendar/day`, class: 'menu-calendar-day' },
        { label: 'Month', link: `/tree/${tree.name}/calendar/month`, class: 'menu-calendar-month' },
        { label: 'Year', link: `/tree/${tree.name}/calendar/year`, class: 'menu-calendar-year' },
      ],
    });
  }

  // Reports - ReportsMenuModule::getMenu().
  if (isVisible(levels, 'reports-menu', accessLevel)) {
    const visibleReports = REPORT_ENTRIES.filter((entry) => isVisible(levels, entry.module, accessLevel));

    if (visibleReports.length > 0) {
      const xref = await significantIndividual(pool, tree, { userId }, xrefParam);

      if (xref !== null) {
        menus.push({
          label: 'Reports',
          link: '#',
          class: 'menu-report',
          submenus: sortByLabel(
            visibleReports.map((entry) => ({
              label: entry.label,
              link: `/tree/${tree.name}/report/${entry.module}?xref=${encodeURIComponent(xref)}`,
              class: 'menu-report-' + entry.module,
            })),
          ),
        });
      }
    }
  }

  // Search - SearchMenuModule::getMenu(). Search-and-replace only
  // shown to at-least-members (a simplified stand-in for real PHP's
  // own Auth::isEditor() - see docs/php-to-js-migration/phase5-genealogy-menu.md).
  if (isVisible(levels, 'search-menu', accessLevel)) {
    const submenus = [
      { label: 'General search', link: `/tree/${tree.name}/search-general`, class: 'menu-search-general' },
      { label: 'Phonetic search', link: `/tree/${tree.name}/search-phonetic`, class: 'menu-search-soundex' },
      { label: 'Advanced search', link: `/tree/${tree.name}/search-advanced`, class: 'menu-search-advanced' },
    ];

    if (accessLevel <= 1) {
      submenus.push({ label: 'Search and replace', link: `/tree/${tree.name}/search-replace`, class: 'menu-search-replace' });
    }

    menus.push({ label: 'Search', link: '#', class: 'menu-search', submenus });
  }

  return menus;
}
