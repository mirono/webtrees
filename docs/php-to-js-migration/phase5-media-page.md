# Phase 5, step 17: `/tree/{tree}/media/{xref}` (MediaPage)

**Status: done and verified live (2026-09-28), against a real user-imported GEDCOM tree.**

## What this is

The sixth route serving real GEDCOM record data
(Individual/Family/Source/Repository/Note/Media). PHP's real route is
`/tree/{tree}/media/{xref}{/slug}` (`app/Http/Routes/WebRoutes.php:665`).
Same "shell + narrow slice" precedent as every prior record page: title
+ each media file's own display block + the record's remaining facts
table — no linked-record reverse-lookup section
(`linked_families`/`linked_individuals`/etc. from `media-page.phtml`'s
own `record-page-links` include, same as every other route).

## Media::canShowByType() — reusing and extending step 16's machinery

`Media::canShowByType()` (`app/Media.php:41-58`) is, structurally,
**the exact same "hide if attached to a private record" loop** as
`Note::canShowByType()` (`app/Note.php:58-75`) — both real PHP methods
walk every `link` table row pointing at the record and hide it if any
linking record is itself unshowable. This step reuses phase 5 step
16's `linkedRecordCanShow()` dispatcher almost unchanged:

- `linkedRecordCanShow()` in `index.mjs` gained an `'OBJE'` branch to
  the type-detection `UNION` query (a linked record can now itself be
  a media object, e.g. a media object whose own `NOTE` references
  another note that's in turn referenced from a media object) and to
  the dispatch itself — using the new `mediaCanShowRecord()` (below)
  with `linkedRecordsShowable` hardcoded `true`, i.e. **not**
  recursing into that media object's own linked-record check. This is
  a deliberate, documented scope cut to avoid unbounded
  mutual-reference recursion (a media object CAN in principle carry a
  `NOTE` that eventually references back toward the record being
  checked — not reachable in the real tree's data, but not provably
  bounded either).
- `media.mjs` gained `mediaCanShowRecord()` — line-for-line the same
  shape as `note.mjs`'s `noteCanShowRecord()` (shared `defaultRecordCanShow`
  pattern keyed on `'OBJE'` instead of `'NOTE'`).
- `index.mjs` gained `mediaLinkedRecordsShowable()` — the same shape
  as `noteLinkedRecordsShowable()`, querying `wt_link` for
  `l_type = 'OBJE'` rows. This one (unlike `linkedRecordCanShow()`'s
  own internal `'OBJE'` branch) IS the full, real check — used by
  `handleMediaPage()` itself to gate the media object's own page.

**Live-verified with a real, naturally-occurring case, not a synthetic
one this time**: `M1` (a photo of "Yael Weiss") is linked to
`I002623`, a living individual (born 1975, no death date, so the
tree's `HIDE_LIVE_PEOPLE`/keep-alive-age logic treats her as living) —
requesting `M1` anonymously correctly returns **403**, while a
disposable member-level test user (who passes the living-people gate)
gets **200**. This is exactly the real override firing on real data,
not a contrived fixture.

## The facts table and per-file display

Real `media-page-details.phtml` renders each `1 FILE` fact in its own
block (filename/title/type/format + the actual image/icon + a download
link), separately from the record's remaining facts (`CHAN`, etc. —
everything except `FILE`). This step ports that shape:

- **`media.mjs`** gained `mediaFileDetails()` — a richer sibling of the
  already-existing `mediaFiles()` (built for the IndividualPage photo
  box), adding `title`/`type`/`format` extraction and a wider
  `fullMimeType` (covering PDF/BMP, not just the 4-5 types
  `MediaFile::isImage()` itself cares about) for the mime-icon fallback
  on non-image files. Kept as a **separate** function rather than
  widening `mediaFiles()` itself — that function's existing callers
  (photo box, Media/Album tabs) only need the 4 fields it already
  returns.
- **`mediaDownloadUrl()`** (new) — mirrors `MediaFile::downloadUrl()`
  (`app/MediaFile.php:261-271`). Unlike `imageUrl()`, this route is
  **not signed** — `MediaFileDownload.php` re-checks the media
  record's own `canShow()` before serving, rather than trusting a URL
  signature (confirmed by reading the handler directly — no `s` param
  anywhere in it).
