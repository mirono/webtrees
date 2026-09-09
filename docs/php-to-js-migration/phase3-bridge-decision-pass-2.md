# Phase 3 — Bridge decision pass 2 (tasks 18-21)

Per [php-to-js-migration-checklist.md](../php-to-js-migration-checklist.md)'s
Phase 3, and following the same investigate-before-deciding discipline as
[phase3-date-bridge-design.md](phase3-date-bridge-design.md) and
[phase3-soundex-bridge.md](phase3-soundex-bridge.md). Tasks 18-21
(`FactSortService`, `GedcomExportService::wrapLongLines()`,
`TextWrapper`/`HtmlTextMeasurer`, `GedcomImportService::reformatRecord()`)
were each deliberately left unbridged with a note that it was "a real
future bridge candidate" — this doc is that promised follow-up decision,
made by actually reading the real call sites rather than continuing to
defer.

## Decision criteria (unchanged from earlier bridges)

A bridge is worth building when: the operation has a clean, bounded
input/output shape; call volume is low enough (or batchable enough) that
HTTP round-trips are tolerable; and the existing PHP call site doesn't
need restructuring beyond a like-for-like drop-in replacement — matching
exactly how the Soundex/SurnameTradition/GedcomService bridges were added
(a `callService()` short-circuit at the top of the existing method, native
logic unchanged below it as fallback).

## Call-site investigation

| Module | Real call sites | Calls per typical operation | Interleaved with other unbridged PHP logic? |
|---|---|---|---|
| `FactSortService.sort()` | 5 tab modules (`Media`/`Notes`/`Places`/`IndividualFacts`/`Sources`Tab) + `chart-box.phtml`, each calling `sort()` exactly once per render | **~5-6 per page** (one per active tab/chart on an individual or family page) — each call handles that tab's own fact list (tens of facts), not the whole tree | No — each call is a single, self-contained "sort this list" operation with no PHP logic needed between the call and using its result |
| `GedcomExportService::wrapLongLines()` | One call site, inside the per-record export loop (`GedcomExportService.php:270`) | **One per exported record** — a full tree export streams every individual/family/source/etc. through this line, so a 5,000-individual tree is ~5,000+ calls in one export | No — each call is independent, but the *loop* also does media-file copying and CRLF conversion around it, so there's no single upfront point to batch all records into one call without restructuring the export loop itself |
| `TextWrapper`/`HtmlTextMeasurer` | 4 call sites in `LayoutEngine.php` (`wrapText`, `textHeight` ×3) | **Once per text element per report page** — reports can have hundreds of text boxes/cells across many pages, and `LayoutEngine.php` does substantial PHP-side positioning/box-fitting logic *between* each measurement call, often using one call's result to decide the next call's input | **Yes** — this is the closest of the four to `lib/date`'s already-rejected shape: repeated, high-volume calls tightly interleaved with unbridged PHP layout logic, not one call per independent higher-level operation |
| `GedcomImportService::reformatRecord()` | 4 call sites, all funneling through `importRecord()` (`TreeService.php` ×2, `TreeImport.php` CLI, `GedcomLoad.php` web handler) | **One per imported record** — same order of magnitude as `wrapLongLines()`, a multi-thousand-record GEDCOM import is multi-thousand calls | No — each call is independent, but (like export) there's no existing upfront "collect everything first" phase in the import pipeline to batch into one call without restructuring it |

## Decisions

### `FactSortService` — **build the bridge**

Low call volume (a handful per page render, not per-item), a genuinely
clean shape (flat array of fact shims in, flat array out), and no PHP-side
logic needed between the call and consuming its result. This is the
strongest candidate of the four and the most directly comparable to the
already-successful `GedcomService` bridge (also called at a handful of
points per page, not in a tight per-item loop).

### `GedcomExportService::wrapLongLines()` and `GedcomImportService::reformatRecord()` — **build the bridge, same documented tradeoff as Soundex**

Both are called once per record, which can be a large number for a big
tree — but this is **the same shape and the same tradeoff already accepted
for the `Soundex` bridge**, whose own doc explicitly flags: *"no request
batching yet, so bulk GEDCOM import pays one HTTP round-trip per name."*
Neither function needs PHP-side logic between the call and using its
result (the export loop just writes the returned string; the import
pipeline just continues with the returned normalized record). Building
these follows the identical precedent rather than a new one — declining to
bridge them while keeping Soundex bridged would be an inconsistent
double-standard with no principled basis for the difference. Both get the
same explicit "known risk: no batching, high call volume for bulk
operations" note as Soundex, so a deployer can weigh it before enabling
the env var, same as today.

### `TextWrapper`/`HtmlTextMeasurer` — **do not bridge**

This is architecturally the same shape as the already-rejected `lib/date`
bridge, not the same shape as the three approved above: call volume scales
with report content (hundreds of calls per multi-page report, not a
handful per page or one per record), and those calls are tightly
interleaved with substantial PHP-side layout logic in `LayoutEngine.php`
that makes decisions based on each measurement's result before the next
call — there's no clean, independent per-operation boundary to bridge
across. Bridging one method here wouldn't let PHP retire any layout code
either, since `LayoutEngine.php` still needs to run natively regardless.
Revisit only if `LayoutEngine.php` itself is ever restructured to batch
all of a page's measurements upfront (unlikely without a much larger
report-engine refactor, well outside this migration's scope).

## What's next

Build the three approved bridges (`FactSortService`, `wrapLongLines`,
`reformatRecord`) following the exact structural pattern already
established for `GedcomService`: a `callService()`/equivalent short-circuit
at the top of each real PHP method, a new per-module env var, native logic
unchanged below as fallback, routes added to `server/migration-service.mjs`,
and a `tests/Feature/*BridgeTest.php` proving both the service-routed and
fallback paths. Update `phase4-cutover-tracking.md`'s three rows
accordingly once built.
