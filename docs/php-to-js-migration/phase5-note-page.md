# Phase 5, step 16: `/tree/{tree}/note/{xref}` (NotePage)

**Status: done and verified live (2026-09-28), against a real user-imported GEDCOM tree.**

## What this is

The fifth route serving real GEDCOM record data
(Individual/Family/Source/Repository/Note). PHP's real route is
`/tree/{tree}/note/{xref}{/slug}` (`app/Http/Routes/WebRoutes.php:666`).
There's also a separate `/tree/{tree}/shared-note/{xref}` route for the
GEDCOM-7-era `SNOTE` record type (`app/Http/RequestHandlers/
SharedNotePage.php`) — **deliberately not ported**: the real imported
"ophir" tree has exactly one `wt_other` row of type `NOTE` and zero of
type `SNOTE` (confirmed via `SELECT o_type, count(*) FROM wt_other
GROUP BY o_type`), so there's no real data to serve through it yet.

Same "shell + narrow slice" precedent as Source/Repository: title +
the note's own text + its remaining facts table (just `CHAN` in
practice) — no linked-record reverse-lookup section (no
`linked_families`/`linked_individuals`/etc., matching
`note-page.phtml`'s own `record-page-links` include, which this step
skips just like Source/Repository skipped theirs).

## Two things this step does NOT do, and why

**Markdown/autolink rendering is not ported.** Real PHP renders a
note's text through `NOTE:CONC`'s element (`SubmitterText`), which
calls `Registry::markdownFactory()->markdown()` (tree default) or
`->autolink()` — a full `league/commonmark` CommonMark + Table +
custom Census-table + Xref-autolinking pipeline
(`app/Factories/MarkdownFactory.php`). Porting this exactly is a
disproportionately large subsystem for one route — the same
"stub/simplify rather than half-port" call already made for
Places/Interactive-tree. This route instead renders the note's plain
escaped text with newlines as `<br>` — the SAME simplification already
applied to shared notes shown inline on IndividualPage's own Notes tab
(`note.mjs`'s `noteText()`, phase 5 step 14c). Real markdown syntax in
a note's text (there is none in the real tree's one NOTE record) would
render as literal characters rather than formatted HTML — a
readability regression, never a privacy one, so it's a safe direction.

**Media (`OBJE`) and Submitter (`SUBM`) linked-record privacy is not
ported** — see below.

## The real linked-record privacy override — the interesting part of this step

