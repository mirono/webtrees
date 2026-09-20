# Phase 5, steps 3-4: `/login{/tree}` and `/logout` ported to Node

## Context

Step 2 (`/my-account`, see [phase5-first-node-route.md](phase5-first-node-route.md))
proved the strangler-fig pattern for an *already-authenticated* page:
`wt_session.user_id` is its own plain column, so Node never needed to
touch PHP's session serialization format — it only ever *read* a
session PHP had already written.

Login is different, and genuinely harder: it's the one route where
Node must **create** a session the real PHP app will recognize.
`Auth::id()` — which every PHP page uses to decide who's logged in —
reads `$_SESSION['wt_user']`, which lives *inside* the PHP-serialized
`session_data` blob (`session.serialize_handler=php`, confirmed via
`php -i`). The `user_id` column `/my-account` reads is just a
denormalized cache PHP writes alongside it. Skip writing a real
PHP-format session blob, and every subsequent PHP page would see the
user as logged out even though Node thinks they're logged in.

## The new hard part: PHP's session serialization format

`session.serialize_handler=php` is a simple, fully-specified format:
repeated `key|serialized_value` fragments with no separator between
entries, where the value uses PHP's `serialize()` encoding. A full
`serialize()`/`unserialize()` implementation was **not** needed — a
site-wide grep of every `Session::put()` call site in `app/` confirmed
this app's `$_SESSION` only ever stores 4 value kinds: int (`wt_user`),
bool (`initiated`), string (`CSRF_TOKEN`/`language`/`theme`), and null.

`pages-server/php-serialize.mjs` implements exactly those 4 kinds —
nothing more. The sharpest correctness edge: PHP's `s:N:"..."` length
is a **byte** count, not a character count (`Buffer.byteLength(value,
'utf8')`, not `.length`) — `'café'` is 4 JS characters but 5 UTF-8
bytes, and getting this wrong would desync PHP's own parser.

**Verified against real PHP, not just self-consistency**:

```
$ php -r 'session_start(); $_SESSION["wt_user"]=42; ...; echo session_encode();'
initiated|b:1;CSRF_TOKEN|s:21:"...";wt_user|i:42;language|s:5:"en-US";theme|s:0:"";
```

byte-for-byte identical to `encodePhpSession()`'s output for the same
input. And the reverse: a string `encodePhpSession()` produced was fed
to `session_decode()` in a real PHP process, which correctly
reconstructed `$_SESSION` with correct types (`is_int`, `is_bool`
confirmed).

**Unrecognized value types are not guessed at.** An array/object/float
value in an existing session row (never written by this app, but
possible on a foreign/stale row) can't be safely skipped without
knowing PHP's full recursive serialization grammar — a wrong guess
about where such a value ends would silently corrupt the rest of the
parse. `decodePhpSession()` throws `UnsupportedPhpValueTypeError`
instead, and the caller (`session-store.mjs`) falls back to treating
that session as unreadable, starting a fresh anonymous one — never
crashing the request.

## Session lifecycle, mirroring PHP exactly

`pages-server/session-store.mjs`:

- **`loadOrCreateAnonymousSession()`**: reuses an existing session
  (decoding its `session_data`) if the cookie matches a row, or mints
  a fresh anonymous one (`user_id: 0`, `{initiated: true, CSRF_TOKEN:
  <random>}`) — mirroring `Session::start()`'s new-session branch.
- **`regenerateSessionForLogin()`**: mirrors `Auth::login()` →
  `Session::regenerate()` with **no destroy** — a brand-new session ID
  is issued, but the session's existing data (`CSRF_TOKEN`,
  `initiated`) carries over unchanged, with `wt_user` added. **The old
  session row is deliberately left untouched, not deleted** — real
  PHP's `session_regenerate_id(false)` never deletes it synchronously
  either (left for `SessionDatabaseHandler::gc()`); deleting it
  immediately would be *more* aggressive than PHP itself, not a bug
  fix.

Known, accepted gap: no locking around the read-then-write on
`wt_session` (PHP's own handler has the identical gap, no
`flock`-equivalent) — two near-simultaneous login POSTs on the same
old session both succeed with distinct new session IDs; one extra
harmless orphaned row results.

## CSRF: reuses PHP's real mechanism, not `/my-account`'s cookie scheme

`/my-account`'s CSRF (`pages-server/csrf.mjs`) is a self-contained
double-submit cookie, deliberately built to avoid ever touching PHP's
session format. Login can no longer avoid that format, so it reuses
PHP's actual session-stored CSRF token (`CheckCsrf.php`'s own
mechanism) instead of inventing a third scheme.

## `doLogin()` — faithful port of `LoginAction.php`

`pages-server/login-action.mjs` mirrors `LoginAction.php:79-115`
exactly, including reusing the identical "The username or password is
incorrect" message for both the no-such-user and wrong-password cases
(never leak which one failed). Setting-name constants were
double-checked directly against `app/Contracts/UserInterface.php` —
the PHP *constant names* are not the `setting_name` values actually
stored (`PREF_IS_EMAIL_VERIFIED` → `'verified'`,
`PREF_IS_ACCOUNT_APPROVED` → `'verified_by_admin'`,
`PREF_TIMESTAMP_ACTIVE` → `'sessiontime'`).

