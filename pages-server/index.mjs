#!/usr/bin/env node

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

// Phase 5, steps 2-13 of the php-to-js migration
// (docs/php-to-js-migration/phase5-first-node-route.md): real HTTP
// routes served entirely by Node instead of PHP. Sits behind
// proxy/index.mjs, which sends /my-account*, /login*, /logout,
// /my-account-delete, /, /language/*, /theme/*, the exact-match
// /tree/{tree} page, /tree/{tree}/individual/{xref},
// /tree/{tree}/family/{xref}, and /tree/{tree}/source/{xref} here and
// everything else to the PHP app - both processes share the same
// Postgres database and the same login session (see auth.mjs and, for
// /login/logout/language/theme specifically, session-store.mjs +
// php-serialize.mjs). /tree/{tree} (step 8,
// docs/php-to-js-migration/phase5-tree-page.md) is the first
// tree-scoped route and renders only one of TreePage's up to 8
// configurable blocks (WelcomeBlockModule) - every other block a tree
// might have configured is simply omitted from the layout.
// /tree/{tree}/individual/{xref} (step 9,
// docs/php-to-js-migration/phase5-individual-page.md) is the first
// route serving real GEDCOM record data and the first with a
// genuinely nontrivial privacy/access-control chain - identity header
// + vital-event facts (BIRT/CHR/BAPM/DEAT/BURI/CREM) only, no tabs, no
// MARR, no slug canonicalization. /tree/{tree}/family/{xref} (step 10,
// docs/php-to-js-migration/phase5-family-page.md) closes the MARR gap:
// husband/wife/children identity cards (each linking to their own
// individual page) + marriage/divorce vital facts, reusing almost all
// of individual.mjs's privacy chain and identity rendering.
// /tree/{tree}/source/{xref} (step 13,
// docs/php-to-js-migration/phase5-source-page.md) is the third
// real-GEDCOM-record route and the first that isn't Individual/Family:
// title (TITL) + basic source facts (AUTH/PUBL/ABBR/TEXT/CHAN), with a
// source's privacy additionally gated on every repository (REPO) it
// references - no linked-record reverse-lookup section.
//
// Deliberately plain node:http, no framework - same convention as
// server/migration-service.mjs.

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadDbConfig, loadSiteUrlConfig } from './config.mjs';
import {
  isMyAccountPath,
  isLoginPath,
  isLogoutPath,
  isAccountDeletePath,
  isHomePath,
  matchLanguagePath,
  matchThemePath,
  matchTreePagePath,
  matchIndividualPagePath,
  matchFamilyPagePath,
  matchSourcePagePath,
  matchRepositoryPagePath,
  matchNotePagePath,
  matchMediaPagePath,
  matchSubmitterPagePath,
  matchHeaderPagePath,
  matchRepositoryListPagePath,
  matchSourceListPagePath,
  matchNoteListPagePath,
  matchLocationListPagePath,
  matchFamilyListPagePath,
  matchIndividualListPagePath,
  matchMediaListPagePath,
  matchAncestorsChartPagePath,
  matchDescendancyChartPagePath,
  matchHourglassChartPagePath,
  matchHourglassChartActionPath,
  matchFamilyBookChartPagePath,
  matchCompactTreeChartPagePath,
  matchFanChartPagePath,
  matchLifespansChartPagePath,
  matchTimelineChartPagePath,
  matchRelationshipsChartPagePath,
  matchStatisticsChartActionPath,
  matchPedigreeMapChartPagePath,
  matchControlPanelPath,
  matchUserListPagePath,
  matchUserListDataPath,
  matchUserAddPath,
  matchUserEditPath,
  matchDeleteUserPath,
  matchMasqueradePath,
  matchManageTreesPath,
  matchCreateTreePath,
  matchSelectDefaultTreePath,
  matchDeleteTreePath,
  matchMergeTreesPath,
  matchTreePreferencesPath,
  matchRenumberTreePath,
  matchTreePrivacyPath,
  matchCheckTreePath,
  matchSitePreferencesPath,
  matchSiteRegistrationPath,
  matchEmailPreferencesPath,
  matchSiteTagsPath,
} from './routes.mjs';
import { parseCookies, getCurrentUser } from './auth.mjs';
import { generateCsrfToken, csrfSetCookieHeader, isValidCsrf } from './csrf.mjs';
import { renderAccountPage } from './account-view.mjs';
import { updateAccount } from './account-update.mjs';
import { deleteAccount } from './account-delete.mjs';
import { renderLoginPage, isLocalPath } from './login-view.mjs';
import { doLogin } from './login-action.mjs';
import { doLogout } from './logout.mjs';
import { renderNoTreeAccessPage } from './home-view.mjs';
import { renderTreePage } from './tree-view.mjs';
import { accessibleTrees, accessibleTreeByName, isTreeManager, viewerAccessLevel } from './trees.mjs';
import { significantIndividualXref, findVisibleWelcomeBlockId } from './welcome-block.mjs';
import { renderIndividualPage, EXTRA_INFO_TAGS } from './individual-view.mjs';
import {
  loadIndividual,
  loadTreePrivacyPrefs,
  loadDefaultResn,
  viewerRelationshipPrefs,
  canShowRecord,
  canShowName,
  sex,
  sexLabel,
  extractPrimaryName,
  extractAllNameFacts,
  getPrimaryNameIndex,
  nameSubTagAttributes,
  parseFacts,
  getBirthDate,
  getDeathDate,
  getAllBirthDates,
  getAllDeathDates,
  isDead,
  lifespan,
  ageString,
  factCanShow,
  displayDate,
  extractNameFromFact,
  factPlainValue,
  parentRelationshipLabel,
  spouseRelationshipLabel,
  childRelationshipLabel,
  siblingRelationshipLabel,
  selfRelationshipLabel,
  otherFactAttributes,
} from './individual.mjs';
import {
  loadFactsMedia,
  mediaThumbnailUrl,
  mediaDownloadUrl,
  loadGlideKey,
  needsWatermark,
  loadMedia,
  mediaFileDetails,
  firstImageFile,
  displayableMediaFacts,
  mediaFactOtherAttributes,
  mediaCanShowRecord,
  allFolders,
  allMedia,
  linkedRecordXrefsForMedia,
} from './media.mjs';
import { renderMediaListPage } from './media-list-view.mjs';
import { buildChartBoxViewModel, loadShowHighlightImagesPref, loadShowPrivateRelationshipsPref } from './chart-box.mjs';
import { renderChartBox } from './chart-box-view.mjs';
import { renderAncestorsTreeNode, renderAncestorsChartPage } from './ancestors-chart-view.mjs';
import { renderDescendancyTreeNode, renderDescendancyChartPage } from './descendancy-chart-view.mjs';
import {
  renderHourglassChart,
  renderHourglassChartPage,
  renderHourglassAncestorsNode,
  renderHourglassDescendantsNode,
} from './hourglass-chart-view.mjs';
import { renderFamilyBookChart, renderFamilyBookChartPage } from './family-book-chart-view.mjs';
import { renderCompactTreeChart, renderCompactTreeChartPage } from './compact-tree-chart-view.mjs';
import { buildFanWedges, renderFanChart, renderFanChartPage } from './fan-chart-view.mjs';
import {
  parseLifespansXrefs,
  joinLifespansXrefs,
  closeFamilyXrefs,
  resolvePlaceId,
  findIndividualsByDate,
  findIndividualsByPlace,
  lifespansMinYear,
  lifespansMaxYear,
  layoutIndividuals,
} from './lifespans-chart.mjs';
import { renderLifespansChart, renderLifespansChartPage } from './lifespans-chart-view.mjs';
import {
  collectIndividualTimelineEvents,
  layoutTimelineEvents,
  timelineColorIndex,
  timelineEventYear,
  timelineZoomIn,
  timelineZoomOut,
} from './timeline-chart.mjs';
import { renderTimelineChart, renderTimelineChartPage } from './timeline-chart-view.mjs';
import {
  loadLinkGraphRows,
  buildLinkGraph,
  collectAncestors,
  collectExcludedFamilies,
  calculateRelationshipPaths,
  relationshipCodesForPath,
  loadPathRecords,
} from './relationship-chart.mjs';
import { legacyNameAlgorithm } from './relationship-names.mjs';
import { renderRelationshipsChart, renderRelationshipsChartPage, buildRelationshipGrid, renderRelationshipPath } from './relationship-chart-view.mjs';
import * as statistics from './statistics.mjs';
import { individualRecordHtml, familyRecordHtml } from './statistics-records.mjs';
import { buildCustomChart } from './statistics-custom-chart.mjs';
import {
  renderStatisticsChartPage,
  renderIndividualsTab,
  renderFamiliesTab,
  renderOtherTab,
  renderCustomTab,
  renderCustomChartResult,
} from './statistics-chart-view.mjs';
import { sosaStradonitzAncestors, buildPedigreeMapData } from './pedigree-map.mjs';
import { renderPedigreeMapChart, renderPedigreeMapPage } from './pedigree-map-view.mjs';
import { buildLeafletJsConfig } from './leaflet-config.mjs';
import * as controlPanel from './control-panel.mjs';
import { renderControlPanelPage } from './control-panel-view.mjs';
import * as usersAdmin from './users-admin.mjs';
import { handleDatatablesQuery } from './datatables.mjs';
import { renderUsersListPage, renderUserAddPage, renderUserEditPage } from './users-admin-view.mjs';
import * as treeManagement from './tree-management.mjs';
import {
  renderManageTreesPage,
  renderCreateTreePage,
  renderMergeTreesPage,
  renderTreePreferencesPage,
  renderRenumberTreePage,
  renderTreePrivacyPage,
  renderCheckTreePage,
} from './tree-management-view.mjs';
import * as sitePreferences from './site-preferences.mjs';
import {
  renderGeneralPreferencesPage,
  renderRegistrationPreferencesPage,
  renderEmailPreferencesPage,
  renderSiteTagsPage,
} from './site-preferences-view.mjs';
import { buildGenealogyMenu } from './genealogy-menu.mjs';
import { renderGenealogyMenuNav } from './genealogy-menu-view.mjs';
import { renderMediaPage } from './media-view.mjs';
import { loadSubmitter, submitterCanShowRecord, displayableSubmitterFacts, submitterFactOtherAttributes } from './submitter.mjs';
import { renderSubmitterPage } from './submitter-view.mjs';
import { loadHeader, headerCanShowRecord, displayableHeaderFacts, headerFactOtherAttributes } from './header.mjs';
import { renderHeaderPage } from './header-view.mjs';
import { GedcomDate } from '../lib/gedcom-date.js';
import { renderFamilyPage } from './family-view.mjs';
import {
  loadFamily,
  loadRelatedFamilyXrefs,
  childrenXrefs,
  displayableFamilyFacts,
  familyCanShowRecord,
  numberOfChildren,
  getAllMarriageDates,
  getMarriageDate,
  hasMarriageFact,
  hasDivorceFact,
} from './family.mjs';
import { Age } from '../lib/age.js';
import {
  surnameData,
  allSurns,
  allSurnames,
  surnameInitials,
  givenNameInitials,
  familyXrefsForSurnames,
  resolveListRequest,
  needsGivenNameSublist,
  filterSurnamesForAlpha,
  computeSurnsToShow,
  loadFamilyListPrefs,
} from './family-list.mjs';
import { renderFamilyListPage, renderSurnamesTable, renderFamiliesTable } from './family-list-view.mjs';
import {
  numberOfChildren as individualNumberOfChildren,
  getEstimatedBirthDate,
  getEstimatedDeathDate,
  individualRowsForSurnames,
  loadShowEstimatedDatesPref,
} from './individual-list.mjs';
import { renderIndividualsTable } from './individual-list-view.mjs';
import { renderSourcePage } from './source-view.mjs';
import { renderRepositoryPage } from './repository-view.mjs';
import {
  loadSource,
  loadRepository,
  repoXrefs,
  displayableSourceFacts,
  sourceFactOtherAttributes,
  displayableRepositoryFacts,
  repositoryFactOtherAttributes,
  repositoryCanShowRecord,
  sourceCanShowRecord,
  loadRepositoryList,
  loadShowLastChangePref,
  repositorySourceCounts,
  recordLastChange,
  loadSourceList,
  sourceIndividualCounts,
  sourceFamilyCounts,
  sourceMediaCounts,
  sourceNoteCounts,
  firstFactPlainValue,
} from './source.mjs';
import { renderRepositoryListPage } from './repository-list-view.mjs';
import { renderSourceListPage } from './source-list-view.mjs';
import {
  loadNote,
  noteCanShowRecord,
  noteText,
  displayableNoteFacts,
  loadNoteList,
  noteIndividualCounts,
  noteFamilyCounts,
  noteMediaCounts,
  noteSourceCounts,
} from './note.mjs';
import { renderNoteListPage } from './note-list-view.mjs';
import { renderNotePage } from './note-view.mjs';
import {
  loadLocation,
  loadLocationList,
  locationIndividualCounts,
  locationFamilyCounts,
  locationCanShowRecord,
} from './location.mjs';
import { renderLocationListPage } from './location-list-view.mjs';
import { phpRouteUrl } from './route-url.mjs';
import { selectPreference } from './preferences.mjs';
import {
  loadOrCreateAnonymousSession,
  saveSession,
  regenerateSessionForLogin,
  sessionSetCookieHeader,
  sessionClearCookieHeader,
  findSessionCookieValue,
  newCsrfToken,
} from './session-store.mjs';
import { loadSetupLanguages } from '../setup-cli/languages.mjs';

const { Pool } = pg;

const PORT = Number(process.env.PORT) || 8092;

// This server has one hard dependency: a Postgres-backed install (see
// docs/php-to-js-migration/phase5-postgres-setup-cli.md). If
// data/config.yaml doesn't exist yet (setup-cli/ was never run) or
// isn't Postgres, don't crash-loop - a long-running server should
// degrade to a clear, static error response instead of exiting, since
// in docker-compose that just means every request hits a connection
// refused/502 from the proxy with no explanation. configError stays
// null once startup succeeds.
let configError = null;
let pool = null;
let siteUrlConfig = null;

try {
  // A long-lived server should pool connections, not open one per
  // request (unlike setup-cli/pg.mjs's one-shot Client - that's fine
  // for a CLI run, but this process handles concurrent requests for as
  // long as it's up).
  pool = new Pool(loadDbConfig());
  siteUrlConfig = loadSiteUrlConfig();
} catch (error) {
  configError = error.message;
  console.error('pages-server cannot start normally:', configError);
}

const CONTACT_METHODS = [
  ['messaging', 'Internal messaging'],
  ['messaging2', 'Internal messaging with emails'],
  ['messaging3', 'webtrees sends emails with no storage'],
  ['mailto', 'Mailto link'],
  ['none', 'No contact'],
];

const LANGUAGES = loadSetupLanguages().map((language) => [language.languageTag, language.endonym]);

// A real, non-guessed IANA time zone list (Node's own Intl data, not
// hand-maintained) - PHP's equivalent is DateTimeZone::listIdentifiers()
// (AccountEdit.php:70), also just the system's real IANA zone list, so
// this matches in spirit even though the two runtimes' exact IANA
// database versions could theoretically differ slightly.
const TIMEZONES = Intl.supportedValuesOf('timeZone').map((tz) => [tz, tz]);

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function clientIp(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
}

function isSecure(req) {
  return req.headers['x-forwarded-proto'] === 'https';
}

async function handleMyAccount(req, res) {
  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (user === null) {
    // Not logged in - same destination the PHP app itself redirects to.
    res.writeHead(302, { Location: '/login' });
    res.end();
    return;
  }

  if (req.method === 'GET') {
    const csrfToken = generateCsrfToken();
    const html = renderAccountPage({
      user,
      contactMethods: CONTACT_METHODS,
      languages: LANGUAGES,
      timezones: TIMEZONES,
      csrfToken,
      message: null,
    });

    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'set-cookie': csrfSetCookieHeader(csrfToken),
    });
    res.end(html);
    return;
  }

  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);
    const cookies = parseCookies(req.headers.cookie);

    if (!isValidCsrf(cookies, formData.get('_csrf'))) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('This form has expired. Please reload the page and try again.');
      return;
    }

    const { errors } = await updateAccount(pool, user, formData);
    const refreshedUser = await getCurrentUser(req.headers.cookie, pool);
    const csrfToken = generateCsrfToken();

    const message =
      errors.length > 0
        ? { status: 'danger', text: errors.join(' ') }
        : { status: 'success', text: `The details for “${refreshedUser.userName}” have been updated.` };

    const html = renderAccountPage({
      user: refreshedUser,
      contactMethods: CONTACT_METHODS,
      languages: LANGUAGES,
      timezones: TIMEZONES,
      csrfToken,
      message,
    });

    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'set-cookie': csrfSetCookieHeader(csrfToken),
    });
    res.end(html);
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

async function canRegisterUsers() {
  const result = await pool.query("SELECT setting_value FROM wt_site_setting WHERE setting_name = 'USE_REGISTRATION_MODULE'");

  return result.rows[0]?.setting_value === '1';
}

async function handleLogin(req, res, url) {
  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (user !== null) {
    // Already logged in - PHP redirects to a tree-scoped UserPage; the
    // no-tree variant here just goes home (same simplification as
    // /my-account's own scope).
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  const ip = clientIp(req);

  if (req.method === 'GET') {
    const { sessionId, session, isNew } = await loadOrCreateAnonymousSession(req.headers.cookie, ip, pool);

    let tokenJustWritten = false;

    if (typeof session.CSRF_TOKEN !== 'string') {
      // Mirrors Session::getCsrfToken()'s lazy-generate-and-save
      // behavior, which fires even on a GET.
      session.CSRF_TOKEN = newCsrfToken();
      tokenJustWritten = true;
    }

    if (!isNew && tokenJustWritten) {
      await saveSession(sessionId, session, pool);
    }

    const urlParam = url.searchParams.get('url');
    const targetUrl = isLocalPath(urlParam) ? urlParam : '/';
    const username = url.searchParams.get('username') ?? '';
    const canRegister = await canRegisterUsers();

    const html = renderLoginPage({ csrfToken: session.CSRF_TOKEN, url: targetUrl, username, canRegister, error: null });

    const headers = { 'content-type': 'text/html; charset=utf-8' };

    if (isNew || tokenJustWritten) {
      headers['set-cookie'] = sessionSetCookieHeader(isSecure(req), sessionId);
    }

    res.writeHead(200, headers);
    res.end(html);
    return;
  }

  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);

    const { sessionId, session, isNew } = await loadOrCreateAnonymousSession(req.headers.cookie, ip, pool);

    const urlParam = formData.get('url');
    const targetUrl = isLocalPath(urlParam) ? urlParam : '/';
    const username = formData.get('username') ?? '';
    const canRegister = await canRegisterUsers();

    if (formData.get('_csrf') !== session.CSRF_TOKEN) {
      const html = renderLoginPage({
        csrfToken: session.CSRF_TOKEN,
        url: targetUrl,
        username,
        canRegister,
        error: 'This form has expired. Try again.',
      });

      const headers = { 'content-type': 'text/html; charset=utf-8' };

      if (isNew) {
        headers['set-cookie'] = sessionSetCookieHeader(isSecure(req), sessionId);
      }

      res.writeHead(200, headers);
      res.end(html);
      return;
    }

    const password = formData.get('password') ?? '';
    const result = await doLogin(pool, { username, password, clientIp: ip, cookiesPresent: !isNew });

    if (!result.ok) {
      const html = renderLoginPage({ csrfToken: session.CSRF_TOKEN, url: targetUrl, username, canRegister, error: result.message });

      const headers = { 'content-type': 'text/html; charset=utf-8' };

      if (isNew) {
        headers['set-cookie'] = sessionSetCookieHeader(isSecure(req), sessionId);
      }

      res.writeHead(200, headers);
      res.end(html);
      return;
    }

    session.language = result.language;
    session.theme = result.theme;

    const { newSessionId } = await regenerateSessionForLogin(session, result.userId, ip, pool);

    res.writeHead(302, {
      Location: targetUrl,
      'set-cookie': sessionSetCookieHeader(isSecure(req), newSessionId),
    });
    res.end();
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // No CSRF check here, matching PHP: app/Http/Middleware/CheckCsrf.php
  // explicitly excludes Logout::class from its check.

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const cookies = parseCookies(req.headers.cookie);
  const sessionId = findSessionCookieValue(cookies);

  const destroyed = await doLogout(pool, { sessionId, user, clientIp: clientIp(req) });

  const headers = {};

  if (destroyed) {
    headers['set-cookie'] = sessionClearCookieHeader(isSecure(req));
  }

  if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  res.writeHead(302, { ...headers, Location: '/' });
  res.end();
}

async function handleAccountDelete(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (user === null) {
    // Matches AccountDelete.php's own unconditional redirect - even
    // when not logged in, it just redirects (to a page that will
    // itself redirect to /login), no error.
    res.writeHead(302, { Location: '/my-account' });
    res.end();
    return;
  }

  // resources/js/webtrees/http.js's httpPost() sends an empty body and
  // only the X-CSRF-TOKEN header for this kind of no-payload action
  // (same as "Sign out") - check the header, not a form field.
  const cookies = parseCookies(req.headers.cookie);

  if (!isValidCsrf(cookies, req.headers['x-csrf-token'])) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('This form has expired. Please reload the page and try again.');
    return;
  }

  // Matches AccountEdit.php/AccountDelete.php's own admin guard
  // exactly - an administrator can only be deleted by another
  // administrator, never through this self-service route. The UI
  // never even renders the delete link for an admin
  // (account-view.mjs's showDeleteOption), so this is a silent no-op
  // here too, matching PHP - only reachable by bypassing the UI.
  if (user.settings.canadmin === '1') {
    res.writeHead(302, { Location: '/my-account' });
    res.end();
    return;
  }

  try {
    await deleteAccount(pool, user.userId);
  } catch (error) {
    console.error('Failed to delete account:', error);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('Something went wrong deleting your account. Nothing was changed - please try again.');
    return;
  }

  // The account and every one of its sessions (including this one)
  // are gone - clear the cookie rather than leaving the browser
  // holding a reference to a now-nonexistent session.
  res.writeHead(302, {
    Location: '/my-account',
    'set-cookie': sessionClearCookieHeader(isSecure(req)),
  });
  res.end();
}

function redirectToPhp(res, path) {
  res.writeHead(302, { Location: phpRouteUrl(path, siteUrlConfig) });
  res.end();
}

async function handleHomePage(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    const defaultResult = await pool.query("SELECT setting_value FROM wt_site_setting WHERE setting_name = 'DEFAULT_GEDCOM'");
    const defaultGedcomName = defaultResult.rows[0]?.setting_value ?? '';

    const trees = await accessibleTrees(pool, { userId, isAdmin });

    tree = trees.find((t) => t.name === defaultGedcomName) ?? trees[0] ?? null;
  } catch (error) {
    console.error('Failed to look up trees:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree !== null) {
    if (tree.imported) {
      if (user !== null) {
        redirectToPhp(res, `/tree/${tree.name}/my-page`);
      } else {
        redirectToPhp(res, `/tree/${tree.name}`);
      }
      return;
    }

    const manager = await isTreeManager(pool, { gedcomId: tree.gedcomId, userId, isAdmin });

    if (manager) {
      redirectToPhp(res, `/trees/manage/${tree.name}`);
      return;
    }
  }

  // No tree available.
  if (isAdmin) {
    redirectToPhp(res, '/trees/create');
    return;
  }

  if (user !== null) {
    // Logged in, but no access to any tree.
    const csrfToken = generateCsrfToken();

    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'set-cookie': csrfSetCookieHeader(csrfToken),
    });
    res.end(renderNoTreeAccessPage({ user, csrfToken }));
    return;
  }

  // Not logged in - /login is already a Node route, so redirect there
  // directly rather than building a PHP ugly-URL for it. PHP's own
  // target here is route(LoginPage::class, ['url' => '']) - an empty
  // "url" fails LoginPage's own isLocalUrl() validation and falls back
  // to its default (home), the same effective behavior as omitting the
  // param entirely, which is what Node's own /login GET handler does
  // too (isLocalPath('') is false - see login-view.mjs).
  res.writeHead(302, { Location: '/login' });
  res.end();
}

async function handleSelectPreference(req, res, field, value) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // No CSRF check, matching PHP: app/Http/Middleware/CheckCsrf.php
  // excludes both SelectLanguage::class and SelectTheme::class.

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const { sessionId, session, isNew } = await loadOrCreateAnonymousSession(req.headers.cookie, clientIp(req), pool);

  try {
    await selectPreference(pool, { field, value, session, user });
  } catch (error) {
    console.error(`Failed to save ${field} preference:`, error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  await saveSession(sessionId, session, pool);

  const headers = {};

  if (isNew) {
    headers['set-cookie'] = sessionSetCookieHeader(isSecure(req), sessionId);
  }

  res.writeHead(200, headers);
  res.end();
}

async function handleTreePage(req, res, treeName) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    // Matches app/Http/RequestHandlers/NotFound.php's own behavior for
    // a GET on a route carrying an unresolved {tree} attribute -
    // confirmed live against the real PHP app: a nonexistent (or
    // inaccessible) tree name redirects home, it doesn't 404. PHP
    // makes no distinction between "no such tree" and "tree exists but
    // isn't accessible to this viewer" - accessibleTreeByName() above
    // doesn't either, matching that exactly.
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let welcomeBlock = null;

  try {
    const level = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const blockId = await findVisibleWelcomeBlockId(pool, { gedcomId: tree.gedcomId, viewerAccessLevel: level });

    if (blockId !== null) {
      const xref = await significantIndividualXref(pool, tree, { userId });

      if (xref !== null) {
        const links = [{ url: phpRouteUrl(`/tree/${tree.name}/individual/${xref}`, siteUrlConfig), title: 'Default individual', iconClass: 'icon-indis' }];

        if (user === null && (await canRegisterUsers())) {
          links.push({
            url: phpRouteUrl(`/register/${tree.name}`, siteUrlConfig),
            title: 'Request a new user account',
            iconClass: 'icon-user_add',
          });
        }

        welcomeBlock = { blockId, links };
      }
    }
  } catch (error) {
    console.error('Failed to build the welcome block:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderTreePage({ tree, user, csrfToken, welcomeBlock, genealogyMenuHtml });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
}

// The individual's own event/attribute facts this route renders -
// widened from the original BIRT/DEAT-only v1 scope after the user's
// real imported tree turned out to have plenty of RESI/CENS/IMMI/EVEN
// facts that were silently invisible (same class of gap already found
// and fixed for FamilyPage's own facts table). Deliberately still an
// ALLOWLIST, not "everything except a few structural tags" the way
// FamilyPage's filter is - unlike FamilyPage, real PHP routes several
// individual-level tags to OTHER tabs entirely (NAME/SEX to the page
// header itself; OBJE to MediaTabModule; NOTE to NotesTabModule; SOUR
// to SourcesTabModule; FAMC/FAMS to RelativesTabModule, now partially
// covered by this page's own "Families" section) - none of those have
// a sensible date+place-shaped rendering, so a denylist approach here
// would show them as broken-looking empty rows instead of omitting
// them, unlike FamilyPage where the excluded set really is just
// HUSB/WIFE/CHIL. Every label verified against app/Gedcom.php's real
// 'INDI:TAG' element definitions, not guessed.
const VITAL_FACT_TAGS = [
  'BIRT',
  'CHR',
  'BAPM',
  'CHRA',
  'CONF',
  'FCOM',
  'BARM',
  'BASM',
  'BLES',
  'ADOP',
  'NATU',
  'EMIG',
  'IMMI',
  'CENS',
  'PROB',
  'WILL',
  'GRAD',
  'RETI',
  'DEAT',
  'BURI',
  'CREM',
  'RESI',
  'EVEN',
  'OCCU',
  'EDUC',
  'DSCR',
  'NATI',
  'RELI',
  'TITL',
  'CAST',
  'NMR',
];
// IDNO/SSN/CHAN moved to the "Extra information" sidebar (phase 5 step
// 14b) - matches real PHP's own exclusion mechanism exactly:
// IndividualFactsTabModule excludes every tag any enabled sidebar's
// own supportedFacts() claims (app/Module/IndividualFactsTabModule.php:
// 84-98), and IndividualMetadataModule's supportedFacts() includes all
// three (app/Module/IndividualMetadataModule.php:38-53,97-100) - so
// real PHP never shows them on the main Facts tab either.

/**
 * Resolved media files -> real signed thumbnail URLs (200x260 crop,
 * 2x/3x/4x srcset) - shared by the photo box (step 14a) and the
 * Media/Album tabs (step 14c), since both need the exact same
 * signature-building call, just for a different set of source images.
 * Skips the glide-key lookup entirely when there's nothing to sign.
 *
 * @param {{mediaXref: string, factId: string}[]} imageFiles
 * @param {{name: string}} tree
 * @param {number} accessLevel
 * @param {{showNoWatermark: number}} treePrivacyPrefs
 * @param {string} altText
 * @returns {Promise<{thumbnailUrl: string, srcset: string, alt: string}[]>}
 */
async function buildThumbnails(imageFiles, tree, accessLevel, treePrivacyPrefs, altText) {
  if (imageFiles.length === 0) {
    return [];
  }

  const glideKey = await loadGlideKey(pool);
  const watermark = needsWatermark(accessLevel, treePrivacyPrefs.showNoWatermark);

  return imageFiles.map((file) => {
    const baseParams = { xref: file.mediaXref, treeName: tree.name, factId: file.factId, fit: 'crop', needsWatermark: watermark };

    return {
      thumbnailUrl: mediaThumbnailUrl({ ...baseParams, width: 200, height: 260 }, glideKey, siteUrlConfig),
      srcset: [2, 3, 4]
        .map((density) => `${mediaThumbnailUrl({ ...baseParams, width: 200 * density, height: 260 * density }, glideKey, siteUrlConfig)} ${density}x`)
        .join(','),
      alt: altText,
    };
  });
}

async function handleIndividualPage(req, res, treeName, xref) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    // Same "tree doesn't exist or isn't accessible" 302-to-home
    // behavior as handleTreePage() - PHP makes no distinction here either.
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let individual;
  let facts;
  let treePrivacyPrefs;
  let accessLevel;
  let relPrefs;
  let defaultResnInfo;
  let dead;
  let shown;

  try {
    individual = await loadIndividual(pool, tree.gedcomId, xref);

    if (individual === null) {
      // Distinct from the tree-not-found case above: this mirrors
      // Auth::checkIndividualAccess()'s HttpNotFoundException (404),
      // not a redirect - a nonexistent xref within a real, accessible
      // tree is a genuinely different situation from a bad tree name.
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    facts = parseFacts(individual.gedcom);
    treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
    accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, individual.xref);

    const viewer = {
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === individual.xref,
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead,
      relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
    };
    const treeForPrivacy = {
      hideLivePeople: treePrivacyPrefs.hideLivePeople,
      defaultResn: defaultResnInfo.individualResn,
      keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
      keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
    };

    shown = canShowRecord(treeForPrivacy, individual.gedcom, facts, viewer);
  } catch (error) {
    console.error('Failed to resolve individual privacy:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (!shown) {
    // Mirrors Auth::checkIndividualAccess()'s HttpAccessDeniedException (403).
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // "Families" tab (phase 5 step 14c - docs/php-to-js-migration/
  // phase5-individual-page-full.md): real per-member cards + the
  // family's own vital facts, upgraded from step 11's flat link list.
  // Mirrors RelativesTabModule's parent_families/spouse_families
  // (app/Module/RelativesTabModule.php:61-71) - no step-families
  // (adoption-driven second parent/spouse sets,
  // app/Individual.php's spouseStepFamilies()/childStepFamilies(), a
  // rarer relationship type this v1 doesn't chase), no
  // SHOW_PRIVATE_RELATIONSHIPS bypass, no edit affordances (add/
  // reorder - modules/relatives/tab.phtml's own `can_edit` block, same
  // "no editing capability yet" cut already made everywhere else).
  let familiesTab;
  let parentFamilyXrefs;
  let spouseFamilyXrefs;

  try {
    const relatedFamilyXrefs = await loadRelatedFamilyXrefs(pool, tree.gedcomId, individual.xref);

    parentFamilyXrefs = relatedFamilyXrefs.parentFamilies;
    spouseFamilyXrefs = relatedFamilyXrefs.spouseFamilies;

    const parentFamilies = [];
    for (const familyXref of parentFamilyXrefs) {
      const family = await resolveFamiliesTabFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref, 'Parents');
      if (family !== null) {
        parentFamilies.push(family);
      }
    }

    const spouseFamilies = [];
    for (const familyXref of spouseFamilyXrefs) {
      const family = await resolveFamiliesTabFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref, 'Spouse family');
      if (family !== null) {
        spouseFamilies.push(family);
      }
    }

    familiesTab = { parentFamilies, spouseFamilies };
  } catch (error) {
    console.error('Failed to resolve related families:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const primaryName = extractPrimaryName(individual.gedcom);
  // Fallback for the rare individual with zero NAME facts - PHP has its
  // own "Private"/no-name display fallback via fullName(); this v1 slice
  // just falls back to the xref itself. GEDCOM xrefs are always plain
  // alphanumeric identifiers (never contain HTML metacharacters), so
  // embedding it directly here is safe without a separate escape step.
  const fullNameHtml = primaryName !== null ? primaryName.full : `<span class="NAME" dir="auto" translate="no">${individual.xref}</span>`;

  // Photo box (phase 5 step 14a - docs/php-to-js-migration/phase5-individual-page-full.md).
  // Mirrors IndividualPage::handle()'s own inline OBJE-fact resolution:
  // only DIRECT `1 OBJE` facts on this individual (not family-linked
  // media), each privacy-filtered the same way every other fact here
  // is (factCanShow()), matching real PHP's facts(['OBJE']) which
  // applies the same per-fact canShow() check internally.
  let photoImages;

  try {
    const objeFacts = facts.filter((fact) => {
      const tag = /^1 (\S+)/.exec(fact)?.[1];

      if (tag !== 'OBJE') {
        return false;
      }

      const resolvedDefaultResn = defaultResnInfo.factResn.get(tag) ?? defaultResnInfo.treeFactResn.get(tag) ?? null;

      return factCanShow(fact, accessLevel, resolvedDefaultResn);
    });
    const imageFiles = await loadFactsMedia(pool, tree.gedcomId, objeFacts);

    photoImages = await buildThumbnails(imageFiles, tree, accessLevel, treePrivacyPrefs, fullNameHtml.replace(/<[^>]*>/g, ''));
  } catch (error) {
    console.error('Failed to resolve individual media:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const names = extractAllNameFacts(individual.gedcom, 'NAME').map((name) => ({
    full: name.full,
    rawValue: name.rawValue,
    gedcom: name.gedcom,
    subAttributes: nameSubTagAttributes(name.gedcom),
  }));

  const birthDate = getBirthDate(facts);
  const deathDate = getDeathDate(facts);
  const individualSex = sex(individual.gedcom);

  const ownFacts = facts.filter((fact) => VITAL_FACT_TAGS.includes(/^1 (\S+)/.exec(fact)?.[1]));
  const visibleFacts = extractVisibleFacts(ownFacts, defaultResnInfo, accessLevel);

  // Mirrors IndividualFactsTabModule's own merge of individualFacts()
  // with familyFacts() (app/Services/IndividualFactsService.php) -
  // reported live: Miron Ophir's own page was missing his Marriage/
  // Family residence facts, both of which live on his FAMILY record
  // (F000001), not his own. See familyFactsForIndividual()'s doc
  // comment for what's ported vs. simplified (year-only sort, no
  // relativeFacts()/associateFacts()/historicFacts()).
  try {
    const familyFacts = await familyFactsForIndividual(tree, treePrivacyPrefs, accessLevel, relPrefs, spouseFamilyXrefs);

    visibleFacts.push(...familyFacts);
    visibleFacts.sort((a, b) => a.sortYear - b.sortYear);
  } catch (error) {
    console.error('Failed to resolve family facts for individual:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  // "Extra information" sidebar (phase 5 step 14b) - mirrors
  // IndividualMetadataModule's own tag set, reusing the SAME extraction
  // used for the main Facts tab (now that these tags are excluded from
  // VITAL_FACT_TAGS - see that const's own doc comment).
  const extraInfoOwnFacts = facts.filter((fact) => EXTRA_INFO_TAGS.includes(/^1 (\S+)/.exec(fact)?.[1]));
  const extraInformationFacts = extractVisibleFacts(extraInfoOwnFacts, defaultResnInfo, accessLevel).map((fact) => ({
    ...fact,
    isExtraInfo: true,
  }));

  // "Family navigator" sidebar (phase 5 step 14b) - father/mother/
  // himself/siblings for each parent family, husband/wife/himself/
  // children for each spouse family, reusing the exact same family
  // load/privacy chain as the Families tab and the family-facts merge
  // above (resolveShownFamily()), just with per-member relationship
  // rows instead of a flat link or extracted facts.
  const individualBirthYear = birthDate && birthDate.date.isOK() ? birthDate.date.minimumDate().yearValue() : null;
  let familyNavigator;

  try {
    const navigatorParentFamilies = [];

    for (const familyXref of parentFamilyXrefs) {
      const family = await resolveFamilyNavigatorFamily(
        tree,
        treePrivacyPrefs,
        accessLevel,
        relPrefs,
        familyXref,
        'parent',
        individual.xref,
        individualBirthYear,
      );

      if (family !== null) {
        navigatorParentFamilies.push(family);
      }
    }

    const navigatorSpouseFamilies = [];

    for (const familyXref of spouseFamilyXrefs) {
      const family = await resolveFamilyNavigatorFamily(
        tree,
        treePrivacyPrefs,
        accessLevel,
        relPrefs,
        familyXref,
        'spouse',
        individual.xref,
        individualBirthYear,
      );

      if (family !== null) {
        navigatorSpouseFamilies.push(family);
      }
    }

    familyNavigator = { parentFamilies: navigatorParentFamilies, spouseFamilies: navigatorSpouseFamilies };
  } catch (error) {
    console.error('Failed to resolve family navigator:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  // Sources/Notes/Media/Album tabs (phase 5 step 14c) - all four share
  // the same "own facts + every showable spouse family's own facts"
  // base pool (see ownAndSpouseFamilyShowableFacts()'s own doc comment).
  let sourcesTab;
  let notesTab;
  let mediaImages;

  try {
    const factPairs = await ownAndSpouseFamilyShowableFacts(
      tree,
      treePrivacyPrefs,
      accessLevel,
      relPrefs,
      facts,
      defaultResnInfo,
      spouseFamilyXrefs,
    );

    sourcesTab = await sourcesTabItems(tree, treePrivacyPrefs, accessLevel, factPairs);
    notesTab = await notesTabItems(tree, treePrivacyPrefs, accessLevel, relPrefs, factPairs);

    const mediaFiles = await loadFactsMedia(
      pool,
      tree.gedcomId,
      factPairs.map(({ fact }) => fact),
    );

    mediaImages = await buildThumbnails(mediaFiles, tree, accessLevel, treePrivacyPrefs, fullNameHtml.replace(/<[^>]*>/g, ''));
  } catch (error) {
    console.error('Failed to resolve sources/notes/media tabs:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const individualViewModel = {
    xref: individual.xref,
    fullNameHtml,
    lifespan: lifespan({ birthDate, deathDate, isDead: dead }),
    age: ageString({ birthDate, deathDate, isDead: dead, sex: individualSex }),
    sex: individualSex,
    sexValueLabel: sexLabel(individualSex),
    photoImages,
    useSilhouette: treePrivacyPrefs.useSilhouette,
    names,
    facts: visibleFacts,
    extraInformationFacts,
    familyNavigator,
    familiesTab,
    sourcesTab,
    notesTab,
    mediaImages,
  };

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: xref }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderIndividualPage({ tree, user, csrfToken, individual: individualViewModel, genealogyMenuHtml });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
}

/**
 * Resolves one family member (husband/wife/child) to everything a
 * card needs to render, or null if the xref doesn't resolve to a real
 * individual - matching how PHP's own husband()/wife()/children()
 * silently drop a broken/missing reference rather than erroring, and
 * how Family::canShowByType()'s member-privacy scan only ever checks
 * xrefs that resolve to a real Individual (app/Family.php:121-128).
 */
async function resolveFamilyMember(tree, treePrivacyPrefs, accessLevel, relPrefs, xref) {
  if (xref === null) {
    return null;
  }

  const individual = await loadIndividual(pool, tree.gedcomId, xref);

  if (individual === null) {
    return null;
  }

  const facts = parseFacts(individual.gedcom);
  const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
  const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, individual.xref);
  const viewer = {
    accessLevel,
    isSelfRecord: relPrefs.gedcomid === individual.xref,
    showDeadPeople: treePrivacyPrefs.showDeadPeople,
    dead,
    relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
  };
  const treeForPrivacy = {
    hideLivePeople: treePrivacyPrefs.hideLivePeople,
    defaultResn: defaultResnInfo.individualResn,
    keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
    keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
    // Only read by canShowName() below - canShowRecord() never looks at it.
    showLivingNames: treePrivacyPrefs.showLivingNames,
  };
  const canShow = canShowRecord(treeForPrivacy, individual.gedcom, facts, viewer);
  // Mirrors Family::husband()/wife()'s own weaker gate
  // (app/Family.php:86-113): a living individual's NAME can be shown
  // even when canShow (canShowRecord) is false, per SHOW_LIVING_NAMES -
  // used by FamilyListModule's families-table row rendering, which
  // calls husband()/wife() directly, not the full-record gate.
  const canShowNameOnly = canShowName(treeForPrivacy, individual.gedcom, facts, viewer);

  return { individual, facts, dead, canShow, canShowNameOnly };
}

/**
 * Matches chart-box.phtml's "wt-chart-box-facts" line (a single
 * BIRT-or-equivalent-event summary, `app/Http/RequestHandlers's real
 * chart-box view: "Show BIRT or equivalent event"`) - simplified to
 * plain date+place text, no icon, no CHART_BOX_TAGS-driven optional
 * events, no relative-age-at-event numbers (those need the PARENTS'
 * own ages too, a further scope cut).
 */
function birthSummary(birthDate) {
  if (!birthDate) {
    return '';
  }

  const displayedDate = displayDate(birthDate.date);

  return birthDate.place ? `Birth: ${displayedDate}, ${birthDate.place}` : `Birth: ${displayedDate}`;
}

function familyMemberViewModel(tree, member) {
  if (member === null) {
    return null;
  }

  const primaryName = extractPrimaryName(member.individual.gedcom);
  const fullNameHtml =
    primaryName !== null ? primaryName.full : `<span class="NAME" dir="auto" translate="no">${member.individual.xref}</span>`;
  const birthDate = getBirthDate(member.facts);

  return {
    fullNameHtml,
    sex: sex(member.individual.gedcom),
    birthSummary: birthSummary(birthDate),
    url: `/tree/${tree.name}/individual/${member.individual.xref}`,
  };
}

const UNKNOWN_NAME_HTML = '<span class="NAME" dir="auto" translate="no">…</span>';

/**
 * Resolves ONE family (a parent family or a spouse family, from
 * loadRelatedFamilyXrefs()) fully - every member plus the family's own
 * privacy gate - or null if the family shouldn't be shown to this
 * viewer at all, matching how Individual::childFamilies()/
 * spouseFamilies() themselves already filter via canShow() internally
 * (app/GedcomRecord.php's target resolution), not something
 * IndividualPage/FamilyPage do separately in PHP. Shared by
 * resolveFamiliesTabFamily() (IndividualPage's own "Families" tab),
 * resolveFamilyNavigatorFamily() (the Family navigator sidebar), and
 * familyFactsForIndividual() (the individual's OWN Facts tab, which
 * merges in facts from every showable spouse family - see that
 * function's own doc comment) so all three reuse the SAME single
 * family load/member-resolution/privacy computation rather than each
 * querying separately (a known, accepted redundancy across sections of
 * the same page request, not eliminated by a page-level cache here).
 */
async function resolveShownFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref) {
  const family = await loadFamily(pool, tree.gedcomId, familyXref);

  if (family === null) {
    return null;
  }

  const facts = parseFacts(family.gedcom);
  const husband = await resolveFamilyMember(tree, treePrivacyPrefs, accessLevel, relPrefs, family.husb);
  const wife = await resolveFamilyMember(tree, treePrivacyPrefs, accessLevel, relPrefs, family.wife);
  const children = [];

  for (const childXref of childrenXrefs(facts)) {
    children.push(await resolveFamilyMember(tree, treePrivacyPrefs, accessLevel, relPrefs, childXref));
  }

  const memberCanShowResults = [husband, wife, ...children].filter((member) => member !== null).map((member) => member.canShow);
  const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, family.xref);
  const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
  const familyViewer = { accessLevel, isSelfRecord: false };

  if (!familyCanShowRecord(treeForPrivacy, family.gedcom, familyViewer, memberCanShowResults)) {
    return null;
  }

  return { family, facts, husband, wife, children, defaultResnInfo };
}

/**
 * Resolves one linked source's own showability, including its own REPO
 * citation cascade - the same logic handleSourcePage() applies to the
 * page's own subject source, factored out so NotePage's/the Notes tab's
 * linked-record check can reuse it for a SOUR-type link without
 * duplicating the repo cascade.
 */
async function linkedSourceCanShow(tree, treePrivacyPrefs, accessLevel, xref) {
  const source = await loadSource(pool, tree.gedcomId, xref);

  if (source === null) {
    return true;
  }

  const facts = parseFacts(source.gedcom);
  const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, source.xref);
  const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
  const sourceViewer = { accessLevel, isSelfRecord: false };
  const repoCanShowResults = [];

  for (const repoXref of repoXrefs(facts)) {
    const repository = await loadRepository(pool, tree.gedcomId, repoXref);

    if (repository === null) {
      continue;
    }

    const repoDefaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, repository.xref);
    const repoTreeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: repoDefaultResnInfo.individualResn };

    repoCanShowResults.push(repositoryCanShowRecord(repoTreeForPrivacy, repository.gedcom, sourceViewer, repoDefaultResnInfo.treeFactResn));
  }

  return sourceCanShowRecord(treeForPrivacy, source.gedcom, sourceViewer, defaultResnInfo.treeFactResn, repoCanShowResults);
}

