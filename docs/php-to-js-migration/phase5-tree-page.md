# Phase 5, step 8: `/tree/{tree}` (TreePage) + WelcomeBlockModule

**Status: done and verified live (2026-09-20).**

## What this is

The first **tree-scoped** route served entirely by Node, and the first
to touch real GEDCOM/individual data rather than only user/session/site
settings. Everything shipped in steps 2-7 (`/my-account`, `/login`,
`/logout`, `/my-account-delete`, `/`, `/language`, `/theme`)
deliberately avoided tree context.

## Key finding: TreePage is a block/widget system, not one page

Reading `TreePage.php` shows it isn't a single page — it renders
whichever of up to 8 independent `ModuleBlockInterface` classes are
configured per tree. Confirmed via `wt_block` on the real "ophir" tree:
`gedcom_stats`, `gedcom_news`, `gedcom_favorites`, `review_changes`,
`gedcom_block`, `random_media`, `todays_events`, `logged_in`. Porting
all 8 is out of scope for one step — same "prove the pattern, don't
over-scope" precedent as every prior step (e.g. `/my-account` skipping
2 tree-scoped fields).

**Scope for this step**: the TreePage *shell* (chrome, block layout)
plus exactly one real block — `WelcomeBlockModule` (module_name
`gedcom_block`). Every other configured block is simply **omitted**
from the layout — not stubbed, not placeholder'd, just not shown.
`WelcomeBlockModule` turned out far more tractable than "porting GEDCOM
rendering" sounds: it never reads or renders GEDCOM field data (no
name, no dates) — it only needs a resolved individual **xref** (for a
URL), the tree's title, and a couple of site/user preference lookups.

## Scope cuts

- **The "Default chart" link is cut** — would require checking whether
  a `PedigreeChartModule` is active for this tree, a separate
  module-registry concern. The block still renders real, useful
  content without it.
- **The individual link omits the SEO slug** — `IndividualPage`'s route
  is `/individual/{xref}{/slug}`, confirmed structurally optional
  (`Validator::attributes($request)->string('slug', '')`, defaults to
  empty, never validated). Linking to
  `/tree/{tree}/individual/{xref}` with no slug is a fully valid URL —
  **confirmed live**: PHP 301-redirects it to the full slug URL rather
  than 404ing (see "Live verification" below).
- **No default-block auto-seeding.** PHP's
  `HomePageService::checkDefaultTreeBlocksExist()` copies 8 template
  rows into a tree's `wt_block` on first visit if none exist. **Not
  replicated in Node** — it's a write whose full semantics (8 real
  module rows resolved via the module registry) Node doesn't
  implement; partially replicating it would persist rows that don't
  match what PHP itself would seed, corrupting the tree's real config
  for every future PHP-rendered visit. If a tree has no `wt_block` row
  for `gedcom_block`, Node just renders an empty block area — a
  visible gap, not a corrupting one, and it self-heals the moment that
  tree is ever visited through PHP. (The real "ophir" tree already has
  its blocks seeded — confirmed live, `block_id=27`.)
- **Pending (unsaved editor) changes are not consulted** when resolving
  the significant individual — consistent with editor-feature cuts
  made elsewhere in this migration.

## A correctness gap found and fixed during implementation

The first draft of `isWelcomeBlockEnabledAndVisible()` only checked
module-level enable/visibility (`wt_module`/`wt_module_privacy`) — it
never checked whether the **specific tree** actually has a `wt_block`
row configuring `gedcom_block` at all. PHP's real
`HomePageService::treeBlocks()` requires ALL of: a configured
`wt_block` row, the module enabled, and privacy-level visible — a tree
admin can remove a block from their layout even while the module stays
globally enabled. Fixed by replacing that function with
`findVisibleWelcomeBlockId()` (`pages-server/welcome-block.mjs`), which
queries `wt_block` first and returns the real `block_id` (needed for
the `id="block-N"` HTML attribute) — `null` short-circuits before ever
querying module/privacy state. `index.mjs`'s `handleTreePage()` had
been using a placeholder (`tree.gedcomId`) for `block-N`; now uses the
real value.

## Auth / tree-resolution behavior (verified against source and live)

`app/Http/Middleware/Router.php:112-125` is the real tree-resolution
logic (no separate `UseTree` middleware): `TreeService::all()->get($name)`
— the exact same privacy predicate `pages-server/trees.mjs`'s
`accessibleTrees()` already replicates, scoped to one name via the new
`accessibleTreeByName()`. If that lookup returns null (tree doesn't
exist *or* isn't accessible to this viewer — PHP does not distinguish
the two), the request falls through to `NotFound::handle()`, which
redirects (`302 Location: /`) for a normal GET.

`TreePage::class` has no `AuthLoggedIn` middleware — anonymous visitors
can view it, provided the tree itself is accessible.

## Implementation

