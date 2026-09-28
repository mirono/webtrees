# Phase 5, step 15: `/tree/{tree}/repository/{xref}` (RepositoryPage)

**Status: done and verified live (2026-09-27), against a real user-imported GEDCOM tree.**

## What this is

The fourth route serving real GEDCOM record data, and the smallest one
yet: title (from `NAME`) plus a facts table matching real PHP's own
tag-agnostic `record-page-details.phtml` (the same shared template
already ported for SourcePage — see
[phase5-source-page.md](phase5-source-page.md)'s own "Follow-up fix"
for why that means every real fact, not a curated subset). No
linked-source reverse-lookup section, no slug canonicalization — same
"shell + narrow slice" precedent as every step so far.

## Why this was the natural next step

Almost everything this route needs was already built while porting
SourcePage, since a source's own privacy chain requires checking every
repository it cites: `loadRepository()`, `repositoryCanShowRecord()`
(Repository has no `canShowByType()` override at all — base
`GedcomRecord::canShowByType()` applies unmodified, confirmed by
`app/Repository.php`'s own near-empty class body), and the `_HEB`/
`CALN`-style `otherFactAttributes()` fallback machinery. This step
only needed to add the record's own facts-table scope
(`displayableRepositoryFacts()`/`repositoryFactOtherAttributes()` in
`source.mjs`, alongside Source's own — the file already owned
Repository's privacy/loading, so its own facts-table scope belongs
there too) and the route/view/handler plumbing.

## Facts table scope

Repository's real element set (`app/Gedcom.php`): `NAME` (labeled
"Name", not "Repository name" — confirmed via the real
`I18N::translateContext('Repository', 'Name')` call), `ADDR`, `PHON`,
`EMAIL`, `FAX`, `WWW`, `REFN`, `RIN`, `CHAN`. `NOTE` is the one
deliberate exclusion, same reasoning as Source's own NOTE cut.

**EMAIL and WWW are the two exceptions to "plain value" rendering**:
confirmed by reading `AddressEmail::value()`/`AddressWebPage::value()`
directly — EMAIL renders as a `mailto:` link, WWW as an external link.
Everything else (`ADDR`, `PHON`, `FAX`, `REFN`, `RIN`) is plain text,
reusing `factPlainValue()` (CONT/CONC-merged, so a real multi-line
address renders correctly with `<br>`).

## Implementation

- **`pages-server/source.mjs`**: gained `displayableRepositoryFacts()`
  and `repositoryFactOtherAttributes()` alongside its existing
  `loadRepository()`/`repositoryCanShowRecord()` — this file already
  owned Repository's privacy/loading (needed for Source's own
  privacy cascade), so its facts-table scope belongs there too rather
  than a separate file.
- **`pages-server/repository-view.mjs`** (new): `renderRepositoryPage()`,
  same hand-rolled-HTML convention as every prior view (`dir="ltr"`,
  `escapeHtml()`, CSRF meta tag only when logged in, real `fact.phtml`
  class names, the same `wt-fact-other-attributes` sub-tag mechanism
  as Source/Individual).
- **`pages-server/routes.mjs`** / **`proxy/routing.mjs`**:
  `matchRepositoryPagePath()` / `isRepositoryPagePath()`, same
  exact-shape convention as every prior record-page matcher.
- **`pages-server/index.mjs`**: `handleRepositoryPage()` — the
  simplest handler of the four record-page routes yet: load →
  `repositoryCanShowRecord()` (no citation cascade to resolve, unlike
  Source) → extract displayable facts → render. 404 for a nonexistent
  repository xref, 403 if the gate denies, 302 for a nonexistent tree.

## Verification

**Unit tests**: `source.mjs`'s test file gained coverage for
`displayableRepositoryFacts()` (keeps NAME/ADDR/PHON/EMAIL/FAX/WWW/
REFN/RIN/CHAN, drops NOTE) and `repositoryFactOtherAttributes()` (raw
`REPO:TAG:subtag` fallback, `_WT_USER` exclusion). New
`pages_server_repository_view.test.js` covers the view layer,
including the EMAIL/WWW link rendering and the other-attributes
mechanism. Route-matcher tests added to both `pages_server_routes.test.js`
and `proxy_routing.test.js`. Full JS suite: **4538 tests, green**
(4506 + 32 new).

**Live verification** — against the real, user-imported "ophir" tree,
using the established trap-guarded `data/config.yaml` swap script (see
[[feedback-config-yaml-swap-safety]]):
1. `R3` ("Israel State Archives") renders correctly for a disposable
   member-level test user: real Name (with its own `_HEB`
   transliteration sub-attribute), a real multi-line Address (CONT-
   joined, rendered with `<br>`), Phone, and Last change with author —
   independently cross-checked against the raw `o_gedcom` row.
2. This tree has a tree-wide `REPO` privacy restriction (already
   discovered while building SourcePage) — confirmed an anonymous
   visitor correctly 403s on the same repository.
3. 404 (nonexistent repository xref) vs. 403 (denied) vs. 302
   (nonexistent tree) status codes all confirmed live.
4. All disposable test fixtures (1 test user, its settings/session
   rows) deleted afterward; `data/config.yaml` restored via the
   trap-guarded script, confirmed via `grep dbhost` after.
