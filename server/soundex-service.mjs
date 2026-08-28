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
// docs/php-to-js-migration/). PHP's app/Soundex.php calls out to this
// service when WEBTREES_SOUNDEX_SERVICE_URL is set, falling back to its
// own native implementation on any failure — this service is never a
// single point of failure for the app.
//
// Deliberately plain node:http, no framework — the request/response shape
// here is small and fixed (3 routes), and this repo has no Node HTTP
// framework dependency to reuse.
//
// Run with: npm run serve:soundex   (or: node server/soundex-service.mjs)
// Configure the listen port with PORT (default 8090).

import { createServer } from 'node:http';
import { russell, compare, daitchMokotoff } from '../lib/soundex.js';

const PORT = Number(process.env.PORT) || 8090;

const ROUTES = {
  '/russell': (body) => ({ code: russell(String(body.text ?? '')) }),
  '/compare': (body) => ({ match: compare(String(body.a ?? ''), String(body.b ?? '')) }),
  '/daitch-mokotoff': (body) => ({ code: daitchMokotoff(String(body.text ?? '')) }),
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  const handler = req.method === 'POST' ? ROUTES[req.url] : undefined;

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
    console.log(`${req.method} ${req.url}`, body, '->', result);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'bad request' }));
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`soundex-service listening on http://127.0.0.1:${PORT}`);
});