/**
 * Whether ONE record linking to a note/media object (a wt_link row's
 * `l_from`) is itself showable to this viewer - the real check behind
 * Note::canShowByType()/Media::canShowByType()'s own "hide if attached
 * to a private record" loop (app/Note.php:58-75, app/Media.php:41-58).
 * Dispatches by the linked record's OWN type (determined by which table
 * actually holds it, not by the wt_link row's l_type - that column is
 * the type of the LINK, e.g. always 'NOTE' for links pointing at a
 * note, not the linking record's own type).
 *
 * Individual/Family/Source/Repository get the real, full privacy check
 * (reusing the exact same machinery already built for their own pages).
 * Media gets its OWN base default privacy only (loadDefaultResn's
 * tree-wide OBJE resn, via mediaCanShowRecord() with
 * linkedRecordsShowable hardcoded true) - NOT its own further recursive
 * linked-record check, to avoid unbounded mutual-reference recursion
 * (a media object CAN itself carry a NOTE that references back to
 * something referencing the original media - not reachable in the real
 * tree's data, but not provably impossible either). Submitter/anything
 * else/a since-deleted record fall back to "showable" - real PHP's own
 * `$linked_record instanceof GedcomRecord` guard already does this for
 * a missing record, and this migration hasn't ported Submitter's
 * privacy chain at all - a deliberate, narrow scope cut, not an
 * oversight.
 */
async function linkedRecordCanShow(tree, treePrivacyPrefs, accessLevel, relPrefs, xref) {
  const typeResult = await pool.query(
    `SELECT 'INDI' AS rtype FROM wt_individuals WHERE i_id = $1 AND i_file = $2
     UNION ALL SELECT 'FAM' AS rtype FROM wt_families WHERE f_id = $1 AND f_file = $2
     UNION ALL SELECT o_type AS rtype FROM wt_other WHERE o_id = $1 AND o_file = $2
     UNION ALL SELECT 'OBJE' AS rtype FROM wt_media WHERE m_id = $1 AND m_file = $2
     LIMIT 1`,
    [xref, tree.gedcomId],
  );
  const rtype = typeResult.rows[0]?.rtype ?? null;

  if (rtype === 'INDI') {
    const member = await resolveFamilyMember(tree, treePrivacyPrefs, accessLevel, relPrefs, xref);
    return member === null || member.canShow;
  }

  if (rtype === 'FAM') {
    return (await resolveShownFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, xref)) !== null;
  }

  if (rtype === 'SOUR') {
    return linkedSourceCanShow(tree, treePrivacyPrefs, accessLevel, xref);
  }

  if (rtype === 'REPO') {
    const repository = await loadRepository(pool, tree.gedcomId, xref);

    if (repository === null) {
      return true;
    }

    const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, repository.xref);
    const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };

    return repositoryCanShowRecord(treeForPrivacy, repository.gedcom, { accessLevel, isSelfRecord: false }, defaultResnInfo.treeFactResn);
  }

  if (rtype === 'OBJE') {
    const media = await loadMedia(pool, tree.gedcomId, xref);

    if (media === null) {
      return true;
    }

    const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, media.xref);
    const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };

    return mediaCanShowRecord(treeForPrivacy, media.gedcom, { accessLevel, isSelfRecord: false }, defaultResnInfo.treeFactResn, true);
  }

  return true;
}

/**
 * Every record linking to a media object (via wt_link, l_type='OBJE')
 * must itself be showable for the media object to be showable - see
 * linkedRecordCanShow()'s own doc comment. Used by handleMediaPage()
 * itself (the full, real check for the media object's OWN privacy gate
 * - unlike linkedRecordCanShow()'s OBJE branch above, which
 * deliberately does NOT recurse into this).
 */
async function mediaLinkedRecordsShowable(tree, treePrivacyPrefs, accessLevel, relPrefs, mediaXref) {
  const linkResult = await pool.query("SELECT l_from FROM wt_link WHERE l_to = $1 AND l_file = $2 AND l_type = 'OBJE'", [
    mediaXref,
    tree.gedcomId,
  ]);

  for (const row of linkResult.rows) {
    if (!(await linkedRecordCanShow(tree, treePrivacyPrefs, accessLevel, relPrefs, row.l_from))) {
      return false;
    }
  }

  return true;
}

/**
 * Every record linking to a note (via wt_link, l_type='NOTE') must
 * itself be showable for the note to be showable - see
 * linkedRecordCanShow()'s own doc comment.
 */
async function noteLinkedRecordsShowable(tree, treePrivacyPrefs, accessLevel, relPrefs, noteXref) {
  const linkResult = await pool.query("SELECT l_from FROM wt_link WHERE l_to = $1 AND l_file = $2 AND l_type = 'NOTE'", [
    noteXref,
    tree.gedcomId,
  ]);

  for (const row of linkResult.rows) {
    if (!(await linkedRecordCanShow(tree, treePrivacyPrefs, accessLevel, relPrefs, row.l_from))) {
      return false;
    }
  }

  return true;
}

/**
 * The Families tab's own per-family entry (phase 5 step 14c) - real
 * member cards (reusing familyMemberViewModel(), the exact shape
 * already built for FamilyPage's own husband/wife/children cards) plus
 * the family's own displayable facts (MARR/RESI/etc, the exact same
 * extraction already shared with FamilyPage and the Facts-tab merge) -
 * upgraded from step 11's flat "husband + wife" link summary.
 *
 * @param {string} label 'Parents' or 'Spouse family' - matches the
 *   labels already used by the Family navigator sidebar and (before
 *   this step) the flat list this replaces; real PHP computes a
 *   fuller label via Individual::getChildFamilyLabel()/
 *   getSpouseFamilyLabel() (e.g. distinguishing "Adoptive parents"),
 *   not ported - same "small hardcoded set, not the full label engine"
 *   cut as the Family navigator's own relationship labels.
 */
async function resolveFamiliesTabFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref, label) {
  const shown = await resolveShownFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref);

  if (shown === null) {
    return null;
  }

  const facts = extractVisibleFacts(displayableFamilyFacts(shown.facts), shown.defaultResnInfo, accessLevel);

  return {
    label,
    url: `/tree/${tree.name}/family/${shown.family.xref}`,
    husband: familyMemberViewModel(tree, shown.husband),
    wife: familyMemberViewModel(tree, shown.wife),
    children: shown.children.map((child) => familyMemberViewModel(tree, child)).filter((child) => child !== null),
    facts,
  };
}

/**
 * @param {{individual: {xref: string, gedcom: string}, facts: string[], dead: boolean}|null} member
 * @returns {number|null}
 */
function memberBirthYear(member) {
  if (member === null) {
    return null;
  }

  const birthDate = getBirthDate(member.facts);

  return birthDate && birthDate.date.isOK() ? birthDate.date.minimumDate().yearValue() : null;
}

/**
 * One row of the Family navigator sidebar (phase 5 step 14b - see
 * docs/php-to-js-migration/phase5-individual-page-full.md) - a single
 * resolved family member, with a relationship label chosen from the
 * small hardcoded set in individual.mjs (father/mother/husband/wife/
 * son/daughter/sibling, "you are here" for the page's own subject).
 *
 * @param {object} tree
 * @param {{individual: {xref: string, gedcom: string}, facts: string[], dead: boolean}|null} member
 * @param {string} individualXref the page's own subject - marks the "you are here" row
 * @param {number|null} individualBirthYear needed only for sibling rows' elder/younger prefix
 * @param {'parent'|'spouse'} kind which family type this member belongs to
 * @param {'parent'|'child'} cssRowType matches wt-family-navigator-parent/child
 * @returns {object|null}
 */
function familyNavigatorRow(tree, member, individualXref, individualBirthYear, kind, cssRowType) {
  if (member === null) {
    return null;
  }

  const memberSex = sex(member.individual.gedcom);
  const isSelf = member.individual.xref === individualXref;

  let label;

  if (isSelf) {
    label = selfRelationshipLabel(memberSex);
  } else if (cssRowType === 'parent') {
    label = kind === 'parent' ? parentRelationshipLabel(memberSex) : spouseRelationshipLabel(memberSex);
  } else {
    label = kind === 'parent' ? siblingRelationshipLabel(memberSex, individualBirthYear, memberBirthYear(member)) : childRelationshipLabel(memberSex);
  }

  const primaryName = extractPrimaryName(member.individual.gedcom);
  const fullNameHtml =
    primaryName !== null ? primaryName.full : `<span class="NAME" dir="auto" translate="no">${member.individual.xref}</span>`;
  const birthDate = getBirthDate(member.facts);
  const deathDate = getDeathDate(member.facts);

  return {
    label,
    isSelf,
    fullNameHtml,
    lifespanText: lifespan({ birthDate, deathDate, isDead: member.dead }),
    url: `/tree/${tree.name}/individual/${member.individual.xref}`,
    sex: memberSex,
    rowType: cssRowType,
  };
}

/**
 * One family's full Family navigator entry - reuses resolveShownFamily()
 * (the same single family load/member-resolution/privacy computation
 * shared with resolveFamilySummary() and familyFactsForIndividual()).
 *
 * @returns {Promise<{titleHtml: string, url: string, rows: object[]}|null>}
 */
async function resolveFamilyNavigatorFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref, kind, individualXref, individualBirthYear) {
  const shown = await resolveShownFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref);

  if (shown === null) {
    return null;
  }

  const husbandVM = familyMemberViewModel(tree, shown.husband);
  const wifeVM = familyMemberViewModel(tree, shown.wife);
  const titleHtml = `${husbandVM !== null ? husbandVM.fullNameHtml : UNKNOWN_NAME_HTML} + ${wifeVM !== null ? wifeVM.fullNameHtml : UNKNOWN_NAME_HTML}`;

  const rows = [
    familyNavigatorRow(tree, shown.husband, individualXref, individualBirthYear, kind, 'parent'),
    familyNavigatorRow(tree, shown.wife, individualXref, individualBirthYear, kind, 'parent'),
    ...shown.children.map((child) => familyNavigatorRow(tree, child, individualXref, individualBirthYear, kind, 'child')),
  ].filter((row) => row !== null);

  return { titleHtml, url: `/tree/${tree.name}/family/${shown.family.xref}`, rows };
}

/**
 * Mirrors Fact::canShow()-filtered, date/time/place/address/author-
 * extracted fact rows - the exact shape renderFact() (individual-view.mjs/
 * family-view.mjs) already expects. Shared so handleFamilyPage()'s own
 * facts table and IndividualPage's Facts tab (both personal facts and,
 * now, merged-in family facts) don't each hand-roll the same
 * extraction loop three times.
 *
 * @param {string[]} facts already-filtered to the tags that should
 *   display (e.g. via displayableFamilyFacts() or a VITAL_FACT_TAGS check)
 * @param {{factResn: Map<string,string>, treeFactResn: Map<string,string>}} defaultResnInfo
 * @param {number} accessLevel
 * @returns {{tag: string, date: string, time: string, place: string, address: string, author: string, sortYear: number}[]}
 */
function extractVisibleFacts(facts, defaultResnInfo, accessLevel) {
  const visibleFacts = [];

  for (const fact of facts) {
    const tag = /^1 (\S+)/.exec(fact)?.[1];
    const resolvedDefaultResn = defaultResnInfo.factResn.get(tag) ?? defaultResnInfo.treeFactResn.get(tag) ?? null;

    if (!factCanShow(fact, accessLevel, resolvedDefaultResn)) {
      continue;
    }

    const dateMatch = /\n2 DATE (.+)/.exec(fact);
    const placeMatch = /\n2 PLAC (.+)/.exec(fact);
    const timeMatch = /\n3 TIME (.+)/.exec(fact);
    const addressMatch = /\n2 ADDR (.+)/.exec(fact);
    // CHAN's own author sub-tag (app/GedcomRecord.php's updateChange()
    // writes it as "2 _WT_USER <username>") - only ever meaningful on
    // a CHAN fact, harmless to extract unconditionally elsewhere since
    // no other tag carries it.
    const authorMatch = /\n2 _WT_USER (.+)/.exec(fact);
    const gedcomDate = dateMatch ? new GedcomDate(dateMatch[1]) : null;

    visibleFacts.push({
      tag,
      // Most date/place-shaped events (BIRT, RESI, CHAN, ...) have no
      // meaningful text on their own "1 TAG" line - factPlainValue()
      // correctly returns '' for those (renderFact() already treats an
      // empty value as "nothing to render"). Populated unconditionally
      // so the SAME extraction serves both event-shaped facts and
      // plain-value ones (Extra information's AFN/REFN/RIN/SSN/...).
      value: factPlainValue(fact),
      date: gedcomDate ? displayDate(gedcomDate) : '',
      time: timeMatch ? timeMatch[1] : '',
      place: placeMatch ? placeMatch[1] : '',
      address: addressMatch ? addressMatch[1] : '',
      author: authorMatch ? authorMatch[1] : '',
      // A simple year-only sort key (undated facts sort last) - real
      // PHP's FactSortService does a full date-precision-aware
      // comparison; this migration doesn't port that whole comparator,
      // just enough to put a family's MARR/RESI facts in roughly the
      // right chronological position among an individual's own facts
      // (the actual gap this extraction step exists to close), not a
      // faithful full reproduction of the real sort.
      sortYear: gedcomDate && gedcomDate.isOK() ? gedcomDate.minimumDate().yearValue() : Infinity,
    });
  }

  return visibleFacts;
}

// Mirrors IndividualFactsTabModule::getTabContent()'s own hardcoded
// family-metadata exclusion (app/Module/IndividualFactsTabModule.php:96):
// a family's own CHAN/_UID/UID/SUBM facts are meaningless mixed into an
// individual's personal timeline (CHAN in particular would misleadingly
// read as "this person last changed", when it's really the FAMILY
// record's own last-changed stamp) - excluded from the merge, not from
// the family's own FamilyPage facts table (unaffected).
const FAMILY_FACTS_EXCLUDED_ON_INDIVIDUAL_TAB = new Set(['CHAN', '_UID', 'UID', 'SUBM']);

/**
 * Mirrors IndividualFactsService::familyFacts() (app/Services/
 * IndividualFactsService.php:66-72): every displayable fact from EVERY
 * spouse family the individual belongs to (marriage, family residence,
 * divorce, ...) gets merged into their own Facts and events tab, not
 * just shown on the separate family page - the gap reported live
 * (Miron Ophir's own page was missing his Marriage/Family residence
 * facts, both of which live on his family record, not his own). Only
 * spouse families (real PHP's own scope here) - not parent families
 * (a person's own birth-family facts are the PARENTS' story, not
 * theirs).
 *
 * @param {{gedcomId: number}} tree
 * @param {object} treePrivacyPrefs
 * @param {number} accessLevel
 * @param {object} relPrefs
 * @param {string[]} spouseFamilyXrefs
 * @returns {Promise<ReturnType<typeof extractVisibleFacts>>}
 */
async function familyFactsForIndividual(tree, treePrivacyPrefs, accessLevel, relPrefs, spouseFamilyXrefs) {
  const facts = [];

  for (const familyXref of spouseFamilyXrefs) {
    const shown = await resolveShownFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref);

    if (shown === null) {
      continue;
    }

    const displayable = displayableFamilyFacts(shown.facts).filter(
      (fact) => !FAMILY_FACTS_EXCLUDED_ON_INDIVIDUAL_TAB.has(/^1 (\S+)/.exec(fact)?.[1]),
    );

    facts.push(...extractVisibleFacts(displayable, shown.defaultResnInfo, accessLevel).map((fact) => ({ ...fact, fromFamily: true })));
  }

  return facts;
}

/**
 * @param {string[]} facts
 * @param {{factResn: Map<string,string>, treeFactResn: Map<string,string>}} defaultResnInfo
 * @param {number} accessLevel
 * @returns {string[]}
 */
function showableRawFacts(facts, defaultResnInfo, accessLevel) {
  return facts.filter((fact) => {
    const tag = /^1 (\S+)/.exec(fact)?.[1];
    const resolvedDefaultResn = defaultResnInfo.factResn.get(tag) ?? defaultResnInfo.treeFactResn.get(tag) ?? null;

    return factCanShow(fact, accessLevel, resolvedDefaultResn);
  });
}

/**
 * The common base pool the Sources/Notes/Media/Album tabs all scan:
 * this individual's own facts PLUS every showable spouse family's own
 * facts (SourcesTabModule::getFactsWithSources(), NotesTabModule's
 * equivalent, and MediaTabModule::getFactsWithMedia() - app/Module/
 * *TabModule.php - all three start from this exact same "own + spouse
 * family" pool before applying their own tag-specific regex). Reuses
 * resolveShownFamily() a fourth time (see that function's own doc
 * comment on the accepted per-section redundancy). Each fact keeps a
 * `fromFamily` flag so a tab that needs the family-level label (e.g.
 * Sources/Notes showing which fact a citation/note came from) can
 * pick the right one, same convention as the Facts-tab merge.
 *
 * @returns {Promise<{fact: string, fromFamily: boolean}[]>}
 */
async function ownAndSpouseFamilyShowableFacts(tree, treePrivacyPrefs, accessLevel, relPrefs, ownFacts, ownDefaultResnInfo, spouseFamilyXrefs) {
  const showable = showableRawFacts(ownFacts, ownDefaultResnInfo, accessLevel).map((fact) => ({ fact, fromFamily: false }));

  for (const familyXref of spouseFamilyXrefs) {
    const shown = await resolveShownFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref);

    if (shown !== null) {
      showable.push(...showableRawFacts(shown.facts, shown.defaultResnInfo, accessLevel).map((fact) => ({ fact, fromFamily: true })));
    }
  }

  return showable;
}

/**
 * Sources tab items (phase 5 step 14c) - every showable own/spouse-
 * family fact with a SOUR citation anywhere in its own text (own
 * top-level `1 SOUR @Sx@` or a nested `2 SOUR @Sx@` sub-citation),
 * each resolved to its cited source(s)' real title + link. Mirrors
 * SourcesTabModule's own detection regex (app/Module/SourcesTabModule.php:
 * 114); simplified from real PHP's own rendering (no PAGE/DATA/QUAY
 * citation details, no "show all sources" collapsible toggle) to a
 * flat label + linked source title list. A cited source's own privacy
 * uses sourceCanShowRecord() with an EMPTY repo-results array - the
 * "does this source's own referenced repository ALSO have to be
 * showable" cascade isn't replicated here (a narrow, documented
 * simplification: the only way this could differ from full fidelity
 * is a source hidden SOLELY because of an unshowable referenced
 * repository still showing its title here - its own RESN chain is
 * still fully enforced).
 *
 * @param {{fact: string, fromFamily: boolean}[]} factPairs
 * @returns {Promise<{tag: string, fromFamily: boolean, sourceLinks: {url: string, nameHtml: string}[]}[]>}
 */
async function sourcesTabItems(tree, treePrivacyPrefs, accessLevel, factPairs) {
  const viewer = { accessLevel, isSelfRecord: false };
  const items = [];

  for (const { fact, fromFamily } of factPairs) {
    if (!/(?:^1|\n\d) SOUR/.test(fact)) {
      continue;
    }

    const tag = /^1 (\S+)/.exec(fact)?.[1];
    const sourceXrefs = [...new Set([...fact.matchAll(/\d SOUR @([^@]+)@/g)].map((match) => match[1]))];
    const sourceLinks = [];

    for (const sourceXref of sourceXrefs) {
      const source = await loadSource(pool, tree.gedcomId, sourceXref);

      if (source === null) {
        continue;
      }

      const sourceDefaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, source.xref);
      const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: sourceDefaultResnInfo.individualResn };

      if (!sourceCanShowRecord(treeForPrivacy, source.gedcom, viewer, sourceDefaultResnInfo.treeFactResn, [])) {
        continue;
      }

      const titleName = extractNameFromFact(source.gedcom, 'TITL');
      const nameHtml = titleName !== null ? titleName.full : `<span class="NAME" dir="auto" translate="no">${source.xref}</span>`;

      sourceLinks.push({ url: `/tree/${tree.name}/source/${source.xref}`, nameHtml });
    }

    if (sourceLinks.length > 0) {
      items.push({ tag, fromFamily, sourceLinks });
    }
  }

  return items;
}

/**
 * Notes tab items (phase 5 step 14c) - every showable own/spouse-
 * family fact with a NOTE anywhere in its own text, each resolved to
 * its note text(s): a shared `@Nxref@` reference resolved to the real
 * note's own text (subject to its own privacy via noteCanShowRecord()),
 * or inline text shown as-is. Mirrors NotesTabModule's own detection
 * (app/Module/NotesTabModule.php's `INDI:NOTE`/`FAM:NOTE` top-level
 * check, or a nested NOTE sub-tag on another fact,
 * resources/views/modules/notes/tab.phtml:35,58); simplified
 * similarly to Sources (no "show all notes" toggle, no edit links, no
 * SubmitterText markdown-ish formatting - plain escaped text).
 *
 * @param {{fact: string, fromFamily: boolean}[]} factPairs
 * @returns {Promise<{tag: string, fromFamily: boolean, notes: {isShared: boolean, text: string}[]}[]>}
 */
async function notesTabItems(tree, treePrivacyPrefs, accessLevel, relPrefs, factPairs) {
  const viewer = { accessLevel, isSelfRecord: false };
  const items = [];

  for (const { fact, fromFamily } of factPairs) {
    const noteMatches = [...`\n${fact}`.matchAll(/\n[1-9] NOTE ?(.*(?:\n\d CONT.*)*)/g)];

    if (noteMatches.length === 0) {
      continue;
    }

    const tag = /^1 (\S+)/.exec(fact)?.[1];
    const notes = [];

    for (const match of noteMatches) {
      const text = match[1].replace(/\n\d CONT ?/g, '\n');
      const xrefMatch = /^@([^@]+)@$/.exec(text.trim());

      if (xrefMatch) {
        const note = await loadNote(pool, tree.gedcomId, xrefMatch[1]);

        if (note === null) {
          continue;
        }

        const noteDefaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, note.xref);
        const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: noteDefaultResnInfo.individualResn };
        const linkedRecordsShowable = await noteLinkedRecordsShowable(tree, treePrivacyPrefs, accessLevel, relPrefs, note.xref);

        if (!noteCanShowRecord(treeForPrivacy, note.gedcom, viewer, noteDefaultResnInfo.treeFactResn, linkedRecordsShowable)) {
          continue;
        }

        notes.push({ isShared: true, text: noteText(note.gedcom) });
      } else if (text.trim() !== '') {
        notes.push({ isShared: false, text });
      }
    }

    if (notes.length > 0) {
      items.push({ tag, fromFamily, notes });
    }
  }

  return items;
}

