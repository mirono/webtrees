# Phase 5 step 43: GEDCOM export (`/tree/{tree}/export`, `-export-client`, `-export-server`)

**Done 2026-11-11.** Scoped to export only (user's explicit choice) -
GEDCOM **import** (the chunk-upload + record-parsing pipeline) is its
own, separately-scoped future step: it's the one piece of this whole
migration that needs a genuinely new "parse raw GEDCOM into SQL rows"
engine (~650 lines of untouched PHP: `GedcomImportService::importRecord()`
and its `updatePlaces()`/`updateDates()`/`updateLinks()`/`updateNames()`/
`convertInlineMedia()` helpers), whereas export reuses privacy/record
logic already built for every individual record-page route in this
migration.

## Routes ported

| Route | Real PHP handler |
|---|---|
| `GET /tree/{tree}/export` | `ExportGedcomPage` |
| `POST /tree/{tree}/export-client` | `ExportGedcomClient` (streams a file download) |
| `POST /tree/{tree}/export-server` | `ExportGedcomServer` (writes a `.ged` file into the data folder) |

All three are **AuthManager**-gated (any tree manager, not just an
admin) - same gate tree management (step 41) introduced via
`authenticateTreeManager()`, reused as-is here.

Formats: `gedcom`, `zip`, `zipmedia`, `gedzip`. Privacy: `none` (admin
only - no filtering at all), `gedadmin`, `user`, `visitor`. Encodings:
`UTF-8`, `UTF-16BE`, `ANSEL`, `ASCII`, `CP1252`. Line endings: `CRLF`/`LF`.
`export-server` always exports unfiltered (`privacy='none'` equivalent,
UTF-8, CRLF) - matching real PHP's own hardcoded
`$this->gedcom_export_service->export($tree, true)` call, which has no
format/privacy/encoding options on that form at all.

## Architecture: natural Node approach, not per-record round-trips

Real PHP's `GedcomExportService::export()` streams the tree one
Eloquent-hydrated record at a time, calling
`GedcomRecord::privatizeGedcom($access_level)` per record (which itself
does its own `Registry::gedcomRecordFactory()->make($xref)` DB lookup
for every link it finds, to decide whether to strip it).

This port restructures that into three batch-loaded, in-memory passes
(`pages-server/gedcom-export.mjs`):

1. **Load everything once**: all individuals/families/sources/other/
   media raw GEDCOM text (5 queries total, not one per record), every
   `wt_default_resn` row for the tree (1 query), and every `wt_link`
   row (1 query, used to build a reverse index for Media/Note's
   "every record linking to me must itself be showable" check).
2. **Compute every record's `canShow(accessLevel)` decision in memory**,
   in dependency order (individuals → families → repositories →
   sources → headers/locations/submitters/other → media → notes),
   reusing the EXACT same per-record-type `canShowRecord()`-family
   functions already built for every individual record page in this
   migration (`individual.mjs`/`family.mjs`/`source.mjs`/`media.mjs`/
   `note.mjs`/`header.mjs`/`location.mjs`/`submitter.mjs`) - not
   reimplemented.
3. **Emit**: for `privacy='none'`, every record's raw GEDCOM text is
   written out completely unchanged (mirrors
   `GedcomRecord::privatizeGedcom()`'s own early return when
   `$access_level === Auth::PRIV_HIDE` - the common admin-export case).
   For `gedadmin`/`user`/`visitor`, each record is rebuilt fact-by-fact
   via the already-built `factCanShow()`, and a final regex pass
   strips any `\d TAG @xref@` line (and its sub-lines) whose target
   either doesn't exist or can't be shown - exactly mirroring
   `privatizeGedcom()`'s own link-stripping step, including stripping
   **dangling** links (targets that don't exist at all) even under
   privacy filtering, same as real PHP.

This is a deliberate restructuring of the SAME algorithm, not a new
one - a direct one-query-per-record port would also have worked but
would be needlessly slow for a bulk operation; this matches the
"natural Node approach, not a mechanical port of a PHP workaround"
choice already made for this bucket's import architecture question.

## Real correctness details worth flagging

- **A real bug was found and fixed during manual live testing**: the
  first implementation of `privatizeRecord()` iterated over
  `parseFacts(gedcom)` without skipping its first block (the record's
  own level-0 line, e.g. `0 @I2@ INDI`) - `parseFacts()`'s own doc
  comment notes that PHP's version `array_shift()`s this off
  explicitly, but every *existing* caller elsewhere in this migration
  happened to filter by requiring a `1 TAG` prefix match, which
  harmlessly skips it. This function didn't filter by tag at all (it
  processes every fact), so the level-0 line was appended a SECOND
  time as if it were a fact - every privacy-filtered individual and
  family record in a test export came out
  **exactly doubled** (confirmed live: 6,949 individuals became
  13,898 for `privacy='gedadmin'` against the real "ophir" tree).
  Fixed by explicitly skipping any `parseFacts()` block that doesn't
  start with `1 `.
- **The self-record bypass requires the SIMULATED access level to
  match the exporting user's REAL access level**, not just "is this my
  own linked individual" - mirrors
  `GedcomRecord::canShowRecord()`'s own
  `$access_level === Auth::accessLevel($this->tree)` condition exactly
  (app/GedcomRecord.php:957). Since export is manager-gated, the real
  viewer access level is always `0` (`Auth::PRIV_NONE`) here - so a
  manager previewing their own tree as `'visitor'` does NOT get to see
  their own normally-private record, which is the correct, safer
  behavior (a manager can't use "export as visitor" to leak their own
  otherwise-hidden living-person record).
- **Media/Note's reverse-link ("every record linking to me must itself
  be showable") check only looks at the referencing record's own
  already-computed INDI/FAM canShow result** - a link from any other
  record type (another NOTE, a SOUR, etc.) is treated as showable
  without recursing further. This is the exact same bounded,
  documented simplification `linkedRecordCanShow()` in `index.mjs`
  already uses (to avoid unbounded mutual-reference recursion) -
  export reuses that precedent rather than inventing a new one.
- **UTF-16 export faithfully reproduces a real, already-documented PHP
  bug**: `lib/encodings/abstract-utf16-encoding.js` (ported in an
  earlier task) has an operator-precedence bug carried over from real
  PHP that makes every non-ASCII character silently become NUL when
  exporting as UTF-16BE. Not re-verified here beyond confirming the
  existing encoding class is reused unchanged - see
  `docs/php-to-js-migration/task-16-encodings.md` for the original
  finding.
- **ANSEL export of non-Latin scripts (e.g. Hebrew `_HEB` facts)
  correctly falls back to the `?` replacement character**, live-
  verified against the real "ophir" tree's `_HEB` facts - there's no
  ANSEL mapping for Hebrew, matching real PHP's own
  `AbstractEncoding::REPLACEMENT_CHARACTER` behavior.
- **`zipmedia`/`gedzip` real media-file bundling** reads actual files
  from the tree's real media folder (`wt_gedcom.media_folder` - a real
  column, not a setting, confirmed by reading `Tree::fromDB()`) via
  plain `fs/promises.readFile()`, using the brand-new `archiver` v8
  dependency's `ZipArchive` class (a from-scratch ESM rewrite with a
  different API shape than the classic `archiver()` factory function
  older docs/examples describe - this port uses `new ZipArchive()`
  with `.append(buffer, {name, store})`/`.finalize()`). Missing media
  files are silently skipped, matching real PHP's own
  `$media_filesystem->fileExists()` guard.