Unlike Repository (`app/Repository.php` has NO `canShowByType()`
override at all — confirmed by its near-empty class body), `Note`
genuinely does: `Note::canShowByType()` (`app/Note.php:58-75`) hides
the note whenever ANY record linking to it (via the `link` table) is
itself unshowable to the current viewer. **A pre-existing comment in
`note.mjs`, written during phase 5 step 14c, incorrectly claimed Note
has no override at all** (copy-pasted from Repository's own accurate
comment without re-checking) — this step corrects that comment and
actually implements the real behavior, both for this new standalone
route AND retroactively for step 14c's own Notes-tab shared-note
resolution (which had the same gap - a real, if narrow, privacy bug:
a private individual's own linked note could leak through another
individual's Notes tab).

**Implementation** (`pages-server/index.mjs`):
- `linkedRecordCanShow(tree, treePrivacyPrefs, accessLevel, relPrefs, xref)`
  — dispatches by the linked record's OWN type, determined by which
  table actually holds it (a single `UNION ALL` query across
  `wt_individuals`/`wt_families`/`wt_other`), NOT by the `wt_link`
  row's `l_type` column (that's the type of the *link*, e.g. always
  `'NOTE'` for links pointing at a note — not the linking record's own
  type).
  - **INDI**: reuses `resolveFamilyMember()` (already built for
    Families-tab/Family-navigator member resolution) — full real
    privacy check, zero new logic.
  - **FAM**: reuses `resolveShownFamily()` (already built for the
    Families tab) — full real check including its own member-visibility
    cascade.
  - **SOUR**: new `linkedSourceCanShow()`, factored out of
    `handleSourcePage()`'s own inline repo-cascade logic so both share
    it — full real check including the source's own REPO citations.
  - **REPO**: `repositoryCanShowRecord()` directly (already built).
  - **Media/Submitter/anything else/a since-deleted record**: falls
    back to "showable" — a deliberate, narrow scope cut. Real PHP's own
    `$linked_record instanceof GedcomRecord` guard already does this
    for a missing record; this migration hasn't ported `Media`'s own
    (recursive — Media has the identical "hide if attached to a
    private record" override) `canShowByType()` or `Submitter`'s
    privacy chain yet. The real tree's one NOTE record is linked only
    from individuals, so this gap isn't reachable by real data today.
- `noteLinkedRecordsShowable()` — queries `wt_link` for every row with
  `l_to = <note xref>` and `l_type = 'NOTE'`, short-circuits to `false`
  on the first unshowable linked record.
- `note.mjs`'s `noteCanShowRecord()` gained a `linkedRecordsShowable`
  parameter (a precomputed boolean, not a DB query — matching this
  migration's established pattern of keeping DB access in
  `index.mjs`'s handlers and privacy *decisions* in the per-record-type
  modules, same shape as `sourceCanShowRecord()`'s own
  `repoCanShowResults` parameter).

## Other implementation notes

- **`note.mjs`** gained `displayableNoteFacts()` — same "no tag
  allowlist" reasoning as Source/Repository
  (`app/GedcomRecord.php:552-570`), just excluding `CONT`/`CONC`
  (mirrors `note-page-details.phtml`'s own defensive
  `$fact->tag() !== 'NOTE:CONT'` guard — `parseFacts()` only ever
  returns level-1 tags in practice, so this never actually fires
  against real data, but matches the real template's own shape).
- **`note-view.mjs`** (new): `renderNotePage()`, same hand-rolled-HTML
  convention as every prior view. The note's own text gets a fixed
  "Shared note" row (matching `note-page-details.phtml:21-39`'s
  hardcoded label) ahead of the mapped facts table rows.
- **Title derivation**: `Note::extractNames()` derives the record's
  display name from the first line of the *markdown-rendered* text,
  `Str::limit()`-ed to 100 characters. Since markdown isn't ported,
  this step takes the first line of the *plain* text instead, same
  100-character `Str::limit()` truncation (`limitText()` in
  `index.mjs`), wrapped in `<bdi>...</bdi>` — matching
  `GedcomRecord::addName()`'s real markup for a record without proper
  `NAME` gedcom facts (`'full' => '<bdi>' . e($value) . '</bdi>'`), NOT
  the `<span class="NAME">` wrapper used by records with real `NAME`
  facts (Individual/Repository).
- **`pages-server/routes.mjs`** / **`proxy/routing.mjs`**:
  `matchNotePagePath()` / `isNotePagePath()`, same exact-shape
  convention as every prior record-page matcher — matches `/note/`,
  deliberately not `/shared-note/`.

## Verification

**Unit tests**: `note.mjs`'s test file gained `displayableNoteFacts()`
coverage and a new `noteCanShowRecord()` case proving the linked-record
override (`linkedRecordsShowable: false` → hidden even when every
other gate would allow it). New `pages_server_note_view.test.js`
covers the view layer (title derivation, the fixed "Shared note" row,
CHAN rendering, other-attributes, escaping). Route-matcher tests added
to both `pages_server_routes.test.js` and `proxy_routing.test.js`,
including the SNOTE-variant-does-NOT-match case. Full JS suite:
**4564 tests, green** (4538 + 26 new).

**Live verification** — against the real, user-imported "ophir" tree,
using the established trap-guarded `data/config.yaml` swap script (see
[[feedback-config-yaml-swap-safety]]):
1. `N3` ("From Krzepice Book of Residents CRARG:...") renders correctly
   for both a disposable member-level test user and an anonymous
   visitor: the real CONT-joined multi-line tabular text (rendered with
   `<br>`), a real `CHAN` with date/time/author — independently
   cross-checked against the raw `o_gedcom` row. Confirms Note's base
   `canShowByType()` (no tree-wide NOTE restriction on this tree) works
   the same as before.
2. **The linked-record override, proven with a real negative test**: a
   throwaway individual (`ZZTEST1`, `1 RESN confidential`) was inserted
   with a `NOTE @N3@` reference and a matching `wt_link` row, entirely
   additive to the real data. An anonymous visitor's request for `N3`
   flipped from 200 to **403** the moment this link existed — proving
   the override actually gates on linked-record privacy, not just
   passing by construction. The throwaway individual and link row were
   deleted immediately after (confirmed via a follow-up `SELECT`
   returning 0 rows), the real `N3` and its real 8 individual links
   were never touched.
3. 404 (nonexistent note xref) vs. 302 (nonexistent tree) status codes
   confirmed live.
4. All disposable test fixtures (2 test users across two verification
   runs, their settings/session rows, the throwaway individual/link)
   deleted afterward; `data/config.yaml` restored via the trap-guarded
   script, confirmed via `grep dbhost` after both runs.