async function handleFamilyPage(req, res, treeName, xref) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let family;
  let facts;
  let husband;
  let wife;
  let children;
  let shown;
  let accessLevel;
  let defaultResnInfo;

  try {
    family = await loadFamily(pool, tree.gedcomId, xref);

    if (family === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    facts = parseFacts(family.gedcom);

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);

    husband = await resolveFamilyMember(tree, treePrivacyPrefs, accessLevel, relPrefs, family.husb);
    wife = await resolveFamilyMember(tree, treePrivacyPrefs, accessLevel, relPrefs, family.wife);
    children = [];

    for (const childXref of childrenXrefs(facts)) {
      children.push(await resolveFamilyMember(tree, treePrivacyPrefs, accessLevel, relPrefs, childXref));
    }

    const memberCanShowResults = [husband, wife, ...children].filter((member) => member !== null).map((member) => member.canShow);

    defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, family.xref);
    const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const familyViewer = { accessLevel, isSelfRecord: false };

    shown = familyCanShowRecord(treeForPrivacy, family.gedcom, familyViewer, memberCanShowResults);
  } catch (error) {
    console.error('Failed to resolve family privacy:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (!shown) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const visibleFacts = extractVisibleFacts(displayableFamilyFacts(facts), defaultResnInfo, accessLevel);

  const familyViewModel = {
    husband: familyMemberViewModel(tree, husband),
    wife: familyMemberViewModel(tree, wife),
    children: children.map((child) => familyMemberViewModel(tree, child)).filter((child) => child !== null),
    facts: visibleFacts,
  };

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderFamilyPage({ tree, user, csrfToken, family: familyViewModel, genealogyMenuHtml });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
}

// Extracts a source fact's plain-text VALUE, joining CONT/CONC
// continuation lines (real GEDCOM's line-wrap mechanism for long text
// like TEXT transcriptions) into one multi-line string - source.mjs's
// SOURCE_FACT_TAGS (AUTH/PUBL/ABBR/TEXT) are all bare-value tags, none
// DATE/PLAC-structured like Individual/Family's vital events.
async function handleSourcePage(req, res, treeName, xref) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let source;
  let facts;
  let shown;
  let accessLevel;
  let defaultResnInfo;
  let repoInfoByXref;

  try {
    source = await loadSource(pool, tree.gedcomId, xref);

    if (source === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    facts = parseFacts(source.gedcom);

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });

    defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, source.xref);
    const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const sourceViewer = { accessLevel, isSelfRecord: false };

    const repoCanShowResults = [];
    repoInfoByXref = new Map();

    for (const repoXref of repoXrefs(facts)) {
      const repository = await loadRepository(pool, tree.gedcomId, repoXref);

      if (repository === null) {
        continue;
      }

      const repoDefaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, repository.xref);
      const repoTreeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: repoDefaultResnInfo.individualResn };
      const repoShown = repositoryCanShowRecord(repoTreeForPrivacy, repository.gedcom, sourceViewer, repoDefaultResnInfo.treeFactResn);

      repoCanShowResults.push(repoShown);

      // Only feed a showable repository's name into the REPO fact row
      // below (mirrors XrefRepository::value()'s own factory lookup,
      // which is subject to the SAME canShow() gate real PHP applies
      // to every cross-referenced record - Source::canShowByType()
      // already hides the whole source when any repo is unshowable, so
      // this only ever matters for the vacuous "some repos shown, some
      // not" case that can't actually occur given that gate, but
      // guarding it here costs nothing and avoids ever leaking a
      // hidden repository's name through this specific fact row).
      if (repoShown) {
        const repoName = extractNameFromFact(repository.gedcom, 'NAME');

        repoInfoByXref.set(repoXref, {
          url: phpRouteUrl(`/tree/${tree.name}/repository/${repository.xref}`, siteUrlConfig),
          nameHtml: repoName !== null ? repoName.full : `<span class="NAME" dir="auto" translate="no">${repository.xref}</span>`,
        });
      }
    }

    shown = sourceCanShowRecord(treeForPrivacy, source.gedcom, sourceViewer, defaultResnInfo.treeFactResn, repoCanShowResults);
  } catch (error) {
    console.error('Failed to resolve source privacy:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (!shown) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const visibleFacts = [];

  for (const fact of displayableSourceFacts(facts)) {
    const tag = /^1 (\S+)/.exec(fact)?.[1];
    const resolvedDefaultResn = defaultResnInfo.factResn.get(tag) ?? defaultResnInfo.treeFactResn.get(tag) ?? null;

    if (!factCanShow(fact, accessLevel, resolvedDefaultResn)) {
      continue;
    }

    const dateMatch = /\n2 DATE (.+)/.exec(fact);
    const timeMatch = /\n3 TIME (.+)/.exec(fact);
    const authorMatch = /\n2 _WT_USER (.+)/.exec(fact);
    const repoXrefMatch = tag === 'REPO' ? /^1 REPO @([^@]+)@/.exec(fact) : null;
    const repoInfo = repoXrefMatch ? repoInfoByXref.get(repoXrefMatch[1]) : undefined;

    visibleFacts.push({
      tag,
      value: tag === 'CHAN' || tag === 'REPO' ? '' : factPlainValue(fact),
      date: dateMatch ? displayDate(new GedcomDate(dateMatch[1])) : '',
      time: timeMatch ? timeMatch[1] : '',
      author: authorMatch ? authorMatch[1] : '',
      repoUrl: repoInfo?.url,
      repoNameHtml: repoInfo?.nameHtml,
      otherAttributes: sourceFactOtherAttributes(fact, tag),
    });
  }

  const titleName = extractNameFromFact(source.gedcom, 'TITL');
  const fullNameHtml =
    titleName !== null ? titleName.full : `<span class="NAME" dir="auto" translate="no">${source.xref}</span>`;

  const sourceViewModel = {
    xref: source.xref,
    fullNameHtml,
    facts: visibleFacts,
  };

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderSourcePage({ tree, user, csrfToken, source: sourceViewModel, genealogyMenuHtml });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
}

async function handleRepositoryPage(req, res, treeName, xref) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let repository;
  let facts;
  let shown;
  let accessLevel;
  let defaultResnInfo;

  try {
    repository = await loadRepository(pool, tree.gedcomId, xref);

    if (repository === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    facts = parseFacts(repository.gedcom);

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });

    defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, repository.xref);
    const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const repositoryViewer = { accessLevel, isSelfRecord: false };

    shown = repositoryCanShowRecord(treeForPrivacy, repository.gedcom, repositoryViewer, defaultResnInfo.treeFactResn);
  } catch (error) {
    console.error('Failed to resolve repository privacy:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (!shown) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const visibleFacts = [];

  for (const fact of displayableRepositoryFacts(facts)) {
    const tag = /^1 (\S+)/.exec(fact)?.[1];
    const resolvedDefaultResn = defaultResnInfo.factResn.get(tag) ?? defaultResnInfo.treeFactResn.get(tag) ?? null;

    if (!factCanShow(fact, accessLevel, resolvedDefaultResn)) {
      continue;
    }

    const dateMatch = /\n2 DATE (.+)/.exec(fact);
    const timeMatch = /\n3 TIME (.+)/.exec(fact);
    const authorMatch = /\n2 _WT_USER (.+)/.exec(fact);

    visibleFacts.push({
      tag,
      value: tag === 'CHAN' ? '' : factPlainValue(fact),
      date: dateMatch ? displayDate(new GedcomDate(dateMatch[1])) : '',
      time: timeMatch ? timeMatch[1] : '',
      author: authorMatch ? authorMatch[1] : '',
      otherAttributes: repositoryFactOtherAttributes(fact, tag),
    });
  }

  const titleName = extractNameFromFact(repository.gedcom, 'NAME');
  const fullNameHtml =
    titleName !== null ? titleName.full : `<span class="NAME" dir="auto" translate="no">${repository.xref}</span>`;

  const repositoryViewModel = {
    xref: repository.xref,
    fullNameHtml,
    facts: visibleFacts,
  };

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderRepositoryPage({ tree, user, csrfToken, repository: repositoryViewModel, genealogyMenuHtml });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
}

/**
 * Str::limit() (Laravel) - truncates to `limit` characters, appending
 * `end` only when actually truncated. Mirrors Note::extractNames()'s own
 * use of it for a note's derived title.
 */
function limitText(value, limit, end) {
  return value.length > limit ? value.slice(0, limit) + end : value;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function handleNotePage(req, res, treeName, xref) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let note;
  let facts;
  let shown;
  let accessLevel;
  let defaultResnInfo;

  try {
    note = await loadNote(pool, tree.gedcomId, xref);

    if (note === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    facts = parseFacts(note.gedcom);

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);

    defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, note.xref);
    const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const noteViewer = { accessLevel, isSelfRecord: false };
    const linkedRecordsShowable = await noteLinkedRecordsShowable(tree, treePrivacyPrefs, accessLevel, relPrefs, note.xref);

    shown = noteCanShowRecord(treeForPrivacy, note.gedcom, noteViewer, defaultResnInfo.treeFactResn, linkedRecordsShowable);
  } catch (error) {
    console.error('Failed to resolve note privacy:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (!shown) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const visibleFacts = [];

  for (const fact of displayableNoteFacts(facts)) {
    const tag = /^1 (\S+)/.exec(fact)?.[1];
    const resolvedDefaultResn = defaultResnInfo.factResn.get(tag) ?? defaultResnInfo.treeFactResn.get(tag) ?? null;

    if (!factCanShow(fact, accessLevel, resolvedDefaultResn)) {
      continue;
    }

    const dateMatch = /\n2 DATE (.+)/.exec(fact);
    const timeMatch = /\n3 TIME (.+)/.exec(fact);
    const authorMatch = /\n2 _WT_USER (.+)/.exec(fact);

    visibleFacts.push({
      tag,
      value: tag === 'CHAN' ? '' : factPlainValue(fact),
      date: dateMatch ? displayDate(new GedcomDate(dateMatch[1])) : '',
      time: timeMatch ? timeMatch[1] : '',
      author: authorMatch ? authorMatch[1] : '',
      otherAttributes: otherFactAttributes(fact, tag === 'CHAN' ? ['_WT_USER'] : []).map(({ subtag, value }) => ({
        label: `NOTE:${tag}:${subtag}`,
        value,
      })),
    });
  }

  const text = noteText(note.gedcom);
  const firstLine = limitText(text.split('\n')[0] ?? '', 100, '…');
  const fullNameHtml = firstLine !== '' ? `<bdi>${escapeHtml(firstLine)}</bdi>` : `<bdi>${escapeHtml(note.xref)}</bdi>`;

  const noteViewModel = {
    xref: note.xref,
    fullNameHtml,
    text,
    facts: visibleFacts,
  };

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderNotePage({ tree, user, csrfToken, note: noteViewModel, genealogyMenuHtml });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
}

async function handleMediaPage(req, res, treeName, xref) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let media;
  let facts;
  let shown;
  let accessLevel;
  let defaultResnInfo;
  let treePrivacyPrefs;

  try {
    media = await loadMedia(pool, tree.gedcomId, xref);

    if (media === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    facts = parseFacts(media.gedcom);

    treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);

    defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, media.xref);
    const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const mediaViewer = { accessLevel, isSelfRecord: false };
    const linkedRecordsShowable = await mediaLinkedRecordsShowable(tree, treePrivacyPrefs, accessLevel, relPrefs, media.xref);

    shown = mediaCanShowRecord(treeForPrivacy, media.gedcom, mediaViewer, defaultResnInfo.treeFactResn, linkedRecordsShowable);
  } catch (error) {
    console.error('Failed to resolve media privacy:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (!shown) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const watermark = needsWatermark(accessLevel, treePrivacyPrefs.showNoWatermark);
  const showDownloadLink = treePrivacyPrefs.showMediaDownload >= accessLevel;
  const rawFiles = mediaFileDetails(media.gedcom);
  const glideKey = rawFiles.some((file) => !file.isExternal) ? await loadGlideKey(pool) : null;

  const files = rawFiles.map((file) => {
    const isDisplayableImage = !file.isExternal && file.mimeType !== null;
    const urlParams = { xref: media.xref, treeName: tree.name, factId: file.factId, needsWatermark: watermark };

    return {
      ...file,
      imageUrl: isDisplayableImage ? mediaThumbnailUrl({ ...urlParams, width: 200, height: 150, fit: 'contain' }, glideKey, siteUrlConfig) : null,
      downloadUrl: !file.isExternal ? mediaDownloadUrl({ ...urlParams, disposition: 'inline' }, siteUrlConfig) : '',
      attachmentUrl: !file.isExternal ? mediaDownloadUrl({ ...urlParams, disposition: 'attachment' }, siteUrlConfig) : '',
      showDownloadLink: !file.isExternal && showDownloadLink,
    };
  });

  const visibleFacts = [];

  for (const fact of displayableMediaFacts(facts)) {
    const tag = /^1 (\S+)/.exec(fact)?.[1];
    const resolvedDefaultResn = defaultResnInfo.factResn.get(tag) ?? defaultResnInfo.treeFactResn.get(tag) ?? null;

    if (!factCanShow(fact, accessLevel, resolvedDefaultResn)) {
      continue;
    }

    const dateMatch = /\n2 DATE (.+)/.exec(fact);
    const timeMatch = /\n3 TIME (.+)/.exec(fact);
    const authorMatch = /\n2 _WT_USER (.+)/.exec(fact);

    visibleFacts.push({
      tag,
      value: tag === 'CHAN' ? '' : factPlainValue(fact),
      date: dateMatch ? displayDate(new GedcomDate(dateMatch[1])) : '',
      time: timeMatch ? timeMatch[1] : '',
      author: authorMatch ? authorMatch[1] : '',
      otherAttributes: mediaFactOtherAttributes(fact, tag),
    });
  }

  // Media::extractNames() (app/Media.php:104-128), simplified: the
  // first non-empty file title (getPrimaryName() picks the first name
  // in the general case, the same simplification already applied
  // elsewhere in this migration), else the first non-empty filename,
  // else the record's own xref (GedcomRecord::getFallBackName()).
  const titles = files.map((file) => file.title).filter((title) => title !== '');
  const filenames = files.map((file) => file.filename).filter((filename) => filename !== '');
  const chosenName = titles[0] ?? filenames[0] ?? media.xref;
  const fullNameHtml = `<bdi>${escapeHtml(chosenName)}</bdi>`;

  const mediaViewModel = {
    xref: media.xref,
    fullNameHtml,
    files,
    facts: visibleFacts,
  };

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderMediaPage({ tree, user, csrfToken, media: mediaViewModel, genealogyMenuHtml });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
}

async function handleSubmitterPage(req, res, treeName, xref) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let submitter;
  let facts;
  let shown;
  let accessLevel;
  let defaultResnInfo;

  try {
    submitter = await loadSubmitter(pool, tree.gedcomId, xref);

    if (submitter === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    facts = parseFacts(submitter.gedcom);

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });

    defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, submitter.xref);
    const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const submitterViewer = { accessLevel, isSelfRecord: false };

    shown = submitterCanShowRecord(treeForPrivacy, submitter.gedcom, submitterViewer, defaultResnInfo.treeFactResn);
  } catch (error) {
    console.error('Failed to resolve submitter privacy:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (!shown) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const visibleFacts = [];

  for (const fact of displayableSubmitterFacts(facts)) {
    const tag = /^1 (\S+)/.exec(fact)?.[1];
    const resolvedDefaultResn = defaultResnInfo.factResn.get(tag) ?? defaultResnInfo.treeFactResn.get(tag) ?? null;

    if (!factCanShow(fact, accessLevel, resolvedDefaultResn)) {
      continue;
    }

    const dateMatch = /\n2 DATE (.+)/.exec(fact);
    const timeMatch = /\n3 TIME (.+)/.exec(fact);
    const authorMatch = /\n2 _WT_USER (.+)/.exec(fact);

    visibleFacts.push({
      tag,
      value: tag === 'CHAN' ? '' : factPlainValue(fact),
      date: dateMatch ? displayDate(new GedcomDate(dateMatch[1])) : '',
      time: timeMatch ? timeMatch[1] : '',
      author: authorMatch ? authorMatch[1] : '',
      otherAttributes: submitterFactOtherAttributes(fact, tag),
    });
  }

  // Submitter::extractNames() (app/Submitter.php:33-36) uses the real
  // NAME-fact extraction machinery (extractNamesFromFacts, the SAME
  // <span class="NAME"> shape Individual/Repository use) - NOT the
  // <bdi> addName() fallback Note/Media use, since Submitter really
  // does carry a proper `1 NAME` fact when one exists. A submitter with
  // no NAME fact at all (real in this tree - "U1" has only a RIN) falls
  // back to the record's own xref - a deliberate, simpler substitute
  // for real PHP's own edge case here (GedcomRecord::fullName()
  // indexing an empty getAllNames() array), not a faithful port of
  // whatever PHP actually does in that corner case.
  const titleName = extractNameFromFact(submitter.gedcom, 'NAME');
  const fullNameHtml = titleName !== null ? titleName.full : `<span class="NAME" dir="auto" translate="no">${submitter.xref}</span>`;

  const submitterViewModel = {
    xref: submitter.xref,
    fullNameHtml,
    facts: visibleFacts,
  };

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderSubmitterPage({ tree, user, csrfToken, submitter: submitterViewModel, genealogyMenuHtml });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
}

async function handleHeaderPage(req, res, treeName, xref) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let header;
  let facts;
  let shown;
  let accessLevel;
  let defaultResnInfo;
  let submInfo;

  try {
    header = await loadHeader(pool, tree.gedcomId, xref);

    if (header === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    facts = parseFacts(header.gedcom);

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });

    defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, header.xref);
    const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const headerViewer = { accessLevel, isSelfRecord: false };

    shown = headerCanShowRecord(treeForPrivacy, header.gedcom, headerViewer, defaultResnInfo.treeFactResn);

    // HEAD:SUBM (XrefSubmitter) links to the real submitter who created
    // this export - resolved here the same way handleSourcePage()
    // resolves a SOUR fact's own REPO citation, subject to the SAME
    // canShow() gate real PHP applies to every cross-referenced record.
    submInfo = null;
    const submMatch = /^1 SUBM @([^@]+)@/m.exec(header.gedcom);

    if (submMatch !== null) {
      const submitter = await loadSubmitter(pool, tree.gedcomId, submMatch[1]);

      if (submitter !== null) {
        const submDefaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, submitter.xref);
        const submTreeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: submDefaultResnInfo.individualResn };

        if (submitterCanShowRecord(submTreeForPrivacy, submitter.gedcom, headerViewer, submDefaultResnInfo.treeFactResn)) {
          const submName = extractNameFromFact(submitter.gedcom, 'NAME');

          submInfo = {
            url: phpRouteUrl(`/tree/${tree.name}/submitter/${submitter.xref}`, siteUrlConfig),
            nameHtml: submName !== null ? submName.full : `<span class="NAME" dir="auto" translate="no">${submitter.xref}</span>`,
          };
        }
      }
    }
  } catch (error) {
    console.error('Failed to resolve header privacy:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (!shown) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const visibleFacts = [];

  for (const fact of displayableHeaderFacts(facts)) {
    const tag = /^1 (\S+)/.exec(fact)?.[1];
    const resolvedDefaultResn = defaultResnInfo.factResn.get(tag) ?? defaultResnInfo.treeFactResn.get(tag) ?? null;

    if (!factCanShow(fact, accessLevel, resolvedDefaultResn)) {
      continue;
    }

    // HEAD:DATE is unique among every record type ported so far: DATE
    // is the fact's OWN top-level tag (`1 DATE ...`), not a subordinate
    // line under some other event fact - TIME is still nested one level
    // beneath it, same shape as CHAN's own date/time.
    const dateMatch = tag === 'DATE' ? /^1 DATE (.+)/.exec(fact) : /\n2 DATE (.+)/.exec(fact);
    const timeMatch = tag === 'DATE' ? /\n2 TIME (.+)/.exec(fact) : /\n3 TIME (.+)/.exec(fact);
    const authorMatch = /\n2 _WT_USER (.+)/.exec(fact);
    const submUrlInfo = tag === 'SUBM' ? submInfo : null;

    visibleFacts.push({
      tag,
      value: tag === 'CHAN' || tag === 'DATE' || tag === 'SUBM' ? '' : factPlainValue(fact),
      date: dateMatch ? displayDate(new GedcomDate(dateMatch[1])) : '',
      time: timeMatch ? timeMatch[1] : '',
      author: authorMatch ? authorMatch[1] : '',
      submUrl: submUrlInfo?.url,
      submNameHtml: submUrlInfo?.nameHtml,
      otherAttributes: headerFactOtherAttributes(fact, tag),
    });
  }

  // Header::extractNames() (app/Header.php:33-40) always uses the
  // single literal translated string "Header", regardless of content -
  // not derived from any fact.
  const fullNameHtml = 'Header';

  const headerViewModel = {
    xref: header.xref,
    fullNameHtml,
    facts: visibleFacts,
  };

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderHeaderPage({ tree, user, csrfToken, header: headerViewModel, genealogyMenuHtml });

  const responseHeaders = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    responseHeaders['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, responseHeaders);
  res.end(html);
}

/**
 * AbstractModule::accessLevel() (app/Module/AbstractModule.php:167-176):
 * an explicit wt_module_privacy override for this exact (module,
 * gedcom, interface) triple, else the module's own class default.
 */
async function moduleAccessLevel(gedcomId, moduleName, interfaceName, defaultLevel) {
  const result = await pool.query(
    'SELECT access_level FROM wt_module_privacy WHERE gedcom_id = $1 AND module_name = $2 AND interface = $3',
    [gedcomId, moduleName, interfaceName],
  );

  return result.rows[0] ? Number(result.rows[0].access_level) : defaultLevel;
}

async function handleRepositoryListPage(req, res, treeName) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let repositories;
  let showLastChange;

  try {
    // RepositoryListModule::boot() only registers this route while the
    // module itself is enabled (app/Module/RepositoryListModule.php) -
    // this migration's proxy has no way to know that ahead of time (its
    // routing is purely path-based), so the Node handler checks it
    // directly and 404s otherwise, the closest available approximation
    // of "this route was never registered."
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'repository_list'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // RepositoryListModule's own class default (Auth::PRIV_USER = 1,
    // "member") - app/Module/RepositoryListModule.php:39.
    const listAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'repository_list',
      'Fisharebest\\Webtrees\\Module\\ModuleListInterface',
      1,
    );

    if (listAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const allRepositories = await loadRepositoryList(pool, tree.gedcomId);
    const sourceCounts = await repositorySourceCounts(pool, tree.gedcomId);
    showLastChange = await loadShowLastChangePref(pool, tree.gedcomId);
    const viewer = { accessLevel, isSelfRecord: false };

    repositories = [];

    for (const repository of allRepositories) {
      const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, repository.xref);
      const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };

      if (!repositoryCanShowRecord(treeForPrivacy, repository.gedcom, viewer, defaultResnInfo.treeFactResn)) {
        continue;
      }

      const nameFact = extractNameFromFact(repository.gedcom, 'NAME');
      const fullNameHtml =
        nameFact !== null ? nameFact.full : `<span class="NAME" dir="auto" translate="no">${repository.xref}</span>`;
      const lastChangeRaw = recordLastChange(repository.gedcom);

      repositories.push({
        xref: repository.xref,
        url: phpRouteUrl(`/tree/${tree.name}/repository/${repository.xref}`, siteUrlConfig),
        fullNameHtml,
        sourceCount: sourceCounts.get(repository.xref) ?? 0,
        lastChange: lastChangeRaw !== null ? { date: displayDate(new GedcomDate(lastChangeRaw.date)), time: lastChangeRaw.time } : null,
      });
    }
  } catch (error) {
    console.error('Failed to resolve repository list:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderRepositoryListPage({ tree, user, csrfToken, title: 'Repositories', repositories, showLastChange, genealogyMenuHtml });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
}

async function handleSourceListPage(req, res, treeName) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let sources;
  let showLastChange;

  try {
    // SourceListModule::boot() only registers this route while the
    // module itself is enabled (app/Module/SourceListModule.php) - same
    // "proxy routing is purely path-based" reasoning as
    // handleRepositoryListPage() above.
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'source_list'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // SourceListModule's own class default (Auth::PRIV_USER = 1,
    // "member") - app/Module/SourceListModule.php:40.
    const listAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'source_list',
      'Fisharebest\\Webtrees\\Module\\ModuleListInterface',
      1,
    );

    if (listAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const allSources = await loadSourceList(pool, tree.gedcomId);
    const individualCounts = await sourceIndividualCounts(pool, tree.gedcomId);
    const familyCounts = await sourceFamilyCounts(pool, tree.gedcomId);
    const mediaCounts = await sourceMediaCounts(pool, tree.gedcomId);
    const noteCounts = await sourceNoteCounts(pool, tree.gedcomId);
    showLastChange = await loadShowLastChangePref(pool, tree.gedcomId);
    const viewer = { accessLevel, isSelfRecord: false };

    sources = [];

    for (const source of allSources) {
      const facts = parseFacts(source.gedcom);
      const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, source.xref);
      const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };

      const repoCanShowResults = [];

      for (const repoXref of repoXrefs(facts)) {
        const repository = await loadRepository(pool, tree.gedcomId, repoXref);

        if (repository === null) {
          continue;
        }

        const repoDefaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, repository.xref);
        const repoTreeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: repoDefaultResnInfo.individualResn };

        repoCanShowResults.push(repositoryCanShowRecord(repoTreeForPrivacy, repository.gedcom, viewer, repoDefaultResnInfo.treeFactResn));
      }

      if (!sourceCanShowRecord(treeForPrivacy, source.gedcom, viewer, defaultResnInfo.treeFactResn, repoCanShowResults)) {
        continue;
      }

      const titleName = extractNameFromFact(source.gedcom, 'TITL');
      const fullNameHtml =
        titleName !== null ? titleName.full : `<span class="NAME" dir="auto" translate="no">${source.xref}</span>`;
      const lastChangeRaw = recordLastChange(source.gedcom);

      sources.push({
        xref: source.xref,
        url: phpRouteUrl(`/tree/${tree.name}/source/${source.xref}`, siteUrlConfig),
        fullNameHtml,
        abbreviation: firstFactPlainValue(source.gedcom, 'ABBR'),
        author: firstFactPlainValue(source.gedcom, 'AUTH'),
        publication: firstFactPlainValue(source.gedcom, 'PUBL'),
        individualCount: individualCounts.get(source.xref) ?? 0,
        familyCount: familyCounts.get(source.xref) ?? 0,
        mediaCount: mediaCounts.get(source.xref) ?? 0,
        noteCount: noteCounts.get(source.xref) ?? 0,
        lastChange: lastChangeRaw !== null ? { date: displayDate(new GedcomDate(lastChangeRaw.date)), time: lastChangeRaw.time } : null,
      });
    }
  } catch (error) {
    console.error('Failed to resolve source list:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderSourceListPage({ tree, user, csrfToken, title: 'Sources', sources, showLastChange, genealogyMenuHtml });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
}

async function handleNoteListPage(req, res, treeName) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let notes;
  let showLastChange;

  try {
    // NoteListModule::boot() only registers this route while the module
    // itself is enabled - same "proxy routing is purely path-based"
    // reasoning as handleRepositoryListPage()/handleSourceListPage()
    // above.
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'note_list'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // NoteListModule has no $access_level override of its own, unlike
    // RepositoryListModule/SourceListModule - AbstractModule's own class
    // default applies: Auth::PRIV_PRIVATE = 2 ("visitor"), i.e. open to
    // everyone including anonymous visitors.
    const listAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'note_list',
      'Fisharebest\\Webtrees\\Module\\ModuleListInterface',
      2,
    );

    if (listAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const allNotes = await loadNoteList(pool, tree.gedcomId);
    const individualCounts = await noteIndividualCounts(pool, tree.gedcomId);
    const familyCounts = await noteFamilyCounts(pool, tree.gedcomId);
    const mediaCounts = await noteMediaCounts(pool, tree.gedcomId);
    const sourceCounts = await noteSourceCounts(pool, tree.gedcomId);
    showLastChange = await loadShowLastChangePref(pool, tree.gedcomId);
    const viewer = { accessLevel, isSelfRecord: false };

    notes = [];

    for (const note of allNotes) {
      const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, note.xref);
      const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
      const linkedRecordsShowable = await noteLinkedRecordsShowable(tree, treePrivacyPrefs, accessLevel, relPrefs, note.xref);

      if (!noteCanShowRecord(treeForPrivacy, note.gedcom, viewer, defaultResnInfo.treeFactResn, linkedRecordsShowable)) {
        continue;
      }

      const text = noteText(note.gedcom);
      const firstLine = limitText(text.split('\n')[0] ?? '', 100, '…');
      const fullNameHtml = firstLine !== '' ? `<bdi>${escapeHtml(firstLine)}</bdi>` : `<bdi>${escapeHtml(note.xref)}</bdi>`;
      const lastChangeRaw = recordLastChange(note.gedcom);

      notes.push({
        xref: note.xref,
        url: phpRouteUrl(`/tree/${tree.name}/note/${note.xref}`, siteUrlConfig),
        fullNameHtml,
        individualCount: individualCounts.get(note.xref) ?? 0,
        familyCount: familyCounts.get(note.xref) ?? 0,
        mediaCount: mediaCounts.get(note.xref) ?? 0,
        sourceCount: sourceCounts.get(note.xref) ?? 0,
        lastChange: lastChangeRaw !== null ? { date: displayDate(new GedcomDate(lastChangeRaw.date)), time: lastChangeRaw.time } : null,
      });
    }
  } catch (error) {
    console.error('Failed to resolve note list:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderNoteListPage({ tree, user, csrfToken, title: 'Notes', notes, showLastChange, genealogyMenuHtml });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
}

async function handleLocationListPage(req, res, treeName) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let locations;
  let showLastChange;

  try {
    // LocationListModule::boot() only registers this route while the
    // module itself is enabled - same "proxy routing is purely path-based"
    // reasoning as handleRepositoryListPage()/handleSourceListPage()/
    // handleNoteListPage() above.
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'location_list'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // LocationListModule's own class default (Auth::PRIV_USER = 1,
    // "member") - app/Module/LocationListModule.php:41.
    const listAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'location_list',
      'Fisharebest\\Webtrees\\Module\\ModuleListInterface',
      1,
    );

    if (listAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const allLocations = await loadLocationList(pool, tree.gedcomId);
    const individualCounts = await locationIndividualCounts(pool, tree.gedcomId);
    const familyCounts = await locationFamilyCounts(pool, tree.gedcomId);
    showLastChange = await loadShowLastChangePref(pool, tree.gedcomId);
    const viewer = { accessLevel, isSelfRecord: false };

    locations = [];

    for (const location of allLocations) {
      const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, location.xref);
      const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };

      if (!locationCanShowRecord(treeForPrivacy, location.gedcom, viewer, defaultResnInfo.treeFactResn)) {
        continue;
      }

      const nameFact = extractNameFromFact(location.gedcom, 'NAME');
      const fullNameHtml =
        nameFact !== null ? nameFact.full : `<span class="NAME" dir="auto" translate="no">${location.xref}</span>`;
      const lastChangeRaw = recordLastChange(location.gedcom);

      locations.push({
        xref: location.xref,
        url: phpRouteUrl(`/tree/${tree.name}/location/${location.xref}`, siteUrlConfig),
        fullNameHtml,
        individualCount: individualCounts.get(location.xref) ?? 0,
        familyCount: familyCounts.get(location.xref) ?? 0,
        lastChange: lastChangeRaw !== null ? { date: displayDate(new GedcomDate(lastChangeRaw.date)), time: lastChangeRaw.time } : null,
      });
    }
  } catch (error) {
    console.error('Failed to resolve location list:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
  const genealogyMenuHtml = renderGenealogyMenuNav(
    await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
  );
  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderLocationListPage({ tree, user, csrfToken, title: 'Locations', locations, showLastChange, genealogyMenuHtml });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
}

/**
 * Mirrors Family::husband()/wife() exactly: null when the spouse xref
 * is absent OR the resolved member's name can't even be shown
 * (canShowNameOnly, Family's own weaker gate - see index.mjs's own
 * resolveFamilyMember() doc comment) - families-table.phtml's row
 * rendering falls back to a blank stub Individual in that case, which
 * this view's spouseNameCellHtml() already renders as "…" for a null
 * spouse (family-list-view.mjs).
 *
 * @param {{individual: {xref: string, gedcom: string}, canShowNameOnly: boolean, dead: boolean}|null} resolvedMember
 * @param {string} treeName
 * @returns {{allNames: object[], primaryIndex: number, sex: string, url: string, sortName: string}|null}
 */
function buildSpouseViewModel(resolvedMember, treeName) {
  if (resolvedMember === null || !resolvedMember.canShowNameOnly) {
    return null;
  }

  const allNames = extractAllNameFacts(resolvedMember.individual.gedcom, 'NAME');
  const primaryIndex = getPrimaryNameIndex(allNames);

  return {
    allNames,
    primaryIndex,
    sex: sex(resolvedMember.individual.gedcom),
    url: `/tree/${treeName}/individual/${resolvedMember.individual.xref}`,
    // Simplified from families-table.phtml's own sort key (which
    // reverses "SURN,GIVN" to "GIVN,SURN" and AAAA-substitutes
    // commas/placeholders) to the plain sortName() string - this only
    // affects DataTables' exact secondary tie-break order within this
    // hidden sort column, never what's actually shown.
    sortName: allNames[primaryIndex]?.sort ?? '',
  };
}

/**
 * Mirrors `new Age($birthDate, $otherDate)` - families-table.phtml's
 * own age-at-event columns. Returns null (rendered as a blank cell by
 * ageCellHtml() in family-list-view.mjs) when either side has no
 * usable date - the SAME "skip Age entirely rather than construct it
 * with an invalid-date shim" simplification individual.mjs's own
 * ageString() already establishes for the "no birth date" case,
 * applied consistently here to marriage-date gaps too.
 *
 * @param {{date: GedcomDate}|null} dateA
 * @param {{date: GedcomDate}|null} dateB
 * @returns {Age|null}
 */
function ageBetween(dateA, dateB) {
  if (dateA === null || dateB === null) {
    return null;
  }

  const shimA = { minimumDate: dateA.date.minimumDate(), maximumDate: dateA.date.maximumDate(), isOK: dateA.date.isOK() };
  const shimB = { minimumDate: dateB.date.minimumDate(), maximumDate: dateB.date.maximumDate(), isOK: dateB.date.isOK() };

  return new Age(shimA, shimB);
}

async function handleFamilyListPage(req, res, treeName, url) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let redirectUrl = null;

  try {
    // FamilyListModule::boot() only registers this route while the
    // module itself is enabled - same "proxy routing is purely
    // path-based" reasoning as every other list handler above.
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'family_list'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // FamilyListModule has no $access_level override of its own -
    // AbstractModule's own class default, Auth::PRIV_PRIVATE = 2
    // ("visitor"), applies - confirmed live: no wt_module_privacy
    // override row for 'family_list' in this tree either.
    const listAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'family_list',
      'Fisharebest\\Webtrees\\Module\\ModuleListInterface',
      2,
    );

    if (listAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const showLastChange = await loadShowLastChangePref(pool, tree.gedcomId);
    const familyListPrefs = await loadFamilyListPrefs(pool, tree.gedcomId);

    const rawParams = {
      treeName: tree.name,
      routeSegment: 'family-list',
      surnameParam: url.searchParams.get('surname') ?? '',
      alpha: url.searchParams.get('alpha') ?? '',
      falpha: url.searchParams.get('falpha') ?? '',
      show: url.searchParams.get('show') ?? '',
      showAll: url.searchParams.get('show_all') ?? '',
      showMarnm: url.searchParams.get('show_marnm') ?? '',
      showAllFirstnames: url.searchParams.get('show_all_firstnames') ?? '',
    };

    const marnm = rawParams.showMarnm === 'yes';
    const data = await surnameData(pool, tree.gedcomId, marnm, true);
    const surns = allSurns(data);
    const surnames = allSurnames(data);

    const resolved = resolveListRequest(rawParams, surns, surnames, true);

    if (resolved.kind === 'redirect') {
      redirectUrl = resolved.url;
    } else if (resolved.kind === 'not-found') {
      redirectUrl = resolved.url;
    } else {
      const initials = surnameInitials(data);
      let bodyHtml = '';
      let givenNameSublist = null;

      if (resolved.show === 'surn') {
        // Real PHP also supports 'style1' (column-list)/'style3'
        // (tag-cloud) - deliberately not ported (see
        // docs/php-to-js-migration/phase5-location-list.md's own
        // "next candidates" note): this tree's real
        // SURNAME_LIST_STYLE is 'style2' (the default, confirmed via
        // the DB - no override row exists), so the real table is
        // always what renders here regardless of the loaded pref.
        const filteredSurnames = filterSurnamesForAlpha(surnames, {
          alpha: resolved.alpha,
          surname: resolved.surname,
          showAll: resolved.showAll,
        });

        bodyHtml = renderSurnamesTable({
          routeSegment: resolved.routeSegment,
          treeName: tree.name,
          surnames: filteredSurnames,
          showFamilies: true,
          listParams: resolved.listParams,
        });
      } else if (resolved.show === 'indi') {
        const filteredSurnames = filterSurnamesForAlpha(surnames, {
          alpha: resolved.alpha,
          surname: resolved.surname,
          showAll: resolved.showAll,
        });
        const matchedCount = [...filteredSurnames.values()]
          .flatMap((spellings) => [...spellings.values()])
          .reduce((sum, count) => sum + count, 0);

        // Mirrors handle()'s own "don't sublist short lists" gate
        // (app/Module/AbstractIndividualListModule.php:374-414)
        // EXACTLY, including its one real subtlety: the given-name
        // nav/reassignment only happens at all when a specific surname
        // or "all" was chosen - a plain alpha-letter browse (e.g.
        // alpha=S with no surname) never sublists, no matter how many
        // individuals match, because real PHP's own
        // `if ($surname !== '' || $show_all === 'yes')` guard sits
        // INSIDE the "needs a sublist" branch and is the only place
        // `$show`/the nav get touched.
        let falpha = resolved.falpha;
        let showRows = true;

        if (needsGivenNameSublist(familyListPrefs.sublistTrigger, matchedCount)) {
          if (resolved.surname !== '' || resolved.showAll === 'yes') {
            const surnsToShow = computeSurnsToShow(surns, { alpha: resolved.alpha, surname: resolved.surname });
            const givenInitials = await givenNameInitials(pool, tree.gedcomId, surnsToShow, marnm, true);

            givenNameSublist = { givenNameInitials: givenInitials, falpha, showAllFirstnames: resolved.showAllFirstnames };
            // "Don't show the list until we have some filter criteria."
            showRows = falpha !== '' || resolved.showAllFirstnames === 'yes';
          }
        } else {
          falpha = '';
        }

        if (showRows) {
          const surnsToShow = computeSurnsToShow(surns, { alpha: resolved.alpha, surname: resolved.surname });
          const familyXrefs = await familyXrefsForSurnames(pool, tree.gedcomId, surnsToShow, falpha, marnm);

          const nowDate = new Date();
          const monthAbbrev = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][nowDate.getMonth()];
          const today = new GedcomDate(`${String(nowDate.getDate()).padStart(2, '0')} ${monthAbbrev} ${nowDate.getFullYear()}`);
          const todayShim = { date: today };
          const hundredYearsAgoJd = today.minimumJulianDay() - 36525;
          const todayJd = today.minimumJulianDay();

          const families = [];

          for (const familyXref of familyXrefs) {
            const shown = await resolveShownFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref);

            if (shown === null) {
              continue;
            }

            const husbandView = buildSpouseViewModel(shown.husband, tree.name);
            const wifeView = buildSpouseViewModel(shown.wife, tree.name);

            const husbandBirthDate = shown.husband !== null ? getBirthDate(shown.husband.facts) : null;
            const wifeBirthDate = shown.wife !== null ? getBirthDate(shown.wife.facts) : null;
            const marriageDates = getAllMarriageDates(shown.facts);
            const marriageDate = marriageDates[0] ?? null;

            const husbandAge = ageBetween(husbandBirthDate, marriageDate);
            const wifeAge = ageBetween(wifeBirthDate, marriageDate);
            const anniversaryAge = ageBetween(marriageDate, todayShim);

            const lastChangeRaw = recordLastChange(shown.family.gedcom);

            const husbandDead = shown.husband?.dead ?? false;
            const wifeDead = shown.wife?.dead ?? false;
            const husbandSexValue = husbandView?.sex ?? '';
            const wifeSexValue = wifeView?.sex ?? '';

            let aliveDeadFilterCode = '';

            if (husbandDead && wifeDead) {
              aliveDeadFilterCode = 'Y';
            } else if (husbandDead && !wifeDead) {
              aliveDeadFilterCode = wifeSexValue === 'F' ? 'H' : wifeSexValue === 'M' ? 'W' : '';
            } else if (!husbandDead && wifeDead) {
              aliveDeadFilterCode = husbandSexValue === 'M' ? 'W' : husbandSexValue === 'F' ? 'H' : '';
            } else {
              aliveDeadFilterCode = 'N';
            }

            const husbandRelated =
              shown.husband !== null && husbandView !== null
                ? await loadRelatedFamilyXrefs(pool, tree.gedcomId, shown.husband.individual.xref)
                : { parentFamilies: [], spouseFamilies: [] };
            const wifeRelated =
              shown.wife !== null && wifeView !== null
                ? await loadRelatedFamilyXrefs(pool, tree.gedcomId, shown.wife.individual.xref)
                : { parentFamilies: [], spouseFamilies: [] };

            const childCount = numberOfChildren(shown.facts);
            let rootsLeavesFilterCode = '';

            if (husbandRelated.parentFamilies.length === 0 && wifeRelated.parentFamilies.length === 0) {
              rootsLeavesFilterCode = 'R';
            } else if (!husbandDead && !wifeDead && childCount === 0) {
              rootsLeavesFilterCode = 'L';
            }

            let marriageFilterCode = '';

            if (marriageDate !== null && marriageDate.date.maximumJulianDay() > hundredYearsAgoJd && marriageDate.date.maximumJulianDay() <= todayJd) {
              marriageFilterCode += 'Y100';
            } else if (hasMarriageFact(shown.facts)) {
              marriageFilterCode += 'YES';
            } else {
              marriageFilterCode += 'U';
            }

            if (hasDivorceFact(shown.facts)) {
              marriageFilterCode += 'D';
            }

            if (husbandRelated.spouseFamilies.length > 1 || wifeRelated.spouseFamilies.length > 1) {
              marriageFilterCode += 'M';
            }

            families.push({
              xref: shown.family.xref,
              url: `/tree/${tree.name}/family/${shown.family.xref}`,
              isPendingAddition: false,
              isPendingDeletion: false,
              husband: husbandView,
              wife: wifeView,
              husbandAge,
              wifeAge,
              anniversaryAge,
              marriageDatesHtml: marriageDates.map((d) => displayDate(d.date)),
              marriageDateSortKey: marriageDate !== null ? marriageDate.date.julianDay() : 0,
              marriageYesNo: marriageDates.length > 0 ? null : hasMarriageFact(shown.facts) ? 'yes' : 'no',
              marriagePlaces: marriageDates.map((d) => d.place).filter((place) => place !== ''),
              marriagePlaceSortKey: marriageDates[0]?.place ?? '',
              numberOfChildren: childCount,
              lastChange:
                lastChangeRaw !== null ? { date: displayDate(new GedcomDate(lastChangeRaw.date)), time: lastChangeRaw.time } : null,
              lastChangeSortKey: lastChangeRaw !== null ? new GedcomDate(lastChangeRaw.date).julianDay() : 0,
              marriageFilterCode,
              aliveDeadFilterCode,
              rootsLeavesFilterCode,
            });
          }

          bodyHtml = renderFamiliesTable({ families, showLastChange });
        }
      }

      const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
      const genealogyMenuHtml = renderGenealogyMenuNav(
        await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
      );
      const csrfToken = user !== null ? generateCsrfToken() : null;
      const html = renderFamilyListPage({
        routeSegment: resolved.routeSegment,
        tree,
        user,
        csrfToken,
        genealogyMenuHtml,
        title: resolved.title,
        legendHtml: resolved.legendHtml,
        surnameInitials: initials,
        alpha: resolved.alpha,
        showAll: resolved.showAll,
        showMarnm: resolved.showMarnm,
        show: resolved.show,
        listParams: resolved.listParams,
        bodyHtml,
        givenNameSublist,
      });

      const headers = { 'content-type': 'text/html; charset=utf-8' };

      if (csrfToken !== null) {
        headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
      }

      res.writeHead(200, headers);
      res.end(html);
      return;
    }
  } catch (error) {
    console.error('Failed to resolve family list:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  res.writeHead(302, { Location: redirectUrl });
  res.end();
}

/**
 * Mirrors Individual::getAllBirthPlaces()/getAllDeathPlaces() to the
 * SAME "v1 simplification" degree getAllBirthDates()/getAllDeathDates()
 * already carries (individual.mjs's own doc comment): place is read
 * from the SAME dated fact as the date, not selected independently.
 * `dates` here is the array already returned by getAllBirthDates()/
 * getAllDeathDates() - this just extracts the non-blank `place` fields.
 */
function placesFromDates(dates) {
  return dates.map((d) => d.place).filter((place) => place !== '');
}

async function handleIndividualListPage(req, res, treeName, url) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  let redirectUrl = null;

  try {
    // IndividualListModule::boot() only registers this route while the
    // module itself is enabled - same reasoning as every other list handler.
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'individual_list'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // IndividualListModule has no $access_level override of its own,
    // same as FamilyListModule - AbstractModule's own class default,
    // Auth::PRIV_PRIVATE = 2 ("visitor") - confirmed live: no
    // wt_module_privacy override row for 'individual_list' either.
    const listAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'individual_list',
      'Fisharebest\\Webtrees\\Module\\ModuleListInterface',
      2,
    );

    if (listAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const showLastChange = await loadShowLastChangePref(pool, tree.gedcomId);
    const showEstimatedDates = await loadShowEstimatedDatesPref(pool, tree.gedcomId);
    const familyListPrefs = await loadFamilyListPrefs(pool, tree.gedcomId);

    const rawParams = {
      treeName: tree.name,
      routeSegment: 'individual-list',
      surnameParam: url.searchParams.get('surname') ?? '',
      alpha: url.searchParams.get('alpha') ?? '',
      falpha: url.searchParams.get('falpha') ?? '',
      show: url.searchParams.get('show') ?? '',
      showAll: url.searchParams.get('show_all') ?? '',
      showMarnm: url.searchParams.get('show_marnm') ?? '',
      showAllFirstnames: url.searchParams.get('show_all_firstnames') ?? '',
    };

    const marnm = rawParams.showMarnm === 'yes';
    const data = await surnameData(pool, tree.gedcomId, marnm, false);
    const surns = allSurns(data);
    const surnames = allSurnames(data);

    const resolved = resolveListRequest(rawParams, surns, surnames, false);

    if (resolved.kind === 'redirect' || resolved.kind === 'not-found') {
      redirectUrl = resolved.url;
    } else {
      const initials = surnameInitials(data);
      let bodyHtml = '';
      let givenNameSublist = null;

      if (resolved.show === 'surn') {
        const filteredSurnames = filterSurnamesForAlpha(surnames, {
          alpha: resolved.alpha,
          surname: resolved.surname,
          showAll: resolved.showAll,
        });

        bodyHtml = renderSurnamesTable({
          routeSegment: resolved.routeSegment,
          treeName: tree.name,
          surnames: filteredSurnames,
          showFamilies: false,
          listParams: resolved.listParams,
        });
      } else if (resolved.show === 'indi') {
        const filteredSurnames = filterSurnamesForAlpha(surnames, {
          alpha: resolved.alpha,
          surname: resolved.surname,
          showAll: resolved.showAll,
        });
        const matchedCount = [...filteredSurnames.values()]
          .flatMap((spellings) => [...spellings.values()])
          .reduce((sum, count) => sum + count, 0);

        let falpha = resolved.falpha;
        let showRows = true;

        if (needsGivenNameSublist(familyListPrefs.sublistTrigger, matchedCount)) {
          if (resolved.surname !== '' || resolved.showAll === 'yes') {
            const surnsToShow = computeSurnsToShow(surns, { alpha: resolved.alpha, surname: resolved.surname });
            const givenInitials = await givenNameInitials(pool, tree.gedcomId, surnsToShow, marnm, false);

            givenNameSublist = { givenNameInitials: givenInitials, falpha, showAllFirstnames: resolved.showAllFirstnames };
            showRows = falpha !== '' || resolved.showAllFirstnames === 'yes';
          }
        } else {
          falpha = '';
        }

        if (showRows) {
          const surnsToShow = computeSurnsToShow(surns, { alpha: resolved.alpha, surname: resolved.surname });
          const rows = await individualRowsForSurnames(pool, tree.gedcomId, surnsToShow, falpha, marnm);

          const nowDate = new Date();
          const monthAbbrev = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][nowDate.getMonth()];
          const today = new GedcomDate(`${String(nowDate.getDate()).padStart(2, '0')} ${monthAbbrev} ${nowDate.getFullYear()}`);
          const todayShim = { date: today };
          const hundredYearsAgoJd = today.minimumJulianDay() - 36525;
          const todayJd = today.minimumJulianDay();

          const individuals = [];

          for (const row of rows) {
            const resolvedMember = await resolveFamilyMember(tree, treePrivacyPrefs, accessLevel, relPrefs, row.xref);

            if (resolvedMember === null || !resolvedMember.canShow) {
              continue;
            }

            const { individual, facts, dead } = resolvedMember;
            const allNames = extractAllNameFacts(individual.gedcom, 'NAME');
            // Mirrors AbstractIndividualListModule::individuals()'s own
            // setPrimaryName($n) (app/Module/AbstractIndividualListModule.php:718-729):
            // the specific NAME fact that matched this surname/galpha
            // query becomes primary for display, not necessarily the
            // script-based default - falls back to the script-based
            // index if (unexpectedly) no exact match is found.
            const matchedIndex = allNames.findIndex((n) => n.givn === row.matchedGivn && n.surn === row.matchedSurn);
            const primaryIndex = matchedIndex !== -1 ? matchedIndex : getPrimaryNameIndex(allNames);

            const birthDates = getAllBirthDates(facts);
            const deathDates = getAllDeathDates(facts);
            const estimatedBirthDate = await getEstimatedBirthDate(
              pool,
              tree.gedcomId,
              individual.xref,
              facts,
              treePrivacyPrefs.maxAliveAge,
            );
            const estimatedDeathDate = getEstimatedDeathDate(facts, estimatedBirthDate, treePrivacyPrefs.maxAliveAge);

            const birthDatesHtml =
              birthDates.length > 0
                ? birthDates.map((d) => displayDate(d.date))
                : showEstimatedDates && estimatedBirthDate.isOK()
                  ? [displayDate(estimatedBirthDate)]
                  : [];
            const deathDatesHtml =
              deathDates.length > 0
                ? deathDates.map((d) => displayDate(d.date))
                : showEstimatedDates && estimatedDeathDate.isOK() && estimatedDeathDate.minimumJulianDay() < todayJd
                  ? [displayDate(estimatedDeathDate)]
                  : [];

            const birthAnniversaryAge = ageBetween(birthDates[0] ?? null, todayShim);
            const deathAnniversaryAge = ageBetween(deathDates[0] ?? null, todayShim);
            const ageAtDeath = ageBetween(birthDates[0] ?? null, deathDates[0] ?? null);

            const childCount = await individualNumberOfChildren(pool, tree.gedcomId, individual.xref, facts);
            const related = await loadRelatedFamilyXrefs(pool, tree.gedcomId, individual.xref);

            const lastChangeRaw = recordLastChange(individual.gedcom);

            let birthFilterCode;

            if (estimatedBirthDate.maximumJulianDay() > hundredYearsAgoJd && estimatedBirthDate.maximumJulianDay() <= todayJd) {
              birthFilterCode = 'Y100';
            } else {
              birthFilterCode = 'YES';
            }

            let deathFilterCode;

            if (estimatedDeathDate.maximumJulianDay() > hundredYearsAgoJd && estimatedDeathDate.maximumJulianDay() <= todayJd) {
              deathFilterCode = 'Y100';
            } else if (dead) {
              deathFilterCode = 'YES';
            } else {
              deathFilterCode = 'N';
            }

            let rootsLeavesFilterCode = '';

            if (related.parentFamilies.length === 0) {
              rootsLeavesFilterCode = 'R';
            } else if (!dead && childCount < 1) {
              rootsLeavesFilterCode = 'L';
            }

            individuals.push({
              xref: individual.xref,
              url: `/tree/${tree.name}/individual/${individual.xref}`,
              isPendingAddition: false,
              isPendingDeletion: false,
              allNames,
              primaryIndex,
              sex: sex(individual.gedcom),
              sortName: allNames[primaryIndex]?.sort ?? '',
              birthDatesHtml,
              birthDateSortKey: estimatedBirthDate.julianDay(),
              birthAnniversaryAge,
              birthPlaces: placesFromDates(birthDates),
              birthPlaceSortKey: birthDates[0]?.place ?? '',
              numberOfChildren: childCount,
              deathDatesHtml,
              deathDateSortKey: estimatedDeathDate.julianDay(),
              deathAnniversaryAge,
              ageAtDeath,
              deathPlaces: placesFromDates(deathDates),
              deathPlaceSortKey: deathDates[0]?.place ?? '',
              lastChange:
                lastChangeRaw !== null ? { date: displayDate(new GedcomDate(lastChangeRaw.date)), time: lastChangeRaw.time } : null,
              lastChangeSortKey: lastChangeRaw !== null ? new GedcomDate(lastChangeRaw.date).julianDay() : 0,
              sexFilterCode: sex(individual.gedcom),
              birthFilterCode,
              deathFilterCode,
              rootsLeavesFilterCode,
            });
          }

          bodyHtml = renderIndividualsTable({ individuals, showLastChange });
        }
      }

      const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
      const genealogyMenuHtml = renderGenealogyMenuNav(
        await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
      );
      const csrfToken = user !== null ? generateCsrfToken() : null;
      const html = renderFamilyListPage({
        routeSegment: resolved.routeSegment,
        tree,
        user,
        csrfToken,
        genealogyMenuHtml,
        title: resolved.title,
        legendHtml: resolved.legendHtml,
        surnameInitials: initials,
        alpha: resolved.alpha,
        showAll: resolved.showAll,
        showMarnm: resolved.showMarnm,
        show: resolved.show,
        listParams: resolved.listParams,
        bodyHtml,
        givenNameSublist,
      });

      const headers = { 'content-type': 'text/html; charset=utf-8' };

      if (csrfToken !== null) {
        headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
      }

      res.writeHead(200, headers);
      res.end(html);
      return;
    }
  } catch (error) {
    console.error('Failed to resolve individual list:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  res.writeHead(302, { Location: redirectUrl });
  res.end();
}

function mediaListRedirectUrl(treeName, params) {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '') {
      query.set(key, String(value));
    }
  }

  return `/tree/${treeName}/media-list?${query.toString()}`;
}

