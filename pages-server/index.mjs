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
import { renderIndividualPage } from './individual-view.mjs';
import {
  loadIndividual,
  loadTreePrivacyPrefs,
  loadDefaultResn,
  viewerRelationshipPrefs,
  canShowRecord,
  sex,
  extractPrimaryName,
  parseFacts,
  getBirthDate,
  getDeathDate,
  isDead,
  lifespan,
  ageString,
  factCanShow,
  displayDate,
  extractNameFromFact,
} from './individual.mjs';
import { GedcomDate } from '../lib/gedcom-date.js';
import { renderFamilyPage } from './family-view.mjs';
import { loadFamily, loadRelatedFamilyXrefs, childrenXrefs, displayableFamilyFacts, familyCanShowRecord } from './family.mjs';
import { renderSourcePage } from './source-view.mjs';
import {
  loadSource,
  loadRepository,
  repoXrefs,
  displayableSourceFacts,
  sourceFactOtherAttributes,
  repositoryCanShowRecord,
  sourceCanShowRecord,
} from './source.mjs';
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

  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderTreePage({ tree, user, csrfToken, welcomeBlock });

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
  'IDNO',
  'NMR',
  'SSN',
  'CHAN',
];

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

  // "Families" section (new step: closes the navigation loop back to
  // FamilyPage - see docs/php-to-js-migration/phase5-individual-page-families.md).
  // Mirrors RelativesTabModule's parent_families/spouse_families
  // (app/Module/RelativesTabModule.php:61-71), reduced to a flat list
  // of links - no step-families (adoption-driven second parent/spouse
  // sets, app/Individual.php's spouseStepFamilies()/childStepFamilies(),
  // a rarer relationship type this v1 doesn't chase), no
  // SHOW_PRIVATE_RELATIONSHIPS bypass (same accepted, display-only cut
  // already made for FamilyPage's own member cards).
  let parentFamilies;
  let spouseFamilies;

  try {
    const relatedFamilyXrefs = await loadRelatedFamilyXrefs(pool, tree.gedcomId, individual.xref);

    parentFamilies = [];
    for (const familyXref of relatedFamilyXrefs.parentFamilies) {
      const summary = await resolveFamilySummary(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref);
      if (summary !== null) {
        parentFamilies.push(summary);
      }
    }

    spouseFamilies = [];
    for (const familyXref of relatedFamilyXrefs.spouseFamilies) {
      const summary = await resolveFamilySummary(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref);
      if (summary !== null) {
        spouseFamilies.push(summary);
      }
    }
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

  const birthDate = getBirthDate(facts);
  const deathDate = getDeathDate(facts);
  const individualSex = sex(individual.gedcom);

  const visibleFacts = [];

  for (const fact of facts) {
    const tag = /^1 (\S+)/.exec(fact)?.[1];

    if (!VITAL_FACT_TAGS.includes(tag)) {
      continue;
    }

    // Fact-specific default RESN overrides the tree-wide one when both
    // exist - matches Fact::canShow()'s own check order
    // (individual_fact_privacy before fact_privacy, app/Fact.php:229-233).
    const resolvedDefaultResn = defaultResnInfo.factResn.get(tag) ?? defaultResnInfo.treeFactResn.get(tag) ?? null;

    if (!factCanShow(fact, accessLevel, resolvedDefaultResn)) {
      continue;
    }

    const dateMatch = /\n2 DATE (.+)/.exec(fact);
    const placeMatch = /\n2 PLAC (.+)/.exec(fact);
    const timeMatch = /\n3 TIME (.+)/.exec(fact);
    const addressMatch = /\n2 ADDR (.+)/.exec(fact);
    // CHAN's own author sub-tag - see family.mjs's identical handling;
    // 'INDI:CHAN' => [['_WT_USER', '0:1']] confirmed in app/Gedcom.php,
    // same shape as the family-level version already ported.
    const authorMatch = /\n2 _WT_USER (.+)/.exec(fact);

    visibleFacts.push({
      tag,
      date: dateMatch ? displayDate(new GedcomDate(dateMatch[1])) : '',
      time: timeMatch ? timeMatch[1] : '',
      place: placeMatch ? placeMatch[1] : '',
      address: addressMatch ? addressMatch[1] : '',
      author: authorMatch ? authorMatch[1] : '',
    });
  }

  const individualViewModel = {
    xref: individual.xref,
    fullNameHtml,
    lifespan: lifespan({ birthDate, deathDate, isDead: dead }),
    age: ageString({ birthDate, deathDate, isDead: dead, sex: individualSex }),
    facts: visibleFacts,
    parentFamilies,
    spouseFamilies,
  };

  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderIndividualPage({ tree, user, csrfToken, individual: individualViewModel });

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
  };
  const canShow = canShowRecord(treeForPrivacy, individual.gedcom, facts, viewer);

  return { individual, facts, dead, canShow };
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
 * loadRelatedFamilyXrefs()) to a summary link for IndividualPage's new
 * "Families" section - reuses the exact same member-resolution and
 * family-level privacy chain handleFamilyPage() already uses below,
 * since a family referenced from an individual's page needs the
 * identical "every member must be showable" gate as the family's own
 * page (`familyCanShowRecord()`) - returns null if the family
 * shouldn't be shown to this viewer at all, matching how
 * Individual::childFamilies()/spouseFamilies() themselves already
 * filter via canShow() internally (app/GedcomRecord.php's target
 * resolution), not something IndividualPage does separately in PHP.
 */
