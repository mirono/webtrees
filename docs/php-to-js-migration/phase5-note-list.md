# Phase 5, step 22: `/tree/{tree}/note-list` (NoteListModule)

**Status: done and verified live (2026-10-08), against a real user-imported GEDCOM tree.**

## What this is

The third **list** route this migration has ported, following step 20
(`RepositoryListModule`) and step 21 (`SourceListModule`).
`NoteListModule` (`app/Module/NoteListModule.php`) is the next-named
candidate in step 20's own "what's next" note - same small, generic
shape, reusing `note.mjs`'s existing `noteCanShowRecord()`/
`noteLinkedRecordsShowable()` privacy chain (built for the standalone
`NotePage` in step 16) and the module-gating pattern established in
steps 20-21 (`moduleAccessLevel()`), unchanged.

## The one real difference from steps 20/21: the default access level

Unlike `RepositoryListModule`/`SourceListModule`, `NoteListModule` sets
NO `$access_level` property of its own - `AbstractModule`'s own class
default applies: `Auth::PRIV_PRIVATE` = 2 ("visitor"), i.e. **open to
everyone, including anonymous visitors**, not member-gated. Confirmed
by reading `AbstractModule.php:41` directly rather than assuming every
list module shares Repository/Source's member-only default.
`moduleAccessLevel()`'s own default-level PARAMETER (already generic
since step 20) just needed a `2` passed in here instead of `1` - no
code change to the function itself. Live-verified both ways: the
real tree has no `wt_module_privacy` override row for `note_list`, so
an anonymous visitor gets 200 by default; a temporary, disposable
override row (`access_level = 1`, member-only) correctly 403s the same
anonymous request, then removed, confirming the row itself (not some
anonymous-always-wins shortcut) drives the result.

## Title column: reuses NotePage's own "first line of text" derivation

Real PHP's `Note::extractNames()` converts the note's Markdown/autolink
HTML to plain text and takes the first 100 characters of the first
non-empty line as its "name" - already simplified for step 16's
`NotePage` (`noteText()` + plain-text truncation via `limitText()`,
since Markdown/autolink rendering was deliberately not ported). The
list's own Title column reuses that exact same derivation unchanged,
not a second copy of similar logic.

## Four linked-record counts, no "Notes" column (obviously)

`resources/views/lists/notes-table.phtml` is structurally identical to
`sources-table.phtml`'s own DataTables pattern, but counts
Individuals/Families/Media objects/Sources (not Abbreviation/Author/
Publication - Notes don't have those). Same deliberate simplification
as steps 20-21: a plain, always-visible table; same deliberately
privacy-bypassing `COUNT(*) ... GROUP BY l_to` shortcut for each count,
reproduced as-is.

## Implementation

- **`note.mjs`** gained `loadNoteList()` (every shared note in the
  tree, ordered by xref, same reasoning as `loadRepositoryList()`/
  `loadSourceList()`), and `noteIndividualCounts()`/
  `noteFamilyCounts()`/`noteMediaCounts()`/`noteSourceCounts()` (one
  query per linked-record type, mirroring `notes-table.phtml`'s own
  four count queries).
- **`note-list-view.mjs`** (new): `renderNoteListPage()`, same
  hand-rolled-HTML convention as `repository-list-view.mjs`/
  `source-list-view.mjs`.
- **`pages-server/routes.mjs`** / **`proxy/routing.mjs`**:
  `matchNoteListPagePath()` / `isNoteListPagePath()` - same exact-match
  shape as the prior two list routes.
- **`index.mjs`**: `handleNoteListPage()` reuses
  `noteCanShowRecord()`/`noteLinkedRecordsShowable()`/`noteText()`/
  `recordLastChange()` (the last two already generic, from `note.mjs`
  and `source.mjs` respectively) unchanged, applied per note in a loop,
  plus the same module-gating checks as steps 20-21 (module name
  `note_list`, default level `2` this time).

## A deployment gotcha worth remembering: `proxy` ALSO needs a restart

Known already for `pages` (bind-mounted source, but the running Node
process caches its module graph at startup) - this step is the first
to show the SAME is true of `proxy`: `docker compose restart pages`
alone left the route 404ing, because `proxy/routing.mjs`'s own
`isNoteListPagePath()` only took effect once `proxy` itself was
restarted too (`isNodeRoute()` runs inside the `proxy` process, not
`pages`). Both services needed a restart, not just the one that owns
the new handler.

## Verification

**Unit tests**: `note.mjs`'s test file gained coverage for
`loadNoteList()` and the four count functions (table-driven for all
four, since none has a NOTE-specific wrinkle this time). New
`pages_server_note_list_view.test.js` covers the view layer (row
rendering with all four counts, the "Never" case, the no-time case,
title escaping). Route-matcher tests added to
`pages_server_routes.test.js` and `proxy_routing.test.js`. Full JS
suite: **4759 tests, green** (4735 + 24 new).

**Live verification** - against the real, user-imported "ophir" tree
(which has exactly ONE real shared note, `N3`), via `docker compose`:

1. The one real note renders correctly: title "From Krzepice Book of
   Residents CRARG:" (first line of its real text, truncated/escaped
   correctly), individual-count 8 cross-checked against the raw
   `wt_link` `GROUP BY` query exactly, correctly formatted `CHAN`
   date/time.
2. **Module access-level gating confirmed both directions, using a
   disposable `wt_module_privacy` override row** (no pre-existing
   override exists in the real tree, unlike steps 20-21's member-only
   default): anonymous visitor gets 200 by default (no override row);
   inserting a temporary member-only override row (`access_level = 1`)
   correctly 403s the same anonymous request; removing the row restores
   200 - proving the override mechanism itself, not just one static
   outcome.
3. 302 (nonexistent tree) confirmed live.

## What's next for the "list" family

`FamilyListModule`/`MediaListModule` remain, same shape.
`SubmitterListModule` still disabled in this tree.
`AbstractIndividualListModule` remains its own, larger,
separately-planned undertaking (see step 20's own note).
