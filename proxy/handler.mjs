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

// The actual request-forwarding logic, split out from index.mjs so
// it's testable against a real (if fake) backend without needing to
// spawn a child process - same convention as pages-server/routes.mjs
// splitting pure logic from its HTTP server entrypoint.

import { request as httpRequest } from 'node:http';
import { isNodeRoute, rewriteForPages } from './routing.mjs';

/**
 * @param {{host: string, port: number}} appTarget
 * @param {{host: string, port: number}} pagesTarget
 * @returns {(clientReq: import('node:http').IncomingMessage, clientRes: import('node:http').ServerResponse) => void}
 */
export function createProxyHandler({ appTarget, pagesTarget }) {
  return function handleRequest(clientReq, clientRes) {
    const url = new URL(clientReq.url, 'http://localhost');
    const toPages = isNodeRoute(url.pathname, url.searchParams);
    const target = toPages ? pagesTarget : appTarget;
    const outgoingPath = toPages ? rewriteForPages(url) : clientReq.url;

    const proxyReq = httpRequest(
      {
        host: target.host,
        port: target.port,
        path: outgoingPath,
        method: clientReq.method,
        headers: {
          ...clientReq.headers,
          'x-forwarded-for': clientReq.socket.remoteAddress,
          'x-forwarded-proto': 'http',
          'x-forwarded-host': clientReq.headers.host ?? '',
        },
      },
      (proxyRes) => {
        clientRes.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(clientRes);
      },
    );

    proxyReq.on('error', (error) => {
      console.error(`Proxy error forwarding to ${target.host}:${target.port}:`, error.message);

      if (clientRes.headersSent) {
        // A LATE error on the proxy's own outgoing connection, after
        // the response to the client already went out successfully -
        // e.g. "Parse Error: Data after `Connection: close`", a known
        // quirk of PHP's `php -S` dev server sending trailing bytes
        // past its own declared Connection: close. Confirmed live:
        // this crashed the whole proxy process (ERR_HTTP_HEADERS_SENT
        // is an uncaught exception when thrown from an 'error'
        // handler), taking the entire site offline, not just the one
        // request that triggered it. Nothing to do here - the real
        // response was already served.
        return;
      }

      clientRes.writeHead(502, { 'content-type': 'text/plain' });
      clientRes.end('Bad Gateway');
    });

    clientReq.pipe(proxyReq);
  };
}
