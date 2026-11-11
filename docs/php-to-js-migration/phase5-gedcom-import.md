# Phase 5 step 44: GEDCOM import (`/tree/{tree}/import`)

**Done 2026-11-11.** The counterpart to step 43's GEDCOM export, and
the single piece of this whole migration that needed genuinely new
infrastructure: a from-scratch port of
`GedcomImportService::importRecord()` and its
`updatePlaces()`/`updateDates()`/`updateLinks()`/`updateNames()`
helpers - turning raw GEDCOM record text into real
individuals/families/sources/other/media/name/dates/link/placelinks
rows.

## Route ported

| Route | Real PHP handler |
|---|---|
| `GET/POST /tree/{tree}/import` | `ImportGedcomPage`/`ImportGedcomAction` (+ the `GedcomLoad` chunk-processing engine, restructured - see below) |

AuthManager-gated, same as export.

## Scope, per the user's explicit choices

- **Inline media conversion is NOT ported.** Real PHP's
  `convertInlineMedia()`/`createMediaObject()` turn legacy inline
  `2 OBJE` sub-records (no `@xref@`, from old genealogy software) into
  real, separate media objects. Every modern GEDCOM export - including
  this app's own, built in step 43 - already uses linked
  `1 OBJE @M1@` references. Only standard links are supported.
- **Import is a destructive replace, same as real PHP** - importing
  wipes the tree's existing individuals/families/sources/other/
  places/placelinks/name/dates/link rows (and media/media_file too,
  unless "keep media objects" is checked) before writing the new
  file's records. Per the user's explicit choice: a tree that already
  has data shows a prominent warning and requires an explicit
  confirmation checkbox before the destructive re-import proceeds (the
  submit button is disabled until checked); an empty tree imports
  immediately with no extra confirmation. The server re-validates this
  independently of the client-side checkbox.
- **One synchronous request, no chunk-and-poll.** Real PHP processes
  the upload via a DB-stored chunk table plus recursive client-side
  AJAX polling, specifically to work around PHP's own execution-time
  limits - a constraint Node doesn't have. This port parses and writes
  the whole file in one pass within one request/response, per the
  "natural Node approach, not a port of PHP's own workaround" choice
  already applied to step 43's export architecture. `wt_gedcom_chunk`
  is not used at all.
- **Wrapped in a real transaction**, which PHP's own chunked import is
  NOT (a crash mid-import leaves PHP's tree genuinely half-imported).
  This port's whole wipe-then-reload runs in one transaction: any
  failure (a malformed record, a missing trailer) rolls back to the
  exact pre-import state - same "add the transaction PHP doesn't have"
  convention already used for tree management's merge/delete/renumber
  actions.
- Legacy `_PLAC_DEFN`/TNG `_PLAC` lat/long-only sidecar record types are
  detected and silently skipped (matching real PHP's own early
  `return`), but their `wt_place_location` lat/long side-effect isn't
  reproduced - a narrow, rarely-hit cut.

## Architecture

`pages-server/gedcom-import.mjs` batch-decodes the whole uploaded/
server file, splits it into records at level-0 boundaries, then in one
transaction: wipes the tree's existing data, and for each record:
reformats (reuses the already-ported `reformatRecord()`), classifies
its type/xref, optionally injects a `_UID`, optionally re-attaches
media kept across the wipe, inserts its type-specific row, and runs
the shared `updatePlaces`/`updateDates`/`updateLinks`(+`updateNames`
for individuals) cross-reference writers - all ported directly from
real PHP's exact algorithms (table/column names, truncation lengths,
soundex calls), not reinvented.

Real correctness details worth flagging:

- **`updateLinks()` has no tag-based direction flip** - confirmed by
  reading real PHP directly: whichever record's text contains a
  pointer line is always `l_from`, the target is always `l_to`,
  regardless of tag (FAMC/FAMS/HUSB/WIFE/CHIL/SOUR/OBJE/etc. all
  behave identically). An earlier survey had flagged this as a
  possible subtlety; it isn't one.
- **`updateDates()`'s second (maximum-bound) row reuses the
  MINIMUM bound's calendar-escape type** (`d_type`) - a real PHP quirk
  in `GedcomImportService::updateDates()`, replicated exactly rather
  than "fixed," since for a non-range date the two rows are identical
  anyway (deduped to one) and for a real BET/AND range this is simply
  what real PHP's own output is.
- **Place resolution/dedup truncates to 120 characters**, matching
  real PHP's `mb_substr(...,0,120)` exactly, even though this
  migration's Postgres schema's `p_place` column allows 150 - matching
  the WIDER column would silently diverge from PHP's own dedup
  behavior for a place name differing only after character 120.
- **`_UID` generation** (`pafUid()`) implements the real RFC 9562
  UUIDv7 bit layout directly (48-bit millisecond timestamp, version/
  variant bits, remaining random bits) plus the real PAF checksum
  algorithm ("GEDCOM Unique Identifiers" by Gordon Clarke, 2007) -
  not a UUIDv4 substitute.
- **Encoding auto-detection** (`detectEncodingName()`) ports real
  PHP's `EncodingFactory::detect()` label table directly (BOM sniffing
  first, then a real-software-label-to-encoding lookup scanning the
  GEDCOM header's `1 CHAR` line) - every encoding this migration has
  ever ported (ANSEL/ASCII/CP437/CP850/ISO-8859-1/2/MacRoman/Windows
  1250/1251/1252/UTF-16BE/LE) is reachable via auto-detect, matching
  the real form's default "automatic" encoding choice.
- **New `busboy` dependency** for `multipart/form-data` parsing (the
  real upload form always posts multipart, even when "a file on the
  server" is the selected source) - a well-established, minimal
  streaming multipart parser, not hand-rolled boundary-parsing code.

## Live verification

Exercised end to end over HTTP against a disposable test tree (created
and deleted within the verification pass), using a disposable
self-generated manager session:

- Client-file upload into an empty tree: succeeded, 5 records,
  individuals/families/names/links all correct, `wt_gedcom.imported`
  flipped to `1`.
- Re-import into the now-non-empty tree WITHOUT `confirmed=1`:
  correctly rejected with the confirmation-required message, no data
  touched.
- Re-import WITH `confirmed=1`: succeeded, old data correctly wiped
  first (record count stayed at 2, not doubled to 4).
- "A file on the server" source, with encoding left blank (auto-detect
  from the `1 CHAR UTF-8` header line): succeeded.
- A truncated file with no `0 TRLR`: correctly rejected, and the
  transaction rollback left the tree's existing data completely
  intact (confirmed via direct count - the earlier successful import's
  2 individuals, not 0 and not partially-written).
- The core per-record algorithm (name/date/place/link extraction) was
  additionally validated directly against Postgres before building the
  HTTP layer, using small hand-written GEDCOM snippets covering: simple
  dates, `BET`/`AND` date ranges (correctly producing 2 distinct date
  rows), place-hierarchy dedup/reuse across multiple records sharing
  the same place name, `FAMC`/`FAMS`/`HUSB`/`WIFE`/`CHIL` link
  directions, multi-surname names (`Jean /Vasquez/ y /Cortes/`),
  `Mc`/`Mac` surname normalization, missing-name placeholders
  (`@N.N.`/`@P.N.`), and `_MARNM` alternate-name extraction - all
  matched expected real-PHP output exactly.
