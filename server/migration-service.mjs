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

// The Phase 3 bridge target for the PHP->JS strangler-fig migration (see
// docs/php-to-js-migration/). Hosts every ported module that has a live
// PHP-side bridge — currently Soundex (app/Soundex.php,
// WEBTREES_SOUNDEX_SERVICE_URL, see phase3-soundex-bridge.md),
// SurnameTradition (app/SurnameTradition/BridgedSurnameTradition.php,
// WEBTREES_SURNAME_TRADITION_SERVICE_URL, see
// phase3-surname-tradition-bridge.md), GedcomService
// (app/Services/GedcomService.php, WEBTREES_GEDCOM_SERVICE_URL, see
// phase3-gedcom-service-bridge.md), FactSortService
// (app/Services/FactSortService.php, WEBTREES_FACT_SORT_SERVICE_URL),
// GedcomExportService::wrapLongLines() (app/Services/GedcomExportService.php,
// WEBTREES_GEDCOM_EXPORT_SERVICE_URL), and
// GedcomImportService::reformatRecord() (app/Services/GedcomImportService.php,
// WEBTREES_GEDCOM_IMPORT_SERVICE_URL) — the latter three added together in
// a single decision pass, see phase3-bridge-decision-pass-2.md. Each PHP
// bridge falls back to its own native implementation on any failure —
// this service is never a single point of failure for the app, for any
// module.
//
// Originally soundex-service.mjs (Soundex-only) — renamed when the
// SurnameTradition bridge was added, since bolting unrelated modules onto
// a Soundex-named file would only get more misleading with each future
// module. Soundex's routes/env var were deliberately left unchanged
// (only the file and npm script were renamed) so already-shipped PHP code
// and its tests didn't need to change.
//
// Deliberately plain node:http, no framework — the routing needs here are
// still simple enough (a handful of fixed and `/module/key/method`-shaped
// routes) that a framework dependency isn't worth adding.
//
// Run with: npm run serve:migration   (or: node server/migration-service.mjs)
// Configure the listen port with PORT (default 8090).

import { createServer } from 'node:http';
import { russell, compare, daitchMokotoff } from '../lib/soundex.js';
import { canonicalTag, readLatitude, readLongitude } from '../lib/services/gedcom-service.js';
import { FactSortService } from '../lib/services/fact-sort-service.js';
import { wrapLongLines } from '../lib/services/gedcom-export-service.js';
import { reformatRecord } from '../lib/services/gedcom-import-service.js';
import { DefaultSurnameTradition } from '../lib/surname-tradition/default.js';
import { PatrilinealSurnameTradition } from '../lib/surname-tradition/patrilineal.js';
import { PaternalSurnameTradition } from '../lib/surname-tradition/paternal.js';
import { MatrilinealSurnameTradition } from '../lib/surname-tradition/matrilineal.js';
import { IcelandicSurnameTradition } from '../lib/surname-tradition/icelandic.js';
import { LithuanianSurnameTradition } from '../lib/surname-tradition/lithuanian.js';
import { PolishSurnameTradition } from '../lib/surname-tradition/polish.js';
import { PortugueseSurnameTradition } from '../lib/surname-tradition/portuguese.js';
import { SpanishSurnameTradition } from '../lib/surname-tradition/spanish.js';

const PORT = Number(process.env.PORT) || 8090;

// --- Soundex routes (app/Soundex.php) — unchanged from soundex-service.mjs ---

const SOUNDEX_ROUTES = {
  '/russell': (body) => ({ code: russell(String(body.text ?? '')) }),
  '/compare': (body) => ({ match: compare(String(body.a ?? ''), String(body.b ?? '')) }),
  '/daitch-mokotoff': (body) => ({ code: daitchMokotoff(String(body.text ?? '')) }),
};

// --- GedcomService routes (app/Services/GedcomService.php) ---

const GEDCOM_SERVICE_ROUTES = {
  '/gedcom/canonical-tag': (body) => ({ tag: canonicalTag(String(body.tag ?? '')) }),
  '/gedcom/read-latitude': (body) => ({ value: readLatitude(String(body.text ?? '')) }),
  '/gedcom/read-longitude': (body) => ({ value: readLongitude(String(body.text ?? '')) }),
};

// --- FactSortService routes (app/Services/FactSortService.php) ---
//
// `body.facts` is an array of fact shims, each carrying its original PHP
// array index (see FactSortService::factShim()) so the PHP side can map
// the returned order back to its real Fact objects without needing to
// reconstruct them from JSON. sort() only reads tag/value/id/attributeDate/
// date/record — the index field rides along untouched and comes back in
// the same shim object, in the new order.
const factSortService = new FactSortService();