async function handleMediaListPage(req, res, treeName, url) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // Mirrors MediaListModule::handle()'s own "Convert POST requests into
  // GET requests for pretty URLs" (app/Module/MediaListModule.php:128-139) -
  // the search form posts, real PHP redirects to the equivalent GET URL.
  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);

    res.writeHead(302, {
      Location: mediaListRedirectUrl(treeName, {
        go: '1',
        page: formData.get('page') ?? '1',
        max: formData.get('max') ?? '20',
        folder: formData.get('folder') ?? '',
        filter: formData.get('filter') ?? '',
        subdirs: formData.get('subdirs') ? '1' : '',
        format: formData.get('format') ?? '',
      }),
    });
    res.end();
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  try {
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'media_list'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // MediaListModule has no $access_level override of its own, same as
    // every other list module - AbstractModule's own class default,
    // Auth::PRIV_PRIVATE = 2 ("visitor") - confirmed live: no
    // wt_module_privacy override row for 'media_list' either.
    const listAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'media_list',
      'Fisharebest\\Webtrees\\Module\\ModuleListInterface',
      2,
    );

    if (listAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);

    const folders = await allFolders(pool, tree.gedcomId);
    const go = url.searchParams.get('go') === '1';
    const page = parseInt(url.searchParams.get('page') ?? '1', 10) || 1;
    const max = parseInt(url.searchParams.get('max') ?? '20', 10) || 20;
    const folder = url.searchParams.get('folder') ?? '';
    const filter = url.searchParams.get('filter') ?? '';
    const subdirs = url.searchParams.get('subdirs') === '1';
    const format = url.searchParams.get('format') ?? '';

    const mediaXrefs = go ? await allMedia(pool, tree.gedcomId, folder, subdirs, filter, format) : [];

    // Mirrors GedcomRecord::accessFilter(), applied to allMedia()'s own
    // result set BEFORE pagination (app/Module/MediaListModule.php:260) -
    // real PHP's $count/$pages are computed from the ALREADY-filtered
    // collection, so privacy must be resolved for the WHOLE matched set
    // here too, not just the current page's slice (otherwise count/pages
    // would be wrong, and a page could silently render fewer than `max`
    // cards whenever some of its slice turned out unshowable - found
    // live: a 502 first, from an unrelated SQL bug, then a found-but-short
    // page once that was fixed, before this ordering fix).
    const showableMedia = [];

    for (const xref of mediaXrefs) {
      const mediaRecord = await loadMedia(pool, tree.gedcomId, xref);

      if (mediaRecord === null) {
        continue;
      }

      const facts = parseFacts(mediaRecord.gedcom);
      const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, mediaRecord.xref);
      const treeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
      const mediaViewer = { accessLevel, isSelfRecord: false };
      const linkedRecordsShowable = await mediaLinkedRecordsShowable(tree, treePrivacyPrefs, accessLevel, relPrefs, mediaRecord.xref);
      const shown = mediaCanShowRecord(treeForPrivacy, mediaRecord.gedcom, mediaViewer, defaultResnInfo.treeFactResn, linkedRecordsShowable);

      if (shown) {
        showableMedia.push({ mediaRecord, facts });
      }
    }

    const count = showableMedia.length;
    const pages = Math.max(1, Math.ceil(count / max));
    const clampedPage = Math.max(Math.min(page, pages), 1);
    const pageItems = showableMedia.slice((clampedPage - 1) * max, clampedPage * max);

    let glideKey = null;
    const media = [];

    for (const { mediaRecord, facts } of pageItems) {
      const rawFiles = mediaFileDetails(mediaRecord.gedcom);

      if (glideKey === null && rawFiles.some((file) => !file.isExternal)) {
        glideKey = await loadGlideKey(pool);
      }

      const watermark = needsWatermark(accessLevel, treePrivacyPrefs.showNoWatermark);
      const thumbnailHtml = rawFiles
        .filter((file) => !file.isExternal && file.mimeType !== null)
        .map((file) => {
          const imageUrl = mediaThumbnailUrl(
            { xref: mediaRecord.xref, treeName: tree.name, factId: file.factId, width: 300, height: 200, fit: 'contain', needsWatermark: watermark },
            glideKey,
            siteUrlConfig,
          );

          return `<img class="img-fluid" src="${imageUrl}">`;
        });

      const firstFile = rawFiles[0] ?? null;
      const typeLabelHtml =
        firstFile !== null && firstFile.type !== ''
          ? `<div><span class="label">Type</span>: <span class="value">${escapeHtml(firstFile.type)}</span></div>`
          : '';

      // Simplified from real PHP's own `view('fact-gedcom-fields', ...)`
      // partial (full GEDCOM-structure-aware fact rendering, not ported
      // anywhere in this migration) to each fact's plain text value -
      // shows the same content, not byte-identical formatting. Also
      // simplified away entirely: the editor-only raw filename/file-
      // attributes display and the "file does not exist" check (both
      // need real filesystem access this migration's Node side
      // deliberately never does - the same "no Node-side image/file
      // processing" decision already made for thumbnails themselves).
      // Resolves a `1 SOUR @Sx@` citation to a real link (source's own
      // title, privacy-checked) rather than showing the raw GEDCOM
      // pointer text - a real bug found live (factPlainValue() on a
      // pointer fact just returns "@S558@" verbatim, since that IS the
      // fact's own value line). A non-pointer (inline, unstructured)
      // SOUR citation falls back to its plain text, same as before.
      const sourceFactsHtml = [];

      for (const fact of facts.filter((f) => /^1 SOUR/.test(f))) {
        const pointerMatch = /^1 SOUR @([^@]+)@/.exec(fact);

        if (pointerMatch === null) {
          sourceFactsHtml.push(`<div>${escapeHtml(factPlainValue(fact))}</div>`);
          continue;
        }

        const citedSourceXref = pointerMatch[1];
        const citedSource = await loadSource(pool, tree.gedcomId, citedSourceXref);

        if (citedSource === null) {
          continue;
        }

        const citedDefaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, citedSourceXref);
        const citedTreeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: citedDefaultResnInfo.individualResn };
        const citedViewer = { accessLevel, isSelfRecord: false };

        if (sourceCanShowRecord(citedTreeForPrivacy, citedSource.gedcom, citedViewer, citedDefaultResnInfo.treeFactResn, [])) {
          const citedName = extractNameFromFact(citedSource.gedcom, 'TITL');
          const citedLabel = citedName !== null ? citedName.full : `<span class="NAME" dir="auto" translate="no">${citedSourceXref}</span>`;

          sourceFactsHtml.push(`<div><a href="/tree/${tree.name}/source/${citedSourceXref}">${citedLabel}</a></div>`);
        }
      }

      // Same pointer-resolution fix as SOUR above, for a `1 NOTE @Nx@`
      // shared-note citation; an inline (non-pointer) NOTE falls back
      // to its plain text.
      const noteFactsHtml = [];

      for (const fact of facts.filter((f) => /^1 NOTE/.test(f))) {
        const pointerMatch = /^1 NOTE @([^@]+)@/.exec(fact);

        if (pointerMatch === null) {
          noteFactsHtml.push(`<div>${escapeHtml(factPlainValue(fact))}</div>`);
          continue;
        }

        const citedNoteXref = pointerMatch[1];
        const citedNote = await loadNote(pool, tree.gedcomId, citedNoteXref);

        if (citedNote === null) {
          continue;
        }

        const citedDefaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, citedNoteXref);
        const citedTreeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: citedDefaultResnInfo.individualResn };
        const citedViewer = { accessLevel, isSelfRecord: false };
        const citedLinkedRecordsShowable = await noteLinkedRecordsShowable(tree, treePrivacyPrefs, accessLevel, relPrefs, citedNoteXref);

        if (noteCanShowRecord(citedTreeForPrivacy, citedNote.gedcom, citedViewer, citedDefaultResnInfo.treeFactResn, citedLinkedRecordsShowable)) {
          const citedLabel = noteText(citedNote.gedcom);

          noteFactsHtml.push(`<div><a href="/tree/${tree.name}/note/${citedNoteXref}">${escapeHtml(citedLabel)}</a></div>`);
        }
      }

      // Mirrors Media::extractNames() (app/Media.php:104-128) EXACTLY
      // the same way handleMediaPage() already does above: the first
      // non-empty FILE title (NOT a top-level TITL fact, which media
      // records don't have - a real bug found live, where this
      // originally used extractNameFromFact(gedcom, 'TITL') and every
      // card fell back to showing its bare xref), else the first
      // non-empty filename, else the record's own xref.
      const titles = rawFiles.map((file) => file.title).filter((title) => title !== '');
      const filenames = rawFiles.map((file) => file.filename).filter((filename) => filename !== '');
      const chosenName = titles[0] ?? filenames[0] ?? mediaRecord.xref;
      const fullNameHtml = `<bdi>${escapeHtml(chosenName)}</bdi>`;

      const linkedXrefs = await linkedRecordXrefsForMedia(pool, tree.gedcomId, mediaRecord.xref);

      const linkedIndividuals = [];

      for (const linkedXref of linkedXrefs.individuals) {
        const resolved = await resolveFamilyMember(tree, treePrivacyPrefs, accessLevel, relPrefs, linkedXref);

        if (resolved !== null && resolved.canShow) {
          const linkedName = extractPrimaryName(resolved.individual.gedcom);

          linkedIndividuals.push({
            url: `/tree/${tree.name}/individual/${linkedXref}`,
            fullNameHtml: linkedName !== null ? linkedName.full : `<span class="NAME" dir="auto" translate="no">${linkedXref}</span>`,
          });
        }
      }

      const linkedFamilies = [];

      for (const linkedXref of linkedXrefs.families) {
        const shownFamily = await resolveShownFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, linkedXref);

        if (shownFamily !== null) {
          const husbandName = shownFamily.husband !== null ? extractPrimaryName(shownFamily.husband.individual.gedcom) : null;
          const wifeName = shownFamily.wife !== null ? extractPrimaryName(shownFamily.wife.individual.gedcom) : null;
          const combinedName = `${husbandName?.full ?? '…'} + ${wifeName?.full ?? '…'}`;

          linkedFamilies.push({ url: `/tree/${tree.name}/family/${linkedXref}`, fullNameHtml: combinedName });
        }
      }

      const linkedSources = [];

      for (const linkedXref of linkedXrefs.sources) {
        const source = await loadSource(pool, tree.gedcomId, linkedXref);

        if (source === null) {
          continue;
        }

        const sourceDefaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, linkedXref);
        const sourceTreeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: sourceDefaultResnInfo.individualResn };
        const sourceViewer = { accessLevel, isSelfRecord: false };

        // Repo-citation privacy is skipped for this footer mention,
        // same established shortcut already used elsewhere in this
        // migration for a source referenced only in passing (not the
        // page's own subject record) - see index.mjs's own comment at
        // sourceCanShowRecord's other such call site.
        if (sourceCanShowRecord(sourceTreeForPrivacy, source.gedcom, sourceViewer, sourceDefaultResnInfo.treeFactResn, [])) {
          const sourceName = extractNameFromFact(source.gedcom, 'TITL');

          linkedSources.push({
            url: `/tree/${tree.name}/source/${linkedXref}`,
            fullNameHtml: sourceName !== null ? sourceName.full : `<span class="NAME" dir="auto" translate="no">${linkedXref}</span>`,
          });
        }
      }

      const linkedLocations = [];

      for (const linkedXref of linkedXrefs.locations) {
        const location = await loadLocation(pool, tree.gedcomId, linkedXref);

        if (location === null) {
          continue;
        }

        const locationDefaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, linkedXref);
        const locationTreeForPrivacy = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: locationDefaultResnInfo.individualResn };
        const locationViewer = { accessLevel, isSelfRecord: false };

        if (locationCanShowRecord(locationTreeForPrivacy, location.gedcom, locationViewer, locationDefaultResnInfo.treeFactResn)) {
          const locationName = extractNameFromFact(location.gedcom, 'NAME');

          linkedLocations.push({
            url: `/tree/${tree.name}/location/${linkedXref}`,
            fullNameHtml: locationName !== null ? locationName.full : `<span class="NAME" dir="auto" translate="no">${linkedXref}</span>`,
          });
        }
      }

      media.push({
        xref: mediaRecord.xref,
        url: `/tree/${tree.name}/media/${mediaRecord.xref}`,
        fullNameHtml,
        thumbnailHtml,
        typeLabelHtml,
        sourceFactsHtml: sourceFactsHtml.join(''),
        noteFactsHtml: noteFactsHtml.join(''),
        filenameHtml: '',
        linkedIndividuals,
        linkedFamilies,
        linkedSources,
        linkedLocations,
      });
    }

    const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const genealogyMenuHtml = renderGenealogyMenuNav(
      await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: null }),
    );
    const csrfToken = user !== null ? generateCsrfToken() : null;
    const html = renderMediaListPage({
      tree,
      user,
      csrfToken,
      genealogyMenuHtml,
      folders,
      folder,
      subdirs,
      max,
      format,
      filter,
      count,
      page: clampedPage,
      pages,
      media,
    });

    const headers = { 'content-type': 'text/html; charset=utf-8' };

    if (csrfToken !== null) {
      headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
    }

    res.writeHead(200, headers);
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve media list:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

const ANCESTORS_CHART_MIN_GENERATIONS = 2;
// Mirrors AncestorsChartModule::MAXIMUM_GENERATIONS (app/Module/AncestorsChartModule.php:58):
// `PHP_INT_SIZE === 4 ? 31 : 63` - Node always runs on a 64-bit build,
// so this is always 63, the SAME branch any real 64-bit PHP install
// would take too (not a divergence specific to this port).
const ANCESTORS_CHART_MAX_GENERATIONS = 63;

/**
 * Mirrors Family::spouses()'s own filter (via husband($access_level)/
 * wife($access_level), each internally gated by canShowName()) - a
 * spouse that exists but fails canShowName is OMITTED from the
 * family's own spouse list entirely (no box at all for that side), not
 * shown as a "Private" placeholder box - a real, confirmed difference
 * from chart-box.mjs's own "canShow false -> show a Private box"
 * behavior, which only applies once a spouse has ALREADY cleared this
 * gate and is being rendered as a box in its own right.
 *
 * @param {{canShowNameOnly: boolean}|null} resolvedMember
 * @returns {boolean}
 */
function spouseEntersChart(resolvedMember) {
  return resolvedMember !== null && resolvedMember.canShowNameOnly;
}

/**
 * Mirrors ancestors-chart/tree.phtml's own marriage-summary line
 * (`$parents->facts(['MARR', 'DIV', '_NMR'], true)` - label + date per
 * fact, joined by " — "). English-only labels, this migration's
 * established no-I18N convention for hand-rolled views.
 */
const MARRIAGE_SUMMARY_LABELS = { MARR: 'Marriage', DIV: 'Divorce', _NMR: 'Not married' };

function buildMarriageSummaryHtml(familyFacts) {
  const parts = [];

  for (const fact of familyFacts) {
    const tag = /^1 (\S+)/.exec(fact)?.[1];
    const label = MARRIAGE_SUMMARY_LABELS[tag];

    if (label === undefined) {
      continue;
    }

    const dateMatch = /\n2 DATE (.+)/.exec(fact);
    let part = label;

    if (dateMatch) {
      const gedcomDate = new GedcomDate(dateMatch[1]);

      if (gedcomDate.isOK()) {
        part += ` ${displayDate(gedcomDate)}`;
      }
    }

    parts.push(part);
  }

  return parts.join(' — ');
}

/**
 * Recursively resolves one node of the ancestors tree - mirrors
 * resources/views/modules/ancestors-chart/tree.phtml's own recursive
 * structure (see ancestors-chart-view.mjs's own renderAncestorsTreeNode()
 * doc comment for the exact shape). `ctx` bundles everything constant
 * across the whole recursion (tree/privacy/viewer context, the
 * SHOW_PRIVATE_RELATIONSHIPS-aware traversalAccessLevel, a pre-loaded
 * glideKey, siteUrlConfig) so each recursive call only needs to thread
 * through what actually changes: the individual, their Sosa number,
 * and how many generations remain.
 */
async function buildAncestorsNode(ctx, individualXref, sosaNumber, generationsRemaining) {
  const individual = await loadIndividual(pool, ctx.gedcomId, individualXref);

  if (individual === null) {
    return { box: null, sosa: sosaNumber, parentFamily: null };
  }

  const defaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, individualXref);
  const box = await buildChartBoxViewModel(
    pool,
    ctx.gedcomId,
    ctx.treeName,
    ctx.treePrivacyPrefs,
    ctx.showHighlightImages,
    individual,
    ctx.viewerBase,
    ctx.traversalAccessLevel,
    defaultResnInfo,
    ctx.glideKey,
    ctx.siteUrlConfig,
  );

  let parentFamily = null;

  if (generationsRemaining > 1) {
    const related = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, individualXref);
    const familyXref = related.parentFamilies[0] ?? null;

    if (familyXref !== null) {
      const shownFamily = await resolveShownFamily(ctx.tree, ctx.treePrivacyPrefs, ctx.traversalAccessLevel, ctx.relPrefs, familyXref);

      if (shownFamily !== null) {
        const spouseXrefs = [
          spouseEntersChart(shownFamily.husband) ? shownFamily.family.husb : null,
          spouseEntersChart(shownFamily.wife) ? shownFamily.family.wife : null,
        ].filter((x) => x !== null);

        const spouses = [];

        for (const spouseXref of spouseXrefs) {
          const spouseIndividual = await loadIndividual(pool, ctx.gedcomId, spouseXref);

          if (spouseIndividual === null) {
            continue;
          }

          const spouseSex = sex(spouseIndividual.gedcom);
          const childSosa = sosaNumber * 2 + (spouseSex === 'F' ? 1 : 0);

          spouses.push(await buildAncestorsNode(ctx, spouseXref, childSosa, generationsRemaining - 1));
        }

        if (spouses.length > 0) {
          parentFamily = {
            familyXref,
            marriageSummaryHtml: buildMarriageSummaryHtml(shownFamily.facts),
            childCount: numberOfChildren(shownFamily.facts),
            spouses,
          };
        }
      }
    }
  }

  return { box, sosa: sosaNumber, parentFamily };
}

async function handleAncestorsChartPage(req, res, match, url) {
  const { tree: treeName, style, generations, xref } = match;

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // Mirrors AncestorsChartModule::handle()'s own "Convert POST requests
  // into GET requests for pretty URLs" - unlike every other POST->GET
  // redirect in this migration so far, style/generations/xref are PATH
  // segments here, not query params, so the redirect target is a
  // different PATH, not just a different query string.
  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);
    const postedStyle = ['tree', 'individuals', 'families'].includes(formData.get('style')) ? formData.get('style') : 'tree';
    const postedGenerations = Math.max(
      ANCESTORS_CHART_MIN_GENERATIONS,
      Math.min(parseInt(formData.get('generations'), 10) || 4, ANCESTORS_CHART_MAX_GENERATIONS),
    );
    const postedXref = formData.get('xref') ?? xref;

    res.writeHead(302, {
      Location: `/tree/${treeName}/ancestors-${postedStyle}-${postedGenerations}/${encodeURIComponent(postedXref)}`,
    });
    res.end();
    return;
  }

  if (generations < ANCESTORS_CHART_MIN_GENERATIONS || generations > ANCESTORS_CHART_MAX_GENERATIONS) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  try {
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'ancestors_chart'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // AncestorsChartModule has no $access_level override of its own,
    // same as every list module - AbstractModule's own class default,
    // Auth::PRIV_PRIVATE = 2 ("visitor") - confirmed live: no
    // wt_module_privacy override row for 'ancestors_chart' either.
    const chartAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'ancestors_chart',
      'Fisharebest\\Webtrees\\Module\\ModuleChartInterface',
      2,
    );

    if (chartAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const individual = await loadIndividual(pool, tree.gedcomId, xref);

    if (individual === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const showHighlightImages = await loadShowHighlightImagesPref(pool, tree.gedcomId);
    const showPrivateRelationships = await loadShowPrivateRelationshipsPref(pool, tree.gedcomId);

    const facts = parseFacts(individual.gedcom);
    const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
    const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, individual.xref);
    const viewerBase = {
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === individual.xref,
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead,
      relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
    };
    const treeForPrivacy = {
      hideLivePeople: treePrivacyPrefs.hideLivePeople,
      defaultResn: defaultResnInfo.individualResn,
      keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
      keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
    };

    // Mirrors Auth::checkIndividualAccess($individual, false, true)'s
    // own `$chart` bypass (app/Auth.php:225-245): SHOW_PRIVATE_RELATIONSHIPS
    // lets the chart's OWN subject individual be charted regardless of
    // their personal canShow() - same preference, same bypass shape as
    // chart relationship traversal itself, just applied once up front
    // to the root individual rather than per-box.
    const subjectShown = showPrivateRelationships || canShowRecord(treeForPrivacy, individual.gedcom, facts, viewerBase);

    if (!subjectShown) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const primaryName = extractPrimaryName(individual.gedcom);
    const individualFullNameHtml = primaryName !== null ? primaryName.full : `<span class="NAME" dir="auto" translate="no">${individual.xref}</span>`;
    const chartTitle = `Ancestors of ${individualFullNameHtml.replace(/<[^>]*>/g, '')}`;

    if (url.searchParams.get('ajax') === '1') {
      const traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel;
      const glideKey = await loadGlideKey(pool);

      const ctx = {
        gedcomId: tree.gedcomId,
        treeName: tree.name,
        tree,
        treePrivacyPrefs,
        showHighlightImages,
        viewerBase,
        traversalAccessLevel,
        relPrefs,
        glideKey,
        siteUrlConfig,
      };

      let bodyHtml;

      if (style === 'individuals' || style === 'families') {
        // Simplified for v1 (documented, not silently dropped): these
        // two alternate AJAX views reuse renderIndividualsTable()/
        // renderFamiliesTable() unchanged, but with plain real dates
        // only (no estimated-date heuristic) and no DataTables
        // filter-button codes - the chart's own real value is the
        // "tree" style; these two are a secondary convenience on the
        // SAME underlying ancestor set, not this step's primary target.
        const sosaRoot = await buildAncestorsNode(ctx, xref, 1, generations);
        const flatNodes = [];
        const collectNodes = (node) => {
          flatNodes.push(node);

          if (node.parentFamily !== null) {
            node.parentFamily.spouses.forEach(collectNodes);
          }
        };
        collectNodes(sosaRoot);

        if (style === 'individuals') {
          const individuals = flatNodes
            .filter((node) => node.box !== null)
            .map((node) => ({
              xref: node.box.xref,
              url: node.box.url,
              isPendingAddition: false,
              isPendingDeletion: false,
              allNames: [{ type: 'NAME', full: node.box.fullNameHtml }],
              primaryIndex: 0,
              sex: node.box.sex,
              sortName: node.box.fullNameHtml.replace(/<[^>]*>/g, ''),
              birthDatesHtml: node.box.birthSummaryHtml !== '' ? [node.box.birthSummaryHtml] : [],
              birthDateSortKey: 0,
              birthAnniversaryAge: null,
              birthPlaces: [],
              birthPlaceSortKey: '',
              numberOfChildren: 0,
              deathDatesHtml: node.box.deathSummaryHtml !== '' ? [node.box.deathSummaryHtml] : [],
              deathDateSortKey: 0,
              deathAnniversaryAge: null,
              ageAtDeath: null,
              deathPlaces: [],
              deathPlaceSortKey: '',
              lastChange: null,
              lastChangeSortKey: 0,
              sexFilterCode: node.box.sex,
              birthFilterCode: '',
              deathFilterCode: '',
              rootsLeavesFilterCode: '',
            }));

          bodyHtml = renderIndividualsTable({ individuals, showLastChange: false });
        } else {
          const families = flatNodes
            .filter((node) => node.parentFamily !== null)
            .map((node) => ({
              xref: node.parentFamily.familyXref,
              url: `/tree/${tree.name}/family/${node.parentFamily.familyXref}`,
              isPendingAddition: false,
              isPendingDeletion: false,
              husband: node.parentFamily.spouses[0]
                ? { allNames: [{ type: 'NAME', full: node.parentFamily.spouses[0].box.fullNameHtml }], primaryIndex: 0, sex: node.parentFamily.spouses[0].box.sex, url: node.parentFamily.spouses[0].box.url, sortName: '' }
                : null,
              wife: node.parentFamily.spouses[1]
                ? { allNames: [{ type: 'NAME', full: node.parentFamily.spouses[1].box.fullNameHtml }], primaryIndex: 0, sex: node.parentFamily.spouses[1].box.sex, url: node.parentFamily.spouses[1].box.url, sortName: '' }
                : null,
              husbandAge: null,
              wifeAge: null,
              anniversaryAge: null,
              marriageDatesHtml: [],
              marriageDateSortKey: 0,
              marriageYesNo: null,
              marriagePlaces: [],
              marriagePlaceSortKey: '',
              numberOfChildren: node.parentFamily.childCount,
              lastChange: null,
              lastChangeSortKey: 0,
              marriageFilterCode: '',
              aliveDeadFilterCode: '',
              rootsLeavesFilterCode: '',
            }));

          bodyHtml = renderFamiliesTable({ families, showLastChange: false });
        }
      } else {
        const root = await buildAncestorsNode(ctx, xref, 1, generations);
        bodyHtml = renderAncestorsTreeNode(root);
      }

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(bodyHtml);
      return;
    }

    const ajaxUrl = `/tree/${tree.name}/ancestors-${style}-${generations}/${encodeURIComponent(xref)}?ajax=1`;

    const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const genealogyMenuHtml = renderGenealogyMenuNav(
      await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: xref }),
    );
    const csrfToken = user !== null ? generateCsrfToken() : null;
    const html = renderAncestorsChartPage({
      tree,
      user,
      csrfToken,
      genealogyMenuHtml,
      title: chartTitle,
      individual: { xref: individual.xref, fullNameHtml: individualFullNameHtml },
      generations,
      minGenerations: ANCESTORS_CHART_MIN_GENERATIONS,
      maxGenerations: ANCESTORS_CHART_MAX_GENERATIONS,
      style,
      ajaxUrl,
    });

    const headers = { 'content-type': 'text/html; charset=utf-8' };

    if (csrfToken !== null) {
      headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
    }

    res.writeHead(200, headers);
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve ancestors chart:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

/**
 * Mirrors Date::julianDay()-based comparators (Family::marriageDateComparator()/
 * Individual::birthDateComparator()) to the degree this migration's
 * established "date comparisons via julianDay(), no PHP Collection sort
 * stability subtleties re-derived" simplification already covers
 * elsewhere - a record with no usable date sorts LAST (Infinity),
 * matching real PHP's own "unknown dates sort to the end" convention.
 */
function julianDayOrInfinity(dateOrNull) {
  return dateOrNull !== null && dateOrNull.date.isOK() ? dateOrNull.date.julianDay() : Infinity;
}

/**
 * Recursively resolves one node of the descendancy tree - mirrors
 * resources/views/modules/descendancy_chart/tree.phtml's own recursive
 * structure (see descendancy-chart-view.mjs's own renderDescendancyTreeNode()
 * doc comment for the exact shape and the real differences from
 * buildAncestorsNode() above: multiple families per node, a terminal
 * (non-recursed) spouse box per family, and a single child-numbering
 * counter shared across ALL of a node's own families, matching real
 * PHP's own `$child_number` - declared once, outside the families
 * loop, in tree.phtml).
 */
