# Phase 5, step 21: `/tree/{tree}/source-list` (SourceListModule)

**Status: done and verified live (2026-10-08), against a real user-imported GEDCOM tree.**

## What this is

The second **list** route this migration has ported, following step
20's `RepositoryListModule`. `SourceListModule`
(`app/Module/SourceListModule.php`) is the next-named candidate in that
module's own "What's next for the 'list' family" note — same small,
generic shape, reusing almost all of its data/privacy infrastructure
from `source.mjs` (built for `SourcePage`/`RepositoryPage` already),
module gating from `moduleAccessLevel()`, and the module-enabled check
pattern, all unchanged from step 20.

## A richer table than Repository's own list

Real PHP renders this via `resources/views/lists/sources-table.phtml` —
structurally the same DataTables pattern as
`repositories-table.phtml`, but with more columns: besides the title
link and "Last change", it shows Abbreviation/Author/Publication (each
the source's own first `ABBR`/`AUTH`/`PUBL` fact, or blank) and FOUR
separate linked-record counts (Individuals/Families/Media
objects/Shared notes), not just one ("Sources" on the Repository list).
Same deliberate simplification as step 20: a plain, always-visible
table, no DataTables sort/search/conditional-column-hiding. The four
count queries are each a direct, unfiltered `COUNT(*) ... GROUP BY
l_to` over `wt_link` joined to the relevant table (`wt_individuals`/
`wt_families`/`wt_media`/`wt_other` filtered to `o_type = 'NOTE'`) —
reproducing the real template's own acknowledged privacy-bypassing
shortcut exactly, same reasoning as `repositorySourceCounts()`.

`Registry::elementFactory()->make('SOUR:PUBL')->value(...)` (real
PHP's Publication column) resolves to the generic default element (no
dedicated `SOUR:PUBL` class exists in `app/Elements/`) — i.e. plain
text, same as Abbreviation/Author's own plain `->value()` calls. No
special-casing needed.

## Implementation

- **`source.mjs`** gained `loadSourceList()` (every source in the
  tree, ordered by xref, same "DataTables sorts client-side" reasoning
  as `loadRepositoryList()`), `sourceIndividualCounts()`/
  `sourceFamilyCounts()`/`sourceMediaCounts()`/`sourceNoteCounts()`
  (one query per linked-record type, each mirroring
  `sources-table.phtml`'s own four separate count queries), and
  `firstFactPlainValue()` (a small generic helper: the first fact
  matching a given tag's plain value, or `''` — used for Abbreviation/
  Author/Publication).
- **`source-list-view.mjs`** (new): `renderSourceListPage()`, same
  hand-rolled-HTML convention as `repository-list-view.mjs`, with the
  extra columns added.
- **`pages-server/routes.mjs`** / **`proxy/routing.mjs`**:
  `matchSourceListPagePath()` / `isSourceListPagePath()` — same
  exact-match shape as `matchRepositoryListPagePath()`/
  `isRepositoryListPagePath()`.
- **`index.mjs`**: `handleSourceListPage()` reuses
  `sourceCanShowRecord()`/`repositoryCanShowRecord()`/`repoXrefs()`/
  `loadDefaultResn()`/`extractNameFromFact()` unchanged from
  `SourcePage`'s own privacy cascade (a source can be hidden by its own
  RESN chain OR by any referenced repository being hidden), applied per
  source in a loop, plus the same module-gating checks as step 20
  (module name `source_list`, same `Auth::PRIV_USER = 1` class
  default).

## Verification

**Unit tests**: `source.mjs`'s test file gained coverage for
`loadSourceList()`, the four count functions (table-driven for the
three identically-shaped individual/family/media counts, plus a
dedicated case for the NOTE one), and `firstFactPlainValue()`. New
`pages_server_source_list_view.test.js` covers the view layer (row
rendering with all four counts, abbreviation/author/publication
escaping, the "Never" case, the no-time case, title escaping).
Route-matcher tests added to `pages_server_routes.test.js` and
`proxy_routing.test.js`. Full JS suite: **4735 tests, green** (4708 +
27 new).

**Live verification** — against the real, user-imported "ophir" tree,
via `docker compose` (postgres/pages/proxy/app/migration all up), using
a disposable test user created directly via a Node/`pg` script run
inside the `pages` container (not `psql -v`, which chokes on bcrypt
hashes containing `$`), then logged in through the real `/login` route
to get a real session cookie:

1. **All 573 real sources render** (row count cross-checked: 574
   `<tr>` elements = 573 data rows + 1 header row; `wt_sources` has
   exactly 573 rows for `s_file = 1`). Real titles (including CJK and
   quoted-title cases, e.g. "The Hongkong Album…"), real Abbreviation/
   Author text (`S000021`: "Lee, P.C., "The Hong" / "Lee, Ping-chen",
   correctly HTML-escaped), real individual-count cross-checked against
   the raw `wt_link` `GROUP BY` query for `S000001` (1, matching
   exactly) and `S000021` (2, matching), real `CHAN` dates/times
   correctly formatted, sources with no `CHAN` fact showing "Never".
2. **Module access-level gating confirmed both ways**: an anonymous
   visitor correctly 403s (module default access level is
   member-only); a disposable member-level test user (`canedit =
   'access'` on the ophir tree) gets 200.
3. 302 (nonexistent tree) confirmed live.
4. The disposable test user and its `wt_log`/`wt_session`/
   `wt_user_setting`/`wt_user_gedcom_setting` rows all deleted
   afterward (the `wt_log` row written by the real `/login` flow's own
   authentication-log call wasn't anticipated by step 20's cleanup
   pattern and had to be added - a real `wt_log_user_id_foreign`
   foreign-key failure caught it immediately rather than leaving an
   orphaned row).

## What's next for the "list" family

`FamilyListModule`/`NoteListModule`/`MediaListModule` remain, all
sharing the same shape. `SubmitterListModule` is still disabled in
this tree. `AbstractIndividualListModule` remains its own, larger,
separately-planned undertaking (see step 20's own note).
