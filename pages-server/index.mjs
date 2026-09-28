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
  matchRepositoryPagePath,
  matchNotePagePath,
  matchMediaPagePath,
  matchSubmitterPagePath,
  matchHeaderPagePath,
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
  sex,
  sexLabel,
  extractPrimaryName,
  extractAllNameFacts,
  nameSubTagAttributes,
  parseFacts,
  getBirthDate,
  getDeathDate,
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
} from './media.mjs';
import { renderMediaPage } from './media-view.mjs';
import { loadSubmitter, submitterCanShowRecord, displayableSubmitterFacts, submitterFactOtherAttributes } from './submitter.mjs';
import { renderSubmitterPage } from './submitter-view.mjs';
import { loadHeader, headerCanShowRecord, displayableHeaderFacts, headerFactOtherAttributes } from './header.mjs';
import { renderHeaderPage } from './header-view.mjs';
import { GedcomDate } from '../lib/gedcom-date.js';
import { renderFamilyPage } from './family-view.mjs';
import { loadFamily, loadRelatedFamilyXrefs, childrenXrefs, displayableFamilyFacts, familyCanShowRecord } from './family.mjs';
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
} from './source.mjs';
import { loadNote, noteCanShowRecord, noteText, displayableNoteFacts } from './note.mjs';
import { renderNotePage } from './note-view.mjs';
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

  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderSourcePage({ tree, user, csrfToken, source: sourceViewModel });

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

  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderRepositoryPage({ tree, user, csrfToken, repository: repositoryViewModel });

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

  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderNotePage({ tree, user, csrfToken, note: noteViewModel });

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

  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderMediaPage({ tree, user, csrfToken, media: mediaViewModel });

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

  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderSubmitterPage({ tree, user, csrfToken, submitter: submitterViewModel });

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

  const csrfToken = user !== null ? generateCsrfToken() : null;
  const html = renderHeaderPage({ tree, user, csrfToken, header: headerViewModel });

  const responseHeaders = { 'content-type': 'text/html; charset=utf-8' };

  if (csrfToken !== null) {
    responseHeaders['set-cookie'] = csrfSetCookieHeader(csrfToken);
  }

  res.writeHead(200, responseHeaders);
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