async function buildDescendancyNode(ctx, individualXref, daboville, generationsRemaining) {
  const individual = await loadIndividual(pool, ctx.gedcomId, individualXref);

  if (individual === null) {
    return { box: null, daboville, families: [] };
  }

  const defaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, individualXref);
  const box = await buildChartBoxViewModel(
    pool,
    ctx.gedcomId,
    ctx.treeName,
    ctx.treePrivacyPrefs,
    ctx.showHighlightImages,
    individual,
    ctx.viewerBase,
    ctx.traversalAccessLevel,
    defaultResnInfo,
    ctx.glideKey,
    ctx.siteUrlConfig,
  );

  const families = [];

  if (generationsRemaining > 1) {
    const related = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, individualXref);
    const resolvedFamilies = [];

    for (const familyXref of related.spouseFamilies) {
      const shownFamily = await resolveShownFamily(ctx.tree, ctx.treePrivacyPrefs, ctx.traversalAccessLevel, ctx.relPrefs, familyXref);

      if (shownFamily !== null) {
        resolvedFamilies.push(shownFamily);
      }
    }

    resolvedFamilies.sort((a, b) => julianDayOrInfinity(getMarriageDate(a.facts)) - julianDayOrInfinity(getMarriageDate(b.facts)));

    let childCounter = 0;

    for (const shownFamily of resolvedFamilies) {
      const isHusband = shownFamily.family.husb === individualXref;
      const spouseResolved = isHusband ? shownFamily.wife : shownFamily.husband;

      let spouseBox = null;

      if (spouseEntersChart(spouseResolved)) {
        const spouseDefaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, spouseResolved.individual.xref);

        spouseBox = await buildChartBoxViewModel(
          pool,
          ctx.gedcomId,
          ctx.treeName,
          ctx.treePrivacyPrefs,
          ctx.showHighlightImages,
          spouseResolved.individual,
          ctx.viewerBase,
          ctx.traversalAccessLevel,
          spouseDefaultResnInfo,
          ctx.glideKey,
          ctx.siteUrlConfig,
        );
      }

      const showableChildren = shownFamily.children.filter(spouseEntersChart);
      showableChildren.sort((a, b) => julianDayOrInfinity(getBirthDate(a.facts)) - julianDayOrInfinity(getBirthDate(b.facts)));

      const childNodes = [];

      for (const childResolved of showableChildren) {
        childCounter += 1;
        childNodes.push(
          await buildDescendancyNode(ctx, childResolved.individual.xref, `${daboville}.${childCounter}`, generationsRemaining - 1),
        );
      }

      families.push({
        familyXref: shownFamily.family.xref,
        marriageSummaryHtml: buildMarriageSummaryHtml(shownFamily.facts),
        childCount: numberOfChildren(shownFamily.facts),
        spouseBox,
        children: childNodes,
      });
    }
  }

  return { box, daboville, families };
}

/**
 * Flattens an already-resolved descendancy tree into every node/family
 * it contains - used by the "individuals"/"families" AJAX styles below
 * (same simplification already established for Ancestors: these two
 * secondary views are built from the SAME resolved descendant set as
 * the "tree" style, not a separately-queried flat BFS).
 */
function flattenDescendancyNodes(root) {
  const nodes = [];

  const visit = (node) => {
    nodes.push(node);
    node.families.forEach((family) => family.children.forEach(visit));
  };

  visit(root);

  return nodes;
}

async function handleDescendancyChartPage(req, res, match, url) {
  const { tree: treeName, style, generations, xref } = match;

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);
    const postedStyle = ['tree', 'individuals', 'families'].includes(formData.get('style')) ? formData.get('style') : 'tree';
    const postedGenerations = Math.max(
      ANCESTORS_CHART_MIN_GENERATIONS,
      Math.min(parseInt(formData.get('generations'), 10) || 3, ANCESTORS_CHART_MAX_GENERATIONS),
    );
    const postedXref = formData.get('xref') ?? xref;

    res.writeHead(302, {
      Location: `/tree/${treeName}/descendants-${postedStyle}-${postedGenerations}/${encodeURIComponent(postedXref)}`,
    });
    res.end();
    return;
  }

  if (generations < ANCESTORS_CHART_MIN_GENERATIONS || generations > ANCESTORS_CHART_MAX_GENERATIONS) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  try {
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'descendancy_chart'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // DescendancyChartModule has no $access_level override of its own,
    // same as every other chart/list module - confirmed live: no
    // wt_module_privacy override row for 'descendancy_chart' either.
    const chartAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'descendancy_chart',
      'Fisharebest\\Webtrees\\Module\\ModuleChartInterface',
      2,
    );

    if (chartAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const individual = await loadIndividual(pool, tree.gedcomId, xref);

    if (individual === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const showHighlightImages = await loadShowHighlightImagesPref(pool, tree.gedcomId);
    const showPrivateRelationships = await loadShowPrivateRelationshipsPref(pool, tree.gedcomId);

    const facts = parseFacts(individual.gedcom);
    const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
    const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, individual.xref);
    const viewerBase = {
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === individual.xref,
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead,
      relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
    };
    const treeForPrivacy = {
      hideLivePeople: treePrivacyPrefs.hideLivePeople,
      defaultResn: defaultResnInfo.individualResn,
      keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
      keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
    };

    const subjectShown = showPrivateRelationships || canShowRecord(treeForPrivacy, individual.gedcom, facts, viewerBase);

    if (!subjectShown) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const primaryName = extractPrimaryName(individual.gedcom);
    const individualFullNameHtml = primaryName !== null ? primaryName.full : `<span class="NAME" dir="auto" translate="no">${individual.xref}</span>`;
    const chartTitle = `Descendants of ${individualFullNameHtml.replace(/<[^>]*>/g, '')}`;

    if (url.searchParams.get('ajax') === '1') {
      const traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel;
      const glideKey = await loadGlideKey(pool);

      const ctx = {
        gedcomId: tree.gedcomId,
        treeName: tree.name,
        tree,
        treePrivacyPrefs,
        showHighlightImages,
        viewerBase,
        traversalAccessLevel,
        relPrefs,
        glideKey,
        siteUrlConfig,
      };

      // Mirrors DescendancyChartModule::handle()'s own `$generations - 1`
      // for the individuals/families AJAX styles (one fewer than the
      // "tree" style's own generations count - real PHP's own
      // chart_service calls pass this explicitly).
      const root = await buildDescendancyNode(ctx, xref, '1', style === 'tree' ? generations : generations - 1);

      let bodyHtml;

      if (style === 'individuals' || style === 'families') {
        const flatNodes = flattenDescendancyNodes(root);

        if (style === 'individuals') {
          const individuals = flatNodes
            .filter((node) => node.box !== null)
            .map((node) => ({
              xref: node.box.xref,
              url: node.box.url,
              isPendingAddition: false,
              isPendingDeletion: false,
              allNames: [{ type: 'NAME', full: node.box.fullNameHtml }],
              primaryIndex: 0,
              sex: node.box.sex,
              sortName: node.box.fullNameHtml.replace(/<[^>]*>/g, ''),
              birthDatesHtml: node.box.birthSummaryHtml !== '' ? [node.box.birthSummaryHtml] : [],
              birthDateSortKey: 0,
              birthAnniversaryAge: null,
              birthPlaces: [],
              birthPlaceSortKey: '',
              numberOfChildren: 0,
              deathDatesHtml: node.box.deathSummaryHtml !== '' ? [node.box.deathSummaryHtml] : [],
              deathDateSortKey: 0,
              deathAnniversaryAge: null,
              ageAtDeath: null,
              deathPlaces: [],
              deathPlaceSortKey: '',
              lastChange: null,
              lastChangeSortKey: 0,
              sexFilterCode: node.box.sex,
              birthFilterCode: '',
              deathFilterCode: '',
              rootsLeavesFilterCode: '',
            }));

          bodyHtml = renderIndividualsTable({ individuals, showLastChange: false });
        } else {
          const families = flatNodes
            .flatMap((node) => node.families)
            .map((family) => ({
              xref: family.familyXref,
              url: `/tree/${tree.name}/family/${family.familyXref}`,
              isPendingAddition: false,
              isPendingDeletion: false,
              husband: null,
              wife: family.spouseBox
                ? { allNames: [{ type: 'NAME', full: family.spouseBox.fullNameHtml }], primaryIndex: 0, sex: family.spouseBox.sex, url: family.spouseBox.url, sortName: '' }
                : null,
              husbandAge: null,
              wifeAge: null,
              anniversaryAge: null,
              marriageDatesHtml: [],
              marriageDateSortKey: 0,
              marriageYesNo: null,
              marriagePlaces: [],
              marriagePlaceSortKey: '',
              numberOfChildren: family.childCount,
              lastChange: null,
              lastChangeSortKey: 0,
              marriageFilterCode: '',
              aliveDeadFilterCode: '',
              rootsLeavesFilterCode: '',
            }));

          bodyHtml = renderFamiliesTable({ families, showLastChange: false });
        }
      } else {
        bodyHtml = renderDescendancyTreeNode(root);
      }

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(bodyHtml);
      return;
    }

    const ajaxUrl = `/tree/${tree.name}/descendants-${style}-${generations}/${encodeURIComponent(xref)}?ajax=1`;

    const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const genealogyMenuHtml = renderGenealogyMenuNav(
      await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: xref }),
    );
    const csrfToken = user !== null ? generateCsrfToken() : null;
    const html = renderDescendancyChartPage({
      tree,
      user,
      csrfToken,
      genealogyMenuHtml,
      title: chartTitle,
      individual: { xref: individual.xref, fullNameHtml: individualFullNameHtml },
      generations,
      minGenerations: ANCESTORS_CHART_MIN_GENERATIONS,
      maxGenerations: ANCESTORS_CHART_MAX_GENERATIONS,
      style,
      ajaxUrl,
    });

    const headers = { 'content-type': 'text/html; charset=utf-8' };

    if (csrfToken !== null) {
      headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
    }

    res.writeHead(200, headers);
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve descendancy chart:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

// Mirrors HourglassChartModule::MINIMUM_GENERATIONS/MAXIMUM_GENERATIONS
// (app/Module/HourglassChartModule.php:53,55) - same values as
// AncestorsChartModule/DescendancyChartModule, kept as its own pair of
// constants (not reused) since real PHP defines them separately too.
const HOURGLASS_CHART_MIN_GENERATIONS = 2;
const HOURGLASS_CHART_MAX_GENERATIONS = 63;

/**
 * Recursively resolves one "parents" node of the hourglass chart -
 * mirrors resources/views/modules/hourglass-chart/parents.phtml's own
 * recursive structure exactly (see hourglass-chart-view.mjs's own
 * renderHourglassAncestorsNode() doc comment for the shape): a family,
 * each side (husband/wife) with its own box (null if that side fails
 * its own canShowName() gate - Family::husband()/wife()'s own weaker
 * gate, same as spouseEntersChart() elsewhere in this file) and, only
 * when that side HAS a box AND has its own parent family, either a
 * nested recursive call (generations remain) or a lazy-load arrow
 * (they don't - mirrors getAncestorsAction(), which always resolves
 * exactly one more generation, generations=1 fixed).
 *
 * Returns null when there's no parent family at all (same condition
 * real PHP checks before calling this view in the first place -
 * chart.phtml's own `$individual->childFamilies()->first() !== null`),
 * so this same function serves BOTH the main chart's own first call
 * (on the root individual) and every recursive call (on a parent) and
 * the lazy-load action's own entry point (on a specific family xref)
 * without the caller needing to special-case any of the three.
 */
async function buildHourglassAncestorsNode(ctx, individualXref, generationsRemaining) {
  const related = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, individualXref);
  const familyXref = related.parentFamilies[0] ?? null;

  if (familyXref === null) {
    return null;
  }

  const shownFamily = await resolveShownFamily(ctx.tree, ctx.treePrivacyPrefs, ctx.traversalAccessLevel, ctx.relPrefs, familyXref);

  if (shownFamily === null) {
    return null;
  }

  const buildSide = async (resolvedMember) => {
    if (!spouseEntersChart(resolvedMember)) {
      return { box: null, further: null };
    }

    const memberDefaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, resolvedMember.individual.xref);
    const box = await buildChartBoxViewModel(
      pool,
      ctx.gedcomId,
      ctx.treeName,
      ctx.treePrivacyPrefs,
      ctx.showHighlightImages,
      resolvedMember.individual,
      ctx.viewerBase,
      ctx.traversalAccessLevel,
      memberDefaultResnInfo,
      ctx.glideKey,
      ctx.siteUrlConfig,
    );

    const memberRelated = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, resolvedMember.individual.xref);
    const ownParentFamilyXref = memberRelated.parentFamilies[0] ?? null;

    if (ownParentFamilyXref === null) {
      return { box, further: null };
    }

    if (generationsRemaining > 1) {
      const nested = await buildHourglassAncestorsNode(ctx, resolvedMember.individual.xref, generationsRemaining - 1);

      return { box, further: nested !== null ? { kind: 'nested', node: nested } : null };
    }

    return { box, further: { kind: 'arrow', familyXref: ownParentFamilyXref } };
  };

  const husband = await buildSide(shownFamily.husband);
  const wife = await buildSide(shownFamily.wife);

  return { familyXref, husband, wife };
}

/**
 * Recursively resolves one "children" node of the hourglass chart -
 * mirrors resources/views/modules/hourglass-chart/children.phtml's own
 * recursive structure exactly (see hourglass-chart-view.mjs's own
 * renderHourglassDescendantsNode() doc comment for the shape). Unlike
 * buildHourglassAncestorsNode() above, a child's own box is NEVER null
 * here - `children` is already every member of `resolvedChildren` that
 * passed Family::children()'s own canShowName() filter (the same
 * `.filter(spouseEntersChart)` convention established by
 * buildDescendancyNode() above), so the box always gets built; only
 * the FURTHER-descent decision (nested vs. lazy-load arrow) depends on
 * whether grandchildren exist and whether generations remain - mirrors
 * getDescendantsAction(), which always resolves exactly one more
 * generation, generations=1 fixed.
 *
 * @param {object} ctx
 * @param {Array<{individual: object, facts: string[]}>} resolvedChildren already canShowName()-filtered
 * @param {number} generationsRemaining
 * @param {boolean} spouses
 */
async function buildHourglassDescendantsNode(ctx, resolvedChildren, generationsRemaining, spouses) {
  const items = [];

  for (const childResolved of resolvedChildren) {
    const childXref = childResolved.individual.xref;
    const childDefaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, childXref);
    const box = await buildChartBoxViewModel(
      pool,
      ctx.gedcomId,
      ctx.treeName,
      ctx.treePrivacyPrefs,
      ctx.showHighlightImages,
      childResolved.individual,
      ctx.viewerBase,
      ctx.traversalAccessLevel,
      childDefaultResnInfo,
      ctx.glideKey,
      ctx.siteUrlConfig,
    );

    const related = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, childXref);
    const resolvedSpouseFamilies = [];

    for (const spouseFamilyXref of related.spouseFamilies) {
      const shownFamily = await resolveShownFamily(ctx.tree, ctx.treePrivacyPrefs, ctx.traversalAccessLevel, ctx.relPrefs, spouseFamilyXref);

      if (shownFamily !== null) {
        resolvedSpouseFamilies.push(shownFamily);
      }
    }

    const grandchildren = resolvedSpouseFamilies.flatMap((shownFamily) => shownFamily.children.filter(spouseEntersChart));

    let further = null;

    if (grandchildren.length > 0) {
      if (generationsRemaining > 1) {
        further = { kind: 'nested', items: await buildHourglassDescendantsNode(ctx, grandchildren, generationsRemaining - 1, spouses) };
      } else {
        further = { kind: 'arrow', xref: childXref };
      }
    }

    const spouseBoxes = [];

    if (spouses) {
      for (const shownFamily of resolvedSpouseFamilies) {
        const isHusband = shownFamily.family.husb === childXref;
        const spouseResolved = isHusband ? shownFamily.wife : shownFamily.husband;

        if (spouseEntersChart(spouseResolved)) {
          const spouseDefaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, spouseResolved.individual.xref);
          spouseBoxes.push(
            await buildChartBoxViewModel(
              pool,
              ctx.gedcomId,
              ctx.treeName,
              ctx.treePrivacyPrefs,
              ctx.showHighlightImages,
              spouseResolved.individual,
              ctx.viewerBase,
              ctx.traversalAccessLevel,
              spouseDefaultResnInfo,
              ctx.glideKey,
              ctx.siteUrlConfig,
            ),
          );
        } else {
          spouseBoxes.push(null);
        }
      }
    }

    items.push({ box, spouseBoxes, further });
  }

  return items;
}

async function handleHourglassChartPage(req, res, match, url) {
  const { tree: treeName, generations, spouses, xref } = match;

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // Mirrors HourglassChartModule::handle()'s own "Convert POST requests
  // into GET requests for pretty URLs" - same path-segment redirect
  // shape as Ancestors/Descendancy above.
  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);
    const postedGenerations = Math.max(
      HOURGLASS_CHART_MIN_GENERATIONS,
      Math.min(parseInt(formData.get('generations'), 10) || 3, HOURGLASS_CHART_MAX_GENERATIONS),
    );
    const postedSpouses = formData.get('spouses') !== null ? '1' : '0';
    const postedXref = formData.get('xref') ?? xref;

    res.writeHead(302, {
      Location: `/tree/${treeName}/hourglass-${postedGenerations}-${postedSpouses}/${encodeURIComponent(postedXref)}`,
    });
    res.end();
    return;
  }

  if (generations < HOURGLASS_CHART_MIN_GENERATIONS || generations > HOURGLASS_CHART_MAX_GENERATIONS) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  try {
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'hourglass_chart'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // HourglassChartModule has no $access_level override of its own,
    // same as every other chart/list module.
    const chartAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'hourglass_chart',
      'Fisharebest\\Webtrees\\Module\\ModuleChartInterface',
      2,
    );

    if (chartAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const individual = await loadIndividual(pool, tree.gedcomId, xref);

    if (individual === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const showHighlightImages = await loadShowHighlightImagesPref(pool, tree.gedcomId);
    const showPrivateRelationships = await loadShowPrivateRelationshipsPref(pool, tree.gedcomId);

    const facts = parseFacts(individual.gedcom);
    const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
    const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, individual.xref);
    const viewerBase = {
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === individual.xref,
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead,
      relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
    };
    const treeForPrivacy = {
      hideLivePeople: treePrivacyPrefs.hideLivePeople,
      defaultResn: defaultResnInfo.individualResn,
      keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
      keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
    };

    const subjectShown = showPrivateRelationships || canShowRecord(treeForPrivacy, individual.gedcom, facts, viewerBase);

    if (!subjectShown) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const primaryName = extractPrimaryName(individual.gedcom);
    const individualFullNameHtml = primaryName !== null ? primaryName.full : `<span class="NAME" dir="auto" translate="no">${individual.xref}</span>`;
    const chartTitle = `Hourglass chart of ${individualFullNameHtml.replace(/<[^>]*>/g, '')}`;

    if (url.searchParams.get('ajax') === '1') {
      const traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel;
      const glideKey = await loadGlideKey(pool);

      const ctx = {
        gedcomId: tree.gedcomId,
        treeName: tree.name,
        tree,
        treePrivacyPrefs,
        showHighlightImages,
        viewerBase,
        traversalAccessLevel,
        relPrefs,
        glideKey,
        siteUrlConfig,
      };

      const individualBox = await buildChartBoxViewModel(
        pool,
        ctx.gedcomId,
        ctx.treeName,
        ctx.treePrivacyPrefs,
        ctx.showHighlightImages,
        individual,
        ctx.viewerBase,
        ctx.traversalAccessLevel,
        defaultResnInfo,
        ctx.glideKey,
        ctx.siteUrlConfig,
      );

      const related = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, xref);
      const resolvedSpouseFamilies = [];

      for (const spouseFamilyXref of related.spouseFamilies) {
        const shownFamily = await resolveShownFamily(ctx.tree, ctx.treePrivacyPrefs, ctx.traversalAccessLevel, ctx.relPrefs, spouseFamilyXref);

        if (shownFamily !== null) {
          resolvedSpouseFamilies.push(shownFamily);
        }
      }

      const spouseBoxes = [];

      if (spouses) {
        for (const shownFamily of resolvedSpouseFamilies) {
          const isHusband = shownFamily.family.husb === xref;
          const spouseResolved = isHusband ? shownFamily.wife : shownFamily.husband;

          if (spouseEntersChart(spouseResolved)) {
            const spouseDefaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, spouseResolved.individual.xref);
            spouseBoxes.push(
              await buildChartBoxViewModel(
                pool,
                ctx.gedcomId,
                ctx.treeName,
                ctx.treePrivacyPrefs,
                ctx.showHighlightImages,
                spouseResolved.individual,
                ctx.viewerBase,
                ctx.traversalAccessLevel,
                spouseDefaultResnInfo,
                ctx.glideKey,
                ctx.siteUrlConfig,
              ),
            );
          } else {
            spouseBoxes.push(null);
          }
        }
      }

      const rootChildren = resolvedSpouseFamilies.flatMap((shownFamily) => shownFamily.children.filter(spouseEntersChart));
      const descendantsItems = await buildHourglassDescendantsNode(ctx, rootChildren, generations - 1, spouses);
      const ancestorsNode = await buildHourglassAncestorsNode(ctx, xref, generations - 1);

      const bodyHtml = renderHourglassChart({
        individualBox,
        spouseBoxes,
        descendantsItems,
        ancestorsNode,
        treeName: tree.name,
        spouses,
      });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(bodyHtml);
      return;
    }

    const ajaxUrl = `/tree/${tree.name}/hourglass-${generations}-${spouses ? '1' : '0'}/${encodeURIComponent(xref)}?ajax=1`;

    const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const genealogyMenuHtml = renderGenealogyMenuNav(
      await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: xref }),
    );
    const csrfToken = user !== null ? generateCsrfToken() : null;
    const html = renderHourglassChartPage({
      tree,
      user,
      csrfToken,
      genealogyMenuHtml,
      title: chartTitle,
      individual: { xref: individual.xref, fullNameHtml: individualFullNameHtml },
      generations,
      minGenerations: HOURGLASS_CHART_MIN_GENERATIONS,
      maxGenerations: HOURGLASS_CHART_MAX_GENERATIONS,
      spouses,
      ajaxUrl,
    });

    const headers = { 'content-type': 'text/html; charset=utf-8' };

    if (csrfToken !== null) {
      headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
    }

    res.writeHead(200, headers);
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve hourglass chart:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

/**
 * The lazy-load "expand one more generation" arrow endpoints behind
 * HourglassChartModule::getAncestorsAction()/getDescendantsAction() -
 * /module/hourglass_chart/Ancestors/{tree}?xref={familyXref} and
 * /module/hourglass_chart/Descendants/{tree}?xref={individualXref}&spouses={0|1}.
 * Each always resolves exactly one more generation (generations=1
 * fixed, same as real PHP) and returns a bare HTML fragment (no page
 * shell, no wt-chart-hourglass wrapper, no <script> - those only exist
 * in the main chart's own AJAX response) to be `.load()`-ed into the
 * clicked arrow's own parent element.
 *
 * Access is deliberately NOT given the chart's own SHOW_PRIVATE_RELATIONSHIPS
 * traversal bypass for the Ancestors action - mirrors
 * Auth::checkFamilyAccess()'s own unconditional `$family->canShow()`
 * check (app/Auth.php:180-199), which (unlike checkIndividualAccess())
 * has no `$chart` bypass parameter at all. The Descendants action,
 * however, mirrors checkIndividualAccess($individual, false, true)'s
 * OWN bypass (same shape as the main chart's root individual above) -
 * a real, deliberate asymmetry in webtrees' own HourglassChartModule.
 */
async function handleHourglassChartAction(req, res, match, url) {
  const { action, tree: treeName } = match;

  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
    return;
  }

  try {
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'hourglass_chart'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const xref = url.searchParams.get('xref');

    if (xref === null) {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const showHighlightImages = await loadShowHighlightImagesPref(pool, tree.gedcomId);
    const showPrivateRelationships = await loadShowPrivateRelationshipsPref(pool, tree.gedcomId);
    const glideKey = await loadGlideKey(pool);

    const viewerBase = {
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === xref,
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead: false,
      relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
    };

    if (action === 'Ancestors') {
      // checkFamilyAccess() has no SHOW_PRIVATE_RELATIONSHIPS bypass -
      // resolve at the viewer's own plain accessLevel.
      const shownFamily = await resolveShownFamily(tree, treePrivacyPrefs, accessLevel, relPrefs, xref);

      if (shownFamily === null) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      const ctx = {
        gedcomId: tree.gedcomId,
        treeName: tree.name,
        tree,
        treePrivacyPrefs,
        showHighlightImages,
        viewerBase,
        traversalAccessLevel: accessLevel,
        relPrefs,
        glideKey,
        siteUrlConfig,
      };

      const buildSide = async (resolvedMember) => {
        if (!spouseEntersChart(resolvedMember)) {
          return { box: null, further: null };
        }

        const memberDefaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, resolvedMember.individual.xref);
        const box = await buildChartBoxViewModel(
          pool,
          ctx.gedcomId,
          ctx.treeName,
          ctx.treePrivacyPrefs,
          ctx.showHighlightImages,
          resolvedMember.individual,
          ctx.viewerBase,
          ctx.traversalAccessLevel,
          memberDefaultResnInfo,
          ctx.glideKey,
          ctx.siteUrlConfig,
        );

        const memberRelated = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, resolvedMember.individual.xref);
        const ownParentFamilyXref = memberRelated.parentFamilies[0] ?? null;

        return { box, further: ownParentFamilyXref !== null ? { kind: 'arrow', familyXref: ownParentFamilyXref } : null };
      };

      const node = {
        familyXref: xref,
        husband: await buildSide(shownFamily.husband),
        wife: await buildSide(shownFamily.wife),
      };

      const bodyHtml = renderHourglassAncestorsNode(node, tree.name);

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(bodyHtml);
      return;
    }

    if (action === 'Descendants') {
      const spouses = url.searchParams.get('spouses') === '1';
      // checkIndividualAccess($individual, false, true)'s own $chart
      // bypass - same traversalAccessLevel convention as the main
      // chart's root individual above.
      const traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel;

      const individual = await loadIndividual(pool, tree.gedcomId, xref);

      if (individual === null) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const facts = parseFacts(individual.gedcom);
      const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
      const individualViewerBase = { ...viewerBase, isSelfRecord: relPrefs.gedcomid === xref, dead };
      const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, xref);
      const treeForPrivacy = {
        hideLivePeople: treePrivacyPrefs.hideLivePeople,
        defaultResn: defaultResnInfo.individualResn,
        keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
        keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
      };

      const subjectShown = showPrivateRelationships || canShowRecord(treeForPrivacy, individual.gedcom, facts, individualViewerBase);

      if (!subjectShown) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('Forbidden');
        return;
      }

      const ctx = {
        gedcomId: tree.gedcomId,
        treeName: tree.name,
        tree,
        treePrivacyPrefs,
        showHighlightImages,
        viewerBase: individualViewerBase,
        traversalAccessLevel,
        relPrefs,
        glideKey,
        siteUrlConfig,
      };

      const related = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, xref);
      const resolvedSpouseFamilies = [];

      for (const spouseFamilyXref of related.spouseFamilies) {
        const shownFamily = await resolveShownFamily(ctx.tree, ctx.treePrivacyPrefs, ctx.traversalAccessLevel, ctx.relPrefs, spouseFamilyXref);

        if (shownFamily !== null) {
          resolvedSpouseFamilies.push(shownFamily);
        }
      }

      const children = resolvedSpouseFamilies.flatMap((shownFamily) => shownFamily.children.filter(spouseEntersChart));
      const items = await buildHourglassDescendantsNode(ctx, children, 1, spouses);
      const bodyHtml = renderHourglassDescendantsNode(items, tree.name, spouses);

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(bodyHtml);
      return;
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
  } catch (error) {
    console.error('Failed to resolve hourglass chart action:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

// Mirrors FamilyBookChartModule's own limits (app/Module/FamilyBookChartModule.php:52,53,55,56)
// - MAXIMUM_GENERATIONS is the same 63 as Ancestors/Descendancy/Hourglass
// (always 64-bit on Node's build), kept as its own constant since real
// PHP defines it separately per module too.
const FAMILY_BOOK_CHART_MIN_BOOK_SIZE = 2;
const FAMILY_BOOK_CHART_MAX_BOOK_SIZE = 5;
const FAMILY_BOOK_CHART_MIN_GENERATIONS = 2;
const FAMILY_BOOK_CHART_MAX_GENERATIONS = 63;

/**
 * Recursively resolves one "parents" node of the family book chart -
 * mirrors resources/views/modules/family-book-chart/parents.phtml's
 * own recursive structure exactly (see family-book-chart-view.mjs's
 * own renderFamilyBookParentsNode() doc comment for the shape and for
 * why - unlike Hourglass's ancestors node - this ALWAYS recurses one
 * level deeper per side while `radiusRemaining > 1`, producing empty
 * placeholder boxes once the real chain runs out rather than stopping
 * early or offering a lazy-load arrow).
 *
 * @param {object} ctx
 * @param {string|null} familyXref
 * @param {number} radiusRemaining
 */
async function buildFamilyBookParentsNode(ctx, familyXref, radiusRemaining) {
  let husbandBox = null;
  let wifeBox = null;
  let husbandNextFamilyXref = null;
  let wifeNextFamilyXref = null;

  if (familyXref !== null) {
    const shownFamily = await resolveShownFamily(ctx.tree, ctx.treePrivacyPrefs, ctx.traversalAccessLevel, ctx.relPrefs, familyXref);

    if (shownFamily !== null) {
      if (spouseEntersChart(shownFamily.husband)) {
        const husbandDefaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, shownFamily.husband.individual.xref);
        husbandBox = await buildChartBoxViewModel(
          pool,
          ctx.gedcomId,
          ctx.treeName,
          ctx.treePrivacyPrefs,
          ctx.showHighlightImages,
          shownFamily.husband.individual,
          ctx.viewerBase,
          ctx.traversalAccessLevel,
          husbandDefaultResnInfo,
          ctx.glideKey,
          ctx.siteUrlConfig,
        );

        const husbandRelated = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, shownFamily.husband.individual.xref);
        husbandNextFamilyXref = husbandRelated.parentFamilies[0] ?? null;
      }

      if (spouseEntersChart(shownFamily.wife)) {
        const wifeDefaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, shownFamily.wife.individual.xref);
        wifeBox = await buildChartBoxViewModel(
          pool,
          ctx.gedcomId,
          ctx.treeName,
          ctx.treePrivacyPrefs,
          ctx.showHighlightImages,
          shownFamily.wife.individual,
          ctx.viewerBase,
          ctx.traversalAccessLevel,
          wifeDefaultResnInfo,
          ctx.glideKey,
          ctx.siteUrlConfig,
        );

        const wifeRelated = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, shownFamily.wife.individual.xref);
        wifeNextFamilyXref = wifeRelated.parentFamilies[0] ?? null;
      }
    }
  }

  const husband = { box: husbandBox, nested: null };
  const wife = { box: wifeBox, nested: null };

  if (radiusRemaining > 1) {
    husband.nested = await buildFamilyBookParentsNode(ctx, husbandNextFamilyXref, radiusRemaining - 1);
    wife.nested = await buildFamilyBookParentsNode(ctx, wifeNextFamilyXref, radiusRemaining - 1);
  }

  return { husband, wife };
}

/**
 * Recursively resolves one "children" node of the family book chart -
 * mirrors resources/views/modules/family-book-chart/children.phtml's
 * own recursive structure exactly (see family-book-chart-view.mjs's
 * own renderFamilyBookChildrenNode() doc comment for the shape). No
 * spouse boxes here (only the block's own center individual gets
 * those) and no lazy-load arrow (a radius that runs out before
 * grandchildren simply omits them).
 *
 * @param {object} ctx
 * @param {Array<{individual: object, facts: string[]}>} resolvedChildren already canShowName()-filtered
 * @param {number} radiusRemaining
 */
async function buildFamilyBookChildrenNode(ctx, resolvedChildren, radiusRemaining) {
  const items = [];

  for (const childResolved of resolvedChildren) {
    const childXref = childResolved.individual.xref;
    const childDefaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, childXref);
    const box = await buildChartBoxViewModel(
      pool,
      ctx.gedcomId,
      ctx.treeName,
      ctx.treePrivacyPrefs,
      ctx.showHighlightImages,
      childResolved.individual,
      ctx.viewerBase,
      ctx.traversalAccessLevel,
      childDefaultResnInfo,
      ctx.glideKey,
      ctx.siteUrlConfig,
    );

    const related = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, childXref);
    const resolvedSpouseFamilies = [];

    for (const spouseFamilyXref of related.spouseFamilies) {
      const shownFamily = await resolveShownFamily(ctx.tree, ctx.treePrivacyPrefs, ctx.traversalAccessLevel, ctx.relPrefs, spouseFamilyXref);

      if (shownFamily !== null) {
        resolvedSpouseFamilies.push(shownFamily);
      }
    }

    const grandchildren = resolvedSpouseFamilies.flatMap((shownFamily) => shownFamily.children.filter(spouseEntersChart));

    const nested =
      radiusRemaining > 1 && grandchildren.length > 0 ? await buildFamilyBookChildrenNode(ctx, grandchildren, radiusRemaining - 1) : null;

    items.push({ box, nested });
  }

  return items;
}

/**
 * Builds the flat, pre-order sequence of "family of X" blocks that
 * make up the whole family book - see family-book-chart-view.mjs's own
 * top-of-file doc comment for why this is flattened rather than a tree
 * (mirrors chart.phtml's own "render self, then `<hr>` + recurse into
 * chart.phtml again for EACH child" structure exactly: this individual's
 * own block first, then every one of ITS children's own whole
 * sub-sequence, in order, appended after).
 *
 * @param {object} ctx
 * @param {{xref: string, gedcom: string}} individual already canShowName()-cleared
 * @param {number} generationsRemaining
 * @param {number} bookSize
 * @param {boolean} spouses
 * @returns {Promise<Array<object>>}
 */
async function buildFamilyBookBlocks(ctx, individual, generationsRemaining, bookSize, spouses) {
  const defaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, individual.xref);
  const individualBox = await buildChartBoxViewModel(
    pool,
    ctx.gedcomId,
    ctx.treeName,
    ctx.treePrivacyPrefs,
    ctx.showHighlightImages,
    individual,
    ctx.viewerBase,
    ctx.traversalAccessLevel,
    defaultResnInfo,
    ctx.glideKey,
    ctx.siteUrlConfig,
  );

  const related = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, individual.xref);
  const resolvedSpouseFamilies = [];

  for (const spouseFamilyXref of related.spouseFamilies) {
    const shownFamily = await resolveShownFamily(ctx.tree, ctx.treePrivacyPrefs, ctx.traversalAccessLevel, ctx.relPrefs, spouseFamilyXref);

    if (shownFamily !== null) {
      resolvedSpouseFamilies.push(shownFamily);
    }
  }

  const spouseBoxes = [];

  if (spouses) {
    for (const shownFamily of resolvedSpouseFamilies) {
      const isHusband = shownFamily.family.husb === individual.xref;
      const spouseResolved = isHusband ? shownFamily.wife : shownFamily.husband;

      if (spouseEntersChart(spouseResolved)) {
        const spouseDefaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, spouseResolved.individual.xref);
        spouseBoxes.push(
          await buildChartBoxViewModel(
            pool,
            ctx.gedcomId,
            ctx.treeName,
            ctx.treePrivacyPrefs,
            ctx.showHighlightImages,
            spouseResolved.individual,
            ctx.viewerBase,
            ctx.traversalAccessLevel,
            spouseDefaultResnInfo,
            ctx.glideKey,
            ctx.siteUrlConfig,
          ),
        );
      } else {
        spouseBoxes.push(null);
      }
    }
  }

  const children = resolvedSpouseFamilies.flatMap((shownFamily) => shownFamily.children.filter(spouseEntersChart));
  const childrenNode = await buildFamilyBookChildrenNode(ctx, children, bookSize - 1);
  const parentFamilyXref = related.parentFamilies[0] ?? null;
  const parentsNode = await buildFamilyBookParentsNode(ctx, parentFamilyXref, bookSize - 1);

  const primaryName = extractPrimaryName(individual.gedcom);
  const fullNameHtml = primaryName !== null ? primaryName.full : `<span class="NAME" dir="auto" translate="no">${individual.xref}</span>`;

  const blocks = [{ fullNameHtml, individualBox, spouseBoxes, childrenNode, parentsNode }];

  if (generationsRemaining > 1) {
    for (const childResolved of children) {
      const childBlocks = await buildFamilyBookBlocks(ctx, childResolved.individual, generationsRemaining - 1, bookSize, spouses);
      blocks.push(...childBlocks);
    }
  }

  return blocks;
}

