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

// HTML assembly for /admin (ControlPanel) - mirrors
// resources/views/layouts/administration.phtml (the admin-specific
// page shell - no genealogy menu bar, no site header/footer, just a
// "My page"/"Sign out" strip) wrapping
// resources/views/admin/control-panel.phtml. Every link below is a
// REAL link to its real PHP path (mostly still served by PHP via the
// proxy, same strangler-fig pattern as the genealogy menu built in
// step 33) - only the page's own `/admin` route is served by Node so far.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

const ICONS = {
  preferences: '<span class="wt-icon-preferences"><i class="fa-solid fa-wrench"></i></span>',
  email: '<span class="wt-icon-email"><i class="fa-solid fa-envelope"></i></span>',
  user: '<span class="wt-icon-user"><i class="fa-solid fa-user"></i></span>',
  list: '<span class="wt-icon-list"><i class="fa-solid fa-list"></i></span>',
  delete: '<span class="wt-icon-delete"><i class="fa-solid fa-trash-alt"></i></span>',
  server: '<span class="wt-icon-server"><i class="fa-solid fa-server"></i></span>',
  tag: '<span class="wt-icon-tag"><i class="fa-solid fa-tags"></i></span>',
  add: '<span class="wt-icon-add"><i class="fa-solid fa-plus"></i></span>',
  block: '<span class="wt-icon-block"><i class="fa-solid fa-th-list fa-flip-horizontal"></i></span>',
  merge: '<span class="wt-icon-merge"><i class="fa-solid fa-code-branch"></i></span>',
  module: '<span class="wt-icon-module"><i class="fa-solid fa-puzzle-piece"></i></span>',
  footer: '<span class="wt-icon-footer"><i class="fa-solid fa-grip-lines"></i></span>',
  analytics: '<span class="wt-icon-analytics"><i class="fa-solid fa-magic"></i></span>',
  theme: '<span class="wt-icon-theme"><i class="fa-solid fa-paint-brush"></i></span>',
  language: '<span class="wt-icon-language"><i class="fa-solid fa-language"></i></span>',
  search: '<span class="wt-icon-search"><i class="fa-solid fa-search"></i></span>',
  'search-location': '<span class="wt-icon-search-location"><i class="fa-solid fa-search-location"></i></span>',
  location: '<span class="wt-icon-location"><i class="fa-solid fa-map-marker-alt"></i></span>',
  map: '<span class="wt-icon-map"><i class="fa-solid fa-map"></i></span>',
  menu: '<span class="wt-icon-menu"><i class="fa-solid fa-bars"></i></span>',
  chart: '<span class="wt-icon-chart"><i class="fa-solid fa-sitemap"></i></span>',
  report: '<span class="wt-icon-report"><i class="fa-solid fa-file"></i></span>',
  'data-fix': '<span class="wt-icon-data-fix"><i class="fa-solid fa-medkit"></i></span>',
  tab: '<span class="wt-icon-theme"><i class="fa-solid fa-folder"></i></span>',
  sidebar: '<span class="wt-icon-sidebar"><i class="fa-solid fa-pause"></i></span>',
  history: '<span class="wt-icon-history"><i class="fa-solid fa-history"></i></span>',
  share: '<span class="wt-icon-sidebar"><i class="fa-solid fa-share-alt"></i></span>',
  upload: '<span class="wt-icon-upload"><i class="fa-solid fa-upload"></i></span>',
  link: '<span class="wt-icon-link"><i class="fa-solid fa-link"></i></span>',
};

