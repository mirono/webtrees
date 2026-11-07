# Phase 5 step 40: User management (`/admin/admin-users...`)

**Done 2026-11-07.** Full fidelity (user's explicit choice): the user
list (real server-side DataTables AJAX, not the plain-table
simplification earlier list routes used), add user, edit user (the
full profile + per-tree role/individual-link/relationship-privacy
form), delete user (reusing and correctly extending the already-fixed
transactional delete), and masquerade (log in as another user).

## New infrastructure

- `pages-server/datatables.mjs` — a generic port of
  `DatatablesService::handleQuery()`
  (app/Services/DatatablesService.php:118-181), the real server-side
  DataTables protocol. Written generically (not a one-off for the
  user list) since several other admin pages this migration hasn't
  reached yet (pending-changes log, site logs, ...) use the exact
  same real PHP service. Every stage (count/filter/sort/paginate) runs
  against one shared `SELECT * FROM (${baseSql}) AS base_query`
  wrapper, so `ORDER BY`/`WHERE` can reference the base query's own
  output column names directly — the same thing Eloquent's
  `$query->orderBy($sort_columns[...])` does with a real query-builder
  object, which pg's raw-SQL approach doesn't have.
- `pages-server/admin-layout-view.mjs` — the shared admin page shell +
  breadcrumb renderer, factored out since this is the first of
  (presumably) several further admin pages to need it (step 39's
  `control-panel-view.mjs` keeps its own earlier inline copy
  unchanged — not worth churning an already-shipped page for no
  behavior change).
- `pages-server/users-admin.mjs` / `pages-server/users-admin-view.mjs` —
  the feature itself.

## Real correctness details worth flagging

- **`UserEditAction`'s real field-write ordering is preserved, not
  "fixed".** Real PHP writes every OTHER preference (theme, language,
  timezone, contact method, comment, auto-accept, visible-online,
  verified, approved, password, admin flag, every tree's role/
  individual-link/path-length) *before* checking for a duplicate
  email/username. So a duplicate submission still applies every other
  field change, and only the email/username write itself is skipped.
  Ported exactly, since full fidelity was the explicit choice here.
- **`DeleteUser`'s pending-change reassignment is REAL here, unlike
  the self-delete path.** `account-delete.mjs` (step 5) already fixed
  `UserService::delete()`'s real, currently-shipped bug (no
  transaction, so a mid-delete failure leaves the account half-
  deleted) for the self-delete case — but that case's own "reassign
  pending changes to `Auth::id()`" step is a no-op, since the acting
  user and the deleted user are the same person. For an ADMIN deleting
  a DIFFERENT user, that reassignment is not a no-op: the acting
  admin genuinely inherits every non-`rejected` pending change row.
  `deleteUserTransactional(pool, targetUserId, actingAdminUserId)`
  implements this correctly (and still wrapped in one transaction).
- **Masquerade reuses `session-store.mjs`'s `regenerateSessionForLogin()`
  completely unchanged** — "masquerade as this user" is structurally
  identical to `Auth::login()`'s own `Session::regenerate(false)`
  (new session ID, old session data carried forward, target user ID
  written in), just without a password check. No new session-handling
  code was needed at all.

## Scope cuts

- **No approval-notification email.** Real `UserEditAction` sends a
  "New user at %s" email via `EmailService` the moment an admin first
  checks "Approved by administrator". This migration has no
  `EmailService`/SMTP port anywhere (same "no network dependency"
  reasoning already applied to `UpgradeService` in step 39) —
  approving a user just sets the flag, no email is sent.
