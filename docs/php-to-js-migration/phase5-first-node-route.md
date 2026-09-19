# Phase 5, step 2: first real route ported to Node, via a shared session + reverse proxy

## Context

Phase 5's goal is full PHP elimination. Step 1 (`setup-cli/`, a Node CLI
provisioning a Postgres-backed install) is done. This step proves the
"strangler-fig" pattern works at the *HTTP route* level, not just the
algorithm level: one authenticated page (`/my-account`) is now served
entirely by a separate Node server, while PHP continues serving every
other route unchanged — fronted by a new reverse proxy that decides,
per request, which runtime handles it.

This only works for Postgres-backed installs (sites set up via
`setup-cli/`) — Node's `pg` client can't read a SQLite or MySQL
install. The `proxy`/`pages` services this step adds to
`docker-compose.yml` are a distinct, additive layer on top of the
existing `app` service, not a replacement for it — `app` itself is
completely unchanged.

## The key unlock: sessions are already shared, for free

webtrees already stores sessions in the database
(`app/SessionDatabaseHandler.php`), not native PHP files — and
critically, `wt_session.user_id` is its own column, not buried inside
the PHP-serialized `session_data` blob
(`app/SessionDatabaseHandler.php:61-73`; confirmed in
`golden/postgres-schema.sql`'s `wt_session` definition). This means
**identifying the logged-in user needs nothing PHP-specific — just the
raw session cookie value and a plain SQL lookup**:

```sql
SELECT user_id FROM wt_session WHERE session_id = $1
```

No PHP session-deserialization was needed at all for the part that
actually matters. This was the single biggest open risk going into this
step, and it turned out to already be solved by something that
existed, not something to build. Verified live, not assumed: logged in
through the real PHP app, took the exact `WT2_SESSION` cookie value,
and confirmed `pages-server` correctly identified the same user with
zero PHP-specific parsing.

## What was built

### `pages-server/` — the Node page server

| File | Role |
|---|---|
| `index.mjs` | `node:http` server, routes `GET`/`POST /my-account` + `/health` |
| `config.mjs` | Reads `data/config.yaml` (the exact flat shape `setup-cli/config-writer.mjs` writes) |
| `auth.mjs` | `parseCookies()`, `getCurrentUser()` — the session-sharing lookup above |
| `csrf.mjs` | Self-contained double-submit-cookie CSRF (see below) |
| `account-view.mjs` | Hand-rolled HTML replicating `edit-account-page.phtml`'s form fields |
| `account-update.mjs` | Mirrors `AccountUpdate.php`: duplicate email/username checks, `wt_user` update, `bcryptjs` password hash, 4 `wt_user_setting` upserts |

Chosen route: `/my-account` (`app/Http/RequestHandlers/AccountEdit.php`
GET, `AccountUpdate.php` POST), **no-tree variant only** — the real
route is `/my-account{/tree}`; this step skips the optional `{tree}`
segment and its 2 tree-scoped fields (`default_individual` display,
`default-xref`). Reasons: shortest full read+write pair gated by plain
login (not admin), exactly 2 tables (`wt_user`, `wt_user_setting`), no
destructive operations (unlike `AccountDelete`).

**CSRF is deliberately NOT shared with PHP.** PHP's token
(`Session::getCsrfToken()`, `app/Session.php:173-186`) lives *inside*
the PHP-serialized `session_data` blob — parsing PHP's legacy
`session.serialize_handler=php` format just to read one string, for a
token whose only consumer would be this same Node server, isn't worth
it. `pages-server/csrf.mjs` implements its own independent
double-submit-cookie check instead. CSRF protection doesn't need to be
shared across runtimes, only login identity does (which already is).

**Flash messages are deliberately not shared either** — same
PHP-serialized-blob problem (`app/FlashMessages.php:37-47`). On a
successful update, `pages-server` just re-renders the page with an
inline banner in the same response, no redirect-then-flash round trip.

A long-running server pools DB connections (`pg.Pool`), unlike
`setup-cli/pg.mjs`'s one-shot `Client` (fine for a CLI run, wrong for a
server handling concurrent requests).

**Degrades instead of crash-looping** when `data/config.yaml` doesn't
exist or isn't Postgres: every request (including `/health`) gets a
clear `503` explaining why, rather than the process exiting — otherwise
running `docker compose up` before ever running `setup-cli/` would put
`pages` into an endless restart loop with no useful signal.

### `proxy/` — the reverse proxy