async function resolveFamilySummary(tree, treePrivacyPrefs, accessLevel, relPrefs, familyXref) {
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

  const husbandVM = familyMemberViewModel(tree, husband);
  const wifeVM = familyMemberViewModel(tree, wife);
  const titleHtml = `${husbandVM !== null ? husbandVM.fullNameHtml : UNKNOWN_NAME_HTML} + ${wifeVM !== null ? wifeVM.fullNameHtml : UNKNOWN_NAME_HTML}`;

  return { titleHtml, url: `/tree/${tree.name}/family/${family.xref}` };
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

  const visibleFacts = [];

  for (const fact of displayableFamilyFacts(facts)) {
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
    // no other family-level tag carries it.
    const authorMatch = /\n2 _WT_USER (.+)/.exec(fact);

    visibleFacts.push({
      tag,
      date: dateMatch ? displayDate(new GedcomDate(dateMatch[1])) : '',
      time: timeMatch ? timeMatch[1] : '',
      place: placeMatch ? placeMatch[1] : '',
      address: addressMatch ? addressMatch[1] : '',
      author: authorMatch ? authorMatch[1] : '',
    });
  }

  const familyViewModel = {
    husband: familyMemberViewModel(tree, husband),
    wife: familyMemberViewModel(tree, wife),
    children: children.map((child) => familyMemberViewModel(tree, child)).filter((child) => child !== null),
    facts: visibleFacts,
  };

  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderFamilyPage({ tree, user, csrfToken, family: familyViewModel });

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
function sourceFactValue(factGedcom) {
  const lines = factGedcom.split('\n');
  const firstLine = lines[0] ?? '';
  const valueMatch = /^1 \S+ ?(.*)$/.exec(firstLine);
  const parts = [valueMatch ? valueMatch[1] : ''];

  for (const line of lines.slice(1)) {
    const contMatch = /^2 CONT ?(.*)$/.exec(line);
    const concMatch = /^2 CONC ?(.*)$/.exec(line);

    if (contMatch) {
      parts.push(contMatch[1]);
    } else if (concMatch) {
      parts[parts.length - 1] += concMatch[1];
    }
  }

  return parts.join('\n');
}

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
      value: tag === 'CHAN' || tag === 'REPO' ? '' : sourceFactValue(fact),
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

  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderSourcePage({ tree, user, csrfToken, source: sourceViewModel });

  const headers = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    headers['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, headers);
  res.end(html);
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