- **`gedzip` writes media files flat at the zip root** (`media_path=''`)
  while `zipmedia` nests them under the tree's own media folder path
  (e.g. `media/photo.jpg`) - mirrors `downloadResponse()`'s own
  `$format === 'gedzip' ? '' : $tree->mediaFolder()` branch exactly.
- **No pending-changes integration** (same cut as every prior step) -
  export reads straight from `wt_individuals`/etc., matching real
  PHP's own export path (which also bypasses pending changes entirely,
  confirmed by reading `GedcomExportService::export()`).

## Live verification

All three routes were exercised against the real "ophir" tree (6,949
individuals, 2,213 families, ~500 media files) over HTTP, using a
disposable, self-generated admin session (created and deleted within
the verification pass):

- `export-client` with `format=gedcom`: full unfiltered export (128,771
  lines) and a `privacy=visitor`-filtered export (57,763 lines, fewer
  records) both verified byte-for-byte sane via direct inspection.
- `export-client` with `format=zip`: verified via Python's `zipfile`
  module that the `.ged` entry is present and deflate-compressed.
- `export-client` with `format=zipmedia`: verified a real media file
  (`media/weiss-yael.jpg`, 70,485 bytes) is present in the zip with
  `compress_type=0` (STORE, uncompressed).
- `export-client` with `format=gedzip`: verified `gedcom.ged` plus
  every real media file present flat at the zip root (500 entries
  total).
- `export-client` with `encoding=ANSEL`: verified the output is
  non-UTF-8 byte content and that a real Hebrew (`_HEB`) fact
  correctly degrades to `???` (the `?` replacement character).
- `export-server`: verified a real `.ged` file was written to the data
  folder and the page redirected to `ManageTrees` - the test file was
  deleted immediately afterward (not a tracked file, so no git status
  change).
- The double-first-line bug (see above) was caught and fixed during
  this same live-verification pass, before any further work.

The manager-only (`isAdmin: false` → `'none'` forbidden) branch was
verified by reading the code path directly rather than over HTTP - no
second disposable non-admin manager account was created for this pass,
to avoid additional test-data mutation; it's covered by the delegated
unit tests instead.