- **`displayableMediaFacts()`**/**`mediaFactOtherAttributes()`** — same
  "no tag allowlist, `FILE` excluded" / raw-subtag-fallback pattern as
  every prior record type's own facts-table scope.
- Media type values (`OBJE:FILE:FORM:TYPE`, e.g. `photo`/`document`/
  `newspaper` — all three appear in the real tree) are translated via
  a label map matching `app/Elements/SourceMediaType.php`'s real
  controlled-value list, with a `<bdi>` raw-value fallback for a
  custom/non-standard type — the same fallback shape
  `AbstractElement::value()` itself uses.

## Simplifications, and why they're safe

- **No edit UI** (matches every other route in this migration): the
  Filename row is only shown for an external file — real PHP also
  shows it to editors (with a file-exists check), but this migration
  has no edit-mode concept anywhere yet, so that branch never fires.
- **No `<audio>`/`<video>` players**: the real imported tree has zero
  audio/video files (confirmed: `SELECT DISTINCT FORM` across
  `wt_media` returns only `jpg`/`jpeg`/`png`/`bmp`/`pdf`) — a
  non-image file gets the same generic `wt-mime-<type>` icon real PHP
  shows for ANY non-image file, which happens to be the real behavior
  for the tree's actual PDFs too, not a narrowing.
- **Title derivation** (`Media::extractNames()`, `app/Media.php:104-128`)
  simplified to: the first non-empty file title, else the first
  non-empty filename, else the record's own xref
  (`GedcomRecord::getFallBackName()`) — matches `getPrimaryName()`'s
  general "first name" behavior, the same simplification already used
  for Note's own title derivation.
- **The `'OBJE'` branch inside `linkedRecordCanShow()` does not
  recurse** (see above) — narrower than real PHP in one specific,
  documented, unreachable-by-real-data corner, never wider.

None of these can show something real PHP would hide — same "safe
direction" principle used throughout this migration.

## Verification

**Unit tests**: `media.mjs`'s test file gained coverage for
`mediaFileDetails()` (title/type/format extraction, `fullMimeType`
fallback), `mediaDownloadUrl()` (unsigned, `mark` handling),
`displayableMediaFacts()`, `mediaFactOtherAttributes()`, and
`mediaCanShowRecord()` (including the linked-record override). New
`pages_server_media_view.test.js` covers the view layer (per-file
rows, image vs. mime-icon branching, the download-link gate, escaping).
Route-matcher tests added to `pages_server_routes.test.js` and
`proxy_routing.test.js`, including confirming `/media` (ManageMediaPage),
`/media-upload`, `/media-thumbnail`, and `/media-download` all correctly
stay on PHP. Two pre-existing `proxy_routing.test.js` tests that used
`/tree/ophir/media/M1` as a "not yet a Node route" example were updated
to use `/tree/ophir/submitter/U1` instead (Submitter still has no Node
route). Full JS suite: **4607 tests, green** (4564 + 43 new).

**Live verification** — against the real, user-imported "ophir" tree,
using the established trap-guarded `data/config.yaml` swap script (see
[[feedback-config-yaml-swap-safety]]):
1. `M1` (a real photo, "Yael Weiss") renders correctly for a disposable
   member-level test user: real Title/Media type ("Photo")/Format rows,
   a real signed thumbnail `<img>` URL (built by the exact same,
   already-verified `mediaThumbnailUrl()`/`mediaThumbnailSignature()`
   from phase 5 step 14a, unchanged) wrapped in a gallery-style download
   link.
2. **The linked-record override, proven on real data, not a synthetic
   fixture**: the SAME `M1` returns 403 for an anonymous visitor,
   because it's linked to `I002623`, a real living individual — traced
   directly (not assumed) via `wt_link`/`wt_individuals` before
   confirming the 403 live.
3. `M3758` (a real PDF, "Liberman-Kafri: A Family In Nahalal") renders
   its Media type as "Document", Format as "pdf", and the correct
   `wt-mime wt-mime-application wt-mime-application-pdf` icon instead
   of a broken `<img>` tag.
4. 404 (nonexistent media xref) vs. 302 (nonexistent tree) status
   codes confirmed live.
5. All disposable test fixtures (1 test user, its settings/session
   rows) deleted afterward; `data/config.yaml` restored via the
   trap-guarded script, confirmed via `grep dbhost` after.