const FACT_SORT_SERVICE_ROUTES = {
  '/fact-sort/sort': (body) => ({ facts: factSortService.sort(Array.isArray(body.facts) ? body.facts : []) }),
};

// --- GedcomExportService routes (app/Services/GedcomExportService.php) ---

const GEDCOM_EXPORT_SERVICE_ROUTES = {
  '/gedcom-export/wrap-long-lines': (body) => ({
    result: wrapLongLines(String(body.gedcom ?? ''), Number(body.maxLineLength ?? 0)),
  }),
};

// --- GedcomImportService routes (app/Services/GedcomImportService.php) ---

const GEDCOM_IMPORT_SERVICE_ROUTES = {
  '/gedcom-import/reformat-record': (body) => ({
    result: reformatRecord(String(body.rec ?? ''), {
      gedcomMediaPath: String(body.gedcomMediaPath ?? ''),
      wordWrappedNotes: String(body.wordWrappedNotes ?? ''),
    }),
  }),
};

// --- SurnameTradition routes (app/SurnameTradition/BridgedSurnameTradition.php) ---
//
// Keyed the same as SurnameTraditionFactoryInterface's PHP constants
// (app/Contracts/SurnameTraditionFactoryInterface.php), except PHP's
// DEFAULT constant is '' (empty string) — an empty URL path segment is
// awkward/ambiguous, so BridgedSurnameTradition maps '' -> 'default' when
// building the request path; mirrored here on the receiving end.

const SURNAME_TRADITION_CLASSES = {
  default: DefaultSurnameTradition,
  patrilineal: PatrilinealSurnameTradition,
  paternal: PaternalSurnameTradition,
  matrilineal: MatrilinealSurnameTradition,
  icelandic: IcelandicSurnameTradition,
  lithuanian: LithuanianSurnameTradition,
  polish: PolishSurnameTradition,
  portuguese: PortugueseSurnameTradition,
  spanish: SpanishSurnameTradition,
};

// name()/description() are never called via this bridge (they only
// return translated UI labels — no computational value in offloading
// them, and this service has no access to PHP's I18N/locale system to
// translate correctly even if it wanted to; see phase3-surname-tradition-bridge.md).
// This stub only exists so the constructor has something to store; if a
// future code path accidentally called name()/description() through this
// service, returning the raw key is a safe, non-crashing fallback rather
// than throwing.
const NOOP_I18N = { translate: (key) => key, translateContext: (_context, key) => key };

const SURNAME_TRADITION_METHODS = {
  'new-child-names': (tradition, body) => ({
    names: tradition.newChildNames(body.father ?? [], body.mother ?? [], String(body.sex ?? '')),
  }),
  'new-parent-names': (tradition, body) => ({
    names: tradition.newParentNames(body.child ?? [], String(body.sex ?? '')),
  }),
  'new-spouse-names': (tradition, body) => ({
    names: tradition.newSpouseNames(body.spouse ?? [], String(body.sex ?? '')),
  }),
};

function surnameTraditionHandler(key, method) {
  const TraditionClass = SURNAME_TRADITION_CLASSES[key];
  const methodFn = SURNAME_TRADITION_METHODS[method];

  if (!TraditionClass || !methodFn) {
    return undefined;
  }

  const tradition = new TraditionClass(NOOP_I18N);

  return (body) => methodFn(tradition, body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function resolveHandler(pathname) {
  if (SOUNDEX_ROUTES[pathname]) {
    return SOUNDEX_ROUTES[pathname];
  }

  if (GEDCOM_SERVICE_ROUTES[pathname]) {
    return GEDCOM_SERVICE_ROUTES[pathname];
  }

  if (FACT_SORT_SERVICE_ROUTES[pathname]) {
    return FACT_SORT_SERVICE_ROUTES[pathname];
  }

  if (GEDCOM_EXPORT_SERVICE_ROUTES[pathname]) {
    return GEDCOM_EXPORT_SERVICE_ROUTES[pathname];
  }

  if (GEDCOM_IMPORT_SERVICE_ROUTES[pathname]) {
    return GEDCOM_IMPORT_SERVICE_ROUTES[pathname];
  }

  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 3 && segments[0] === 'surname-tradition') {
    const [, key, method] = segments;

    return surnameTraditionHandler(key, method);
  }

  return undefined;
}

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  const handler = req.method === 'POST' ? resolveHandler(pathname) : undefined;

  if (!handler) {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  try {
    const raw = await readBody(req);
    const body = raw === '' ? {} : JSON.parse(raw);
    const result = handler(body);

    // eslint-disable-next-line no-console
    console.log(`${req.method} ${pathname}`, body, '->', result);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'bad request' }));
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`migration-service listening on http://127.0.0.1:${PORT}`);
});