## Scope decisions (same "no-tree variant only, prove the pattern" precedent as `/my-account`)

- `/login` and `/login/<tree>` both accepted, tree segment ignored — no
  per-tree welcome text, no default-tree redirect, no tree-scoped
  post-login destination (home instead of the tree-scoped `UserPage`).
- Skipped: "remember me" (PHP has none), rate-limiting/lockout (PHP has
  none beyond an audit-log write, which *is* replicated), i18n
  (hardcoded English, matching `/my-account`), the admin-only
  "upgrade available" flash message, password rehash-on-login (PHP's
  opportunistic `password_needs_rehash` — won't fire here since both
  sides already hash at bcrypt cost 10).
- `pages-server/login-view.mjs` includes `dir="ltr"` on `<html>` from
  the start — the fix just learned this session for
  `account-view.mjs` (Bootstrap's and the webtrees theme's CSS scope
  huge numbers of rules, including `.row`'s own gutter spacing, behind
  a `[dir]` ancestor attribute selector).

## `proxy/routing.mjs` generalized

`NODE_ROUTE_PATH` (a single constant) became `NODE_ROUTE_PATHS`
(`['/my-account', '/login']`). `rewriteForPages()` needed no change —
it was already path-agnostic, just echoing back whatever `?route=`
held.

## Verified end-to-end against the real stack