// Every real /admin/... path this page links to - most not yet
// served by Node, so they fall through the proxy to PHP unchanged.
export const ADMIN_LINKS = {
  sitePreferences: '/admin/site-preferences',
  email: '/admin/email',
  siteRegistration: '/admin/site-registration',
  siteLogs: '/admin/logs',
  cleanDataFolder: '/admin/clean',
  phpInformation: '/admin/information',
  siteTags: '/admin/tags',
  createTree: '/admin/trees/create',
  treePageDefaultEdit: '/admin/trees/default-blocks',
  mergeTrees: '/admin/trees/merge',
  manageTree: (treeName) => `/admin/trees/manage/${encodeURIComponent(treeName)}`,
  pendingChanges: (treeName) => `/tree/${encodeURIComponent(treeName)}/pending?url=${encodeURIComponent('/admin')}`,
  userList: '/admin/admin-users',
  userAdd: '/admin/admin-users-create',
  userEdit: (userId) => `/admin/admin-users-edit?user_id=${userId}`,
  usersCleanup: '/admin/users-cleanup',
  userPageDefaultEdit: '/admin/user-page-default-edit',
  broadcast: (to) => `/admin/broadcast/${encodeURIComponent(to)}`,
  modulesAll: '/admin/modules',
  modulesFooters: '/admin/footers',
  modulesAnalytics: '/admin/analytics',
  modulesThemes: '/admin/themes',
  modulesLanguages: '/admin/languages',
  modulesBlocks: '/admin/blocks',
  modulesMapAutocomplete: '/admin/map-autocomplete',
  modulesMapGeoLocations: '/admin/map-searches',
  modulesMapLinks: '/admin/map-links',
  modulesMapProviders: '/admin/map-providers',
  modulesMenus: '/admin/menus',
  modulesCharts: '/admin/charts',
  modulesLists: '/admin/lists',
  modulesReports: '/admin/reports',
  modulesDataFixes: '/admin/data-fixes',
  modulesTabs: '/admin/tabs',
  modulesSidebars: '/admin/sidebars',
  modulesHistoricEvents: '/admin/historic-events',
  modulesShares: '/admin/shares',
  manageMedia: '/admin/media',
  uploadMedia: '/admin/media-upload',
  fixLevel0Media: '/admin/fix-level-0-media',
  mapDataList: '/admin/map-data',
};

function badge(enabled, total, context = 'secondary') {
  const fraction = total > enabled ? ` / ${formatNumber(total)}` : '';
  return `<span class="badge bg-${context}">${formatNumber(enabled)}${fraction}</span>`;
}

function listItem(iconKey, href, label, trailing = '') {
  return `<li><span class="fa-li">${ICONS[iconKey]}</span><a href="${escapeHtml(href)}">${label}</a>${trailing}</li>`;
}

function websiteCard() {
  return `<div class="card mb-4">
    <div class="card-header"><h2 class="mb-0">Website</h2></div>
    <div class="card-body">
        <p class="card-text">No upgrade information is available.</p>
        <div class="row">
            <div class="col-sm">
                <ul class="fa-ul mx-0">
                    ${listItem('preferences', ADMIN_LINKS.sitePreferences, 'Website preferences')}
                    ${listItem('email', ADMIN_LINKS.email, 'Sending email')}
                    ${listItem('user', ADMIN_LINKS.siteRegistration, 'Sign-in and registration')}
                </ul>
            </div>
            <div class="col-sm">
                <ul class="fa-ul mx-0">
                    ${listItem('list', ADMIN_LINKS.siteLogs, 'Website logs')}
                    ${listItem('delete', ADMIN_LINKS.cleanDataFolder, 'Clean up data folder')}
                    ${listItem('server', ADMIN_LINKS.phpInformation, 'Server information')}
                </ul>
            </div>
            <div class="col-sm">
                <ul class="fa-ul mx-0">
                    ${listItem('tag', ADMIN_LINKS.siteTags, 'GEDCOM tags')}
                </ul>
            </div>
        </div>
    </div>
</div>`;
}

function treeCountCell(count, listUrl) {
  if (count === 0) {
    return '<td class="d-none d-sm-table-cell align-digits">-</td>';
  }
  const inner = listUrl !== null ? `<a href="${escapeHtml(listUrl)}">${formatNumber(count)}</a>` : formatNumber(count);
  return `<td class="d-none d-sm-table-cell align-digits">${inner}</td>`;
}

/**
 * @param {Array<{gedcomId: number, name: string, title: string}>} trees
 * @param {object} counts { changes, individuals, families, sources, repositories, media, notes, submitters } - each Map<gedcomId, number>
 * @param {object} listUrls { individual, family, source, repository, media, note, submitter } - each (treeName) => string|null
 */