async function handleFamilyBookChartPage(req, res, match, url) {
  const { tree: treeName, bookSize, generations, spouses, xref } = match;

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // Mirrors FamilyBookChartModule::handle()'s own "Convert POST
  // requests into GET requests for pretty URLs" - same path-segment
  // redirect shape as Ancestors/Descendancy/Hourglass above.
  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);
    const postedBookSize = Math.max(
      FAMILY_BOOK_CHART_MIN_BOOK_SIZE,
      Math.min(parseInt(formData.get('book_size'), 10) || 2, FAMILY_BOOK_CHART_MAX_BOOK_SIZE),
    );
    const postedGenerations = Math.max(
      FAMILY_BOOK_CHART_MIN_GENERATIONS,
      Math.min(parseInt(formData.get('generations'), 10) || 5, FAMILY_BOOK_CHART_MAX_GENERATIONS),
    );
    const postedSpouses = formData.get('spouses') !== null ? '1' : '0';
    const postedXref = formData.get('xref') ?? xref;

    res.writeHead(302, {
      Location: `/tree/${treeName}/family-book-${postedBookSize}-${postedGenerations}-${postedSpouses}/${encodeURIComponent(postedXref)}`,
    });
    res.end();
    return;
  }

  if (
    bookSize < FAMILY_BOOK_CHART_MIN_BOOK_SIZE ||
    bookSize > FAMILY_BOOK_CHART_MAX_BOOK_SIZE ||
    generations < FAMILY_BOOK_CHART_MIN_GENERATIONS ||
    generations > FAMILY_BOOK_CHART_MAX_GENERATIONS
  ) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  try {
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'family_book_chart'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // FamilyBookChartModule has no $access_level override of its own,
    // same as every other chart/list module.
    const chartAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'family_book_chart',
      'Fisharebest\\Webtrees\\Module\\ModuleChartInterface',
      2,
    );

    if (chartAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const individual = await loadIndividual(pool, tree.gedcomId, xref);

    if (individual === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const showHighlightImages = await loadShowHighlightImagesPref(pool, tree.gedcomId);
    const showPrivateRelationships = await loadShowPrivateRelationshipsPref(pool, tree.gedcomId);

    const facts = parseFacts(individual.gedcom);
    const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
    const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, individual.xref);
    const viewerBase = {
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === individual.xref,
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead,
      relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
    };
    const treeForPrivacy = {
      hideLivePeople: treePrivacyPrefs.hideLivePeople,
      defaultResn: defaultResnInfo.individualResn,
      keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
      keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
    };

    const subjectShown = showPrivateRelationships || canShowRecord(treeForPrivacy, individual.gedcom, facts, viewerBase);

    if (!subjectShown) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const primaryName = extractPrimaryName(individual.gedcom);
    const individualFullNameHtml = primaryName !== null ? primaryName.full : `<span class="NAME" dir="auto" translate="no">${individual.xref}</span>`;
    const chartTitle = `Family book of ${individualFullNameHtml.replace(/<[^>]*>/g, '')}`;

    if (url.searchParams.get('ajax') === '1') {
      const traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel;
      const glideKey = await loadGlideKey(pool);

      const ctx = {
        gedcomId: tree.gedcomId,
        treeName: tree.name,
        tree,
        treePrivacyPrefs,
        showHighlightImages,
        viewerBase,
        traversalAccessLevel,
        relPrefs,
        glideKey,
        siteUrlConfig,
      };

      const blocks = await buildFamilyBookBlocks(ctx, individual, generations, bookSize, spouses);
      const bodyHtml = renderFamilyBookChart(blocks);

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(bodyHtml);
      return;
    }

    const ajaxUrl = `/tree/${tree.name}/family-book-${bookSize}-${generations}-${spouses ? '1' : '0'}/${encodeURIComponent(xref)}?ajax=1`;

    const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const genealogyMenuHtml = renderGenealogyMenuNav(
      await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: xref }),
    );
    const csrfToken = user !== null ? generateCsrfToken() : null;
    const html = renderFamilyBookChartPage({
      tree,
      user,
      csrfToken,
      genealogyMenuHtml,
      title: chartTitle,
      individual: { xref: individual.xref, fullNameHtml: individualFullNameHtml },
      bookSize,
      minBookSize: FAMILY_BOOK_CHART_MIN_BOOK_SIZE,
      maxBookSize: FAMILY_BOOK_CHART_MAX_BOOK_SIZE,
      generations,
      minGenerations: FAMILY_BOOK_CHART_MIN_GENERATIONS,
      maxGenerations: FAMILY_BOOK_CHART_MAX_GENERATIONS,
      spouses,
      ajaxUrl,
    });

    const headers = { 'content-type': 'text/html; charset=utf-8' };

    if (csrfToken !== null) {
      headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
    }

    res.writeHead(200, headers);
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve family book chart:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

// Mirrors ChartService::sosaStradonitzAncestors()'s own hardcoded
// generations=5 argument (app/Module/CompactTreeChartModule.php:135) -
// not configurable via the URL at all, unlike every other chart. Sosa
// numbers 1-31 (2^5 - 1), max = 2^(generations-1) = 16: the loop stops
// expanding once a Sosa number reaches 16, so numbers 16-31 (the 5th
// generation) are recorded but never themselves expanded further.
const COMPACT_TREE_CHART_GENERATIONS = 5;
const COMPACT_TREE_CHART_MAX_SOSA = 2 ** (COMPACT_TREE_CHART_GENERATIONS - 1);

/**
 * Mirrors ChartService::sosaStradonitzAncestors() exactly - a
 * breadth-first walk assigning each resolved ancestor its real
 * Sosa-Stradonitz number (1 = subject, 2/3 = parents, 4-7 =
 * grandparents, ...). Reuses resolveShownFamily()/spouseEntersChart()
 * unchanged - husband()/wife()'s own canShowName() gate already
 * applies the SHOW_PRIVATE_RELATIONSHIPS override internally
 * (forcing PRIV_HIDE) regardless of what access level a caller passes
 * in, so there's no asymmetry to special-case here even though real
 * PHP's own call site passes no explicit access level at all.
 *
 * @param {object} ctx
 * @param {{xref: string, gedcom: string}} individual the subject, Sosa 1
 * @returns {Promise<Map<number, {xref: string, gedcom: string}>>}
 */
async function buildSosaStradonitzAncestors(ctx, individual, generations) {
  const maxSosa = 2 ** (generations - 1);
  const ancestors = new Map([[1, individual]]);
  const queue = [1];

  while (queue.length > 0) {
    const sosa = queue.shift();

    if (sosa >= maxSosa) {
      break;
    }

    const current = ancestors.get(sosa);
    const related = await loadRelatedFamilyXrefs(pool, ctx.gedcomId, current.xref);
    const parentFamilyXref = related.parentFamilies[0] ?? null;

    if (parentFamilyXref === null) {
      continue;
    }

    const shownFamily = await resolveShownFamily(ctx.tree, ctx.treePrivacyPrefs, ctx.traversalAccessLevel, ctx.relPrefs, parentFamilyXref);

    if (shownFamily === null) {
      continue;
    }

    if (spouseEntersChart(shownFamily.husband)) {
      ancestors.set(sosa * 2, shownFamily.husband.individual);
      queue.push(sosa * 2);
    }

    if (spouseEntersChart(shownFamily.wife)) {
      ancestors.set(sosa * 2 + 1, shownFamily.wife.individual);
      queue.push(sosa * 2 + 1);
    }
  }

  return ancestors;
}

async function buildCompactTreeAncestors(ctx, individual) {
  return buildSosaStradonitzAncestors(ctx, individual, COMPACT_TREE_CHART_GENERATIONS);
}

/**
 * Builds the per-Sosa-number cell data the view layer plugs into its
 * fixed table layout - a chart-box view model plus the arrow link's
 * own href/title, for every Sosa number 1-31 present in `ancestors`.
 *
 * @param {object} ctx
 * @param {Map<number, {xref: string, gedcom: string}>} ancestors
 * @returns {Promise<Array<{box: object, href: string, title: string}|null>>} indexed 1-31
 */
async function buildCompactTreeChartCells(ctx, ancestors) {
  const cells = [];

  for (const [sosa, ancestorIndividual] of ancestors) {
    const defaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, ancestorIndividual.xref);
    const box = await buildChartBoxViewModel(
      pool,
      ctx.gedcomId,
      ctx.treeName,
      ctx.treePrivacyPrefs,
      ctx.showHighlightImages,
      ancestorIndividual,
      ctx.viewerBase,
      ctx.traversalAccessLevel,
      defaultResnInfo,
      ctx.glideKey,
      ctx.siteUrlConfig,
    );

    const primaryName = extractPrimaryName(ancestorIndividual.gedcom);
    const plainFullName =
      primaryName !== null ? primaryName.full.replace(/<[^>]*>/g, '') : ancestorIndividual.xref;

    cells[sosa] = {
      box,
      href: `/tree/${ctx.treeName}/compact/${encodeURIComponent(ancestorIndividual.xref)}`,
      title: `Compact tree of ${plainFullName}`,
    };
  }

  return cells;
}

async function handleCompactTreeChartPage(req, res, match, url) {
  const { tree: treeName, xref } = match;

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // Mirrors CompactTreeChartModule::handle()'s own "Convert POST
  // requests into GET requests for pretty URLs" - same shape as every
  // other chart above, but with only one path segment (xref) to carry
  // forward.
  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);
    const postedXref = formData.get('xref') ?? xref;

    res.writeHead(302, { Location: `/tree/${treeName}/compact/${encodeURIComponent(postedXref)}` });
    res.end();
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  try {
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'compact-chart'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // CompactTreeChartModule has no $access_level override of its own,
    // same as every other chart/list module.
    const chartAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'compact-chart',
      'Fisharebest\\Webtrees\\Module\\ModuleChartInterface',
      2,
    );

    if (chartAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const individual = await loadIndividual(pool, tree.gedcomId, xref);

    if (individual === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const showHighlightImages = await loadShowHighlightImagesPref(pool, tree.gedcomId);
    const showPrivateRelationships = await loadShowPrivateRelationshipsPref(pool, tree.gedcomId);

    const facts = parseFacts(individual.gedcom);
    const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
    const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, individual.xref);
    const viewerBase = {
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === individual.xref,
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead,
      relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
    };
    const treeForPrivacy = {
      hideLivePeople: treePrivacyPrefs.hideLivePeople,
      defaultResn: defaultResnInfo.individualResn,
      keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
      keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
    };

    const subjectShown = showPrivateRelationships || canShowRecord(treeForPrivacy, individual.gedcom, facts, viewerBase);

    if (!subjectShown) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const primaryName = extractPrimaryName(individual.gedcom);
    const individualFullNameHtml = primaryName !== null ? primaryName.full : `<span class="NAME" dir="auto" translate="no">${individual.xref}</span>`;
    const chartTitle = `Compact tree of ${individualFullNameHtml.replace(/<[^>]*>/g, '')}`;

    if (url.searchParams.get('ajax') === '1') {
      const traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel;
      const glideKey = await loadGlideKey(pool);

      const ctx = {
        gedcomId: tree.gedcomId,
        treeName: tree.name,
        tree,
        treePrivacyPrefs,
        showHighlightImages,
        viewerBase,
        traversalAccessLevel,
        relPrefs,
        glideKey,
        siteUrlConfig,
      };

      const ancestors = await buildCompactTreeAncestors(ctx, individual);
      const cells = await buildCompactTreeChartCells(ctx, ancestors);
      const bodyHtml = renderCompactTreeChart(cells);

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(bodyHtml);
      return;
    }

    const ajaxUrl = `/tree/${tree.name}/compact/${encodeURIComponent(xref)}?ajax=1`;

    const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const genealogyMenuHtml = renderGenealogyMenuNav(
      await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: xref }),
    );
    const csrfToken = user !== null ? generateCsrfToken() : null;
    const html = renderCompactTreeChartPage({
      tree,
      user,
      csrfToken,
      genealogyMenuHtml,
      title: chartTitle,
      individual: { xref: individual.xref },
      ajaxUrl,
    });

    const headers = { 'content-type': 'text/html; charset=utf-8' };

    if (csrfToken !== null) {
      headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
    }

    res.writeHead(200, headers);
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve compact tree chart:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

// Mirrors FanChartModule's own Chart styles/Defaults/Limits constants
// (app/Module/FanChartModule.php:76-100).
const FAN_CHART_STYLE_HALF_CIRCLE = 2;
const FAN_CHART_STYLE_THREE_QUARTER_CIRCLE = 3;
const FAN_CHART_STYLE_FULL_CIRCLE = 4;
const FAN_CHART_DEFAULT_STYLE = FAN_CHART_STYLE_THREE_QUARTER_CIRCLE;
const FAN_CHART_DEFAULT_GENERATIONS = 4;
const FAN_CHART_DEFAULT_WIDTH = 100;
const FAN_CHART_MIN_GENERATIONS = 2;
const FAN_CHART_MAX_GENERATIONS = 9;
const FAN_CHART_MIN_WIDTH = 50;
const FAN_CHART_MAX_WIDTH = 500;
const FAN_CHART_WIDTH_PIXELS = 800;
const FAN_CHART_STYLES = {
  [FAN_CHART_STYLE_HALF_CIRCLE]: 'half circle',
  [FAN_CHART_STYLE_THREE_QUARTER_CIRCLE]: 'three-quarter circle',
  [FAN_CHART_STYLE_FULL_CIRCLE]: 'full circle',
};

/**
 * Mirrors FanChartModule::chart()'s own per-style angle/height choice
 * (app/Module/FanChartModule.php:234-253).
 *
 * @param {number} style
 * @param {number} widthPx
 * @returns {{chartStartAngle: number, chartEndAngle: number, heightPx: number}}
 */
function fanChartLayout(style, widthPx) {
  switch (style) {
    case FAN_CHART_STYLE_HALF_CIRCLE:
      return { chartStartAngle: 180, chartEndAngle: 360, heightPx: Math.trunc(widthPx / 2) };
    case FAN_CHART_STYLE_THREE_QUARTER_CIRCLE:
      return { chartStartAngle: 135, chartEndAngle: 405, heightPx: Math.trunc((widthPx * 86) / 100) };
    case FAN_CHART_STYLE_FULL_CIRCLE:
    default:
      return { chartStartAngle: 90, chartEndAngle: 450, heightPx: widthPx };
  }
}

/**
 * Resolves each Sosa-numbered ancestor to a chart-box view model,
 * reusing buildChartBoxViewModel() exactly as every other chart does.
 *
 * @param {object} ctx
 * @param {Map<number, {xref: string, gedcom: string}>} ancestors
 * @returns {Promise<Map<number, {box: object}>>}
 */
async function buildFanChartAncestorBoxes(ctx, ancestors) {
  const boxes = new Map();

  for (const [sosa, ancestorIndividual] of ancestors) {
    const defaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, ancestorIndividual.xref);
    const box = await buildChartBoxViewModel(
      pool,
      ctx.gedcomId,
      ctx.treeName,
      ctx.treePrivacyPrefs,
      ctx.showHighlightImages,
      ancestorIndividual,
      ctx.viewerBase,
      ctx.traversalAccessLevel,
      defaultResnInfo,
      ctx.glideKey,
      ctx.siteUrlConfig,
    );

    boxes.set(sosa, { box });
  }

  return boxes;
}

async function handleFanChartPage(req, res, match, url) {
  const { tree: treeName, xref } = match;

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let style = match.style;
  let generations = match.generations;
  let width = match.width;

  // Mirrors FanChartModule::handle()'s own "Convert POST requests into
  // GET requests for pretty URLs" - same shape as every other chart.
  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);
    const postedXref = formData.get('xref') ?? xref;
    const postedStyle = parseInt(formData.get('style'), 10);
    const postedGenerations = parseInt(formData.get('generations'), 10);
    const postedWidth = parseInt(formData.get('width'), 10);

    const redirectStyle = Object.keys(FAN_CHART_STYLES).map(Number).includes(postedStyle) ? postedStyle : FAN_CHART_DEFAULT_STYLE;
    const redirectGenerations =
      Number.isInteger(postedGenerations) && postedGenerations >= FAN_CHART_MIN_GENERATIONS && postedGenerations <= FAN_CHART_MAX_GENERATIONS
        ? postedGenerations
        : FAN_CHART_DEFAULT_GENERATIONS;
    const redirectWidth =
      Number.isInteger(postedWidth) && postedWidth >= FAN_CHART_MIN_WIDTH && postedWidth <= FAN_CHART_MAX_WIDTH ? postedWidth : FAN_CHART_DEFAULT_WIDTH;

    res.writeHead(302, {
      Location: `/tree/${treeName}/fan-chart-${redirectStyle}-${redirectGenerations}-${redirectWidth}/${encodeURIComponent(postedXref)}`,
    });
    res.end();
    return;
  }

  if (
    !Object.keys(FAN_CHART_STYLES).map(Number).includes(style) ||
    !Number.isInteger(generations) ||
    generations < FAN_CHART_MIN_GENERATIONS ||
    generations > FAN_CHART_MAX_GENERATIONS ||
    !Number.isInteger(width) ||
    width < FAN_CHART_MIN_WIDTH ||
    width > FAN_CHART_MAX_WIDTH
  ) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  try {
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'fan_chart'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const chartAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'fan_chart',
      'Fisharebest\\Webtrees\\Module\\ModuleChartInterface',
      2,
    );

    if (chartAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const individual = await loadIndividual(pool, tree.gedcomId, xref);

    if (individual === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const showHighlightImages = await loadShowHighlightImagesPref(pool, tree.gedcomId);
    const showPrivateRelationships = await loadShowPrivateRelationshipsPref(pool, tree.gedcomId);

    const facts = parseFacts(individual.gedcom);
    const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
    const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, individual.xref);
    const viewerBase = {
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === individual.xref,
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead,
      relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
    };
    const treeForPrivacy = {
      hideLivePeople: treePrivacyPrefs.hideLivePeople,
      defaultResn: defaultResnInfo.individualResn,
      keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
      keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
    };

    const subjectShown = showPrivateRelationships || canShowRecord(treeForPrivacy, individual.gedcom, facts, viewerBase);

    if (!subjectShown) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const primaryName = extractPrimaryName(individual.gedcom);
    const individualFullNameHtml = primaryName !== null ? primaryName.full : `<span class="NAME" dir="auto" translate="no">${individual.xref}</span>`;
    const chartTitle = `Fan chart of ${individualFullNameHtml.replace(/<[^>]*>/g, '')}`;

    if (url.searchParams.get('ajax') === '1') {
      const traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel;
      const glideKey = await loadGlideKey(pool);

      const ctx = {
        gedcomId: tree.gedcomId,
        treeName: tree.name,
        tree,
        treePrivacyPrefs,
        showHighlightImages,
        viewerBase,
        traversalAccessLevel,
        relPrefs,
        glideKey,
        siteUrlConfig,
      };

      const ancestors = await buildSosaStradonitzAncestors(ctx, individual, generations);
      const boxes = await buildFanChartAncestorBoxes(ctx, ancestors);

      const widthPx = Math.trunc((FAN_CHART_WIDTH_PIXELS * width) / 100);
      const { chartStartAngle, chartEndAngle, heightPx } = fanChartLayout(style, widthPx);
      const wedges = buildFanWedges(boxes, generations, widthPx, chartStartAngle, chartEndAngle, heightPx);
      const bodyHtml = renderFanChart(wedges, [...boxes.values()], chartTitle);

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(bodyHtml);
      return;
    }

    const ajaxUrl = `/tree/${tree.name}/fan-chart-${style}-${generations}-${width}/${encodeURIComponent(xref)}?ajax=1`;

    const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const genealogyMenuHtml = renderGenealogyMenuNav(
      await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: xref }),
    );
    const csrfToken = user !== null ? generateCsrfToken() : null;
    const html = renderFanChartPage({
      tree,
      user,
      csrfToken,
      genealogyMenuHtml,
      title: chartTitle,
      individual: { xref: individual.xref },
      style,
      styles: FAN_CHART_STYLES,
      generations,
      minGenerations: FAN_CHART_MIN_GENERATIONS,
      maxGenerations: FAN_CHART_MAX_GENERATIONS,
      width,
      minWidth: FAN_CHART_MIN_WIDTH,
      maxWidth: FAN_CHART_MAX_WIDTH,
      ajaxUrl,
    });

    const headers = { 'content-type': 'text/html; charset=utf-8' };

    if (csrfToken !== null) {
      headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
    }

    res.writeHead(200, headers);
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve fan chart:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

/**
 * Mirrors LifespansChartModule::handle()'s own xrefs-resolution
 * pipeline EXACTLY (app/Module/LifespansChartModule.php:128-184),
 * including a real surprise found reading it closely: a place/date
 * search REPLACES the accumulated xref list rather than adding to
 * it (a straight `$xrefs = ...` reassignment, not a merge) - even an
 * `addxref` from the SAME request gets discarded if a place/date
 * search also fires. Runs identically for GET and POST (POST just
 * also has addxref/addfam/place/start/end body fields to apply) -
 * real PHP always runs this whole pipeline before ever checking the
 * method, which is also why the privacy filter below applies even to
 * the POST->GET redirect's own carried-forward xref list.
 *
 * @param {object} ctx
 * @param {string[]} initialXrefs from the request's own query string
 * @param {{addXref: string, addFamily: boolean, place: string, start: string, end: string}} formFields blank/false for a GET request, matching real PHP's own Validator defaults
 * @returns {Promise<string[]>}
 */
async function resolveLifespansXrefs(ctx, initialXrefs, formFields) {
  let xrefs = [...new Set(initialXrefs)];

  const addIndividual = formFields.addXref !== '' ? await loadIndividual(pool, ctx.gedcomId, formFields.addXref) : null;

  if (addIndividual !== null) {
    xrefs.push(addIndividual.xref);

    if (formFields.addFamily) {
      xrefs.push(...(await closeFamilyXrefs(pool, ctx.gedcomId, addIndividual.xref)));
    }
  }

  const startDate = formFields.start !== '' ? new GedcomDate(formFields.start) : new GedcomDate('');
  const endDate = formFields.end !== '' ? new GedcomDate(formFields.end) : new GedcomDate('');
  const placeId = formFields.place !== '' ? await resolvePlaceId(pool, ctx.gedcomId, formFields.place) : 0;

  if (placeId !== 0 && startDate.isOK() && endDate.isOK()) {
    const dateXrefs = await findIndividualsByDate(pool, ctx.gedcomId, startDate, endDate);
    const placeXrefs = new Set(await findIndividualsByPlace(pool, ctx.gedcomId, placeId));
    xrefs = dateXrefs.filter((xref) => placeXrefs.has(xref));
  } else if (startDate.isOK() && endDate.isOK()) {
    xrefs = await findIndividualsByDate(pool, ctx.gedcomId, startDate, endDate);
  } else if (placeId !== 0) {
    xrefs = await findIndividualsByPlace(pool, ctx.gedcomId, placeId);
  }

  xrefs = [...new Set(xrefs)];

  const visibleXrefs = [];

  for (const xref of xrefs) {
    const individual = await loadIndividual(pool, ctx.gedcomId, xref);

    if (individual === null) {
      continue;
    }

    const defaultResnInfo = await loadDefaultResn(pool, ctx.gedcomId, xref);
    const box = await buildChartBoxViewModel(
      pool,
      ctx.gedcomId,
      ctx.treeName,
      ctx.treePrivacyPrefs,
      false,
      individual,
      ctx.viewerBaseFor(xref),
      ctx.traversalAccessLevel,
      defaultResnInfo,
      ctx.glideKey,
      ctx.siteUrlConfig,
    );

    if (box.canShow) {
      visibleXrefs.push(xref);
    }
  }

  return visibleXrefs;
}

async function handleLifespansChartPage(req, res, match, url) {
  const { tree: treeName } = match;

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  try {
    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const showPrivateRelationships = await loadShowPrivateRelationshipsPref(pool, tree.gedcomId);
    const traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel;
    const glideKey = await loadGlideKey(pool);

    // Unlike every single-root chart (Compact/Fan/...), Lifespans has no
    // "root individual" to build one shared viewerBase around - its own
    // individuals are an arbitrary accumulated set, so isSelfRecord
    // (the viewer's own linked-record privacy bypass) is computed FRESH
    // per individual below, not reused from one shared object.
    const relationshipGateBlocked = relPrefs.gedcomid !== null && relPrefs.pathLength > 0;
    const viewerBaseFor = (xref) => ({
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === xref,
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead: false,
      relationshipGateBlocked,
    });

    const ctx = {
      gedcomId: tree.gedcomId,
      treeName: tree.name,
      treePrivacyPrefs,
      viewerBaseFor,
      traversalAccessLevel,
      glideKey,
      siteUrlConfig,
    };

    let formFields = { addXref: '', addFamily: false, place: '', start: '', end: '' };

    if (req.method === 'POST') {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      formFields = {
        addXref: formData.get('addxref') ?? '',
        addFamily: formData.get('addfam') !== null,
        place: formData.get('place') ?? '',
        start: formData.get('start') ?? '',
        end: formData.get('end') ?? '',
      };
    }

    const initialXrefs = parseLifespansXrefs(url.searchParams);
    const xrefs = await resolveLifespansXrefs(ctx, initialXrefs, formFields);

    if (req.method === 'POST') {
      res.writeHead(302, { Location: `/tree/${tree.name}/lifespans?xrefs=${encodeURIComponent(joinLifespansXrefs(xrefs))}` });
      res.end();
      return;
    }

    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'lifespans_chart'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const chartAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'lifespans_chart',
      'Fisharebest\\Webtrees\\Module\\ModuleChartInterface',
      2,
    );

    if (chartAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (url.searchParams.get('ajax') === '1') {
      const individuals = [];

      for (const xref of xrefs) {
        const individual = await loadIndividual(pool, tree.gedcomId, xref);

        if (individual === null) {
          continue;
        }

        const facts = parseFacts(individual.gedcom);
        const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, xref);
        const box = await buildChartBoxViewModel(
          pool,
          tree.gedcomId,
          tree.name,
          treePrivacyPrefs,
          false,
          individual,
          ctx.viewerBaseFor(xref),
          traversalAccessLevel,
          defaultResnInfo,
          glideKey,
          siteUrlConfig,
        );

        const birthDate = await getEstimatedBirthDate(pool, tree.gedcomId, xref, facts, treePrivacyPrefs.maxAliveAge);
        const deathDate = getEstimatedDeathDate(facts, birthDate, treePrivacyPrefs.maxAliveAge);

        individuals.push({ box, birthDate, deathDate });
      }

      individuals.sort((a, b) => GedcomDate.compare(a.birthDate, b.birthDate));

      const startYear = lifespansMinYear(individuals);
      const endYear = lifespansMaxYear(individuals) + 1;
      const lifespans = layoutIndividuals(individuals);
      const maxRows = lifespans.reduce((carry, item) => Math.max(carry, item.row), 0);
      const count = individuals.length;
      const subtitle = count === 1 ? '1 individual' : `${count} individuals`;

      const bodyHtml = renderLifespansChart({ subtitle, startYear, endYear, lifespans, maxRows });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(bodyHtml);
      return;
    }

    const ajaxUrl = `/tree/${tree.name}/lifespans?ajax=1&xrefs=${encodeURIComponent(joinLifespansXrefs(xrefs))}`;
    const resetUrl = `/tree/${tree.name}/lifespans`;

    const genealogyMenuHtml = renderGenealogyMenuNav(
      await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel, xrefParam: xrefs[0] ?? null }),
    );

    const csrfToken = user !== null ? generateCsrfToken() : null;
    const html = renderLifespansChartPage({
      tree,
      user,
      csrfToken,
      title: 'Lifespans',
      xrefs,
      resetUrl,
      ajaxUrl,
      genealogyMenuHtml,
    });

    const headers = { 'content-type': 'text/html; charset=utf-8' };

    if (csrfToken !== null) {
      headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
    }

    res.writeHead(200, headers);
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve lifespans chart:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

// Mirrors TimelineChartModule's own Defaults/Limits constants
// (app/Module/TimelineChartModule.php:49-57).
const TIMELINE_CHART_DEFAULT_SCALE = 10;
const TIMELINE_CHART_MIN_SCALE = 1;
const TIMELINE_CHART_MAX_SCALE = 200;
const TIMELINE_CHART_BOX_HEIGHT = 30;

function timelineMemberFullNameHtml(individualRecord) {
  const primaryName = extractPrimaryName(individualRecord.gedcom);

  return primaryName !== null ? primaryName.full : `<span class="NAME" dir="auto" translate="no">${individualRecord.xref}</span>`;
}

async function handleTimelineChartPage(req, res, match, url) {
  const { tree: treeName, scale } = match;

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  if (!Number.isInteger(scale) || scale < TIMELINE_CHART_MIN_SCALE || scale > TIMELINE_CHART_MAX_SCALE) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  try {
    // Mirrors TimelineChartModule::handle()'s own `$xrefs = array_filter(array_unique($xrefs))`
    // - the array form only (`xrefs[]=...`), no dot-joined encoding
    // (unlike Lifespans - TimelineChartModule has no SEPARATOR constant).
    const initialXrefs = [...new Set(url.searchParams.getAll('xrefs[]'))].filter((xref) => xref !== '');

    // Mirrors LifespansChartModule::handle()'s own "Convert POST
    // requests into GET requests for pretty URLs" - here just one
    // `add` xref gets appended before the redirect.
    if (req.method === 'POST') {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      const addXref = formData.get('add') ?? '';
      const redirectXrefs = addXref !== '' ? [...initialXrefs, addXref] : initialXrefs;

      const redirectParams = new URLSearchParams();

      for (const xref of redirectXrefs) {
        redirectParams.append('xrefs[]', xref);
      }

      res.writeHead(302, { Location: `/tree/${tree.name}/timeline-${scale}?${redirectParams.toString()}` });
      res.end();
      return;
    }

    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'timeline_chart'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const chartAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'timeline_chart',
      'Fisharebest\\Webtrees\\Module\\ModuleChartInterface',
      2,
    );

    if (chartAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const showPrivateRelationships = await loadShowPrivateRelationshipsPref(pool, tree.gedcomId);
    const traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel;
    const glideKey = await loadGlideKey(pool);

    // Same reasoning as Lifespans: no "root" individual here either, so
    // isSelfRecord is computed fresh per individual, not shared.
    const relationshipGateBlocked = relPrefs.gedcomid !== null && relPrefs.pathLength > 0;
    const viewerBaseFor = (xref) => ({
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === xref,
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead: false,
      relationshipGateBlocked,
    });

    // Resolve + privacy-filter, preserving the ORIGINAL xref order (it's
    // the color-assignment order real PHP's own `array_search($event->record(), $individuals, true)` uses).
    const selectedXrefs = [];
    const selectedBoxes = new Map();

    for (const xref of initialXrefs) {
      const individual = await loadIndividual(pool, tree.gedcomId, xref);

      if (individual === null) {
        continue;
      }

      const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, xref);
      const box = await buildChartBoxViewModel(
        pool,
        tree.gedcomId,
        tree.name,
        treePrivacyPrefs,
        false,
        individual,
        viewerBaseFor(xref),
        traversalAccessLevel,
        defaultResnInfo,
        glideKey,
        siteUrlConfig,
      );

      if (box.canShow) {
        selectedXrefs.push(xref);
        selectedBoxes.set(xref, box);
      }
    }

    if (url.searchParams.get('ajax') === '1') {
      const ctx = { gedcomId: tree.gedcomId, accessLevel: traversalAccessLevel };
      const eventsByKey = new Map();
      let baseyear = new Date().getFullYear();
      let topyear = 0;

      const resolveShownFamilyFor = (familyXref) => resolveShownFamily(tree, treePrivacyPrefs, traversalAccessLevel, relPrefs, familyXref);

      for (const xref of selectedXrefs) {
        const individual = await loadIndividual(pool, tree.gedcomId, xref);
        const facts = parseFacts(individual.gedcom);
        const individualIsDead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });

        const { events, topYearBump } = await collectIndividualTimelineEvents(pool, ctx, individual, individualIsDead, resolveShownFamilyFor);

        for (const event of events) {
          if (!eventsByKey.has(event.key)) {
            eventsByKey.set(event.key, event);
          }

          const year = timelineEventYear(event);
          baseyear = Math.min(baseyear, year);
          topyear = Math.max(topyear, year);
        }

        if (topYearBump) {
          topyear = Math.max(topyear, new Date().getFullYear());
        }
      }

      let resolvedScale = scale;

      if (resolvedScale < 2) {
        resolvedScale = 2;
      }

      baseyear -= 5;
      topyear += 5;

      const sortedEvents = [...eventsByKey.values()].sort((a, b) => GedcomDate.compare(a.gedcomDate, b.gedcomDate));
      const placedEvents = layoutTimelineEvents(sortedEvents, baseyear, resolvedScale, TIMELINE_CHART_BOX_HEIGHT);
      const showNames = selectedXrefs.length > 8;

      const decoratedEvents = placedEvents.map((event) => {
        const colorIndex = timelineColorIndex(selectedXrefs, event);
        const dateDisplay = displayDate(event.gedcomDate);
        const ownerFullNameHtml = showNames ? (selectedBoxes.get(event.ownerXref)?.fullNameHtml ?? '') : '';

        let ageHtml = '';
        let family = null;

        if (event.recordType === 'family') {
          const findMember = (xref) => event.spouses.find((member) => member.individual.xref === xref) ?? null;
          const husband = findMember(event.husbandXref);
          const wife = findMember(event.wifeXref);

          const ages = [];

          for (const [member, label] of [
            [husband, "Husband's age"],
            [wife, "Wife's age"],
          ]) {
            const birthDate = member !== null ? getBirthDate(member.facts) : null;

            if (birthDate !== null && birthDate.date.isOK()) {
              const age = new Age(
                { minimumDate: birthDate.date.minimumDate(), maximumDate: birthDate.date.maximumDate(), isOK: true },
                { minimumDate: event.gedcomDate.minimumDate(), maximumDate: event.gedcomDate.maximumDate(), isOK: true },
              ).toString();

              ages.push(`<span class="age"> ${label} ${age}</span>`);
            }
          }

          ageHtml = ages.join('');
          family = {
            url: `/tree/${tree.name}/family/${event.ownerXref}`,
            fullNameHtml: `${husband !== null ? timelineMemberFullNameHtml(husband.individual) : UNKNOWN_NAME_HTML} + ${wife !== null ? timelineMemberFullNameHtml(wife.individual) : UNKNOWN_NAME_HTML}`,
          };
        }

        return { ...event, colorIndex, dateDisplay, ownerFullNameHtml, ageHtml, family };
      });

      const bodyHtml = renderTimelineChart({
        baseyear,
        topyear,
        scale: resolvedScale,
        bheight: TIMELINE_CHART_BOX_HEIGHT,
        placedEvents: decoratedEvents,
        showNames,
      });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(bodyHtml);
      return;
    }

    const xrefsQuery = selectedXrefs.map((xref) => `xrefs%5B%5D=${encodeURIComponent(xref)}`).join('&');
    const individuals = selectedXrefs.map((xref) => {
      const removeXrefs = selectedXrefs.filter((other) => other !== xref);
      const removeQuery = removeXrefs.map((other) => `xrefs%5B%5D=${encodeURIComponent(other)}`).join('&');

      return { box: selectedBoxes.get(xref), removeUrl: `/tree/${tree.name}/timeline-${scale}?${removeQuery}` };
    });

    const resetUrl = `/tree/${tree.name}/timeline-${TIMELINE_CHART_DEFAULT_SCALE}`;
    const zoomInUrl = `/tree/${tree.name}/timeline-${timelineZoomIn(scale, TIMELINE_CHART_MIN_SCALE, TIMELINE_CHART_MAX_SCALE)}?${xrefsQuery}`;
    const zoomOutUrl = `/tree/${tree.name}/timeline-${timelineZoomOut(scale, TIMELINE_CHART_MIN_SCALE, TIMELINE_CHART_MAX_SCALE)}?${xrefsQuery}`;
    const ajaxUrl = `/tree/${tree.name}/timeline-${scale}?ajax=1&${xrefsQuery}`;

    const genealogyMenuHtml = renderGenealogyMenuNav(
      await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel, xrefParam: selectedXrefs[0] ?? null }),
    );

    const csrfToken = user !== null ? generateCsrfToken() : null;
    const html = renderTimelineChartPage({
      tree,
      user,
      csrfToken,
      title: 'Timeline',
      individuals,
      resetUrl,
      zoomInUrl,
      zoomOutUrl,
      ajaxUrl,
      genealogyMenuHtml,
    });

    const headers = { 'content-type': 'text/html; charset=utf-8' };

    if (csrfToken !== null) {
      headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
    }

    res.writeHead(200, headers);
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve timeline chart:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

// Mirrors RelationshipsChartModule's own Defaults (app/Module/RelationshipsChartModule.php:71-77).
const RELATIONSHIPS_CHART_DEFAULT_ANCESTORS = 0;
const RELATIONSHIPS_CHART_DEFAULT_RECURSION = 99;

/**
 * Mirrors `$tree->getPreference('RELATIONSHIP_ANCESTORS'/'RELATIONSHIP_RECURSION', <default>)` -
 * only used for the options-page UI (whether to show a fixed value or
 * a choice) and to clamp the URL's own `recursion` - the URL's own
 * `ancestors` flag always drives the actual search, unclamped.
 */
async function loadRelationshipChartPrefs(gedcomId) {
  const result = await pool.query(
    "SELECT setting_name, setting_value FROM wt_gedcom_setting WHERE gedcom_id = $1 AND setting_name IN ('RELATIONSHIP_ANCESTORS', 'RELATIONSHIP_RECURSION')",
    [gedcomId],
  );
  const byName = Object.fromEntries(result.rows.map((row) => [row.setting_name, row.setting_value]));

  return {
    ancestorsOnly: (byName.RELATIONSHIP_ANCESTORS ?? String(RELATIONSHIPS_CHART_DEFAULT_ANCESTORS)) === '1',
    maxRecursion: parseInt(byName.RELATIONSHIP_RECURSION ?? String(RELATIONSHIPS_CHART_DEFAULT_RECURSION), 10),
  };
}

function reflexivePronoun(sex) {
  if (sex === 'M') {
    return 'himself';
  }

  if (sex === 'F') {
    return 'herself';
  }

  return 'themself';
}