1. Ran `pages-server` locally against the real Postgres database
   (temporarily pointing `data/config.yaml` at `localhost` for the
   local test — remembered to restore it to `postgres` immediately
   afterward, since the live dockerized `app` reads the same
   bind-mounted file and briefly broke mid-test when it wasn't).
2. `GET /login` → cookie + CSRF token issued. `POST /login` with real
   credentials → `302`, new session cookie.
3. Direct SQL confirmed **both** the pre-login anonymous `wt_session`
   row and the new post-login row exist, the old row's `session_data`
   untouched — proving "regenerate without destroy" was implemented
   correctly.
4. **The test that actually matters**: took the Node-issued session
   cookie and hit the *real PHP app* (not `pages-server`) directly.
   PHP redirected to the "already logged in" destination
   (`UserPage`) instead of showing the login form — proof `Auth::id()`
   accepted the session Node wrote. The pre-login anonymous cookie,
   by contrast, correctly redirected to the real login form. Test user
   and all associated rows (`wt_user`, `wt_user_setting`, `wt_log`,
   `wt_session`) were cleaned up afterward.

Full JS suite: 4091 tests, green (4045 + 46 new). No PHP files
touched.

## Designed via a Plan-agent second pass

After direct reading of `LoginPage.php`, `LoginAction.php`, `Auth.php`,
`Session.php`, `SessionDatabaseHandler.php`, `CheckCsrf.php`,
`UserService.php`, `User.php`, and `login-page.phtml`, a `Plan`
subagent reviewed the design for security-sensitive gaps before any
code was written — caught the setting-name-constant-vs-value
distinction, confirmed `x-forwarded-for` was already plumbed by the
proxy (no proxy change needed for IP logging), and flagged the
session-ID-charset question (resolved by using hex, a valid subset of
every possible PHP `sid_bits_per_character` setting).

## Step 4: `/logout`

The natural complement to step 3, landed the same day, reusing step
3's session infrastructure rather than building anything new:
`session-store.mjs` gained `destroySession()` (mirrors
`SessionDatabaseHandler::destroy()`, invoked by `Auth::logout()` →
`Session::regenerate($destroy=true)`) and
`sessionClearCookieHeader()` (hygiene — clears the browser's cookie
for the now-deleted session; PHP doesn't bother with this explicitly
since `session_regenerate_id()` transparently issues a fresh
replacement cookie, but there's no equivalent "assign a replacement"
step in a destroy-only flow).

**A detail easy to miss reading `Logout.php` too quickly**: it only
touches the session *at all* — log write, `Auth::logout()` — inside
`if ($user instanceof User)`. Hitting `/logout` while already
anonymous is a **complete no-op** on the PHP side. `pages-server/logout.mjs`'s
`doLogout()` replicates this precisely (verified live: an anonymous
`/logout` leaves the `wt_log` row count unchanged and touches no
session row), rather than the more obvious-seeming "always destroy
whatever session cookie was presented."

**A real, currently-live bug found and fixed along the way**: tracing
how the "Sign out" link (`data-wt-post-url="/logout"`,
`app/Module/ModuleThemeTrait.php:270`) actually works led to
`resources/js/webtrees/init.js`'s click handler, which calls
`httpPost()` (`resources/js/webtrees/http.js`). That function
unconditionally does
`document.head.querySelector('meta[name=csrf]').getAttribute('content')`
— a synchronous `TypeError` if the tag is missing, thrown *before* any
network request is sent. Neither `account-view.mjs` nor
`login-view.mjs` rendered that tag, so clicking "Sign out" on the live
`/my-account` page had been silently doing nothing since step 2
landed — not a hypothetical, a real dead button. Both views now
include `<meta name="csrf" content="...">`, reusing each page's own
already-computed CSRF token.

Response shape matches `Logout.php` exactly: `204` empty body for an
AJAX request (`x-requested-with: XMLHttpRequest`, which `httpPost()`
always sends), otherwise a `302` redirect home. No CSRF check — `CheckCsrf.php`
explicitly excludes `Logout::class`. PHP's route (`/logout`) has no
optional `{tree}` segment, unlike `/my-account` and `/login` —
`isLogoutPath()` is accordingly an exact match only.

Verified end-to-end against the real Postgres database (same
temporarily-localhost-then-restore pattern as step 3): logged in,
confirmed the session row existed, `POST /logout` with
`X-Requested-With` → `204` + cleared cookie + the session row actually
deleted + the correct `wt_log` entry written; separately confirmed the
anonymous-logout no-op and that both views render the CSRF meta tag.
Full JS suite: 4102 tests, green.

## Step 5: `/my-account-delete`

Completes the `/my-account` family (GET, update, delete). Unlike every
prior step, this one **deliberately diverges** from PHP rather than
faithfully porting it — `app/Services/UserService::delete()` (called
by `AccountDelete.php`) has a real, confirmed-live bug.

**The bug, found by reading the code and then reproduced live before
writing any Node code**: `delete()` touches ~8 tables (`wt_session`,
`wt_log`, `wt_change`, `wt_block_setting`, `wt_block`,
`wt_user_gedcom_setting`, `wt_user_setting`, `wt_message`, `wt_user`)
with **no transaction** — each `DB::table(...)->delete()`/`->update()`
call commits independently. Its "take over the user's pending
changes" step (`UPDATE wt_change SET user_id = Auth::id() WHERE
user_id = $user->id()`) is a **no-op** for the only real caller:
`AccountDelete.php` only ever deletes `Validator::attributes($request)->user()`
— the currently-logged-in user — so `Auth::id() === $user->id()` at
that point. Since `wt_change.user_id` has a `NOT NULL` foreign key to
`wt_user` with no cascade, any user with a non-rejected `wt_change`
row (or even just an auto-created default `wt_block` dashboard widget
— common for most users, not an edge case) hits a foreign-key
violation on the final `DELETE FROM wt_user`. Reproduced exactly:
created a disposable test user with a pending change, a block, a
block setting, and a message, logged in through the real app, hit the
real `/my-account-delete` — `500 Internal Server Error`, and the
account was left **half-deleted**: session/settings/blocks/messages
already gone, the `wt_user` row still stuck there, unable to log in or
retry.

This changed the shape of the task, so it was surfaced to the user
before writing any code (`AskUserQuestion`) rather than deciding
unilaterally whether to replicate a data-corrupting bug into a new
code path. Chosen fix: wrap every step in one Postgres transaction
(`pages-server/account-delete.mjs`, using a dedicated `pool.connect()`
client with `BEGIN`/`COMMIT`/`ROLLBACK`, not `pool.query()`, since a
real transaction needs one held connection) — a failure now leaves the
account **completely untouched**, never half-deleted. The pending
changes are deleted outright rather than replicating the
self-referential no-op reassignment; there's no "reassign to a
different real admin" without inventing a new decision this project
hasn't made, and deleting your own account already means abandoning
your own pending edits.

**A second, smaller bug found while wiring this up, caught by reading
the spec rather than the hard way**: `csrf.mjs`'s double-submit cookie
was scoped `Path=/my-account`. Per RFC 6265 §5.1.4's cookie-path
matching, a `Path=/my-account` cookie is only sent for a request path
that's exactly `/my-account` or has `/my-account/` as a prefix — a
POST to `/my-account-delete` doesn't qualify (no `/` immediately after
`/my-account`), so the browser would never have sent that cookie,
breaking CSRF validation on this exact route. Broadened to `Path=/`
— the token is regenerated fresh on every `/my-account` GET anyway, so
there's no meaningful downside to the wider scope.

`account-view.mjs` now renders "Delete your account"
(`data-wt-confirm` + `data-wt-post-url`, the same mechanism as "Sign
out") matching `AccountEdit.php`'s `show_delete_option` exactly
(`canadmin !== '1'` — an administrator can only be deleted by another
administrator). The guard is re-checked server-side in
`handleAccountDelete()`, not just left to the UI conditional. Since
this route's `httpPost()` call sends an empty body (matching "Sign
out"'s pattern), CSRF is validated against the `X-CSRF-TOKEN` header,
not a form field.

Verified end-to-end against the real Postgres database: reproduced the
exact crash scenario (pending change + block + block setting +
message) and confirmed Node deletes everything atomically with no
error; separately confirmed the admin guard (no delete button
rendered, and a direct bypass attempt is a silent no-op, matching
PHP), a CSRF mismatch (`403`, nothing touched), and that `wt_log` rows
are correctly preserved with `user_id` set `NULL` (not deleted, same
as PHP). Full JS suite: 4115 tests, green.
