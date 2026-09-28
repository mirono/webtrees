# Phase 5, step 19: `/tree/{tree}/header/{xref}` (HeaderPage)

**Status: done and verified live (2026-09-28), against a real user-imported GEDCOM tree.**

## What this is

The eighth route serving real GEDCOM record data
(Individual/Family/Source/Repository/Note/Media/Submitter/Header). PHP's
real route is `/tree/{tree}/header/{xref}{/slug}`
(`app/Http/Routes/WebRoutes.php:660`). A GEDCOM header (`0 HEAD`) has no
real `@xref@` of its own — webtrees addresses it with the literal
pseudo-xref `"HEAD"` (confirmed: the real imported tree's one `wt_other`
row of type `HEAD` has `o_id = 'HEAD'`). Same generic
`record-page`/`record-page-details.phtml` shape as Submitter — no
dedicated template, no tag allowlist, no `canShowByType()` override
(`app/Header.php`'s class body has only `extractNames()`).

## Two things unique to this route among every record type ported so far

**`Header::extractNames()`** (`app/Header.php:33-40`) doesn't derive a
name from any GEDCOM fact at all — it always pushes the single literal
translated string `"Header"`. `fullNameHtml` is hardcoded to that plain
string, no escaping/wrapping markup needed (unlike every other title
derivation this migration has ported so far).

**`HEAD:DATE` is the fact's own top-level tag**, not a subordinate line
under some other event fact (the shape `CHAN`/every event fact uses
elsewhere). The real header carries `1 DATE 20 APR 2020\n2 TIME
10:17:01` — still rendered via the same `date`/`time` fields as CHAN,
just extracted one level shallower (`^1 DATE (.+)` instead of `\n2 DATE
(.+)`, `\n2 TIME (.+)` instead of `\n3 TIME (.+)`).

## `HEAD:SUBM` resolves to a real submitter link

`HEAD:SUBM` (`XrefSubmitter` element) is the same "resolve a
cross-referenced record, subject to its own privacy gate" pattern
already built for `SOUR:REPO` in `source.mjs` — reused here directly:
`handleHeaderPage()` in `index.mjs` resolves `1 SUBM @S1@` via the
already-existing `loadSubmitter()`/`submitterCanShowRecord()` from the
previous step, and only feeds a showable submitter's name into the
fact row (same `repoUrl`/`repoNameHtml`-shaped pattern, here
`submUrl`/`submNameHtml`).

## A cross-record-type privacy quirk, confirmed as REAL PHP behavior, not a bug

`wt_default_resn` keys a tree-wide fact-level restriction purely by
`tag_type` string — with **no knowledge of which record type the fact
appears within**. This tree already has real tree-wide restrictions on
`tag_type = 'SOUR'` (`privacy`, found while building SourcePage) and
`tag_type = 'SUBM'` (`confidential`, found while building
SubmitterPage). Both restrictions **also apply to `HEAD:SOUR`** (the
header's own "Application ID" field, a completely different real
element than every other record type's own source-citation `SOUR`
tag) **and `HEAD:SUBM`** — live-verified as genuinely correct, not an
artifact of this port: an anonymous visitor cannot see the header's
`SOUR`/`SUBM` facts at all, a member-level viewer can see `SOUR` but
not `SUBM`, and only an admin-level viewer sees both. This is real
PHP's own actual (if surprising) privacy model, reproduced faithfully
via the same shared `factCanShow()`/`loadDefaultResn()` machinery
every other route already uses — not a new mechanism.

## A real bug found live, and fixed retroactively for three already-shipped routes

While building this route, live testing showed an extra table row with
`undefined` for both its label and icon class, ahead of the real
`Destination` row. Root cause: `parseFacts()` (`individual.mjs`) splits
a record's raw gedcom purely on `\n(?=1)` boundaries (mirroring
`GedcomRecord::parseFacts()`'s own `preg_split`), so `facts[0]` is
**always** the record's own leading `"0 @xref@ TYPE ..."` line — not a
real fact. Every route with a tag **allowlist** (Source, Repository)
drops this for free, since its tag (`''`, no match) never appears in
the allowlist array. But the three already-shipped routes with **no**
allowlist at all — Note (step 16), Media (step 17), Submitter (step
18) — had no such filter, so this pseudo-block rendered as a real,
visible extra row on every single note/media object/submitter page
shipped so far, undetected because live verification for those steps
grepped for specific expected content rather than checking the full
raw output.

**Fixed** in `note.mjs`'s `displayableNoteFacts()`, `media.mjs`'s
`displayableMediaFacts()`, and `submitter.mjs`'s
`displayableSubmitterFacts()` — each now filters `fact.startsWith('1
')` first, before any of their own tag-specific logic. This step's own
new `header.mjs`'s `displayableHeaderFacts()` was written correctly
from the start (once the bug was found and understood).

**Re-verified live for all four affected routes**, not just Header: re-ran
each route's own already-established live-test script
(`verify_note.sh`/`verify_media.sh`/`verify_submitter.sh`/
`verify_header.sh`-equivalents) and confirmed the extra `undefined` row
is gone from every one, with all previously-verified real content
(note text, media files, submitter facts, header facts) still rendering
correctly — this was a rendering-only bug, not a privacy or data
regression (the extra row carried no real content, and no data was
ever exposed or hidden incorrectly by it).

## Verification

**Unit tests**: new `pages_server_header.test.js` covers `loadHeader()`
(including the "any xref other than the real HEAD row's own finds
nothing" case), `headerCanShowRecord()`, `displayableHeaderFacts()`
(including the leading-pseudo-block regression case), and
`headerFactOtherAttributes()` (GEDC/SOUR subtag labels, the DATE:TIME
double-render regression case). New `pages_server_header_view.test.js`
covers the view layer (the literal "Header" title, the SOUR-is-plain-
text-not-a-citation-link distinction, the DATE fact's date/time
rendering, the SUBM link rendering including the "no resolvable
submitter" case). Regression tests added to `pages_server_note.test.js`,
`pages_server_media.test.js`, `pages_server_submitter.test.js` for the
retroactive fix. Route-matcher tests added to `pages_server_routes.test.js`
and `proxy_routing.test.js`. Full JS suite: **4682 tests, green**
(4643 + 39 new).

**Live verification** — against the real, user-imported "ophir" tree,
using the established trap-guarded `data/config.yaml` swap script (see
[[feedback-config-yaml-swap-safety]]):
1. The real header renders correctly for an anonymous visitor: title
   "Header", real `Destination`/`Date`(with time)/`GEDCOM`(Version/
   Format)/`Character set`/`Filename` facts — `SOUR`/`SUBM` correctly
   hidden (the tree-wide restrictions above).
2. A member-level test user sees `SOUR` ("Application ID": "webtrees")
   but still not `SUBM`.
3. An admin-level test user sees `SUBM` too, resolving to a real,
   correctly-formed link to `/tree/ophir/submitter/S1` with the real
   submitter's name.
4. 404 (a URL matching the route shape but with the wrong xref, e.g.
   `/header/WRONG`) vs. 302 (nonexistent tree) status codes confirmed
   live.
5. All disposable test fixtures (3 test users across three
   verification runs, their settings/session rows) deleted afterward;
   `data/config.yaml` restored via the trap-guarded script, confirmed
   via `grep dbhost` after every run.

## What's left of the real-record-type family

Individual/Family/Source/Repository/Note/Media/Submitter/Header are now
all served by Node. The real imported tree's one remaining `wt_other`
row type, `TRLR` (the GEDCOM trailer marker, `0 TRLR`), has no
corresponding PHP class or route at all — it's a structural end-of-file
marker, not a viewable record, and needs no port. This closes out the
"generic/simple record page" family for every record type this tree's
real data actually contains.
