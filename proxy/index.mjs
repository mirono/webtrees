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

// Phase 5, step 2 of the php-to-js migration
// (docs/php-to-js-migration/phase5-first-node-route.md): the routing
// shim the migration checklist always called for
// (docs/php-to-js-migration-checklist.md:122, "a reverse proxy... or a
// small router that sends migrated routes to the Node service and
// everything else to PHP, keyed by path") - this is that shim, built
// now that there's finally a route to send anywhere.
//
// Deliberately plain node:http (no dependency), same convention as
// server/migration-service.mjs and pages-server/index.mjs: this only
// ever needs to route by path and stream two directions, not the full
// generality an npm proxy library would offer.

import { createServer } from 'node:http';
import { NODE_ROUTE_PATHS } from './routing.mjs';
import { createProxyHandler } from './handler.mjs';

const PORT = Number(process.env.PORT) || 8000;

const APP_TARGET = { host: process.env.APP_HOST || 'app', port: Number(process.env.APP_PORT) || 8000 };
const PAGES_TARGET = { host: process.env.PAGES_HOST || 'pages', port: Number(process.env.PAGES_PORT) || 8092 };

const server = createServer(createProxyHandler({ appTarget: APP_TARGET, pagesTarget: PAGES_TARGET }));

server.listen(PORT, () => {
  console.log(
    `proxy listening on http://127.0.0.1:${PORT} - ${NODE_ROUTE_PATHS.map((p) => `${p}*`).join(', ')} -> ${PAGES_TARGET.host}:${PAGES_TARGET.port}, everything else -> ${APP_TARGET.host}:${APP_TARGET.port}`,
  );
});