function familyTreesCard(trees, counts, listUrls) {
  const anyChanges = trees.some((tree) => (counts.changes.get(tree.gedcomId) ?? 0) > 0);
  const rows = trees
    .map((tree) => {
      const changeCount = counts.changes.get(tree.gedcomId) ?? 0;
      const changesCell =
        changeCount > 0
          ? `<td style="text-align: right;"><a href="${escapeHtml(ADMIN_LINKS.pendingChanges(tree.name))}">${formatNumber(changeCount)}</a></td>`
          : '<td style="text-align: right;">-</td>';

      return `<tr class="${changeCount > 0 ? 'danger' : ''}">
        <th scope="row">${ICONS.preferences}<a href="${escapeHtml(ADMIN_LINKS.manageTree(tree.name))}">${escapeHtml(tree.name)} - ${escapeHtml(tree.title)}</a></th>
        ${changesCell}
        ${treeCountCell(counts.individuals.get(tree.gedcomId) ?? 0, listUrls.individual(tree.name))}
        ${treeCountCell(counts.families.get(tree.gedcomId) ?? 0, listUrls.family(tree.name))}
        ${treeCountCell(counts.sources.get(tree.gedcomId) ?? 0, listUrls.source(tree.name))}
        ${treeCountCell(counts.repositories.get(tree.gedcomId) ?? 0, listUrls.repository(tree.name))}
        ${treeCountCell(counts.media.get(tree.gedcomId) ?? 0, listUrls.media(tree.name))}
        ${treeCountCell(counts.notes.get(tree.gedcomId) ?? 0, listUrls.note(tree.name))}
        ${treeCountCell(counts.submitters.get(tree.gedcomId) ?? 0, listUrls.submitter(tree.name))}
      </tr>`;
    })
    .join('\n');

  const sum = (map) => [...map.values()].reduce((a, b) => a + b, 0);

  return `<div class="card mb-4 ${anyChanges ? 'card-outline-danger' : ''}">
    <div class="card-header"><h2 class="mb-0">Family trees <span class="badge bg-secondary">${formatNumber(trees.length)}</span></h2></div>
    <div class="card-body">
        ${trees.length === 0 ? '<p class="alert alert-info">You need to create a family tree.</p>' : ''}
        <ul class="fa-ul mx-0">
            ${listItem('add', ADMIN_LINKS.createTree, 'Create a family tree')}
            ${listItem('block', ADMIN_LINKS.treePageDefaultEdit, 'Set the default blocks for new family trees')}
            ${trees.length > 1 ? listItem('merge', ADMIN_LINKS.mergeTrees, 'Merge family trees') : ''}
        </ul>
        <table class="table table-sm">
            <caption class="visually-hidden">Family trees</caption>
            <thead><tr>
                <th>Family tree</th>
                <th class="align-digits">Pending changes</th>
                <th class="d-none d-sm-table-cell align-digits">Individuals</th>
                <th class="d-none d-lg-table-cell align-digits">Families</th>
                <th class="d-none d-sm-table-cell align-digits">Sources</th>
                <th class="d-none d-lg-table-cell align-digits">Repositories</th>
                <th class="d-none d-sm-table-cell align-digits">Media</th>
                <th class="d-none d-lg-table-cell align-digits">Notes</th>
                <th class="d-none d-lg-table-cell align-digits">Submitters</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr>
                <th scope="row">Total</th>
                <td class="align-digits">${formatNumber(sum(counts.changes))}</td>
                <td class="d-none d-sm-table-cell align-digits">${formatNumber(sum(counts.individuals))}</td>
                <td class="d-none d-lg-table-cell align-digits">${formatNumber(sum(counts.families))}</td>
                <td class="d-none d-sm-table-cell align-digits">${formatNumber(sum(counts.sources))}</td>
                <td class="d-none d-lg-table-cell align-digits">${formatNumber(sum(counts.repositories))}</td>
                <td class="d-none d-sm-table-cell align-digits">${formatNumber(sum(counts.media))}</td>
                <td class="d-none d-lg-table-cell align-digits">${formatNumber(sum(counts.notes))}</td>
                <td class="d-none d-lg-table-cell align-digits">${formatNumber(sum(counts.submitters))}</td>
            </tr></tfoot>
        </table>
    </div>
</div>`;
}

