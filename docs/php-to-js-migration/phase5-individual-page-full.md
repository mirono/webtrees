# Phase 5, step 14: IndividualPage full-page structure

**Status: steps 14a and 14b done and verified live (2026-09-23/27), against a real user-imported GEDCOM tree.**

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

## Follow-up fix (2026-09-23, same day): merge in family facts

Reported live immediately after shipping: Miron Ophir's own Facts tab
was missing his Marriage and Family residence facts (both real, both
shown correctly on his separate FamilyPage). Root cause: real PHP's
Facts and events tab doesn't only show an individual's OWN facts -
`IndividualFactsService::familyFacts()` (`app/Services/
IndividualFactsService.php:66-72`) merges in every displayable fact
from EVERY spouse family the individual belongs to, sorted together
with their personal facts. This migration's Facts tab only ever read
`individual.gedcom`'s own facts.

**Fixed** by reusing infrastructure already built for the Families
tab: `index.mjs`'s existing family-resolution loop (`loadFamily()` +
member privacy + `familyCanShowRecord()`, previously only producing a
`{titleHtml, url}` summary) was refactored into a shared
`resolveShownFamily()` returning the full resolved family (gedcom,
members, `defaultResnInfo`), so `resolveFamilySummary()` (Families tab)
and a new `familyFactsForIndividual()` (Facts tab) both reuse the SAME
single family load/privacy computation rather than querying twice. A
new shared `extractVisibleFacts()` (the `factCanShow()`-filtered,
date/time/place/address/author-extraction loop, previously duplicated
almost verbatim between `handleIndividualPage()` and
`handleFamilyPage()`) is now used by both handlers plus the new merge
path.

Real PHP excludes a family's own `CHAN`/`_UID`/`UID`/`SUBM` from this
merge (`IndividualFactsTabModule.php:96` - "Don't show family
meta-data tags") - replicated via
`FAMILY_FACTS_EXCLUDED_ON_INDIVIDUAL_TAB`, since a family's own
"last changed" timestamp would misleadingly read as the *individual's*
on their own timeline.

**A markup subtlety found while fixing this**: a merged-in family fact
keeps its ORIGINAL record's label, not the individual-level one - real
PHP's `Fact::label()` looks up `$this->record->tag() . ':' . $this->tag`,
and a merged family fact's `$fact->record()` is still the FAMILY, so
e.g. `RESI` renders as "Family residence" (not "Residence") even
though it's showing up on the individual's own page. `individual-view.mjs`
gained a small `FAMILY_FACT_LABELS` map and a `fromFamily` flag on each
fact entry to pick the right one.

**Sort order simplification (documented, not silently approximate)**:
real PHP's `FactSortService` is a full date-precision-aware comparator,
also interleaving `relativeFacts()`/`associateFacts()`/`historicFacts()`
(niche timeline features not ported at all here). This fix does a
simple year-only ascending sort (undated facts sort last) - enough to
put a family's Marriage/Residence facts in roughly the right
chronological position among personal facts (the actual gap being
closed), not a faithful full reproduction of the real sort.

Live-verified against Miron Ophir's real page again: Facts tab now
shows Birth (1963) → Marriage (1995) → Family residence with its real
address (1996) → Last change (2018), in correct chronological order,
with the family's own `CHAN` correctly excluded (no duplicate "Last
change" row). Full JS suite: **4462 tests, green** (4460 + 2 new).

## Step 14b: Family navigator + Extra information sidebars

Ships the right-hand sidebar column: a two-item accordion (Extra
information, collapsed by default; Family navigator, forced open,
matching real PHP's own `individual-page-sidebars.phtml` exactly).

**Family navigator** mirrors `modules/family_nav/sidebar-family.phtml`'s
real per-family mini-table (captioned, linked to the family page; one
row per spouse then per child; sex-colored rows; name+lifespan linked
in the data cell; a "you are here" user icon for the page's own
subject) - but with **deliberately simplified relationship labels**
instead of porting `RelationshipService::getCloseRelationshipName()`'s
full BFS + language-aware naming engine (a real, substantial subsystem
of its own). A small hardcoded set in `individual.mjs`
(`parentRelationshipLabel()`/`spouseRelationshipLabel()`/
`childRelationshipLabel()`/`siblingRelationshipLabel()`/
`selfRelationshipLabel()`) covers exactly the relationship shapes the
navigator actually needs: father/mother/husband/wife/son/daughter,
"himself"/"herself" for the self row, and - the one piece of real
age-ordering this migration DOES replicate, since the reference
screenshot showed it - an "elder"/"younger" prefix for siblings,
computed via simple birth-year comparison rather than the full
relationship-path engine. No step-families, no grandparent/in-law
dropdowns (real PHP's `sidebar-family.phtml` nests a dropdown of a
spouse's own parents, or a child's own spouse+children - out of scope
here, a real but narrow feature).

Reuses `resolveShownFamily()` (already shared by the Families tab and
step 14a's family-facts merge) a THIRD time here - each parent/spouse
family is independently re-resolved per sidebar section rather than
sharing one resolution across the whole page request, a known,
accepted minor inefficiency (consistent with how the Families tab and
Facts-tab merge already each independently resolve the same families)
rather than a premature cross-section cache.

**Extra information** mirrors `IndividualMetadataModule`'s tag set
(`AFN/ANCI/CHAN/DESI/IDNO/REFN/RESN/RFN/RIN/SSN/SUBM/_UID/_FSFTID/_WEBTAG`),
reusing the exact same `extractVisibleFacts()`/`renderFact()`
machinery as the Facts tab (a new `factPlainValue()` in `individual.mjs`
- generalized from what used to be SourcePage's private
`sourceFactValue()` - supplies the plain-text VALUE these mostly-bare-
value facts need, which event-shaped facts like `BIRT` never needed
before). Wrapped in the same `wt-facts-table` shape used everywhere
else in this migration, rather than reproducing real PHP's bare
`<hr>`-joined `<div>` layout - a deliberate, documented divergence.
`CHAN`/`IDNO`/`SSN` are now excluded from `VITAL_FACT_TAGS` (the main
Facts tab), since they're owned by this sidebar now - the exact
exclusion mechanism real PHP itself uses
(`IndividualFactsTabModule` excludes every tag any enabled sidebar's
`supportedFacts()` claims).

**A markup subtlety, found by reading real PHP directly, not guessed**:
`ANCI`/`DESI`/`SUBM` are `XrefSubmitter`-typed elements (a cross-
reference to a Submitter record) - this migration has no Submitter
page, so their value renders as the raw `@Sxref@` text rather than a
resolved link, a narrow, documented simplification. `_UID`/`_FSFTID`/
`_WEBTAG` have no defined element in real PHP either (custom tags) -
fall back to the raw `INDI:<TAG>` path, same `UnknownElement`-fallback
convention already established for SourcePage's own subtag handling.

Live-verified against Miron Ophir's real page: his Family navigator
now shows his real parent family (father Raphael Ophir 1935–2006,
mother Sara Granek 1938–2018, himself with the self icon, younger
sister Dafna Ophir 1967–, younger brother Arie Ophir 1971–) and his
real spouse family (himself, wife Yael Ryvka Koblinsky 1970–, three
real sons each correctly labeled "son" and linked) - an exact match to
the original reference screenshot. Extra information correctly shows
his own `CHAN` (Last change, with date/time/author), and the main
Facts tab no longer shows it (no duplicate "Last change" row anywhere
on the page). Full JS suite: **4487 tests, green** (4462 + 25 new).