The routing shim `docs/php-to-js-migration-checklist.md:122` called for
from the start ("a reverse proxy... or a small router that sends
migrated routes to the Node service and everything else to PHP, keyed
by path"). `proxy/routing.mjs` holds the pure routing decisions
(`isNodeRoute()`, `rewriteForPages()`, unit-tested in
`js-tests/proxy_routing.test.js`); `proxy/index.mjs` is the `node:http`
server wiring it up.

Sends `/my-account*` to `pages`, everything else to `app`, unchanged.
**Also handles the "ugly URL" form** (`rewrite_urls` off:
`/index.php?route=/my-account` — PHP's own
`app/Http/Middleware/Router.php:54,69-73` treats `?route=` as a path,
not a route name): detected the same way, then *rewritten* to the
plain `/my-account` path before forwarding, since `pages-server` only
ever matches a plain pathname and shouldn't need to know PHP's
query-string routing convention. Found by testing, not assumed — the
first version only detected the ugly-URL form without rewriting the
outgoing path, so `pages-server` 404'd on it.

### `docker-compose.yml`

Adds `pages` (internal-only) and `proxy` (**now publishes port 8000**).
`app` stops publishing port 8000 directly — it's still reachable
internally as `app:8000`, now only reachable externally through
`proxy`. This is the one deliberate breaking change to the existing
dev flow, called out explicitly in the compose file's own comments.

## Verified end-to-end, twice — directly on the host, then through the real Docker stack

Both runs did the same sequence: log in through the real PHP process
with real HTTP requests (capturing the real session cookie), hit
`/my-account` with that cookie and confirm `pages-server`/`pages`
recognizes the same user, submit a real account update and confirm the
resulting `wt_user`/`wt_user_setting` rows, confirm CSRF rejects a
mismatched token, confirm a request with no session redirects to
`/login`, confirm `/public/*` and ordinary pages still reach PHP
unchanged.

1. **Directly on the host** (`pages-server`/`proxy` run as plain Node
   processes, pointed at `localhost` ports) — caught the ugly-URL
   rewrite bug above.
2. **Through the real `docker compose up --build` stack** — same full
   sequence, this time through the actual `proxy`/`pages`/`app`
   containers on the real Docker network. Caught one more real gotcha:
   `setup-cli/` run from the *host* writes `dbhost: "localhost"` into
   `data/config.yaml`, which is wrong for the containers (`localhost`
   inside a container means the container itself, not the `postgres`
   service) — same class of mistake as phase 5 step 1's original
   host-vs-container config gotcha, now confirmed to recur for this
   step too. Fixed by editing that one line to `postgres` before
   restarting `pages`. Worth remembering: **anyone running `setup-cli/`
   from the host to configure a docker-compose-based install needs
   `--db-host=postgres`, not the default `localhost`.**

Verification commands used, for repeating this later:

```bash
docker compose up --build   # postgres, app, migration, pages, proxy

# If setup-cli/ hasn't been run yet against this stack's Postgres:
node setup-cli/index.mjs --db-host=postgres ...   # from inside a container
# or, from the host (then fix dbhost, see above):
node setup-cli/index.mjs   # interactive, localhost:5432 is published

curl -I http://localhost:8000/                              # -> app (PHP)
curl -I http://localhost:8000/public/css/vendor.min.css      # -> app (PHP)
curl -I http://localhost:8000/my-account                     # -> pages, redirects to /login (no session)
# log in via the browser or curl against /index.php?route=login, then:
curl -b <cookie-jar-with-WT2_SESSION> http://localhost:8000/my-account   # -> pages, real page
```

## Known limits (deliberate, not oversights)

- Postgres-only, matching every other phase-5 step.
- No-tree variant of `/my-account` only.
- No other route ported — this is one route, to prove the pattern.
- CSRF and flash messages are NOT shared cross-runtime (see above) —
  each runtime protects/informs its own forms independently.
- No layout/chrome fidelity beyond the essentials (header, "Sign out",
  flash banner) — no genealogy/tree-switcher menu, theme selector,
  quick search, or module hooks (`ModuleGlobalInterface`). This is a
  "prove the pattern" milestone; the verification bar is **visual/
  functional equivalence, not byte-exact HTML**, unlike the earlier
  algorithm ports' golden-fixture-exact bar.
- `X-Forwarded-For` is sent by the proxy but PHP doesn't trust it by
  default (`app/Http/Middleware/ClientIp.php` needs `trusted_proxies`/
  `trusted_headers` config, which `setup-cli/` doesn't write) — IP
  logging accuracy only, not a functional issue.
- Login/logout stay PHP-only; `pages-server/` only *reads* the session
  PHP already created.
