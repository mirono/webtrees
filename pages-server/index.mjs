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

// Phase 5, steps 2-9 of the php-to-js migration
// (docs/php-to-js-migration/phase5-first-node-route.md): real HTTP
// routes served entirely by Node instead of PHP. Sits behind
// proxy/index.mjs, which sends /my-account*, /login*, /logout,
// /my-account-delete, /, /language/*, /theme/*, the exact-match
// /tree/{tree} page, and /tree/{tree}/individual/{xref} here and
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
// MARR, no slug canonicalization.
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
} from './individual.mjs';
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

// The individual's own vital-event facts this v1 slice renders - see
// docs/php-to-js-migration/phase5-individual-page.md's scope decision
// (MARR and every other GEDCOM tag are out of scope).
const VITAL_FACT_TAGS = ['BIRT', 'CHR', 'BAPM', 'DEAT', 'BURI', 'CREM'];

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

    visibleFacts.push({ tag, date: dateMatch ? dateMatch[1] : '', place: placeMatch ? placeMatch[1] : '' });
  }

  const individualViewModel = {
    xref: individual.xref,
    fullNameHtml,
    lifespan: lifespan({ birthDate, deathDate, isDead: dead }),
    age: ageString({ birthDate, deathDate, isDead: dead, sex: individualSex }),
    facts: visibleFacts,
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
