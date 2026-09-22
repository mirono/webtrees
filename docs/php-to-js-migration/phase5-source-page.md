# Phase 5, step 13: `/tree/{tree}/source/{xref}` (SourcePage)

**Status: done and verified live (2026-09-22), against a real user-imported GEDCOM tree.**

## What this is

The third route serving real GEDCOM record data, and the first that
isn't Individual or Family: title heading (from `TITL`) plus a facts
table matching real PHP's own record-page-details.phtml exactly — see
"Follow-up fix" below for why that means every real fact
(`TITL`/`AUTH`/`PUBL`/`ABBR`/`TEXT`/`REPO`/`CHAN`), not a curated
subset. No linked-record reverse-lookup section (which individuals/
families/media cite this source — a separate, real PHP feature), no
slug canonicalization — same "shell + narrow slice" precedent as every
step so far.

## Key finding: Source's real privacy chain is the simplest yet

`Source` extends `GedcomRecord` and shares its `canShowRecord()`
verbatim, same as `Individual`/`Family` — only `canShowByType()`
differs. `Source::canShowByType()` (`app/Source.php:36-49`) turned out
simpler than either: no relationship-BFS, no keep-alive-years logic, no
dead-people branch at all — just "every referenced repository
(`1 REPO @Rn@`) must itself be showable, else hide the source; else
fall back to the base per-record-type default." `Repository` itself
has **no override at all** — it uses base
`GedcomRecord::canShowByType()` (`app/GedcomRecord.php:841-852`)
directly.

The base `canShowByType()`'s own default (public unless a tree-wide
`wt_default_resn` row exists for that record type — `tag_type = 'SOUR'`
or `'REPO'`, `xref IS NULL`) is a genuinely different default from
`Individual::canShowByType()`'s member-only default — confirmed by
reading the base method directly rather than assuming Source/Repository
inherit Individual's stricter behavior.

Both `repositoryCanShowRecord()` and `sourceCanShowRecord()` reuse the
same shared `canShowViaResnChain()` core already built for
Individual/Family (`pages-server/individual.mjs`), each supplying their
own `canShowByType` delegate — no new RESN/self-record/admin-bypass
logic needed.

## Data layer: repositories have no dedicated table

Unlike individuals/families/sources (`wt_individuals`/`wt_families`/
`wt_sources`, each with their own table), repositories are stored in
the generic `wt_other` table, discriminated by `o_type = 'REPO'`
(alongside `NOTE`/`SUBM`/`SUBN`/`HEAD`/`TRLR` rows) — confirmed live
against the real database (7 real `REPO` records, `R1`-`R7`).