- **`pages-server/trees.mjs`**: added `accessibleTreeByName()` (same
  privacy predicate as `accessibleTrees()`, scoped to one name, now
  also selects `title`) and `viewerAccessLevel()` (mirrors
  `Auth::accessLevel()`'s tiers: 0=manager, 1=member, 2=visitor).
- **`pages-server/welcome-block.mjs`** (new): `significantIndividualXref()`
  mirrors `Tree::significantIndividual($user)`'s no-explicit-xref
  fallback chain (user's `rootid`/`gedcomid` prefs → tree's
  `PEDIGREE_ROOT_ID` → `MIN(i_id)` → `null` if the tree has zero
  individuals); `findVisibleWelcomeBlockId()` as described above.
- **`pages-server/tree-view.mjs`** (new): `renderTreePage()`, following
  the hand-rolled-HTML convention of every prior view
  (`dir="ltr"` — required, not decorative, same `[dir]`-selector CSS
  finding as `/my-account` — CSRF meta tag only when logged in, an
  anonymous vs. logged-in header variant). Since Node only ever
  populates the one side-column block, the layout always takes
  `tree-page.phtml`'s single-full-width-column branch; the two-column
  8/4 split is dead code for this scope. Confirmed live that
  `Str::kebab('gedcom_block')` leaves it unchanged (Laravel's
  `kebab()` only affects camelCase boundaries, not underscores), so
  the wrapper CSS class is `wt-block-gedcom_block`.
- **`pages-server/routes.mjs`**: `matchTreePagePath()` — an **exact**
  match (`/tree/{tree}` registers at `''` inside its own attach block,
  unlike every prefix-matched route from steps 2-7), so sibling routes
  (`/tree/{tree}/individual/{xref}`, `/tree/{tree}/my-page`, ...) stay
  PHP-routed.
- **`proxy/routing.mjs`**: a dedicated `isTreePagePath()` regex check
  (the existing `NODE_ROUTE_PATHS`/prefix-match shape would have wrongly
  forwarded every sibling route too), wired into `isNodeRoute()`
  alongside the existing ugly-URL (`?route=`) handling.
- **`pages-server/index.mjs`**: `handleTreePage()` ties it together —
  resolve the user → resolve the tree (302 home if null) → resolve
  viewer access level → `findVisibleWelcomeBlockId()` → if visible,
  `significantIndividualXref()` → build links ("Default individual"
  always; "Request a new user account" only for an anonymous visitor
  when `USE_REGISTRATION_MODULE` is on, reusing the existing
  `canRegisterUsers()` helper built for `/login`) → render.

## Verification

**Unit tests** (all mocked `pool`, no live DB):
- `js-tests/pages_server_routes.test.js`: `matchTreePagePath()`,
  including the negative case (`/tree/ophir/individual/I1` must not
  match).
- `js-tests/proxy_routing.test.js`: `isTreePagePath()` and
  `isNodeRoute()`'s new branch, same negative case, plus the ugly-URL
  form. (This also **fixed a now-stale assertion** — a pre-existing
  test asserted `/tree/ophir` was *not* a Node route, which stopped
  being true the moment this step landed; updated to assert the
  correct new behavior and moved the "swallows everything" guard test
  to an unrelated static-asset path instead.)
- `js-tests/pages_server_trees.test.js`: `accessibleTreeByName()`
  (admin vs. non-admin query shape, no-match → null) and
  `viewerAccessLevel()`'s 4 branches.
- `js-tests/pages_server_welcome_block.test.js` (new):
  `significantIndividualXref()`'s full fallback chain including the
  "rootid exists but points at a nonexistent individual, falls through
  to gedcomid" case and the "zero individuals" case; `findVisibleWelcomeBlockId()`'s
  4 branches (no `wt_block` row at all, module disabled, no privacy
  override defaults to visible, a restrictive override hides it, a
  permissive override doesn't).
- `js-tests/pages_server_tree_view.test.js` (new): `dir="ltr"`, tree
  title rendering, welcome-block omitted (null / zero links) vs.
  populated (including HTML-escaping of link content), logged-in vs.
  anonymous header.

Full suite: **4194 tests, green** (up from 4152 before this step).

**Live verification** (the established `data/config.yaml`
localhost-swap-then-restore pattern — this session used it against a
locally-run `pages-server` **and** a locally-run `php -S` instance
pointed at the same Postgres database, since this environment's shell
lacks Docker socket permissions):

1. Anonymous visit to `/tree/ophir` — real page renders, welcome block
   shows with the real `wt_block.block_id=27` (not the old placeholder),
   "Default individual" link is `/tree/ophir/individual/X1` (ugly-URL
   form, `rewrite_urls=0`), resolved via the `MIN(i_id)` fallback since
   this tree only has one individual (`X1`) and no `PEDIGREE_ROOT_ID`.
2. **Fed that exact link into a real `php -S` instance sharing the same
   database**: `301 Moved Permanently` → `.../individual/X1/John-DOE`
   → following that reached `wt-route-IndividualPage` in the response
   body (a pre-existing, unrelated "fact-sorting service unavailable"
   error appeared past that point — confirmed via `git log`/grep that
   no file in this step's call path touches that service; it's a
   separate phase-4 bridge dependency, not a regression from this
   step). Confirms the slug-less link target is real and correctly
   routed by PHP, not a guess.
3. Logged-in state, via a disposable test user (`nodetest`, not the
   real admin `mirono`) with a manually inserted `wt_session` row:
   header correctly showed the real name and a working "Sign out"
   control; with no `rootid`/`gedcomid` preference set, resolved via
   the same `MIN(i_id)` fallback as anonymous; after inserting a
   `rootid='X1'` preference row, the block still rendered correctly,
   confirming that query path runs cleanly against the real schema.
   (Only one individual exists in this tree, so the two branches
   happen to resolve to the same xref — the point of this check was
   confirming the SQL executes correctly against real columns, which
   the mocked unit tests can't do.)
4. `/tree/doesnotexist` → confirmed `302 Location: /`, matching PHP's
   confirmed-live NotFound-redirect behavior from step 6.
5. All disposable fixtures (test user, session row, preference row)
   deleted afterward; `data/config.yaml` restored to `dbhost: "postgres"`
   for the live Docker stack; both local test server processes killed.

## Docker note

Same as every prior pages-server step: **needs `docker compose restart
pages`** to pick up these changes in the live stack (bind-mounted
source edits don't restart a long-running Node process).
