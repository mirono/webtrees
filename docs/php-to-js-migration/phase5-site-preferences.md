# Phase 5 step 42: Site preferences (`/admin/site-preferences`, `/admin/site-registration`, `/admin/email`, `/admin/tags`)

**Done 2026-11-10.** Site-WIDE settings (as opposed to the already-ported
per-tree "tree management" bucket). User chose full fidelity for all 4
page-pairs, **including real SMTP sending** for the email page's "send
test email" button — this migration's first genuine network
dependency (every prior network-shaped feature, `UpgradeService` and
`ServerCheckService`, was cut instead precisely because no network
dependency existed anywhere else; this one is different because the
user explicitly asked for it).

## Routes ported

| Route | Real PHP handler |
|---|---|
| `GET/POST /admin/site-preferences` | `SitePreferencesPage`/`SitePreferencesAction` |
| `GET/POST /admin/site-registration` | `SiteRegistrationPage`/`SiteRegistrationAction` |
| `GET/POST /admin/email` | `EmailPreferencesPage`/`EmailPreferencesAction` |
| `GET/POST /admin/tags` | `SiteTagsPage`/`SiteTagsAction` |

All four are AuthAdministrator-only, same gate as every admin page
ported before "tree management" introduced AuthManager.

(A fifth candidate, analytics/tracking module enable-toggles, was
identified during scoping but excluded — it's architecturally part of
the generic Modules admin system shared with footers/menus/themes/etc.,
not a `Site::` preference page, so it belongs with a future "modules"
bucket rather than being bundled in here.)

## New dependency: `nodemailer`

Real PHP's `EmailService` uses Symfony Mailer
(`vendor/symfony/mailer`) — `EsmtpTransport`/`SendmailTransport`/
`NullTransport` built on raw PHP streams
(`stream_socket_client`/`stream_socket_enable_crypto`). This port adds
`nodemailer` (10.5.0) as this migration's first new runtime dependency,
rather than hand-rolling SMTP socket/STARTTLS/AUTH handshake code —
nodemailer's SMTP transport already implements the same shape of
behavior Symfony's `EsmtpTransport` does (opportunistic STARTTLS when
the server advertises it, AUTH LOGIN/PLAIN/CRAM-MD5 negotiation,
implicit TLS on `secure: true`) and is the standard way to send mail
from Node. Reinventing an SMTP client by hand would have been the kind
of unrelated-infrastructure build-out this migration avoids everywhere
else.

## Real correctness details worth flagging

- **The real PHP "NullTransport" behavior is preserved exactly.**
  When `SMTP_ACTIVE` is neither `'sendmail'` nor `'external'` (i.e.
  email hasn't been configured at all — the common default on a fresh
  install), real PHP's `EmailService::transport()` returns a
  `NullTransport`, and `send()` still reports success even though
  nothing is actually transmitted. `sendEmail()` mirrors this: no
  `nodemailer.createTransport()` call happens at all in that case, and
  the function resolves `true` unconditionally. This matters because
  the "send test email" button would otherwise misleadingly fail on
  every unconfigured install, diverging from real behavior.
- **`SMTP_AUTH_PASS` is only overwritten when a new, non-empty value
  is submitted** (`updateEmailPreferences`) — same as the real PHP
  action, so re-saving the form without retyping the password doesn't
  blank out a previously-saved one. The password field itself is
  always rendered empty (never echoes the stored value back into the
  form), matching the real page's own behavior.
- **DKIM signing is conditional on all three fields being set**
  (domain/selector/key), exactly like real PHP's `DkimSigner`
  construction check — nodemailer's own built-in `dkim` transporter
  option is used instead of a separate signing library, since it
  implements the same RSA-SHA256 DKIM-signature mechanism Symfony's
  `DkimSigner` does.
- **`isValidEmail()` approximates `checkdnsrr($domain)`, not a literal
  port of it.** Real PHP's call checks for the domain's default DNS
  record type (MX) via a single C-level resolver call. This port
  checks MX records first, falling back to a plain A/AAAA lookup if no
  MX records exist — a reasonable approximation of how mail delivery
  software actually behaves (MX-then-A fallback is the real SMTP
  delivery convention), not a byte-for-byte port of `checkdnsrr`'s
  exact resolver-level semantics.
- **`HIDDEN_TAG_KEYS`/`CUSTOM_FAMILY_TAGS`/`CUSTOM_INDIVIDUAL_TAGS` are
  hand-transcribed from `Gedcom::HIDDEN_TAGS`/`CUSTOM_FAMILY_TAGS`/
  `CUSTOM_INDIVIDUAL_TAGS` (48/6/20 entries respectively), not
  generated — unlike step 39's control-panel module-category table,
  these are small, flat string-constant arrays with no per-entry
  interface-reflection logic to get wrong, so mechanical generation
  wasn't worth the extra tooling. Verified by direct count against the
  real PHP constants (48/6/20) and a duplicate check.
- **Real PHP keys the welcome-text preference by `I18N::languageTag()`**
  (`WELCOME_TEXT_AUTH_MODE_<tag>`) — this migration is English-only
  throughout, so it's always the literal key
  `WELCOME_TEXT_AUTH_MODE_en-US`, matching every other per-language
  preference key this migration has ever needed to write.
- **UI widget simplifications, not data/behavior simplifications**
  (same convention as every "full fidelity" step so far): the custom
  GEDCOM-tag pickers are plain `<select multiple>` instead of real
  PHP's TomSelect widgets; language/timezone on the general
  preferences page are plain text inputs rather than ~140/~400-entry
  translated `<select>` lists (same simplification already applied in
  step 40's user-edit form); the theme picker reuses the same
  hand-enumerated 6-entry list already built for user management.
- **No session-based flash messages** (same cut as every prior step —
  this migration has no `FlashMessages`-equivalent infrastructure).
  The one exception that still conveys feedback without a flash write:
  the general-preferences page's folder-validation error, which is
  rendered inline on the same re-shown page rather than via a
  redirect+flash round-trip.

## Live verification

All four GET/POST round-trips were exercised against the real install
over HTTP, using a disposable, self-generated admin session (created
and deleted within the verification pass). The "send test email"
button was exercised only against the real PHP-equivalent NullTransport
case (an unconfigured `SMTP_ACTIVE`) — this proves the whole
request/response pipeline (form parse, preference save, redirect-with-
result) without making any real network call or risking delivery to a
real mailbox. The SMTP-socket-level behavior itself (STARTTLS
negotiation, AUTH mechanism selection, DKIM signing) is covered by unit
tests that mock `nodemailer`'s `createTransport`, not by a live
external SMTP connection — that's the right boundary: it verifies this
port's own config-building logic without depending on, or risking
side effects against, a real mail server.