async function handleRelationshipsChartPage(req, res, match, url) {
  const { tree: treeName, ancestors, recursion, xref, xref2 } = match;

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  // Mirrors RelationshipsChartModule::handle()'s own "Convert POST
  // requests into GET requests for pretty URLs".
  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);
    const postedAncestors = formData.get('ancestors') ?? '';
    const postedRecursion = formData.get('recursion') ?? '';
    const postedXref = formData.get('xref') ?? '';
    const postedXref2 = formData.get('xref2') ?? '';

    const xref2Segment = postedXref2 !== '' ? `/${encodeURIComponent(postedXref2)}` : '';

    res.writeHead(302, {
      Location: `/tree/${tree.name}/relationships-${postedAncestors}-${postedRecursion}/${encodeURIComponent(postedXref)}${xref2Segment}`,
    });
    res.end();
    return;
  }

  try {
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'relationships_chart'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const chartAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'relationships_chart',
      'Fisharebest\\Webtrees\\Module\\ModuleChartInterface',
      2,
    );

    if (chartAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const showPrivateRelationships = await loadShowPrivateRelationshipsPref(pool, tree.gedcomId);
    const traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel;
    const glideKey = await loadGlideKey(pool);
    const { ancestorsOnly, maxRecursion } = await loadRelationshipChartPrefs(tree.gedcomId);
    const clampedRecursion = Math.min(recursion, maxRecursion);

    const relationshipGateBlocked = relPrefs.gedcomid !== null && relPrefs.pathLength > 0;
    const viewerBaseFor = (xrefForBase) => ({
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === xrefForBase,
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead: false,
      relationshipGateBlocked,
    });

    // Mirrors `Auth::checkIndividualAccess($individualN, false, true)` -
    // a 403 for the WHOLE page if either individual exists but isn't
    // accessible; a nonexistent xref (no such record at all) is NOT a
    // 404 here, unlike every other chart - $individual1/2 simply stay
    // null and the options page still renders (just with no chart).
    async function resolveTargetIndividual(xrefToResolve) {
      if (xrefToResolve === '') {
        return null;
      }

      const individual = await loadIndividual(pool, tree.gedcomId, xrefToResolve);

      if (individual === null) {
        return null;
      }

      const facts = parseFacts(individual.gedcom);
      const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
      const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, xrefToResolve);
      const viewer = viewerBaseFor(xrefToResolve);
      const treeForPrivacy = {
        hideLivePeople: treePrivacyPrefs.hideLivePeople,
        defaultResn: defaultResnInfo.individualResn,
        keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
        keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
      };
      const shown = showPrivateRelationships || canShowRecord(treeForPrivacy, individual.gedcom, facts, { ...viewer, dead });

      return { individual, shown };
    }

    const resolved1 = await resolveTargetIndividual(xref);
    const resolved2 = await resolveTargetIndividual(xref2);

    if ((resolved1 !== null && !resolved1.shown) || (resolved2 !== null && !resolved2.shown)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const individual1 = resolved1?.individual ?? null;
    const individual2 = resolved2?.individual ?? null;

    const primaryName1 = individual1 !== null ? extractPrimaryName(individual1.gedcom) : null;
    const primaryName2 = individual2 !== null ? extractPrimaryName(individual2.gedcom) : null;
    const fullNameHtml1 = individual1 !== null ? (primaryName1 !== null ? primaryName1.full : `<span class="NAME" dir="auto" translate="no">${individual1.xref}</span>`) : '';
    const fullNameHtml2 = individual2 !== null ? (primaryName2 !== null ? primaryName2.full : `<span class="NAME" dir="auto" translate="no">${individual2.xref}</span>`) : '';

    const bothPresent = individual1 !== null && individual2 !== null;
    const chartTitle = bothPresent
      ? `Relationships between ${fullNameHtml1.replace(/<[^>]*>/g, '')} and ${fullNameHtml2.replace(/<[^>]*>/g, '')}`
      : 'Relationships';

    if (url.searchParams.get('ajax') === '1' && bothPresent) {
      const typedRows = await loadLinkGraphRows(pool, tree.gedcomId);

      let allowedFrom = null;
      let excludedTo = null;

      if (ancestors === 1) {
        allowedFrom = collectAncestors(typedRows, individual1.xref, individual2.xref);
        excludedTo = collectExcludedFamilies(typedRows, individual1.xref, individual2.xref);
      }

      const graph = buildLinkGraph(typedRows, allowedFrom, excludedTo);
      const paths = calculateRelationshipPaths(graph, individual1.xref, individual2.xref, clampedRecursion);
      const { familyGedcomByXref, sexByIndividualXref, individualGedcomByXref } = await loadPathRecords(pool, tree.gedcomId, paths);

      const birthDateCache = new Map();

      const personInfo = (xref3) => {
        if (!birthDateCache.has(xref3)) {
          const gedcom = individualGedcomByXref.get(xref3);
          birthDateCache.set(xref3, {
            sex: sexByIndividualXref.get(xref3) ?? 'U',
            birthDate: gedcom !== undefined ? getBirthDate(parseFacts(gedcom)) : null,
          });
        }

        return birthDateCache.get(xref3);
      };

      const boxCache = new Map();

      const boxFor = async (xref3) => {
        if (boxCache.has(xref3)) {
          return boxCache.get(xref3);
        }

        const individual = await loadIndividual(pool, tree.gedcomId, xref3);
        const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, xref3);
        const box =
          individual !== null
            ? await buildChartBoxViewModel(
                pool,
                tree.gedcomId,
                tree.name,
                treePrivacyPrefs,
                false,
                individual,
                viewerBaseFor(xref3),
                traversalAccessLevel,
                defaultResnInfo,
                glideKey,
                siteUrlConfig,
              )
            : null;

        boxCache.set(xref3, box);

        return box;
      };

      const renderedPaths = [];

      for (const path of paths) {
        if (path.length === 1) {
          const info = personInfo(path[0]);
          const box = await boxFor(path[0]);
          const grid = buildRelationshipGrid(path, [], () => '', () => (box !== null ? renderChartBox(box) : ''));
          renderedPaths.push(renderRelationshipPath(reflexivePronoun(info.sex), grid));
          continue;
        }

        const codes = relationshipCodesForPath(path, familyGedcomByXref, sexByIndividualXref);

        if (codes === null) {
          continue;
        }

        // Pre-resolve every box this path needs before building the
        // grid (buildRelationshipGrid()'s own callbacks are
        // synchronous, matching chart.phtml's own plain PHP loop).
        const boxes = new Map();

        for (let n = 0; n < path.length; n += 2) {
          boxes.set(path[n], await boxFor(path[n]));
        }

        const grid = buildRelationshipGrid(
          path,
          codes,
          (n) => {
            const code = codes[n];
            const linkingFamilyFacts = parseFacts(familyGedcomByXref.get(path[n]) ?? '');

            return legacyNameAlgorithm(code, personInfo(path[n - 1]), personInfo(path[n + 1]), linkingFamilyFacts);
          },
          (n) => {
            const box = boxes.get(path[n]);

            return box !== null ? renderChartBox(box) : '';
          },
        );

        let concatenatedCodes = '';

        for (let n = 1; n < path.length; n += 2) {
          concatenatedCodes += codes[n];
        }

        const titleLinkingFamilyFacts = path.length === 3 ? parseFacts(familyGedcomByXref.get(path[1]) ?? '') : null;
        const relationshipLabel = legacyNameAlgorithm(concatenatedCodes, personInfo(path[0]), personInfo(path[path.length - 1]), titleLinkingFamilyFacts);

        renderedPaths.push(renderRelationshipPath(relationshipLabel, grid));
      }

      const bodyHtml = renderRelationshipsChart(renderedPaths);

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(bodyHtml);
      return;
    }

    const ajaxUrl = bothPresent
      ? `/tree/${tree.name}/relationships-${ancestors}-${clampedRecursion}/${encodeURIComponent(individual1.xref)}/${encodeURIComponent(individual2.xref)}?ajax=1`
      : '';

    const genealogyMenuHtml = renderGenealogyMenuNav(
      await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel, xrefParam: individual1?.xref ?? null }),
    );

    const csrfToken = user !== null ? generateCsrfToken() : null;
    const html = renderRelationshipsChartPage({
      tree,
      user,
      csrfToken,
      title: chartTitle,
      xref1: individual1?.xref ?? xref,
      xref2: individual2?.xref ?? xref2,
      ancestors,
      ancestorsOnly,
      recursion: clampedRecursion,
      maxRecursion,
      ajaxUrl,
      genealogyMenuHtml,
    });

    const headers = { 'content-type': 'text/html; charset=utf-8' };

    if (csrfToken !== null) {
      headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
    }

    res.writeHead(200, headers);
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve relationships chart:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

/**
 * Mirrors Auth::isMember($tree) (app/Auth.php) - true for a logged-in
 * user with at least member-level access to this tree. Used only by
 * the "Oldest living individuals" block's own `!Auth::isMember($tree)`
 * gate (StatisticsChartModule::topTenOldestFemaleListAlive() et al.).
 */
function isMemberAccess(accessLevel) {
  return accessLevel <= 1;
}

/**
 * Resolves one tag's raw `{xref, gedcom}|null` individual record (or
 * array of `{person: {xref,gedcom}, ...rest}` rows) into the final
 * privacy-aware HTML string(s) statistics-chart-view.mjs expects -
 * the bridge between statistics.mjs's raw data and the view layer,
 * using statistics-records.mjs's privacy logic (same "no root
 * individual, resolved fresh per record" shape as Lifespans/Timeline).
 */
async function resolveIndividualTag(ctx, record) {
  return individualRecordHtml(ctx.pool, ctx.tree, ctx.treePrivacyPrefs, ctx.accessLevel, ctx.relPrefs, record);
}

async function resolveFamilyTag(ctx, record) {
  return familyRecordHtml(ctx.pool, ctx.tree, ctx.treePrivacyPrefs, ctx.accessLevel, ctx.relPrefs, record);
}

/**
 * firstEvent/lastEvent (statistics.mjs) are the only tags whose
 * resolved xref can be EITHER an individual or a family record (every
 * other fact-specific event tag - firstBirth, firstMarriage, ... -
 * is pinned to one record type by its fact list) - dispatch on the
 * `isFamily` flag those two functions attach to their raw record.
 */
async function resolveEventRecordTag(ctx, record) {
  if (record === null) {
    return 'This information is not available.';
  }
  return record.isFamily ? resolveFamilyTag(ctx, record) : resolveIndividualTag(ctx, record);
}

async function resolvePersonAgeList(ctx, rows) {
  return Promise.all(rows.map(async (row) => ({ personHtml: await resolveIndividualTag(ctx, row.person), age: row.age })));
}

async function resolveFamilyCountList(ctx, rows, countKey) {
  return Promise.all(rows.map(async (row) => ({ familyHtml: await resolveFamilyTag(ctx, row.family), [countKey]: row[countKey] })));
}

async function resolveSiblingAgeList(ctx, rows) {
  return Promise.all(
    rows.map(async (row) => ({
      child1Html: await resolveIndividualTag(ctx, row.child1),
      child2Html: await resolveIndividualTag(ctx, row.child2),
      ageDiff: row.ageDiff,
    })),
  );
}

/**
 * `ageBetweenSpousesFMList`/`MFList` rows carry `{husband: {xref},
 * wife: {xref}}` with no `gedcom` (statistics.mjs doesn't load it) -
 * load it here before handing off to resolveIndividualTag(), same
 * fetch-then-resolve split used throughout this handler.
 */
async function resolveSpouseAgeList(ctx, rows) {
  return Promise.all(
    rows.map(async (row) => {
      const husband = row.husband !== null ? await loadIndividual(pool, ctx.tree.gedcomId, row.husband.xref) : null;
      const wife = row.wife !== null ? await loadIndividual(pool, ctx.tree.gedcomId, row.wife.xref) : null;
      return {
        husbandHtml: await resolveIndividualTag(ctx, husband),
        wifeHtml: await resolveIndividualTag(ctx, wife),
        ageDiff: row.ageDiff,
      };
    }),
  );
}

/** Mirrors modules/statistics-chart/individuals.phtml's tag closure. */
async function buildIndividualsTabTags(ctx) {
  const isMember = isMemberAccess(ctx.accessLevel);

  const [
    totalIndividuals,
    totalSexMales,
    totalSexFemales,
    chartSex,
    totalLiving,
    totalDeceased,
    chartMortality,
    totalBirths,
    totalDeaths,
    statsBirth,
    statsDeath,
    firstBirth,
    lastBirth,
    firstDeath,
    lastDeath,
    averageLifespan,
    averageLifespanMale,
    averageLifespanFemale,
    statsAgeChart,
    topTenOldestMaleListRaw,
    topTenOldestFemaleListRaw,
    topTenOldestMaleListAliveRaw,
    topTenOldestFemaleListAliveRaw,
    totalSurnames,
    chartCommonSurnames,
    totalGivennames,
    chartCommonGiven,
  ] = await Promise.all([
    statistics.totalIndividuals(pool, ctx.tree.gedcomId),
    statistics.totalSexMales(pool, ctx.tree.gedcomId),
    statistics.totalSexFemales(pool, ctx.tree.gedcomId),
    statistics.chartSex(pool, ctx.tree.gedcomId),
    statistics.totalLiving(pool, ctx.tree.gedcomId),
    statistics.totalDeceased(pool, ctx.tree.gedcomId),
    statistics.chartMortality(pool, ctx.tree.gedcomId),
    statistics.totalBirths(pool, ctx.tree.gedcomId),
    statistics.totalDeaths(pool, ctx.tree.gedcomId),
    statistics.statsBirth(pool, ctx.tree.gedcomId),
    statistics.statsDeath(pool, ctx.tree.gedcomId),
    statistics.firstBirth(pool, ctx.tree.gedcomId),
    statistics.lastBirth(pool, ctx.tree.gedcomId),
    statistics.firstDeath(pool, ctx.tree.gedcomId),
    statistics.lastDeath(pool, ctx.tree.gedcomId),
    statistics.averageLifespan(pool, ctx.tree.gedcomId, '1'),
    statistics.averageLifespanMale(pool, ctx.tree.gedcomId, '1'),
    statistics.averageLifespanFemale(pool, ctx.tree.gedcomId, '1'),
    statistics.statsAge(pool, ctx.tree.gedcomId),
    statistics.topTenOldestMaleList(pool, ctx.tree.gedcomId),
    statistics.topTenOldestFemaleList(pool, ctx.tree.gedcomId),
    statistics.topTenOldestMaleListAlive(pool, ctx.tree.gedcomId, '10', isMember),
    statistics.topTenOldestFemaleListAlive(pool, ctx.tree.gedcomId, '10', isMember),
    statistics.totalSurnames(pool, ctx.tree.gedcomId),
    statistics.chartCommonSurnames(pool, ctx.tree.gedcomId),
    statistics.totalGivennames(pool, ctx.tree.gedcomId),
    statistics.chartCommonGiven(pool, ctx.tree.gedcomId),
  ]);

  const [firstBirthHtml, lastBirthHtml, firstDeathHtml, lastDeathHtml, topTenOldestMaleList, topTenOldestFemaleList] = await Promise.all([
    resolveIndividualTag(ctx, firstBirth),
    resolveIndividualTag(ctx, lastBirth),
    resolveIndividualTag(ctx, firstDeath),
    resolveIndividualTag(ctx, lastDeath),
    resolvePersonAgeList(ctx, topTenOldestMaleListRaw),
    resolvePersonAgeList(ctx, topTenOldestFemaleListRaw),
  ]);

  const topTenOldestMaleListAlive = typeof topTenOldestMaleListAliveRaw === 'string' ? topTenOldestMaleListAliveRaw : await resolvePersonAgeList(ctx, topTenOldestMaleListAliveRaw);
  const topTenOldestFemaleListAlive =
    typeof topTenOldestFemaleListAliveRaw === 'string' ? topTenOldestFemaleListAliveRaw : await resolvePersonAgeList(ctx, topTenOldestFemaleListAliveRaw);

  return {
    totalIndividuals,
    totalSexMales,
    totalSexFemales,
    chartSex,
    totalLiving,
    totalDeceased,
    chartMortality,
    totalBirths,
    totalDeaths,
    statsBirth,
    statsDeath,
    firstBirthHtml,
    lastBirthHtml,
    firstDeathHtml,
    lastDeathHtml,
    averageLifespan,
    averageLifespanMale,
    averageLifespanFemale,
    statsAge: statsAgeChart,
    topTenOldestMaleList,
    topTenOldestFemaleList,
    topTenOldestMaleListAlive,
    topTenOldestFemaleListAlive,
    totalSurnames,
    chartCommonSurnames,
    totalGivennames,
    chartCommonGiven,
  };
}

/** Mirrors modules/statistics-chart/families.phtml's tag closure. */
async function buildFamiliesTabTags(ctx) {
  const [
    totalFamilies,
    totalMarriages,
    statsMarr,
    firstMarriage,
    lastMarriage,
    totalDivorces,
    statsDiv,
    firstDivorce,
    lastDivorce,
    topAgeOfMarriage,
    topAgeOfMarriageFamily,
    minAgeOfMarriage,
    minAgeOfMarriageFamily,
    noChildrenFamilies,
    chartNoChildrenFamilies,
    oldestMarriageMale,
    oldestMarriageMaleAge,
    oldestMarriageFemale,
    oldestMarriageFemaleAge,
    youngestMarriageMale,
    youngestMarriageMaleAge,
    youngestMarriageFemale,
    youngestMarriageFemaleAge,
    statsMarrAge,
    oldestFather,
    oldestFatherAge,
    oldestMother,
    oldestMotherAge,
    youngestFather,
    youngestFatherAge,
    youngestMother,
    youngestMotherAge,
    averageChildren,
    statsChildren,
    topTenLargestFamilyListRaw,
    topTenLargestGrandFamilyListRaw,
    topAgeBetweenSiblingsListRaw,
    topAgeBetweenSiblingsFullName,
    ageBetweenSpousesFMListRaw,
    ageBetweenSpousesMFListRaw,
  ] = await Promise.all([
    statistics.totalFamilies(pool, ctx.tree.gedcomId),
    statistics.totalMarriages(pool, ctx.tree.gedcomId),
    statistics.statsMarr(pool, ctx.tree.gedcomId),
    statistics.firstMarriage(pool, ctx.tree.gedcomId),
    statistics.lastMarriage(pool, ctx.tree.gedcomId),
    statistics.totalDivorces(pool, ctx.tree.gedcomId),
    statistics.statsDiv(pool, ctx.tree.gedcomId),
    statistics.firstDivorce(pool, ctx.tree.gedcomId),
    statistics.lastDivorce(pool, ctx.tree.gedcomId),
    statistics.topAgeOfMarriage(pool, ctx.tree.gedcomId),
    statistics.topAgeOfMarriageFamily(pool, ctx.tree.gedcomId),
    statistics.minAgeOfMarriage(pool, ctx.tree.gedcomId),
    statistics.minAgeOfMarriageFamily(pool, ctx.tree.gedcomId),
    statistics.noChildrenFamilies(pool, ctx.tree.gedcomId),
    statistics.chartNoChildrenFamilies(pool, ctx.tree.gedcomId),
    statistics.oldestMarriageMale(pool, ctx.tree.gedcomId),
    statistics.oldestMarriageMaleAge(pool, ctx.tree.gedcomId, '1'),
    statistics.oldestMarriageFemale(pool, ctx.tree.gedcomId),
    statistics.oldestMarriageFemaleAge(pool, ctx.tree.gedcomId, '1'),
    statistics.youngestMarriageMale(pool, ctx.tree.gedcomId),
    statistics.youngestMarriageMaleAge(pool, ctx.tree.gedcomId, '1'),
    statistics.youngestMarriageFemale(pool, ctx.tree.gedcomId),
    statistics.youngestMarriageFemaleAge(pool, ctx.tree.gedcomId, '1'),
    statistics.statsMarrAge(pool, ctx.tree.gedcomId),
    statistics.oldestFather(pool, ctx.tree.gedcomId),
    statistics.oldestFatherAge(pool, ctx.tree.gedcomId, '1'),
    statistics.oldestMother(pool, ctx.tree.gedcomId),
    statistics.oldestMotherAge(pool, ctx.tree.gedcomId, '1'),
    statistics.youngestFather(pool, ctx.tree.gedcomId),
    statistics.youngestFatherAge(pool, ctx.tree.gedcomId, '1'),
    statistics.youngestMother(pool, ctx.tree.gedcomId),
    statistics.youngestMotherAge(pool, ctx.tree.gedcomId, '1'),
    statistics.averageChildren(pool, ctx.tree.gedcomId),
    statistics.statsChildren(pool, ctx.tree.gedcomId),
    statistics.topTenLargestFamilyList(pool, ctx.tree.gedcomId),
    statistics.topTenLargestGrandFamilyList(pool, ctx.tree.gedcomId),
    statistics.topAgeBetweenSiblingsList(pool, ctx.tree.gedcomId),
    statistics.topAgeBetweenSiblingsFullName(pool, ctx.tree.gedcomId),
    statistics.ageBetweenSpousesFMList(pool, ctx.tree.gedcomId),
    statistics.ageBetweenSpousesMFList(pool, ctx.tree.gedcomId),
  ]);

  const [
    firstMarriageHtml,
    lastMarriageHtml,
    firstDivorceHtml,
    lastDivorceHtml,
    topAgeOfMarriageFamilyHtml,
    minAgeOfMarriageFamilyHtml,
    oldestMarriageMaleHtml,
    oldestMarriageFemaleHtml,
    youngestMarriageMaleHtml,
    youngestMarriageFemaleHtml,
    oldestFatherHtml,
    oldestMotherHtml,
    youngestFatherHtml,
    youngestMotherHtml,
    topTenLargestFamilyList,
    topTenLargestGrandFamilyList,
    topAgeBetweenSiblingsList,
    ageBetweenSpousesFMList,
    ageBetweenSpousesMFList,
  ] = await Promise.all([
    resolveIndividualTag(ctx, firstMarriage),
    resolveIndividualTag(ctx, lastMarriage),
    resolveIndividualTag(ctx, firstDivorce),
    resolveIndividualTag(ctx, lastDivorce),
    resolveFamilyTag(ctx, topAgeOfMarriageFamily),
    resolveFamilyTag(ctx, minAgeOfMarriageFamily),
    resolveFamilyTag(ctx, oldestMarriageMale),
    resolveFamilyTag(ctx, oldestMarriageFemale),
    resolveFamilyTag(ctx, youngestMarriageMale),
    resolveFamilyTag(ctx, youngestMarriageFemale),
    resolveIndividualTag(ctx, oldestFather),
    resolveIndividualTag(ctx, oldestMother),
    resolveIndividualTag(ctx, youngestFather),
    resolveIndividualTag(ctx, youngestMother),
    resolveFamilyCountList(ctx, topTenLargestFamilyListRaw, 'children'),
    resolveFamilyCountList(ctx, topTenLargestGrandFamilyListRaw, 'grandchildren'),
    resolveSiblingAgeList(ctx, topAgeBetweenSiblingsListRaw),
    resolveSpouseAgeList(ctx, ageBetweenSpousesFMListRaw),
    resolveSpouseAgeList(ctx, ageBetweenSpousesMFListRaw),
  ]);

  let topAgeBetweenSiblingsFullNameHtml = 'This information is not available.';

  if (topAgeBetweenSiblingsFullName !== null) {
    const [child2Html, child1Html, familyHtml] = await Promise.all([
      resolveIndividualTag(ctx, topAgeBetweenSiblingsFullName.child2),
      resolveIndividualTag(ctx, topAgeBetweenSiblingsFullName.child1),
      resolveFamilyTag(ctx, topAgeBetweenSiblingsFullName.family),
    ]);
    topAgeBetweenSiblingsFullNameHtml = `${child2Html} and ${child1Html} ${familyHtml}`;
  }

  return {
    totalFamilies,
    totalMarriages,
    statsMarr,
    firstMarriageHtml,
    lastMarriageHtml,
    totalDivorces,
    statsDiv,
    firstDivorceHtml,
    lastDivorceHtml,
    topAgeOfMarriage,
    topAgeOfMarriageFamilyHtml,
    minAgeOfMarriage,
    minAgeOfMarriageFamilyHtml,
    noChildrenFamilies,
    chartNoChildrenFamilies,
    oldestMarriageMaleHtml,
    oldestMarriageMaleAge,
    oldestMarriageFemaleHtml,
    oldestMarriageFemaleAge,
    youngestMarriageMaleHtml,
    youngestMarriageMaleAge,
    youngestMarriageFemaleHtml,
    youngestMarriageFemaleAge,
    statsMarrAge,
    oldestFatherHtml,
    oldestFatherAge,
    oldestMotherHtml,
    oldestMotherAge,
    youngestFatherHtml,
    youngestFatherAge,
    youngestMotherHtml,
    youngestMotherAge,
    averageChildren,
    statsChildren,
    topTenLargestFamilyList,
    topTenLargestGrandFamilyList,
    topAgeBetweenSiblingsList,
    topAgeBetweenSiblingsFullNameHtml,
    ageBetweenSpousesFMList,
    ageBetweenSpousesMFList,
  };
}

/** Mirrors modules/statistics-chart/other.phtml's tag closure. */
async function buildOtherTabTags(ctx) {
  const [
    totalRecords,
    totalMedia,
    totalSources,
    totalNotes,
    totalRepositories,
    totalEvents,
    firstEvent,
    lastEvent,
    firstEventType,
    lastEventType,
    chartMedia,
    totalIndisWithSources,
    chartIndisWithSources,
    totalFamsWithSources,
    chartFamsWithSources,
    totalPlaces,
    commonBirthPlacesList,
    commonDeathPlacesList,
    commonMarriagePlacesList,
    commonCountriesList,
    chartDistribution,
  ] = await Promise.all([
    statistics.totalRecords(pool, ctx.tree.gedcomId),
    statistics.totalMedia(pool, ctx.tree.gedcomId),
    statistics.totalSources(pool, ctx.tree.gedcomId),
    statistics.totalNotes(pool, ctx.tree.gedcomId),
    statistics.totalRepositories(pool, ctx.tree.gedcomId),
    statistics.totalEvents(pool, ctx.tree.gedcomId),
    statistics.firstEvent(pool, ctx.tree.gedcomId),
    statistics.lastEvent(pool, ctx.tree.gedcomId),
    statistics.firstEventType(pool, ctx.tree.gedcomId),
    statistics.lastEventType(pool, ctx.tree.gedcomId),
    statistics.chartMedia(pool, ctx.tree.gedcomId),
    statistics.totalIndisWithSources(pool, ctx.tree.gedcomId),
    statistics.chartIndisWithSources(pool, ctx.tree.gedcomId),
    statistics.totalFamsWithSources(pool, ctx.tree.gedcomId),
    statistics.chartFamsWithSources(pool, ctx.tree.gedcomId),
    statistics.totalPlaces(pool, ctx.tree.gedcomId),
    statistics.commonBirthPlacesList(pool, ctx.tree.gedcomId),
    statistics.commonDeathPlacesList(pool, ctx.tree.gedcomId),
    statistics.commonMarriagePlacesList(pool, ctx.tree.gedcomId),
    statistics.commonCountriesList(pool, ctx.tree.gedcomId),
    statistics.chartDistribution(pool, ctx.tree.gedcomId),
  ]);

  const [firstEventHtml, lastEventHtml] = await Promise.all([resolveEventRecordTag(ctx, firstEvent), resolveEventRecordTag(ctx, lastEvent)]);

  return {
    totalRecords,
    totalMedia,
    totalSources,
    totalNotes,
    totalRepositories,
    totalEvents,
    firstEventHtml,
    lastEventHtml,
    firstEventType,
    lastEventType,
    chartMedia,
    totalIndisWithSources,
    chartIndisWithSources,
    totalFamsWithSources,
    chartFamsWithSources,
    totalPlaces,
    commonBirthPlacesList,
    commonDeathPlacesList,
    commonMarriagePlacesList,
    commonCountriesList,
    chartDistribution,
  };
}

