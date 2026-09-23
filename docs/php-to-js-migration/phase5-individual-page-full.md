# Phase 5, step 14: IndividualPage full-page structure

**Status: step 14a done and verified live (2026-09-23), against a real user-imported GEDCOM tree.**

## Why this step exists

Steps 9, 11, and 12 shipped a genuinely useful but structurally
incomplete IndividualPage: a name/lifespan/age header and a flat facts
list, with no photo, no tabs, and no sidebar. The user compared it
directly against the real PHP page (`Individual.PNG`) and asked for
the page's *structure* to be complete — every real section visibly
present, even where a section's content is minimal for now — rather
than continuing to grow one flat list. This is a bigger, explicitly
multi-step undertaking, broken into:

- **Step 14a** (this doc, done): photo box, Name/Gender accordion, the
  full 8-tab bar (Facts and events, Families, Sources, Notes, Media,
  Album, Interactive tree, Places).
- **Step 14b** (next): the right-hand sidebar (Family navigator, Extra
  information).
- **Step 14c**: real content for the Sources/Notes/Media/Album tabs,
  and a richer Families tab.

Places (a Leaflet map) and Interactive tree (an SVG pedigree-drawing
widget via `TreeView`) are permanently stubbed — confirmed with the
user that both are disproportionately large subsystems, each bigger
than the rest of this page combined, and out of scope for now.

## Key finding: photo thumbnails need no image processing in Node

`MediaFile::displayImage()`/`imageUrl()` (`app/MediaFile.php:157-235`)
don't serve pixels themselves — they build a **signed URL** pointing
at PHP's own `MediaFileThumbnail` route, which still does the real
Imagick/GD work. The signature is a simple, literal algorithm:
`md5($glide_key . ':?' . http_build_query(ksort($params)))`, where
`$glide_key` is a `wt_site_setting` row (`setting_name = 'glide-key'`,
lazily created by whichever system — PHP or Node — is asked first).
Node reproduces this exact signature and lets the browser fetch the
actual image bytes through the proxy to PHP, unmodified — no
image-processing dependency needed at all. New `pages-server/media.mjs`
owns this (`loadGlideKey()`, `mediaThumbnailSignature()`,
`mediaThumbnailUrl()`), plus `mediaFiles()`/`firstImageFile()`
(parsing `wt_media.m_gedcom`'s own `1 FILE` facts — the authoritative
source; `wt_media_file` is a secondary index, not what PHP's own
`Media::mediaFiles()` reads) and `loadFactsMedia()` (resolves every
`OBJE` fact in a fact list to its media's first qualifying image,
reusable later for the Media/Album tabs' own OBJE-fact scans, not just
the header photo).

**A real bug caught live, not by unit tests**: an initial draft
assumed `MediaFileThumbnail` was registered at a bare `/media-thumbnail`
path with `tree` as a query parameter. Reading `WebRoutes.php` directly
revealed it's actually nested inside the shared `/tree/{tree}` attach
block (`/tree/{tree}/media-thumbnail`) — `tree` is a **path** token,
not a query param. The wrong shape 404'd immediately when tested live
against the real PHP app through the proxy. Fixed by building the path
as `/tree/{treeName}/media-thumbnail` while still including `tree` in
the *signed* params (PHP's own handler re-derives `tree` from the
resolved `Tree` object, not the query string, before re-checking the
signature — so the value must still be part of what gets hashed, just
not part of the URL's own query string). `route-url.mjs`'s
`phpRouteUrl()` gained an `extraParams` argument to support routes like
this one that take query-string parameters at all (a first for this
migration — every prior `phpRouteUrl()` caller needed a bare path).

## Other findings

- **`IndividualMetadataModule`'s "Extra information" sidebar** (step
  14b) turns out to reuse the exact same `renderFact()`/
  `otherFactAttributes()` machinery already built for the main facts
  list and SourcePage — just a different, small tag allowlist
  (`AFN/ANCI/CHAN/DESI/IDNO/REFN/RESN/RFN/RIN/SSN/SUBM/_UID/_FSFTID/_WEBTAG`).
- **`extractNameFromFact()`/`extractPrimaryName()`** were only ever
  used for the FIRST matching fact. A real individual can have several
  `NAME` facts (aka/married/birth names, per the real Name accordion),
  so a new `extractAllNameFacts()` returns every match — refactored so
  `extractNameFromFact()` is now a thin wrapper (`[0] ?? null`), with
  no behavior change for any existing caller (confirmed no test relies
  on the old "first fact's empty value short-circuits everything"
  edge case — the new version is, if anything, more faithful to real
  PHP's own `getAllNames()`, which simply skips an invalid fact rather
  than aborting).