function usersCard(users) {
  const groups = [
    ['Administrators', users.administrators],
    ['Managers', users.managers],
    ['Moderators', users.moderators],
    ['Not verified by the user', users.unverified],
    ['Not approved by an administrator', users.unapproved],
  ];

  const dl = groups
    .map(
      ([label, list]) => `<dt class="col-sm-6">${label}</dt>
        <dd class="col-sm-6">${
          list.length === 0
            ? '—'
            : list.map((user) => `<a href="${escapeHtml(ADMIN_LINKS.userEdit(user.userId))}" dir="auto">${escapeHtml(user.realName)}</a>`).join(', ')
        }</dd>`,
    )
    .join('\n');

  const recipientsHtml = users.recipients.map((r) => listItem('email', ADMIN_LINKS.broadcast(r.to), r.label)).join('\n');

  return `<div class="card mb-4 ${users.unapproved.length > 0 || users.unverified.length > 0 ? 'card-outline-danger' : ''}">
    <div class="card-header"><h2 class="mb-0">Users <span class="badge bg-secondary">${formatNumber(users.all.length)}</span></h2></div>
    <div class="card-body">
        <dl class="row">${dl}</dl>
        <div class="row">
            <div class="col-sm-6">
                <ul class="fa-ul mx-0">
                    ${listItem('preferences', ADMIN_LINKS.userList, 'User administration')}
                    ${listItem('add', ADMIN_LINKS.userAdd, 'Add a user')}
                    ${listItem('delete', ADMIN_LINKS.usersCleanup, 'Delete inactive users')}
                    ${listItem('block', ADMIN_LINKS.userPageDefaultEdit, 'Set the default blocks for new users')}
                </ul>
            </div>
            <div class="col-sm-6"><ul class="fa-ul mx-0">${recipientsHtml}</ul></div>
        </div>
    </div>
</div>`;
}

function moduleSection(title, items) {
  const rows = items
    .map(
      ([iconKey, href, label, countInfo]) =>
        `<li><span class="fa-li">${ICONS[iconKey]}</span><a href="${escapeHtml(href)}">${label}</a> ${badge(countInfo.enabled, countInfo.total, 'primary')}</li>`,
    )
    .join('\n');

  return `<h3>${title}</h3><ul class="fa-ul mx-0">${rows}</ul>`;
}

function otherModulesSection(otherModules) {
  const rows = otherModules
    .map(({ name, title, enabled }) => {
      const label = enabled ? `<span class="fa-li">${ICONS.module}</span>${escapeHtml(title)}` : `<span class="text-muted"><span class="fa-li">${ICONS.module}</span>${escapeHtml(title)}</span>`;
      return `<li>${label}</li>`;
    })
    .join('\n');

  return `<h3>Other</h3><ul class="fa-ul mx-0">${rows}</ul>`;
}

/**
 * @param {object} moduleSummary from control-panel.mjs's loadModuleSummary()
 */
function modulesCard(moduleSummary) {
  const c = (key) => moduleSummary.counts[key] ?? { enabled: 0, total: 0 };

  return `<div class="card mb-4">
    <div class="card-header"><h2 class="mb-0">Modules ${badge(moduleSummary.allEnabled, moduleSummary.allTotal, 'secondary')}</h2></div>
    <div class="card-body">
        <ul class="fa-ul mx-0">
            <li><span class="fa-li">${ICONS.module}</span><a href="${escapeHtml(ADMIN_LINKS.modulesAll)}">All modules</a> ${badge(moduleSummary.allEnabled, moduleSummary.allTotal, 'primary')}</li>
        </ul>
        <div class="row">
            <div class="col-sm-4">
                ${moduleSection('Website', [
                  ['footer', ADMIN_LINKS.modulesFooters, 'Footers', c('footer')],
                  ['analytics', ADMIN_LINKS.modulesAnalytics, 'Tracking and analytics', c('analytics')],
                  ['theme', ADMIN_LINKS.modulesThemes, 'Themes', c('theme')],
                  ['language', ADMIN_LINKS.modulesLanguages, 'Languages', c('language')],
                ])}
                ${moduleSection('Home page', [['block', ADMIN_LINKS.modulesBlocks, 'Blocks', c('block')]])}
                ${moduleSection('Geographic data', [
                  ['search', ADMIN_LINKS.modulesMapAutocomplete, 'Autocomplete', c('mapAutocomplete')],
                  ['search-location', ADMIN_LINKS.modulesMapGeoLocations, 'Geolocation', c('mapGeoLocation')],
                  ['location', ADMIN_LINKS.modulesMapLinks, 'Map links', c('mapLink')],
                  ['map', ADMIN_LINKS.modulesMapProviders, 'Map providers', c('mapProvider')],
                ])}
            </div>
            <div class="col-sm-4">
                ${moduleSection('Genealogy', [
                  ['menu', ADMIN_LINKS.modulesMenus, 'Menus', c('menu')],
                  ['chart', ADMIN_LINKS.modulesCharts, 'Charts', c('chart')],
                  ['list', ADMIN_LINKS.modulesLists, 'Lists', c('list')],
                  ['report', ADMIN_LINKS.modulesReports, 'Reports', c('report')],
                  ['data-fix', ADMIN_LINKS.modulesDataFixes, 'Data fixes', c('dataFix')],
                ])}
                ${moduleSection('Individual page', [
                  ['tab', ADMIN_LINKS.modulesTabs, 'Tabs', c('tab')],
                  ['sidebar', ADMIN_LINKS.modulesSidebars, 'Sidebars', c('sidebar')],
                  ['history', ADMIN_LINKS.modulesHistoricEvents, 'Historic events', c('historicEvents')],
                  ['share', ADMIN_LINKS.modulesShares, 'Shares', c('share')],
                ])}
            </div>
            <div class="col-sm-4">${otherModulesSection(moduleSummary.otherModules)}</div>
        </div>
    </div>
</div>`;
}