- **Language/theme lists are NOT translated endonym/title strings.**
  Real PHP's edit form shows every `ModuleLanguageInterface` module's
  own locale `endonym()` (e.g. "Deutsch", not "German") for ~140
  languages, and a theme title per `ModuleThemeInterface`. Getting
  real endonym strings for every locale would mean porting ICU/locale
  data this migration has deliberately avoided everywhere else (the
  established English-only convention) — ported as a **plain text
  input** for language (the raw tag, e.g. `en-US`) instead of a huge
  `<select>`, and a `<select>` with the 6 real theme module names/
  titles (easy to enumerate by hand — confirmed exactly 6 theme
  modules exist via `lib/module-categories.js`'s own generated table).
  Time zone is the SAME simplification (a plain text input, not a
  ~400-entry `<select>`) for the same "huge list, low value for a
  picker nobody actually browses" reasoning — even though Node's own
  `Intl.supportedValuesOf('timeZone')` does ship the same IANA tzdata
  PHP's `DateTimeZone::listIdentifiers()` reads from, so a real
  `<select>` would have been just as easy to build here as it was
  unnecessary. Either way, the real stored VALUE (whatever IANA name
  is typed/was already set) is read and written faithfully — only the
  picker UI is simplified.

## Live verification

Using a freshly-created `wt_session` row for the existing admin user
(no credentials read or extracted — created fresh, deleted after), and
one disposable test user created and destroyed entirely within this
verification pass:

- `GET /admin/admin-users` → `200`, correct DataTables shell/config.
- `POST /admin/admin-users-data` (simulating DataTables' own default
  AJAX body) → correct JSON (`recordsTotal`/`recordsFiltered`/`data`),
  real row data, edit-menu HTML correctly omitting masquerade/delete
  for the viewer's own row.
- Created a test user (`testuser40`) via `POST /admin/admin-users-create`
  → `302` to the new user's own edit page; appeared correctly in the
  list (`recordsTotal` went 1 → 2); a second create attempt with the
  same username correctly `302`'d back to the create form with the
  duplicate-check query params, no new row created.
- Search filter (`search[value]=forty`) correctly narrowed
  `recordsFiltered` to 1.
- `GET /admin/admin-users-edit?user_id=1` (the real admin's own
  account) correctly omitted the admin checkbox and showed "Manager"
  pre-selected for the one real tree, individual-link `I000001`
  pre-filled.
- A stale CSRF token on `POST /admin/masquerade/46` correctly `403`'d;
  a fresh, cookie-matched token succeeded, returning a NEW session
  cookie. Confirmed that new session really is bound to the
  masqueraded (non-admin) user by then hitting `/admin` with it →
  `403` (not `200`, proving it isn't still the original admin's
  session).
- `POST /admin/users/delete/46` (the disposable test user) → `200`,
  row gone from `wt_user`; the masquerade-derived session row for that
  user was also gone afterward — confirmed to be `DeleteUserTransactional`'s
  own `DELETE FROM wt_session WHERE user_id = $1` step cleaning it up,
  not a separate bug.
- `POST /admin/users/delete/1` (the real admin, an administrator) →
  correctly `403` ("Cannot delete an administrator"), row untouched.

## Tests

- `js-tests/pages_server_datatables.test.js` (6 tests) — request
  parsing, unfiltered/filtered/sorted/paginated query shapes against
  an in-memory fixture.
- `js-tests/pages_server_users_admin.test.js` (24 tests) — user
  lookup, create (hash + default settings, TIMEZONE fallback), edit
  (field writes, per-tree settings, admin-flag self-protection,
  duplicate email/username handling with the real "everything else
  still saves" ordering, password-only-if-submitted), the edit-menu's
  privacy gating (self/admin/other), the list row's "highlight old
  unverified registration" rule, transactional delete (reassignment +
  rollback-on-failure).
- `js-tests/pages_server_users_admin_view.test.js` (10 tests) — list
  shell config, add-form prefill, edit-form admin-checkbox visibility,
  tree-role pre-selection, error rendering, HTML escaping.
- `js-tests/pages_server_routes.test.js` / `js-tests/proxy_routing.test.js` —
  new route-matcher cases for all 6 routes.

Full suite: 5558 passing (up from 5510), 0 regressions.

## Next

Remaining in the admin bucket: tree management, module configuration
pages, site preferences, GEDCOM import/export, data fixes, record
merging, and server diagnostics — all still on PHP.
