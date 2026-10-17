# Phase 5, step 26: `/tree/{tree}/media-list` (MediaListModule)

**Status: done (2026-10-17); unit-test-verified and live-verified against the real "ophir" tree.**

## What this is

The seventh and **final** list route, closing out the "list" family
entirely. `MediaListModule` (`app/Module/MediaListModule.php`) is a
genuinely different shape from every prior list route: a search form
(folder/subdirs/max/format/filter) + slice-paginated card grid with real
image thumbnails, not a DataTables table at all - no surname-collation
concept, no filter-button groups, no hidden filter-encoding columns.

## Reused directly, no changes needed

`media.mjs`'s existing `loadMedia`, `mediaFileDetails`, `mediaThumbnailUrl`,
`needsWatermark`, `mediaCanShowRecord`, `mediaLinkedRecordsShowable`,
`loadGlideKey`, all already built and shipped for the single MediaPage
route (step 17) and IndividualPage's photo box (step 14a). Thumbnails
reuse `mediaThumbnailUrl()` **unchanged** - a real signed URL pointing
at PHP's still-unmodified `/media-thumbnail` route, no Node-side image
processing. This is the SAME decision already made twice before; the
user explicitly confirmed keeping it rather than reopening it for this
step, after the volume difference (1 image for MediaPage vs. up to
20+ thumbnails per list page) was raised and found not to change the
mechanism itself.

## New pieces

1. **`allFolders()`/`allMedia()`** (`media.mjs`): port
   `MediaListModule`'s own private methods - folder listing via
   `dirname()` over `multimedia_file_refn`, and the filtered/sorted
   media query (folder/subdirs/filter/format, all `LIKE`-based).
2. **`linkedRecordXrefsForMedia()`**: ports
   `LinkedRecordService::linkedIndividuals()`/`linkedFamilies()`/
   `linkedSources()`/`linkedLocations()` scoped to `l_type = 'OBJE'`, in
   one query (classifies each linking xref by which table it belongs to).
3. **`renderMediaListPage()`** (`media-list-view.mjs`, new): the search
   form, "N found" count, pagination (top and bottom), and card grid.
   No page-shell infra shared with family-list/individual-list (media
   has no surname nav), so this got its own full-page render function.
4. **`handleMediaListPage()`** (`index.mjs`): module gating
   (visitor-level default, no override), the real POST→GET pretty-URL
   redirect (`MediaListModule::handle()`'s own "Convert POST requests
   into GET requests for pretty URLs"), and the per-media card
   resolution (thumbnails, type label, SOUR/NOTE citation links,
   linked-record footer).

## Deliberate, documented simplifications

- The editor-only raw filename/file-attributes display and the "file
  does not exist" check are both NOT ported - they need real
  filesystem access this migration's Node side deliberately never does
  (the same "no Node-side image/file processing" decision as thumbnails
  themselves).
- SOUR/NOTE fact text uses each fact's own plain value (now correctly
  resolved to a real link when it's a pointer - see bugs below) rather
  than real PHP's `view('fact-gedcom-fields', ...)` partial (full
  GEDCOM-structure-aware fact rendering, not built anywhere in this
  migration) - same content, not byte-identical formatting.
- `allMedia()`'s sort order for a hypothetical multi-file media object
  uses that object's own minimum title across its files, rather than
  replicating PHP's exact "sort the raw per-file rows, dedupe keeping
  the first occurrence" tie-break - confirmed via the DB that this
  tree's media are ALL single-file, so this never actually diverges
  from real PHP's own ordering here.

## Three real bugs found and fixed via live verification

1. **Postgres rejected `SELECT DISTINCT ... ORDER BY <expr>` (42P10)** -
   the sort-key subquery wasn't in the select list. First real request
   502'd. Fixed with `GROUP BY m_id` + `MIN(descriptive_title) AS sort_title`
   as an explicit, selected sort key.
2. **Pagination computed `count`/`pages` from the unfiltered xref list,
   privacy-filtering only the current page's slice afterward** - real
   PHP's own `allMedia()` filters the WHOLE matched set
   (`GedcomRecord::accessFilter()`) BEFORE `->slice()`. A 20-item page
   rendered only 14 cards before this fix (6 of the sliced 20 turned
   out unshowable, dropped after slicing instead of before). Fixed by
   resolving privacy for every match up front, then computing
   count/pages/slice from the already-filtered result.
3. **Media titles were always the bare xref** - `Media::extractNames()`
   builds a media object's name from its own FILE's title/filename
   (`app/Media.php:104-128`), NOT a top-level `TITL` fact (media records
   never have one). An initial draft used `extractNameFromFact(gedcom, 'TITL')`
   (the pattern that's correct for Source/Location, but not Media) and
   every card silently fell back to showing its xref. Fixed by reusing
   the exact title-derivation `handleMediaPage()` already established
   for the single-record route.

Also fixed along the way (found by actually reading the card output,
not assumed correct): a `1 SOUR @Sx@`/`1 NOTE @Nx@` citation was
rendering as the raw GEDCOM pointer text (`@S558@`) instead of a real,
privacy-checked link to the cited record's own title.

## Module gating

`MediaListModule` has **no `$access_level` override**, same as every
other list module - confirmed live: `module_name = 'media_list'` is
`enabled`, no `wt_module_privacy` override row.

## Live verification

Against the real "ophir" tree (499 real media objects): anonymous
landing page 200s with no search run yet (`go` not set, matching real
PHP's own "don't search until submitted" default); `?go=1` runs the
unfiltered search (375 real, privacy-filtered matches - visitor-level
anonymous), exactly 20 cards on page 1 (matching `max`), "Page 1 of 19"
pagination top and bottom; a real card shows its actual filename as
title, a real thumbnail URL, and a correctly-resolved SOUR citation
link - hidden from an anonymous viewer (this tree's known pre-existing
SOUR privacy restriction, confirmed via `wt_default_resn`) and visible
with a real admin session, resolving to "Benjamin Scheiner" instead of
the raw pointer; linked-individual footer icons render correctly;
`?page=2` loads; the POST search form redirects correctly to the
pretty GET URL with every search param preserved. Full JS suite: 4996
tests, zero regressions in any previously-shipped route.

## What's next

**The "list" family is now COMPLETE** - Repository, Source, Note,
Location, Family, Individual, and Media are all served entirely by
Node. No further list-route candidates remain in `app/Module/`.