function mediaCard() {
  return `<div class="card mb-4">
    <div class="card-header"><h2 class="mb-0">Media</h2></div>
    <div class="card-body">
        <ul class="fa-ul mx-0">
            ${listItem('preferences', ADMIN_LINKS.manageMedia, 'Manage media')}
            ${listItem('upload', ADMIN_LINKS.uploadMedia, 'Upload media files')}
            ${listItem('link', ADMIN_LINKS.fixLevel0Media, 'Link media objects to facts and events')}
        </ul>
    </div>
</div>`;
}

function mapCard() {
  return `<div class="card mb-4">
    <div class="card-header"><h2 class="mb-0">Map</h2></div>
    <div class="card-body">
        <ul class="fa-ul mx-0">${listItem('location', ADMIN_LINKS.mapDataList, 'Geographic data')}</ul>
    </div>
</div>`;
}

function oldFilesCard(filesToDelete) {
  if (filesToDelete.length === 0) {
    return '';
  }

  const items = filesToDelete.map((file) => `<li dir="ltr"><code>${escapeHtml(file)}</code></li>`).join('\n');

  return `<div class="card mb-4 card-outline-danger">
    <div class="card-header"><h2 class="mb-0">Old files found</h2></div>
    <div class="card-body">
        <p>Files have been found from a previous version of webtrees. Old files can sometimes be a security risk. You should delete them.</p>
        <ul class="list-unstyled">${items}</ul>
    </div>
</div>`;
}

/**
 * Full page: /admin. Mirrors layouts/administration.phtml wrapping
 * admin/control-panel.phtml.
 *
 * @param {object} params
 * @param {{realName: string}} params.user always non-null (AuthAdministrator-gated)
 * @param {string} params.csrfToken
 * @param {Array<{gedcomId: number, name: string, title: string}>} params.trees
 * @param {object} params.treeCounts
 * @param {object} params.listUrls
 * @param {object} params.users { all, administrators, managers, moderators, unapproved, unverified, recipients }
 * @param {object} params.moduleSummary
 * @param {string[]} params.filesToDelete
 * @returns {string}
 */
export function renderControlPanelPage({ csrfToken, trees, treeCounts, listUrls, users, moduleSummary, filesToDelete }) {
  const cards = [
    websiteCard(),
    familyTreesCard(trees, treeCounts, listUrls),
    usersCard(users),
    modulesCard(moduleSummary),
    mediaCard(),
    mapCard(),
    oldFilesCard(filesToDelete),
  ].join('\n');

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <title>Control panel</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/administration.min.css">
</head>
<body class="container-lg wt-global wt-control-panel">
    <header>
        <ul class="nav small d-flex justify-content-end">
            <li class="nav-item menu-mypage"><a class="nav-link active" href="/">My page</a></li>
            <li class="nav-item menu-logout">
                <a class="nav-link" href="#" data-wt-post-url="/logout" data-wt-reload-url="/">Sign out</a>
            </li>
        </ul>
    </header>
    <main id="content">
        <h1>Control panel</h1>
        ${cards}
    </main>
    <script src="/public/js/vendor.min.js"></script>
    <script src="/public/js/webtrees.min.js"></script>
</body>
</html>
`;
}