`extractPrimaryName()` (built for Individual's `1 NAME` tag) was
generalized into `extractNameFromFact(gedcom, tag)`, reused here for
`1 TITL` — confirmed via a live smoke test that the underlying
`addName()` slash-parsing machinery degrades gracefully for plain text
with no name-slash syntax (just wraps the whole value in
`<span class="NAME">`).

## Scope cuts

- **No linked-record reverse-lookup section** — which individuals,
  families, or media cite this source is a real PHP feature
  (`SourceController`'s citation list) requiring its own query shape,
  out of scope for this v1.
- **No slug canonicalization/301 redirect**, same reasoning as every
  prior record-page step.
- **`TITL`/`NOTE`/`REPO` excluded from the rendered facts table** — the
  title is rendered in the page heading, not as a table row; `REPO`
  references drive the privacy chain but aren't rendered as their own
  fact row (no "linked repository" card in this v1); `NOTE` doesn't fit
  this simple date/place-shaped-or-plain-value renderer.

## Implementation

- **`pages-server/individual.mjs`**: `extractPrimaryName(gedcom)`
  generalized into `extractNameFromFact(gedcom, tag)` (exported), with
  `extractPrimaryName()` now a thin wrapper (`extractNameFromFact(gedcom, 'NAME')`).
- **`pages-server/source.mjs`** (new): `loadSource()` (reads
  `wt_sources.s_gedcom`), `loadRepository()` (reads `wt_other.o_gedcom`
  where `o_type = 'REPO'`), `repoXrefs()` (extracts every `1 REPO @Rn@`
  reference, mirroring `Source::canShowByType()`'s own scan),
  `displayableSourceFacts()` (`AUTH`/`PUBL`/`ABBR`/`TEXT`/`CHAN`
  allowlist), `repositoryCanShowRecord()` and `sourceCanShowRecord()`
  as described above.
- **`pages-server/source-view.mjs`** (new): `renderSourcePage()`, same
  hand-rolled-HTML convention as every prior view
  (`dir="ltr"`, `escapeHtml()`, CSRF meta tag only when logged in, real
  `fact.phtml` class names). Source facts are plain `VALUE` text
  (`AUTH`/`PUBL`/`ABBR`/`TEXT`), not `DATE`/`PLAC`-structured events
  like Individual/Family's — rendered via a `wt-fact-value` class
  rather than `wt-fact-place`. A fact's `value` may contain embedded
  newlines (joined `CONT`/`CONC` continuation lines, e.g. for a long
  `TEXT` transcription) — rendered as `<br>` after escaping.
- **`pages-server/routes.mjs`** / **`proxy/routing.mjs`**:
  `matchSourcePagePath()` / `isSourcePagePath()`, same exact-shape
  convention as the individual/family-page matchers.
- **`pages-server/index.mjs`**: `handleSourcePage()` resolves the
  source, then each referenced repository via `loadRepository()` +
  its own scoped `loadDefaultResn()` call + `repositoryCanShowRecord()`,
  collects the per-repository `canShow` results, and calls
  `sourceCanShowRecord()` for the overall page gate. A new
  `sourceFactValue()` helper joins `CONT`/`CONC` continuation lines for
  each displayable fact. 404 for a nonexistent source xref (distinct
  from a nonexistent tree's 302), 403 if the gate denies.

## Verification

**Unit tests**: `pages_server_source.test.js` (19 tests) covers
`loadSource()`, `loadRepository()`, `repoXrefs()`,
`displayableSourceFacts()`, and both `repositoryCanShowRecord()`/
`sourceCanShowRecord()`'s full branch sets (tree-wide default-resn
rows, inline RESN on the record itself, the "any one hidden repo hides
the whole source" rule, admin bypass). `pages_server_source_view.test.js`
(12 tests) covers the view layer, including the CONT-continuation
joining and CHAN's split date/time spans. Route-matcher tests added to
both `pages_server_routes.test.js` and `proxy_routing.test.js`. Full JS
suite: **4394 tests, green** (4352 + 42 new).

**Live verification** — against the real, user-imported "ophir" GEDCOM
tree, using the established `data/config.yaml` localhost-swap-then-
restore pattern:
1. This tree has tree-wide `wt_default_resn` rows for both `SOUR` and
   `REPO` (`resn = 'privacy'`, i.e. members+ only) — confirmed an
   anonymous visitor correctly 403s on every source tested (`S000001`,
   a plain `TITL`+`CHAN` source with no repository; `S473`, which
   references repository `R3`).
2. A disposable member-level test user (`nodetest_src`, `canedit =
   'access'` on this tree — never the real `mirono` account) correctly
   sees both: `S473` renders "Department Of Immigration" with its real
   `AUTH` ("Government Of Palestine") and `CHAN` (date December 30,
   2017, time 17:45:44, author "miron") — independently cross-checked
   against the raw `s_gedcom` row via `psql`.
3. `S453` (real data with a multi-line `TEXT` fact using two `CONT`
   continuations, in Hebrew) rendered correctly with all three lines
   joined by `<br>` — confirming `sourceFactValue()`'s continuation
   handling against real data, not just synthetic test fixtures.
4. A disposable xref-scoped `wt_default_resn` row (`S473`, `resn =
   'hidden'`) correctly 403s **even for the admin test user** — this
   matches `canShowViaResnChain()`'s real, already-verified branch
   order (an xref-specific RESN decides before the admin-bypass check
   is ever reached), not a new bug introduced by this step.
5. A disposable admin test user (`nodetest_src_admin`, `canadmin =
   '1'`) correctly bypasses the tree-wide `SOUR` privacy restriction.
6. 404 (nonexistent source xref) vs. 403 (denied) vs. 302 (nonexistent
   tree) status codes all confirmed live.
7. All disposable fixtures (2 test users, their settings/session rows,
   the temporary xref-scoped RESN row) deleted afterward;
   `data/config.yaml` restored; the local test server process killed.

## Follow-up fix (2026-09-22, after real-world use)

Once the user actually visited `/tree/ophir/source/S473` in the app UI,
they reported the page was "not showing the source title and the
Repository like in the original screen." Reading
`resources/views/record-page-details.phtml` (the real template
`SourcePage` uses) directly revealed the root cause: it renders `$record
->facts([], true)` — an **empty** `$filter` array
(`app/GedcomRecord.php:552-570`), meaning EVERY fact on the record
becomes its own table row, filtered only by privacy, never by tag. The
v1 `SOURCE_FACT_TAGS` allowlist (`AUTH`/`PUBL`/`ABBR`/`TEXT`/`CHAN`)
had silently dropped both `TITL` (shown a second time as its own "Title"
row, in addition to the page heading — confirmed this exact duplication
is genuinely what real PHP renders, not assumed) and `REPO` entirely —
the same class of "narrow allowlist becomes a real gap" mistake already
found and fixed twice before, for FamilyPage's facts table (step 10's
follow-up) and IndividualPage's (step 12).

Unlike those two steps, though, this isn't a case where a *denylist*
was correct and the allowlist just needed widening to match: Source's
real template has **no exclusions of any kind** (it has no tabs to
route other tags to, unlike Individual/Family) — so `TITL`/`REPO`
joined the allowlist as real rows rather than the allowlist being
dropped for a denylist. `NOTE` remains the one deliberate omission
(needs its own shared-note-record rendering this simple renderer
doesn't have yet).

`REPO`'s real rendering (`app/Elements/XrefRepository.php` →
`AbstractXrefElement::valueXrefLink()`) is a link to the repository's
own page with its name as the link text — not a plain value. Since a
Node `RepositoryPage` doesn't exist yet, the link correctly points at
the still-PHP-served `/tree/{tree}/repository/{xref}` route via the
existing `phpRouteUrl()` helper (same convention already used for
other still-PHP links, e.g. `/register/{tree}`), which proxies through
to PHP unchanged. `handleSourcePage()` already loads every referenced
repository for the privacy check, so resolving its real name (via
`extractNameFromFact(repository.gedcom, 'NAME')`) needed no new query
— only a small map built during that existing loop, populated only for
repositories that actually passed `repositoryCanShowRecord()` (a hidden
repository's name is never leaked through this row, even though
`Source::canShowByType()`'s own gate already makes that case
unreachable — a source is hidden entirely the moment any one of its
repositories is hidden, so this is a belt-and-braces guard, not a
load-bearing check).

Live-verified against `S473` again: the facts table now shows Title
("Department Of Immigration"), Author, **Repository** (a real link to
"Israel State Archives", `R3`'s actual name — cross-checked against the
raw `o_gedcom` row), and Last change, matching the original PHP page's
real content. The repository link's own target 500s through the live
PHP app in this dev sandbox — confirmed this is the same pre-existing,
unrelated "fact-sorting service" dependency gap already noted for
FamilyPage/IndividualPage's own PHP cross-checks in prior steps, not
something this fix introduced. Full JS suite: **4397 tests, green**
(4394 + 3 new).