async function handleStatisticsChartPage(req, res, match) {
  const { action, tree: treeName } = match;

  if (action === 'CustomChart' ? req.method !== 'POST' : req.method !== 'GET') {
    res.writeHead(405, { allow: action === 'CustomChart' ? 'POST' : 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  try {
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'statistics_chart'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const chartAccessLevel = await moduleAccessLevel(
      tree.gedcomId,
      'statistics_chart',
      'Fisharebest\\Webtrees\\Module\\ModuleChartInterface',
      2,
    );

    if (chartAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (action === 'CustomChart') {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);

      const result = await buildCustomChart(pool, tree, {
        xAxisType: parseInt(formData.get('x-as') ?? '0', 10),
        yAxisType: parseInt(formData.get('y-as') ?? '0', 10),
        zAxisType: parseInt(formData.get('z-as') ?? '0', 10),
        zAxisBoundariesPeriods: formData.get('z-axis-boundaries-periods') ?? '',
        xAxisBoundariesAges: formData.get('x-axis-boundaries-ages') ?? '',
        xAxisBoundariesAgesM: formData.get('x-axis-boundaries-ages_m') ?? '',
        chartShows: formData.get('chart_shows') ?? 'world',
        chartType: formData.get('chart_type') ?? '',
        surname: formData.get('SURN') ?? '',
      });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderCustomChartResult(result));
      return;
    }

    if (action === 'Custom') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(renderCustomTab({ tree }));
      return;
    }

    if (action === 'Individuals' || action === 'Families' || action === 'Other') {
      const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
      const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
      const ctx = { pool, tree, treePrivacyPrefs, accessLevel, relPrefs };

      let bodyHtml;

      if (action === 'Individuals') {
        bodyHtml = renderIndividualsTab(await buildIndividualsTabTags(ctx));
      } else if (action === 'Families') {
        bodyHtml = renderFamiliesTab(await buildFamiliesTabTags(ctx));
      } else {
        bodyHtml = renderOtherTab(await buildOtherTabTags(ctx));
      }

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(bodyHtml);
      return;
    }

    // action === 'Chart' - the tabbed shell.
    const genealogyMenuHtml = renderGenealogyMenuNav(await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel, xrefParam: null }));
    const csrfToken = user !== null ? generateCsrfToken() : null;
    const html = renderStatisticsChartPage({ tree, user, csrfToken, genealogyMenuHtml });

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve statistics chart:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

// Mirrors PedigreeMapModule::MINIMUM_GENERATIONS/MAXIMUM_GENERATIONS
// (app/Module/PedigreeMapModule.php:62-63) - PHP_INT_SIZE is always 8
// on every platform this migration targets, so 63 (not the 32-bit 31).
const PEDIGREE_MAP_MIN_GENERATIONS = 1;
const PEDIGREE_MAP_MAX_GENERATIONS = 63;

/**
 * /tree/{tree}/pedigree-map-{generations}/{xref} - the ELEVENTH chart
 * route (phase 5 step 38). Unlike every other already-ported chart,
 * there is no `?ajax=1` fragment action at all: the GeoJSON data is
 * built and embedded directly in the one GET response, matching real
 * PedigreeMapModule::handle()'s own inline `getMapData()` call. See
 * pages-server/pedigree-map.mjs's own top doc comment for the two
 * separate access-level contexts (traversal vs. display) this module
 * uses - deliberately NOT the same single accessLevel every other
 * chart route threads through unchanged.
 *
 * Deliberately NOT ported: the AuthNotRobot middleware's bot-blocking
 * check (app/Http/Middleware/AuthNotRobot.php) - an anti-abuse
 * measure with no effect on a normal user's own output, same
 * "mouse-drag exploration aids" flavor of scope-cut already applied
 * to the Timeline chart (phase 5 step 35).
 */
async function handlePedigreeMapChartPage(req, res, match) {
  const { tree: treeName, generations, xref } = match;

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  // Mirrors PedigreeMapModule::handle()'s own "Convert POST requests
  // into GET requests for pretty URLs".
  if (req.method === 'POST') {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);
    const postedGenerations = Math.max(
      PEDIGREE_MAP_MIN_GENERATIONS,
      Math.min(parseInt(formData.get('generations'), 10) || 4, PEDIGREE_MAP_MAX_GENERATIONS),
    );
    const postedXref = formData.get('xref') ?? xref;

    res.writeHead(302, {
      Location: `/tree/${treeName}/pedigree-map-${postedGenerations}/${encodeURIComponent(postedXref)}`,
    });
    res.end();
    return;
  }

  if (generations < PEDIGREE_MAP_MIN_GENERATIONS || generations > PEDIGREE_MAP_MAX_GENERATIONS) {
    res.writeHead(400, { 'content-type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  const isAdmin = user !== null && user.settings.canadmin === '1';
  const userId = user !== null ? user.userId : null;

  let tree;

  try {
    tree = await accessibleTreeByName(pool, treeName, { userId, isAdmin });
  } catch (error) {
    console.error('Failed to look up tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return;
  }

  if (tree === null) {
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  try {
    const statusResult = await pool.query("SELECT status FROM wt_module WHERE module_name = 'pedigree-map'", []);

    if (statusResult.rows[0]?.status !== 'enabled') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const accessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    // PedigreeMapModule has no $access_level override of its own,
    // same as every other chart/list module.
    const chartAccessLevel = await moduleAccessLevel(tree.gedcomId, 'pedigree-map', 'Fisharebest\\Webtrees\\Module\\ModuleChartInterface', 2);

    if (chartAccessLevel < accessLevel) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const individual = await loadIndividual(pool, tree.gedcomId, xref);

    if (individual === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const treePrivacyPrefs = await loadTreePrivacyPrefs(pool, tree.gedcomId);
    const relPrefs = await viewerRelationshipPrefs(pool, tree.gedcomId, userId);
    const showHighlightImages = await loadShowHighlightImagesPref(pool, tree.gedcomId);
    const showPrivateRelationships = await loadShowPrivateRelationshipsPref(pool, tree.gedcomId);

    const facts = parseFacts(individual.gedcom);
    const dead = isDead(facts, { maxAliveAge: treePrivacyPrefs.maxAliveAge });
    const defaultResnInfo = await loadDefaultResn(pool, tree.gedcomId, individual.xref);
    const viewerBase = {
      accessLevel,
      isSelfRecord: relPrefs.gedcomid === individual.xref,
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead,
      relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
    };
    const treeForPrivacy = {
      hideLivePeople: treePrivacyPrefs.hideLivePeople,
      defaultResn: defaultResnInfo.individualResn,
      keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
      keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
    };

    // Mirrors Auth::checkIndividualAccess($individual, false, true)'s
    // own `$chart` bypass - same shape as every other chart's own root
    // individual check (see handleAncestorsChartPage()'s own doc
    // comment for why).
    const subjectShown = showPrivateRelationships || canShowRecord(treeForPrivacy, individual.gedcom, facts, viewerBase);

    if (!subjectShown) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    const primaryName = extractPrimaryName(individual.gedcom);
    const individualFullNameHtml = primaryName !== null ? primaryName.full : `<span class="NAME" dir="auto" translate="no">${individual.xref}</span>`;
    const chartTitle = `Pedigree map of ${individualFullNameHtml.replace(/<[^>]*>/g, '')}`;

    const leafletConfig = await buildLeafletJsConfig(pool);

    if (leafletConfig === null) {
      res.writeHead(503, { 'content-type': 'text/plain' });
      res.end('Service Unavailable: no map-provider module is enabled.');
      return;
    }

    const traversalAccessLevel = showPrivateRelationships ? -1 : accessLevel;
    const glideKey = await loadGlideKey(pool);

    const ancestors = await sosaStradonitzAncestors(pool, tree.gedcomId, treePrivacyPrefs, traversalAccessLevel, relPrefs, xref, generations);
    const geojson = await buildPedigreeMapData(pool, tree, treePrivacyPrefs, showHighlightImages, accessLevel, relPrefs, glideKey, siteUrlConfig, ancestors);

    const mapHtml = renderPedigreeMapChart({ data: geojson, leafletConfig });

    const genealogyMenuAccessLevel = await viewerAccessLevel(pool, { gedcomId: tree.gedcomId, userId, isAdmin });
    const genealogyMenuHtml = renderGenealogyMenuNav(
      await buildGenealogyMenu(pool, { tree, userId, isAdmin, accessLevel: genealogyMenuAccessLevel, xrefParam: xref }),
    );
    const csrfToken = user !== null ? generateCsrfToken() : null;

    const html = renderPedigreeMapPage({
      tree,
      user,
      csrfToken,
      genealogyMenuHtml,
      title: chartTitle,
      individual: { xref: individual.xref },
      generations,
      minGenerations: PEDIGREE_MAP_MIN_GENERATIONS,
      maxGenerations: PEDIGREE_MAP_MAX_GENERATIONS,
      mapHtml,
    });

    const headers = { 'content-type': 'text/html; charset=utf-8' };

    if (csrfToken !== null) {
      headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
    }

    res.writeHead(200, headers);
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve pedigree map chart:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

const WEBTREES_ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));

/**
 * Shared AuthAdministrator-equivalent gate for every /admin/... route
 * this migration serves - not logged in -> 302 to /login?url={path}
 * (mirrors `redirect(route(LoginPage::class, ['url' => ...]))`);
 * logged in but not an admin -> 403. On success returns the user;
 * on failure, the response has already been written and the caller
 * must return immediately.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} requestPath used only for the login redirect's own `url` param
 * @returns {Promise<object|null>} the admin user, or null (response already sent)
 */
async function authenticateAdmin(req, res, requestPath) {
  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return null;
  }

  if (user === null) {
    res.writeHead(302, { Location: `/login?url=${encodeURIComponent(requestPath)}` });
    res.end();
    return null;
  }

  if (user.settings.canadmin !== '1') {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return null;
  }

  return user;
}

/**
 * AuthManager-equivalent gate for /admin/trees/manage - unlike every
 * other /admin/... page ported so far, ManageTrees only requires
 * AuthManager (manager of at least one tree), not AuthAdministrator.
 * Tree management step.
 */
async function authenticateManager(req, res, requestPath) {
  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return null;
  }

  if (user === null) {
    res.writeHead(302, { Location: `/login?url=${encodeURIComponent(requestPath)}` });
    res.end();
    return null;
  }

  const isAdmin = user.settings.canadmin === '1';
  const isManager = await treeManagement.isSiteManager(pool, { userId: user.userId, isAdmin });

  if (!isManager) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return null;
  }

  return { ...user, isAdmin };
}

/**
 * AuthManager-equivalent gate for a SPECIFIC tree (used by
 * TreePreferencesPage/Action, RenumberTreePage/Action,
 * TreePrivacyPage/Action, CheckTree - all under `/tree/{tree}/...`
 * with AuthManager middleware in real PHP, scoped to that one tree).
 * Tree management step.
 *
 * @returns {Promise<{user: object, tree: object}|null>}
 */
async function authenticateTreeManager(req, res, requestPath, treeName) {
  let user;

  try {
    user = await getCurrentUser(req.headers.cookie, pool);
  } catch (error) {
    console.error('Failed to look up session:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
    return null;
  }

  if (user === null) {
    res.writeHead(302, { Location: `/login?url=${encodeURIComponent(requestPath)}` });
    res.end();
    return null;
  }

  const isAdmin = user.settings.canadmin === '1';
  const tree = await accessibleTreeByName(pool, treeName, { userId: user.userId, isAdmin });

  if (tree === null) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not Found');
    return null;
  }

  const isManager = await isTreeManager(pool, { gedcomId: tree.gedcomId, userId: user.userId, isAdmin });

  if (!isManager) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('Forbidden');
    return null;
  }

  return { user: { ...user, isAdmin }, tree };
}

/**
 * /admin (ControlPanel) - the entry point into the ~85-route admin
 * area (phase 5 step 39). Scoped to this read-only dashboard only -
 * every other /admin/... link on the page still falls through the
 * proxy to real PHP. See pages-server/control-panel.mjs's own top doc
 * comment for the three deliberately scope-cut services
 * (ServerCheckService, UpgradeService, HousekeepingService's
 * destructive delete-on-every-load behavior).
 */
async function handleControlPanelPage(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const user = await authenticateAdmin(req, res, '/admin');

  if (user === null) {
    return;
  }

  try {
    const trees = await accessibleTrees(pool, { userId: user.userId, isAdmin: true });

    const [changes, individuals, families, sources, media, repositories, notes, submitters] = await Promise.all([
      controlPanel.totalChangesByTree(pool),
      controlPanel.totalIndividualsByTree(pool),
      controlPanel.totalFamiliesByTree(pool),
      controlPanel.totalSourcesByTree(pool),
      controlPanel.totalMediaByTree(pool),
      controlPanel.totalRepositoriesByTree(pool),
      controlPanel.totalNotesByTree(pool),
      controlPanel.totalSubmittersByTree(pool),
    ]);

    const listModuleUrls = await controlPanel.loadListModuleUrls(pool);

    const [allUsers, administrators, managers, moderators, unapproved, unverified] = await Promise.all([
      controlPanel.loadAllUsers(pool),
      controlPanel.loadAdministrators(pool),
      controlPanel.loadManagers(pool),
      controlPanel.loadModerators(pool),
      controlPanel.loadUnapproved(pool),
      controlPanel.loadUnverified(pool),
    ]);

    const moduleSummary = await controlPanel.loadModuleSummary(pool);
    const filesToDelete = await controlPanel.findOldWebtreesFiles(WEBTREES_ROOT_DIR);

    const csrfToken = generateCsrfToken();

    const html = renderControlPanelPage({
      csrfToken,
      trees: trees.map((tree) => ({ gedcomId: tree.gedcomId, name: tree.name, title: tree.title })),
      treeCounts: { changes, individuals, families, sources, media, repositories, notes, submitters },
      listUrls: {
        individual: (t) => listModuleUrls.individual_list(t),
        family: (t) => listModuleUrls.family_list(t),
        source: (t) => listModuleUrls.source_list(t),
        repository: (t) => listModuleUrls.repository_list(t),
        media: (t) => listModuleUrls.media_list(t),
        note: (t) => listModuleUrls.note_list(t),
        submitter: (t) => listModuleUrls.submitter_list(t),
      },
      users: { all: allUsers, administrators, managers, moderators, unapproved, unverified, recipients: controlPanel.recipientTypes() },
      moduleSummary,
      filesToDelete,
    });

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve control panel:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

/**
 * GET /admin/admin-users (UserListPage) - the list page shell; the
 * real table data loads via /admin/admin-users-data (see
 * handleUserListDataPage() below). Phase 5 step 40.
 */
async function handleUserListPage(req, res, url) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const user = await authenticateAdmin(req, res, '/admin/admin-users');

  if (user === null) {
    return;
  }

  const filter = url.searchParams.get('filter') ?? '';
  const csrfToken = generateCsrfToken();
  const html = renderUsersListPage({ csrfToken, filter });

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
  res.end(html);
}

/**
 * POST /admin/admin-users-data (UserListData) - the real server-side
 * DataTables AJAX endpoint (see pages-server/datatables.mjs). Phase 5
 * step 40.
 */
async function handleUserListDataPage(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const user = await authenticateAdmin(req, res, '/admin/admin-users');

  if (user === null) {
    return;
  }

  try {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);

    const { sql, params } = usersAdmin.buildUserListQuery();
    const sortColumns = { 2: 'user_name', 3: 'real_name', 4: 'email', 5: 'language', 7: 'registered_at', 9: 'active_at', 10: 'verified', 11: 'verified_by_admin' };
    const searchColumns = ['user_name', 'real_name', 'email'];

    const result = await handleDatatablesQuery(pool, sql, params, searchColumns, sortColumns, formData, (row) => usersAdmin.userListRow(row, user.userId));

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    console.error('Failed to resolve user list data:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

/**
 * GET/POST /admin/admin-users-create (UserAddPage/UserAddAction).
 * Phase 5 step 40. On a duplicate username/email, real PHP redirects
 * back to this same GET page with the submitted values as query
 * params - replicated via a 302 with those params, same shape.
 */
async function handleUserAddPage(req, res, url) {
  const user = await authenticateAdmin(req, res, '/admin/admin-users-create');

  if (user === null) {
    return;
  }

  if (req.method === 'GET') {
    const values = {
      email: url.searchParams.get('email') ?? '',
      realName: url.searchParams.get('real_name') ?? '',
      username: url.searchParams.get('username') ?? '',
    };
    const csrfToken = generateCsrfToken();
    const html = renderUserAddPage({ csrfToken, values });

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
    res.end(html);
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      const cookies = parseCookies(req.headers.cookie);

      if (!isValidCsrf(cookies, formData.get('_csrf'))) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('This form has expired. Please reload the page and try again.');
        return;
      }

      const username = formData.get('username') ?? '';
      const realName = formData.get('real_name') ?? '';
      const email = formData.get('email') ?? '';
      const password = formData.get('password') ?? '';

      const duplicateUserName = await usersAdmin.findUserByUserName(pool, username);
      const duplicateEmail = await usersAdmin.findUserByEmail(pool, email);

      if (duplicateUserName !== null || duplicateEmail !== null) {
        const query = new URLSearchParams({ email, real_name: realName, username });
        res.writeHead(302, { Location: `/admin/admin-users-create?${query}` });
        res.end();
        return;
      }

      const newUserId = await usersAdmin.createUser(pool, { username, realName, email, password });

      res.writeHead(302, { Location: `/admin/admin-users-edit?user_id=${newUserId}` });
      res.end();
    } catch (error) {
      console.error('Failed to create user:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

/**
 * GET/POST /admin/admin-users-edit (UserEditPage/UserEditAction).
 * Phase 5 step 40.
 */
async function handleUserEditPage(req, res, url) {
  const adminUser = await authenticateAdmin(req, res, '/admin/admin-users-edit');

  if (adminUser === null) {
    return;
  }

  if (req.method === 'GET') {
    try {
      const userId = parseInt(url.searchParams.get('user_id'), 10);
      const editUser = await usersAdmin.loadUserForEdit(pool, userId);

      if (editUser === null) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      const trees = await accessibleTrees(pool, { userId: adminUser.userId, isAdmin: true });
      const csrfToken = generateCsrfToken();
      const html = renderUserEditPage({
        csrfToken,
        user: editUser,
        trees: trees.map((tree) => ({ gedcomId: tree.gedcomId, title: tree.title })),
        isSelf: editUser.userId === adminUser.userId,
      });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
      res.end(html);
    } catch (error) {
      console.error('Failed to resolve user edit page:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      const cookies = parseCookies(req.headers.cookie);

      if (!isValidCsrf(cookies, formData.get('_csrf'))) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('This form has expired. Please reload the page and try again.');
        return;
      }

      const userId = parseInt(formData.get('user_id'), 10);
      const trees = await accessibleTrees(pool, { userId: adminUser.userId, isAdmin: true });

      const { errors } = await usersAdmin.updateUser(pool, adminUser.userId, trees, formData);

      if (errors.length > 0) {
        const editUser = await usersAdmin.loadUserForEdit(pool, userId);
        const csrfToken = generateCsrfToken();
        const html = renderUserEditPage({
          csrfToken,
          user: editUser,
          trees: trees.map((tree) => ({ gedcomId: tree.gedcomId, title: tree.title })),
          isSelf: userId === adminUser.userId,
          errors,
        });

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
        res.end(html);
        return;
      }

      res.writeHead(302, { Location: '/admin/admin-users' });
      res.end();
    } catch (error) {
      console.error('Failed to update user:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

/**
 * POST /admin/users/delete/{user_id} (DeleteUser) - AJAX, no body on
 * success. Phase 5 step 40. Reuses the already-transactional delete
 * (see pages-server/users-admin.mjs's own doc comment for why the
 * pending-change reassignment is real here, unlike the self-delete case).
 */
async function handleDeleteUser(req, res, targetUserId) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const adminUser = await authenticateAdmin(req, res, '/admin/admin-users');

  if (adminUser === null) {
    return;
  }

  const cookies = parseCookies(req.headers.cookie);

  if (!isValidCsrf(cookies, req.headers['x-csrf-token'])) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('This form has expired. Please reload the page and try again.');
    return;
  }

  try {
    const targetUser = await usersAdmin.loadUserForEdit(pool, targetUserId);

    if (targetUser === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    if (targetUser.preferences.canadmin === '1') {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('Cannot delete an administrator');
      return;
    }

    await usersAdmin.deleteUserTransactional(pool, targetUserId, adminUser.userId);

    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('');
  } catch (error) {
    console.error('Failed to delete user:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

/**
 * POST /admin/masquerade/{user_id} (Masquerade) - AJAX, logs the
 * acting admin in as another user without a password check. Reuses
 * session-store.mjs's regenerateSessionForLogin() unchanged (see
 * pages-server/users-admin.mjs's own doc comment). Phase 5 step 40.
 */
async function handleMasquerade(req, res, targetUserId) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const adminUser = await authenticateAdmin(req, res, '/admin/admin-users');

  if (adminUser === null) {
    return;
  }

  const cookies = parseCookies(req.headers.cookie);

  if (!isValidCsrf(cookies, req.headers['x-csrf-token'])) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('This form has expired. Please reload the page and try again.');
    return;
  }

  try {
    const targetUser = await usersAdmin.loadUserForEdit(pool, targetUserId);

    if (targetUser === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    if (targetUserId === adminUser.userId) {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('');
      return;
    }

    const ip = clientIp(req);
    const { session } = await loadOrCreateAnonymousSession(req.headers.cookie, ip, pool);
    session.masquerade = '1';

    const { newSessionId } = await regenerateSessionForLogin(session, targetUserId, ip, pool);

    res.writeHead(200, { 'content-type': 'text/plain', 'set-cookie': sessionSetCookieHeader(isSecure(req), newSessionId) });
    res.end('');
  } catch (error) {
    console.error('Failed to masquerade:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

/**
 * GET /admin/trees/manage[/{tree}] (ManageTrees) - tree management
 * step. Unlike every other admin page ported so far, this is gated by
 * AuthManager (any tree manager), not AuthAdministrator.
 */
async function handleManageTreesPage(req, res, url) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const user = await authenticateManager(req, res, url.pathname);

  if (user === null) {
    return;
  }

  try {
    const trees = await accessibleTrees(pool, { userId: user.userId, isAdmin: user.isAdmin });
    const defaultResult = await pool.query("SELECT setting_value FROM wt_site_setting WHERE setting_name = 'DEFAULT_GEDCOM'");
    const defaultTreeName = defaultResult.rows[0]?.setting_value ?? '';

    const treesWithStatus = await Promise.all(
      trees.map(async (tree) => ({
        gedcomId: tree.gedcomId,
        name: tree.name,
        title: tree.title,
        isManager: await isTreeManager(pool, { gedcomId: tree.gedcomId, userId: user.userId, isAdmin: user.isAdmin }),
        importing: await treeManagement.isTreeImporting(pool, tree.gedcomId),
      })),
    );

    const csrfToken = generateCsrfToken();
    const html = renderManageTreesPage({
      csrfToken,
      trees: treesWithStatus,
      defaultTreeName,
      canDeleteOrSetDefault: user.isAdmin,
    });

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve manage trees page:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

/**
 * GET/POST /admin/trees/create (CreateTreePage/CreateTreeAction) -
 * AuthAdministrator only. Tree management step. See
 * tree-management.mjs's createTree() doc comment for the scope cut
 * (no placeholder GEDCOM records are inserted).
 */
async function handleCreateTreePage(req, res, url) {
  const user = await authenticateAdmin(req, res, '/admin/trees/create');

  if (user === null) {
    return;
  }

  if (req.method === 'GET') {
    const treeName = url.searchParams.get('name') ?? (await treeManagement.uniqueTreeName(pool));
    const treeTitle = url.searchParams.get('title') ?? 'My family tree';
    const csrfToken = generateCsrfToken();
    const html = renderCreateTreePage({ csrfToken, treeName, treeTitle });

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
    res.end(html);
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      const cookies = parseCookies(req.headers.cookie);

      if (!isValidCsrf(cookies, formData.get('_csrf'))) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('This form has expired. Please reload the page and try again.');
        return;
      }

      const name = formData.get('name') ?? '';
      const title = formData.get('title') ?? '';

      const existingId = await treeManagement.findTreeIdByName(pool, name);

      if (existingId !== null) {
        const query = new URLSearchParams({ title });
        res.writeHead(302, { Location: `/admin/trees/create?${query}` });
        res.end();
        return;
      }

      await treeManagement.createTree(pool, { name, title, userId: user.userId });

      res.writeHead(302, { Location: `/admin/trees/manage/${encodeURIComponent(name)}` });
      res.end();
    } catch (error) {
      console.error('Failed to create tree:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

/**
 * POST /admin/trees/default/{tree} (SelectDefaultTree) -
 * AuthAdministrator only. Tree management step.
 */
async function handleSelectDefaultTree(req, res, treeName) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const user = await authenticateAdmin(req, res, `/admin/trees/default/${treeName}`);

  if (user === null) {
    return;
  }

  try {
    const body = await readRequestBody(req);
    const formData = new URLSearchParams(body);
    const cookies = parseCookies(req.headers.cookie);

    if (!isValidCsrf(cookies, formData.get('_csrf'))) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('This form has expired. Please reload the page and try again.');
      return;
    }

    await treeManagement.setDefaultTree(pool, treeName);

    res.writeHead(302, { Location: `/admin/trees/manage/${encodeURIComponent(treeName)}` });
    res.end();
  } catch (error) {
    console.error('Failed to set default tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

/**
 * POST /admin/trees/delete/{tree} (DeleteTreeAction) - AJAX, AuthAdministrator
 * only. Tree management step. Mirrors TreeService::delete() via
 * tree-management.mjs's deleteTreeTransactional().
 */
async function handleDeleteTree(req, res, treeName) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const user = await authenticateAdmin(req, res, '/admin/trees/manage');

  if (user === null) {
    return;
  }

  const cookies = parseCookies(req.headers.cookie);

  if (!isValidCsrf(cookies, req.headers['x-csrf-token'])) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('This form has expired. Please reload the page and try again.');
    return;
  }

  try {
    const gedcomId = await treeManagement.findTreeIdByName(pool, treeName);

    if (gedcomId === null) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    await treeManagement.deleteTreeTransactional(pool, gedcomId);

    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('');
  } catch (error) {
    console.error('Failed to delete tree:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

/**
 * GET/POST /admin/trees/merge (MergeTreesPage/MergeTreesAction) -
 * AuthAdministrator only. Tree management step.
 */
async function handleMergeTreesPage(req, res, url) {
  const user = await authenticateAdmin(req, res, '/admin/trees/merge');

  if (user === null) {
    return;
  }

  if (req.method === 'GET') {
    try {
      const tree1Name = url.searchParams.get('tree1_name') ?? '';
      const tree2Name = url.searchParams.get('tree2_name') ?? '';
      const tree1Id = await treeManagement.findTreeIdByName(pool, tree1Name);
      const tree2Id = await treeManagement.findTreeIdByName(pool, tree2Name);

      const xrefs = tree1Id !== null && tree2Id !== null && tree1Id !== tree2Id ? await treeManagement.countCommonXrefs(pool, tree1Id, tree2Id) : 0;

      const trees = await accessibleTrees(pool, { userId: user.userId, isAdmin: true });
      const treeList = {};

      for (const tree of trees) {
        treeList[tree.name] = tree.title;
      }

      const csrfToken = generateCsrfToken();
      const html = renderMergeTreesPage({ csrfToken, treeList, tree1Name, tree2Name, xrefs });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
      res.end(html);
    } catch (error) {
      console.error('Failed to resolve merge trees page:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      const cookies = parseCookies(req.headers.cookie);

      if (!isValidCsrf(cookies, formData.get('_csrf'))) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('This form has expired. Please reload the page and try again.');
        return;
      }

      const tree1Name = formData.get('tree1_name') ?? '';
      const tree2Name = formData.get('tree2_name') ?? '';
      const tree1Id = await treeManagement.findTreeIdByName(pool, tree1Name);
      const tree2Id = await treeManagement.findTreeIdByName(pool, tree2Name);

      if (tree1Id !== null && tree2Id !== null && tree1Id !== tree2Id && (await treeManagement.countCommonXrefs(pool, tree1Id, tree2Id)) === 0) {
        await treeManagement.mergeTreesTransactional(pool, tree1Id, tree2Id);

        res.writeHead(302, { Location: `/admin/trees/manage/${encodeURIComponent(tree2Name)}` });
        res.end();
        return;
      }

      const query = new URLSearchParams({ tree1_name: tree1Name, tree2_name: tree2Name });
      res.writeHead(302, { Location: `/admin/trees/merge?${query}` });
      res.end();
    } catch (error) {
      console.error('Failed to merge trees:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

/**
 * GET/POST /tree/{tree}/preferences (TreePreferencesPage/Action) -
 * AuthManager (for THIS tree). Tree management step.
 */
async function handleTreePreferencesPage(req, res, url, treeName) {
  const gate = await authenticateTreeManager(req, res, url.pathname, treeName);

  if (gate === null) {
    return;
  }

  const { user, tree } = gate;

  if (req.method === 'GET') {
    try {
      const data = await treeManagement.loadTreeForPreferences(pool, tree.gedcomId);

      const allUsersResult = await pool.query('SELECT user_id, real_name, user_name FROM wt_user WHERE user_id > 0 ORDER BY real_name');
      const memberList = allUsersResult.rows.map((row) => ({ id: row.user_id, realName: row.real_name, userName: row.user_name }));

      const csrfToken = generateCsrfToken();
      const html = renderTreePreferencesPage({
        csrfToken,
        tree: { gedcom_name: treeName, title: data.row.title, gedcomId: tree.gedcomId },
        preferences: data.preferences,
        members: memberList,
        isAdmin: user.isAdmin,
        duplicateName: url.searchParams.get('duplicate') === '1',
      });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
      res.end(html);
    } catch (error) {
      console.error('Failed to resolve tree preferences page:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      const cookies = parseCookies(req.headers.cookie);

      if (!isValidCsrf(cookies, formData.get('_csrf'))) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('This form has expired. Please reload the page and try again.');
        return;
      }

      const { gedcomName, duplicateName } = await treeManagement.updateTreePreferences(pool, {
        gedcomId: tree.gedcomId,
        isAdmin: user.isAdmin,
        treeName,
        formData,
      });

      const query = duplicateName ? '?duplicate=1' : '';
      res.writeHead(302, { Location: `/tree/${encodeURIComponent(gedcomName)}/preferences${query}` });
      res.end();
    } catch (error) {
      console.error('Failed to update tree preferences:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

/**
 * GET/POST /tree/{tree}/renumber (RenumberTreePage/Action) -
 * AuthManager (for THIS tree). Tree management step.
 */
async function handleRenumberTreePage(req, res, url, treeName) {
  const gate = await authenticateTreeManager(req, res, url.pathname, treeName);

  if (gate === null) {
    return;
  }

  const { tree } = gate;

  if (req.method === 'GET') {
    try {
      const xrefs = await treeManagement.duplicateXrefs(pool, tree.gedcomId);
      const csrfToken = generateCsrfToken();
      const html = renderRenumberTreePage({ csrfToken, tree: { gedcom_name: treeName, title: tree.title }, xrefs });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
      res.end(html);
    } catch (error) {
      console.error('Failed to resolve renumber tree page:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      const cookies = parseCookies(req.headers.cookie);

      if (!isValidCsrf(cookies, formData.get('_csrf'))) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('This form has expired. Please reload the page and try again.');
        return;
      }

      const xrefs = await treeManagement.duplicateXrefs(pool, tree.gedcomId);
      const pendingEdit = await treeManagement.hasPendingEdit(pool, tree.gedcomId);

      if (Object.keys(xrefs).length > 0 && pendingEdit) {
        res.writeHead(302, { Location: `/tree/${encodeURIComponent(treeName)}/renumber?pending=1` });
        res.end();
        return;
      }

      await treeManagement.renumberTreeTransactional(pool, tree.gedcomId, xrefs);

      res.writeHead(302, { Location: `/tree/${encodeURIComponent(treeName)}/renumber` });
      res.end();
    } catch (error) {
      console.error('Failed to renumber tree:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

/**
 * GET/POST /tree/{tree}/privacy (TreePrivacyPage/Action) -
 * AuthManager (for THIS tree). Tree management step.
 */
async function handleTreePrivacyPage(req, res, url, treeName) {
  const gate = await authenticateTreeManager(req, res, url.pathname, treeName);

  if (gate === null) {
    return;
  }

  const { tree } = gate;

  if (req.method === 'GET') {
    try {
      const data = await treeManagement.loadPrivacyData(pool, tree.gedcomId);
      const csrfToken = generateCsrfToken();
      const html = renderTreePrivacyPage({
        csrfToken,
        tree: { gedcom_name: treeName, private: data.tree.private },
        preferences: data.preferences,
        restrictions: data.restrictions,
      });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
      res.end(html);
    } catch (error) {
      console.error('Failed to resolve tree privacy page:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      const cookies = parseCookies(req.headers.cookie);

      if (!isValidCsrf(cookies, formData.get('_csrf'))) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('This form has expired. Please reload the page and try again.');
        return;
      }

      await treeManagement.updatePrivacy(pool, { gedcomId: tree.gedcomId, formData });

      res.writeHead(302, { Location: `/admin/trees/manage/${encodeURIComponent(treeName)}` });
      res.end();
    } catch (error) {
      console.error('Failed to update tree privacy:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

/**
 * GET /tree/{tree}/check (CheckTree) - AuthManager (for THIS tree).
 * Tree management step. Reduced-scope port - see
 * tree-management.mjs's checkTreeErrors() doc comment.
 */
async function handleCheckTreePage(req, res, url, treeName) {
  if (req.method !== 'GET') {
    res.writeHead(405, { allow: 'GET', 'content-type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  const gate = await authenticateTreeManager(req, res, url.pathname, treeName);

  if (gate === null) {
    return;
  }

  const { tree } = gate;

  try {
    const { errors, warnings } = await treeManagement.checkTreeErrors(pool, tree.gedcomId);
    const csrfToken = generateCsrfToken();
    const html = renderCheckTreePage({ csrfToken, tree: { gedcom_name: treeName, title: tree.title }, errors, warnings });

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
    res.end(html);
  } catch (error) {
    console.error('Failed to resolve check tree page:', error);
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Bad Gateway');
  }
}

/**
 * GET/POST /admin/site-preferences (SitePreferencesPage/Action) -
 * AuthAdministrator only. Site preferences step.
 */
async function handleSitePreferencesPage(req, res, url) {
  const user = await authenticateAdmin(req, res, '/admin/site-preferences');

  if (user === null) {
    return;
  }

  if (req.method === 'GET') {
    try {
      const preferences = await sitePreferences.loadGeneralPreferences(pool);
      const csrfToken = generateCsrfToken();
      const html = renderGeneralPreferencesPage({ csrfToken, preferences, dataFolder: `${WEBTREES_ROOT_DIR}data/` });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
      res.end(html);
    } catch (error) {
      console.error('Failed to resolve site preferences page:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      const cookies = parseCookies(req.headers.cookie);

      if (!isValidCsrf(cookies, formData.get('_csrf'))) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('This form has expired. Please reload the page and try again.');
        return;
      }

      const { error } = await sitePreferences.updateGeneralPreferences(pool, formData);

      if (error !== null) {
        const preferences = await sitePreferences.loadGeneralPreferences(pool);
        const csrfToken = generateCsrfToken();
        const html = renderGeneralPreferencesPage({ csrfToken, preferences, dataFolder: `${WEBTREES_ROOT_DIR}data/`, error });

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
        res.end(html);
        return;
      }

      res.writeHead(302, { Location: '/admin' });
      res.end();
    } catch (error) {
      console.error('Failed to update site preferences:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

/**
 * GET/POST /admin/site-registration (SiteRegistrationPage/Action) -
 * AuthAdministrator only. Site preferences step.
 */
async function handleSiteRegistrationPage(req, res) {
  const user = await authenticateAdmin(req, res, '/admin/site-registration');

  if (user === null) {
    return;
  }

  if (req.method === 'GET') {
    try {
      const preferences = await sitePreferences.loadRegistrationPreferences(pool);
      const csrfToken = generateCsrfToken();
      const html = renderRegistrationPreferencesPage({ csrfToken, preferences });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
      res.end(html);
    } catch (error) {
      console.error('Failed to resolve site registration page:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      const cookies = parseCookies(req.headers.cookie);

      if (!isValidCsrf(cookies, formData.get('_csrf'))) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('This form has expired. Please reload the page and try again.');
        return;
      }

      await sitePreferences.updateRegistrationPreferences(pool, formData);

      res.writeHead(302, { Location: '/admin' });
      res.end();
    } catch (error) {
      console.error('Failed to update site registration preferences:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

/**
 * GET/POST /admin/email (EmailPreferencesPage/Action) -
 * AuthAdministrator only. Site preferences step. This is the FIRST
 * real network dependency in this migration - see
 * site-preferences.mjs's top doc comment.
 */
async function handleEmailPreferencesPage(req, res) {
  const user = await authenticateAdmin(req, res, '/admin/email');

  if (user === null) {
    return;
  }

  if (req.method === 'GET') {
    try {
      const preferences = await sitePreferences.loadEmailPreferences(pool);
      const csrfToken = generateCsrfToken();
      const html = renderEmailPreferencesPage({ csrfToken, preferences });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
      res.end(html);
    } catch (error) {
      console.error('Failed to resolve email preferences page:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      const cookies = parseCookies(req.headers.cookie);

      if (!isValidCsrf(cookies, formData.get('_csrf'))) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('This form has expired. Please reload the page and try again.');
        return;
      }

      await sitePreferences.updateEmailPreferences(pool, formData);

      const test = formData.get('test') === '1';

      if (test) {
        const preferences = await sitePreferences.loadEmailPreferences(pool);
        const success = await sitePreferences.sendTestEmail(preferences, { email: user.email, realName: user.userName });

        const csrfToken = generateCsrfToken();
        const html = renderEmailPreferencesPage({
          csrfToken,
          preferences,
          testMessage: success ? `The message was successfully sent to ${user.email}.` : 'The message was not sent.',
          testSuccess: success,
        });

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
        res.end(html);
        return;
      }

      res.writeHead(302, { Location: '/admin' });
      res.end();
    } catch (error) {
      console.error('Failed to update email preferences:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

/**
 * GET/POST /admin/tags (SiteTagsPage/Action) - AuthAdministrator
 * only. Site preferences step.
 */
async function handleSiteTagsPage(req, res) {
  const user = await authenticateAdmin(req, res, '/admin/tags');

  if (user === null) {
    return;
  }

  if (req.method === 'GET') {
    try {
      const preferences = await sitePreferences.loadSiteTagsPreferences(pool);
      const csrfToken = generateCsrfToken();
      const html = renderSiteTagsPage({ csrfToken, preferences });

      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': csrfSetCookieHeader(csrfToken) });
      res.end(html);
    } catch (error) {
      console.error('Failed to resolve site tags page:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = await readRequestBody(req);
      const formData = new URLSearchParams(body);
      const cookies = parseCookies(req.headers.cookie);

      if (!isValidCsrf(cookies, formData.get('_csrf'))) {
        res.writeHead(403, { 'content-type': 'text/plain' });
        res.end('This form has expired. Please reload the page and try again.');
        return;
      }

      await sitePreferences.updateSiteTagsPreferences(pool, formData);

      res.writeHead(302, { Location: '/admin' });
      res.end();
    } catch (error) {
      console.error('Failed to update site tags preferences:', error);
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('Bad Gateway');
    }
    return;
  }

  res.writeHead(405, { allow: 'GET, POST', 'content-type': 'text/plain' });
  res.end('Method Not Allowed');
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') {
    res.writeHead(configError === null ? 200 : 503, { 'content-type': 'text/plain' });
    res.end(configError ?? 'ok');
    return;
  }

  if (configError !== null) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    res.end(`pages-server is not configured: ${configError}`);
    return;
  }

  if (isLogoutPath(url.pathname)) {
    await handleLogout(req, res);
    return;
  }

  if (isAccountDeletePath(url.pathname)) {
    await handleAccountDelete(req, res);
    return;
  }

  if (isLoginPath(url.pathname)) {
    await handleLogin(req, res, url);
    return;
  }

  if (isMyAccountPath(url.pathname)) {
    await handleMyAccount(req, res);
    return;
  }

  if (isHomePath(url.pathname)) {
    await handleHomePage(req, res);
    return;
  }

  const languageValue = matchLanguagePath(url.pathname);

  if (languageValue !== null) {
    await handleSelectPreference(req, res, 'language', languageValue);
    return;
  }

  const themeValue = matchThemePath(url.pathname);

  if (themeValue !== null) {
    await handleSelectPreference(req, res, 'theme', themeValue);
    return;
  }

  const individualMatch = matchIndividualPagePath(url.pathname);

  if (individualMatch !== null) {
    await handleIndividualPage(req, res, individualMatch.tree, individualMatch.xref);
    return;
  }

  const familyMatch = matchFamilyPagePath(url.pathname);

  if (familyMatch !== null) {
    await handleFamilyPage(req, res, familyMatch.tree, familyMatch.xref);
    return;
  }

  const sourceMatch = matchSourcePagePath(url.pathname);

  if (sourceMatch !== null) {
    await handleSourcePage(req, res, sourceMatch.tree, sourceMatch.xref);
    return;
  }

  const repositoryMatch = matchRepositoryPagePath(url.pathname);

  if (repositoryMatch !== null) {
    await handleRepositoryPage(req, res, repositoryMatch.tree, repositoryMatch.xref);
    return;
  }

  const noteMatch = matchNotePagePath(url.pathname);

  if (noteMatch !== null) {
    await handleNotePage(req, res, noteMatch.tree, noteMatch.xref);
    return;
  }

  const mediaMatch = matchMediaPagePath(url.pathname);

  if (mediaMatch !== null) {
    await handleMediaPage(req, res, mediaMatch.tree, mediaMatch.xref);
    return;
  }

  const submitterMatch = matchSubmitterPagePath(url.pathname);

  if (submitterMatch !== null) {
    await handleSubmitterPage(req, res, submitterMatch.tree, submitterMatch.xref);
    return;
  }

  const headerMatch = matchHeaderPagePath(url.pathname);

  if (headerMatch !== null) {
    await handleHeaderPage(req, res, headerMatch.tree, headerMatch.xref);
    return;
  }

  const repositoryListTreeName = matchRepositoryListPagePath(url.pathname);

  if (repositoryListTreeName !== null) {
    await handleRepositoryListPage(req, res, repositoryListTreeName);
    return;
  }

  const sourceListTreeName = matchSourceListPagePath(url.pathname);

  if (sourceListTreeName !== null) {
    await handleSourceListPage(req, res, sourceListTreeName);
    return;
  }

  const noteListTreeName = matchNoteListPagePath(url.pathname);

  if (noteListTreeName !== null) {
    await handleNoteListPage(req, res, noteListTreeName);
    return;
  }

  const locationListTreeName = matchLocationListPagePath(url.pathname);

  if (locationListTreeName !== null) {
    await handleLocationListPage(req, res, locationListTreeName);
    return;
  }

  const familyListTreeName = matchFamilyListPagePath(url.pathname);

  if (familyListTreeName !== null) {
    await handleFamilyListPage(req, res, familyListTreeName, url);
    return;
  }

  const individualListTreeName = matchIndividualListPagePath(url.pathname);

  if (individualListTreeName !== null) {
    await handleIndividualListPage(req, res, individualListTreeName, url);
    return;
  }

  const mediaListTreeName = matchMediaListPagePath(url.pathname);

  if (mediaListTreeName !== null) {
    await handleMediaListPage(req, res, mediaListTreeName, url);
    return;
  }

  const ancestorsChartMatch = matchAncestorsChartPagePath(url.pathname);

  if (ancestorsChartMatch !== null) {
    await handleAncestorsChartPage(req, res, ancestorsChartMatch, url);
    return;
  }

  const descendancyChartMatch = matchDescendancyChartPagePath(url.pathname);

  if (descendancyChartMatch !== null) {
    await handleDescendancyChartPage(req, res, descendancyChartMatch, url);
    return;
  }

  const hourglassChartMatch = matchHourglassChartPagePath(url.pathname);

  if (hourglassChartMatch !== null) {
    await handleHourglassChartPage(req, res, hourglassChartMatch, url);
    return;
  }

  const hourglassChartActionMatch = matchHourglassChartActionPath(url.pathname);

  if (hourglassChartActionMatch !== null) {
    await handleHourglassChartAction(req, res, hourglassChartActionMatch, url);
    return;
  }

  const familyBookChartMatch = matchFamilyBookChartPagePath(url.pathname);

  if (familyBookChartMatch !== null) {
    await handleFamilyBookChartPage(req, res, familyBookChartMatch, url);
    return;
  }

  const compactTreeChartMatch = matchCompactTreeChartPagePath(url.pathname);

  if (compactTreeChartMatch !== null) {
    await handleCompactTreeChartPage(req, res, compactTreeChartMatch, url);
    return;
  }

  const fanChartMatch = matchFanChartPagePath(url.pathname);

  if (fanChartMatch !== null) {
    await handleFanChartPage(req, res, fanChartMatch, url);
    return;
  }

  const lifespansChartMatch = matchLifespansChartPagePath(url.pathname);

  if (lifespansChartMatch !== null) {
    await handleLifespansChartPage(req, res, lifespansChartMatch, url);
    return;
  }

  const timelineChartMatch = matchTimelineChartPagePath(url.pathname);

  if (timelineChartMatch !== null) {
    await handleTimelineChartPage(req, res, timelineChartMatch, url);
    return;
  }

  const relationshipsChartMatch = matchRelationshipsChartPagePath(url.pathname);

  if (relationshipsChartMatch !== null) {
    await handleRelationshipsChartPage(req, res, relationshipsChartMatch, url);
    return;
  }

  const statisticsChartMatch = matchStatisticsChartActionPath(url.pathname);

  if (statisticsChartMatch !== null) {
    await handleStatisticsChartPage(req, res, statisticsChartMatch);
    return;
  }

  const pedigreeMapChartMatch = matchPedigreeMapChartPagePath(url.pathname);

  if (pedigreeMapChartMatch !== null) {
    await handlePedigreeMapChartPage(req, res, pedigreeMapChartMatch);
    return;
  }

  if (matchControlPanelPath(url.pathname)) {
    await handleControlPanelPage(req, res);
    return;
  }

  if (matchUserListPagePath(url.pathname)) {
    await handleUserListPage(req, res, url);
    return;
  }

  if (matchUserListDataPath(url.pathname)) {
    await handleUserListDataPage(req, res);
    return;
  }

  if (matchUserAddPath(url.pathname)) {
    await handleUserAddPage(req, res, url);
    return;
  }

  if (matchUserEditPath(url.pathname)) {
    await handleUserEditPage(req, res, url);
    return;
  }

  const deleteUserId = matchDeleteUserPath(url.pathname);

  if (deleteUserId !== null) {
    await handleDeleteUser(req, res, deleteUserId);
    return;
  }

  const masqueradeUserId = matchMasqueradePath(url.pathname);

  if (masqueradeUserId !== null) {
    await handleMasquerade(req, res, masqueradeUserId);
    return;
  }

  if (matchManageTreesPath(url.pathname)) {
    await handleManageTreesPage(req, res, url);
    return;
  }

  if (matchCreateTreePath(url.pathname)) {
    await handleCreateTreePage(req, res, url);
    return;
  }

  const defaultTreeNameParam = matchSelectDefaultTreePath(url.pathname);

  if (defaultTreeNameParam !== null) {
    await handleSelectDefaultTree(req, res, defaultTreeNameParam);
    return;
  }

  const deleteTreeNameParam = matchDeleteTreePath(url.pathname);

  if (deleteTreeNameParam !== null) {
    await handleDeleteTree(req, res, deleteTreeNameParam);
    return;
  }

  if (matchMergeTreesPath(url.pathname)) {
    await handleMergeTreesPage(req, res, url);
    return;
  }

  const preferencesTreeName = matchTreePreferencesPath(url.pathname);

  if (preferencesTreeName !== null) {
    await handleTreePreferencesPage(req, res, url, preferencesTreeName);
    return;
  }

  const renumberTreeName = matchRenumberTreePath(url.pathname);

  if (renumberTreeName !== null) {
    await handleRenumberTreePage(req, res, url, renumberTreeName);
    return;
  }

  const privacyTreeName = matchTreePrivacyPath(url.pathname);

  if (privacyTreeName !== null) {
    await handleTreePrivacyPage(req, res, url, privacyTreeName);
    return;
  }

  const checkTreeName = matchCheckTreePath(url.pathname);

  if (checkTreeName !== null) {
    await handleCheckTreePage(req, res, url, checkTreeName);
    return;
  }

  if (matchSitePreferencesPath(url.pathname)) {
    await handleSitePreferencesPage(req, res, url);
    return;
  }

  if (matchSiteRegistrationPath(url.pathname)) {
    await handleSiteRegistrationPage(req, res);
    return;
  }

  if (matchEmailPreferencesPath(url.pathname)) {
    await handleEmailPreferencesPage(req, res);
    return;
  }

  if (matchSiteTagsPath(url.pathname)) {
    await handleSiteTagsPage(req, res);
    return;
  }

  const treeName = matchTreePagePath(url.pathname);

  if (treeName !== null) {
    await handleTreePage(req, res, treeName);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`pages-server listening on http://127.0.0.1:${PORT}`);
});
