# Phase 5, step 18: `/tree/{tree}/submitter/{xref}` (SubmitterPage)

**Status: done and verified live (2026-09-28), against a real user-imported GEDCOM tree.**

## What this is

The seventh route serving real GEDCOM record data
(Individual/Family/Source/Repository/Note/Media/Submitter). PHP's real
route is `/tree/{tree}/submitter/{xref}{/slug}`
(`app/Http/Routes/WebRoutes.php:672`). Unlike every prior record type,
`SubmitterPage.php` doesn't even use a dedicated view — it renders
through the fully generic `record-page`/`record-page-details.phtml`
pair (the same shared templates `record-page-details.phtml` already
confirmed to have zero tag allowlist for Source/Repository/Note/Media -
`app/GedcomRecord.php:552-570`), making this the simplest route yet:
title + every real fact, no linked-individuals/families reverse-lookup
section (same "shell + narrow slice" precedent as every prior step).

## Privacy: no override at all

`app/Submitter.php`'s class body has only `extractNames()` — **no
`canShowByType()` override**, exactly like Repository's own shape
(confirmed by reading the file directly, not assumed). So
`submitterCanShowRecord()` in the new `submitter.mjs` is a direct
copy of `repositoryCanShowRecord()`'s shape: the shared RESN chain
plus a tree-wide `SUBM` default-resn lookup, nothing else — no
linked-record check (unlike Note/Media from the previous two steps).

**Live-verified against a real, pre-existing tree-wide restriction**:
this tree already has a `wt_default_resn` row for `tag_type = 'SUBM'`
set to `confidential` (found live, not assumed — the same class of
restriction already discovered for `REPO` while building SourcePage).
A member-level test user correctly got **403** on both real submitters;
an admin-level test user correctly got **200**.

## Facts table: genuinely zero tag allowlist

`displayableSubmitterFacts()` is the identity function — real
`record-page-details.phtml`'s loop (`$record->facts([], true)`) has no
filtering beyond privacy, unlike Source/Repository (which deliberately
exclude `NOTE`) or Note (which excludes `CONT`/`CONC`). The real tree's
one fully-populated submitter (`S1`, "Miron Ophir") actually exercises
this: it carries two inline `1 NOTE` facts (a website and an email,
written as plain text, not GEDCOM `EMAIL`/`WWW` facts) that render
correctly as ordinary "Note" rows — the first real case in this
migration where a `NOTE` fact appears directly in a record's own
generic facts table rather than being resolved through a dedicated
Notes-tab pathway.

Submitter's real element set (`app/Gedcom.php`): `NAME`, `ADDR`,
`PHON`, `EMAIL`, `FAX`, `LANG`, `NOTE`, `OBJE`, `RFN`, `RIN`, `WWW`,
`CHAN`. EMAIL/WWW render as links (same `mailto:`/external-link
exceptions as Repository's own facts table). `OBJE` (a media
reference) falls back to plain-text rendering rather than resolving to
a real media link — the real tree has zero `SUBM:OBJE` facts, so this
is a documented, unreachable-by-real-data scope cut, not a gap found
live.

## A real edge case, handled with a deliberate simplification, not a faithful port

The real tree's second submitter (`U1`) has **no `NAME` fact at all** —
just a bare `1 RIN MH:U1`. Real PHP's `Submitter::extractNames()`
only calls `addName()` when a `NAME` fact exists, so `U1` ends up with
an EMPTY `getAllNames()` array; `GedcomRecord::fullName()` then indexes
that empty array at `getPrimaryName()` (`0`), which is genuinely a
corner case in real PHP's own code (an undefined-array-key situation
against a `string`-typed return) — not something worth faithfully
reproducing (including any resulting error behavior) in Node. This
route instead falls back directly to the record's own xref, matching
`GedcomRecord::getFallBackName()`'s real fallback value for a record
with no name at all, just applied proactively instead of only after
whatever real PHP does when its own array-indexing edge case is hit.
This can only produce a MORE complete, working page than real PHP's
own corner case here, never less — live-verified as an admin-level
viewer: `U1` renders a working page titled with its own xref, real
`RIN` fact included.

## Verification

**Unit tests**: new `pages_server_submitter.test.js` covers
`loadSubmitter()`, `submitterCanShowRecord()` (including the
tree-wide-resn and inline-RESN cases), `displayableSubmitterFacts()`
(confirming the "no allowlist at all" identity behavior), and
`submitterFactOtherAttributes()`. New
`pages_server_submitter_view.test.js` mirrors
`pages_server_repository_view.test.js`'s structure, with added
coverage for NOTE rendering and an empty-value fact (a real blank
`PHON` in `S1`). Route-matcher tests added to `pages_server_routes.test.js`
and `proxy_routing.test.js`. Two pre-existing `proxy_routing.test.js`
tests that had already been updated once (from `/media/M1` to
`/submitter/U1`, in the previous step) needed updating a SECOND time,
to `/location/L1` — a reminder that "not yet a Node route" placeholder
examples need re-checking every time a new route lands, not just once.
Full JS suite: **4643 tests, green** (4607 + 36 new).

**Live verification** — against the real, user-imported "ophir" tree,
using the established trap-guarded `data/config.yaml` swap script (see
[[feedback-config-yaml-swap-safety]]):
1. `S1` ("Miron Ophir") renders correctly for an admin-level test user
   (the tree's real `SUBM` confidential restriction requires it): real
   Address (multi-line, `<br>`-joined), a real blank `PHON` row (label
   only, no value line — confirming the empty-value-fact rendering
   path), and both real inline `NOTE` facts.
2. **The tree-wide restriction confirmed both ways**: a member-level
   test user correctly 403s on `S1`; an anonymous visitor also 403s.
3. `U1` (no `NAME` fact) renders correctly for the same admin user,
   titled with its own xref, its real `RIN` fact shown.
4. 404 (nonexistent submitter xref) vs. 302 (nonexistent tree) status
   codes confirmed live.
5. All disposable test fixtures (2 test users across two verification
   runs, their settings/session rows) deleted afterward;
   `data/config.yaml` restored via the trap-guarded script, confirmed
   via `grep dbhost` after both runs.

## What's left of the "generic record page" family

Individual/Family/Source/Repository/Note/Media/Submitter are now all
served by Node. The remaining real PHP record-page routes
(`HeaderPage`, `LocationPage`, `SharedNotePage` for `SNOTE`,
`GedcomRecordPage`, `SubmissionPage`) all correspond to record types
either absent from the real imported tree (`SNOTE`, `SUBM`ission) or
structural/meta records not meaningfully "viewed" the way a
genealogical record is (`HEAD`, generic `GedcomRecordPage`) —
candidates for a future session to explicitly confirm are out of
scope, rather than silently treating this family as complete.
