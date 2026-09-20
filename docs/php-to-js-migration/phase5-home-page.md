# Phase 5, step 6: `/` (home page) ported to Node

## Context

The natural next step after completing the `/my-account`/`/login`/`/logout`
family. Initially framed (before reading the source) as "the first
anonymous, tree-listing page" — that framing turned out to be wrong,
corrected once the actual code was read: `HomePage.php` is almost
entirely a **redirect dispatcher**. It never lists trees; it picks the
site's default (or first accessible) tree and redirects to whichever
of four destinations applies. It renders real content in exactly one
case: a logged-in user with no access to any tree at all.

## The decision tree, replicated exactly

1. Look up `Site::getPreference('DEFAULT_GEDCOM')`.
2. Compute the current user's **privacy-filtered accessible tree set**
   (see below) and pick the default tree from within it, or the first
   one if the default isn't in that set (or unset).
3. If a tree was found:
   - If it's imported: redirect to `UserPage` (`/tree/{tree}/my-page`)
     if logged in, else `TreePage` (`/tree/{tree}`).
   - Else (not yet imported) and the user manages it: redirect to
     `ManageTrees` (`/trees/manage/{tree}`).
4. No tree resolved: redirect to `CreateTreePage` (`/trees/create`) if
   admin; render the "no tree access" page if logged in; redirect to
   `/login` otherwise.

None of the four redirect targets (`UserPage`, `TreePage`,
`ManageTrees`, `CreateTreePage`) are Node routes yet — the redirects
just point back at PHP, the same pattern already used elsewhere
(`/my-account-delete` redirecting to `/my-account`, `/login` honoring
an arbitrary `url` param). `/login` *is* already a Node route, so the
"not logged in, no tree" case redirects there directly instead of
building a PHP URL for it — PHP's own target,
`route(LoginPage::class, ['url' => ''])`, degrades to the same default
destination as omitting the param entirely, which is exactly what
Node's own `/login` GET handler already does for an empty `url`
(`isLocalPath('')` is `false`).

## The accessible-tree query is security-sensitive, so it's replicated precisely

`pages-server/trees.mjs::accessibleTrees()` mirrors
`TreeService::all()`'s privacy filter
(`app/Services/TreeService.php:72-113`) exactly, not approximately —
this determines which trees a user is even allowed to know exist:

- An **admin** sees every tree (`gedcom_id > 0`), no filtering.
- Anyone else sees a tree only if:
  - they're its **manager** (`wt_user_gedcom_setting.setting_name =
    'canedit'`, value `'admin'` — confirmed against
    `app/Contracts/UserInterface.php`'s actual constant *values*, not
    the constant names), or
  - it's **imported and private**, and they have any granted role
    other than `'none'` (visitor), or
  - it's **imported and public** (`private = 0`).

For an anonymous visitor (`userId === null`), the `LEFT JOIN`'s `user_id
= $1` condition can never match a real row (SQL `NULL` comparison), so
only the public-imported branch can ever apply — the same effective
behavior as `Auth::id()` being `null` for a guest in the PHP query
this replicates.

**Confirmed live, not just logically**: inserted a disposable
non-imported test tree and confirmed it was correctly invisible to a
non-admin visitor's `accessibleTrees()` result entirely (fails all
three conditions — not imported, so neither the private-with-role nor
public-imported branches can match), not merely "ranked lower."

## URL generation

`pages-server/route-url.mjs::phpRouteUrl()` mirrors
`RouteFactory::route()`'s URL-building for the one shape this route
needs: a plain path, no query parameters (none of the four redirect
targets take one beyond the `{tree}` path segment already embedded).
Confirmed live: with `rewrite_urls` off (this dev config), PHP's
router only accepts its own `?route=` ugly-URL form for a route it
owns — even a bare `/` 404s otherwise. Same pattern already seen when
`/login` was ported.

## Routing

`proxy/routing.mjs`'s `NODE_ROUTE_PATHS` gained `'/'`.
`matchesNodeRoute('/', pathname)` only matches an exact `/` or a
`//`-prefixed path — **not** "pathname starts with `/`", which would
be every path — so this doesn't swallow unrelated routes. Covered by
a dedicated test (`'/tree/ophir'` must not match).

## Verified end-to-end against the real Postgres database

- Anonymous visitor with the one real (public, imported) tree →
  redirects to `TreePage`; confirmed PHP itself accepts and renders
  that exact target.
- A disposable admin test user → redirects to `UserPage`; confirmed
  live (this also incidentally re-confirmed Node-issued sessions are
  recognized by real PHP pages beyond just `/login`'s own check).
- A disposable non-imported second tree → correctly redirects an
  admin/manager to `ManageTrees`. PHP's own downstream handling of
  that specific minimal test fixture then redirects further (the
  fixture lacks the full `wt_gedcom_setting` rows a tree created
  through the real "create tree" flow would have) — unrelated to this
  route's own logic, which produced the exactly-correct target URL
  both times; not chased further since verifying arbitrary downstream
  PHP pages work for any possible tree state is out of scope for this
  step.

Cleaned up all test data and the disposable tree afterward. Full JS
suite: 4131 tests, green.