- **The real Name accordion body shows the RAW GEDCOM value**
  (`$fact->value()`, e.g. literally `"John /Smith/"`, slashes
  included) — not the styled `fullName()` HTML shown in the collapsed
  header. A real, deliberate difference in real PHP, not a
  simplification here.
- **Real tab order confirmed from the database, not assumed**: this
  deployment has zero `wt_module.tab_order` override rows, so each
  module's own `defaultTabOrder()` (read directly from all 8 tab
  module classes) is what actually renders: Facts and events (1),
  Families (2), Sources (3), Notes (4), Media (5), Album (6),
  Interactive tree (7), Places (8).
- **Tabs need no extra client-side JS.** Bootstrap's own
  `data-bs-toggle="tab"` handling (already bundled in `vendor.min.js`
  on every page) drives tab switching. Real PHP's own inline script
  only adds AJAX lazy-loading (`canLoadAjax()`) and `location.hash`
  syncing — both skipped: every tab's content renders inline in the
  initial HTML, and the first tab gets `active`/`show active` server-
  side instead of via a page-load script.

## Scope cuts (deliberate, documented)

- The `Add a media object` edit-affordance link is omitted (this
  migration has no editing capability yet, same precedent as every
  prior step).
- No lightbox/gallery click-to-enlarge behavior on the photo
  (`data-wt-gallery` + a second signed `MediaFileDownload` URL) — the
  bare `<img>` is enough for the photo to be visible; the click-to-
  enlarge popup is a nice-to-have, not core to this step.
- A NAME fact's `TYPE` sub-tag (e.g. `MARRIED`) shows its raw GEDCOM
  code rather than a translated label (`NameType`'s own small
  controlled-values enum isn't ported) — same "known label vs. raw
  fallback" convention used elsewhere, just without the "known" half
  yet for this one specific sub-tag.
- The Families tab (14a) is today's existing simplified flat
  parent/spouse-family link list, relocated from its own former inline
  section into this tab's pane — upgraded to real per-member cards in
  step 14c, not rebuilt from scratch here.

## Verification

**Unit tests**: `pages_server_media.test.js` (22 tests, new) covers
`mediaFiles()`, `firstImageFile()`, `needsWatermark()`,
`mediaThumbnailSignature()` (hand-verified against the real algorithm),
`mediaThumbnailUrl()` (including the path-vs-query-param fix),
`loadFactsMedia()`, and `loadGlideKey()`. `pages_server_individual.test.js`
gained tests for `extractAllNameFacts()`, `sexLabel()`, and
`nameSubTagAttributes()`. `pages_server_individual_view.test.js` was
rewritten for the new page structure (photo box branches, the
Name/Gender accordion, all 8 tabs present in the real default order,
stub-vs-real tab content). `pages_server_route_url.test.js` gained
tests for `phpRouteUrl()`'s new `extraParams` argument. Full JS suite:
**4460 tests, green**.

**Live verification** — against the real, user-imported "ophir" tree,
using a trap-guarded verification script (see
[[feedback-config-yaml-swap-safety]] — this session's earlier ad hoc
`data/config.yaml` swap briefly broke the live app, so every
subsequent DB-touching check in this step used a self-restoring script
instead):
1. Miron Ophir's own page (`I000001`, his real uploaded photo `M3450`)
   renders a real signed thumbnail `<img>` with a correct 2x/3x/4x
   `srcset`, the Name/Gender accordion, and all 8 tabs with Facts and
   events active by default.
2. The signed thumbnail URL was tested directly against the real PHP
   app through the live proxy: an anonymous/unauthenticated request to
   Miron's (living) photo correctly gets PHP's own "403 Access denied"
   SVG placeholder (real PHP behavior for a living person's media,
   independent of anything Node does — Node only builds the URL,
   PHP remains the sole gatekeeper for the actual bytes); the same
   mechanism against a public, deceased individual's photo (`I000005`
   / `M3455`) got PAST both the signature check and the privacy check,
   reaching PHP's own "500 File is not readable" — confirming the
   signature and privacy chain both worked correctly, failing only
   because this dev sandbox never received the real uploaded media
   files (only GEDCOM text was imported), not a bug in this step.
3. An individual with no photo (`I000003`) correctly falls back to the
   sex-specific silhouette icon.
4. All disposable test fixtures (5 test users across the several
   verification passes, their settings/session rows) deleted
   afterward; `data/config.yaml` restored via the trap-guarded script
   pattern on every single run, confirmed via `grep dbhost` after each.
