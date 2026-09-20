# Phase 5, step 9: `/tree/{tree}/individual/{xref}` (IndividualPage)

**Status: done and verified live (2026-09-20).**

## What this is

The first Node route to touch real GEDCOM record data (not just user/
session/tree-listing data), and the first that needs a genuinely
nontrivial privacy/access-control chain — a wrong cut here can leak a
living person's private data, not just misrender a page. The previous
step (`/tree/{tree}`) ships a "Default individual" link into this
route; before this step, that link pointed at a still-PHP-served page.

Given the stakes, this step used more scrutiny than any prior one: 3
parallel research passes (identity/name/age rendering; the fact-tab
rendering pipeline; the privacy/access-control layer), a dedicated
Plan-agent design pass, and a manual verification pass against
`app/Individual.php`/`app/GedcomRecord.php` that caught and corrected
**two** real flaws in the design before any code shipped (see "Bugs
found and fixed before shipping" below) — plus a third, purely
cosmetic finding about how `wt_individuals.i_gedcom` is actually
stored, caught during live verification.

## Scope (v1)

**Ships**: identity header (name, sex, lifespan year-range, age
string) + a flat list of the individual's own vital-event facts
(BIRT/CHR/BAPM/DEAT/BURI/CREM — exactly `Gedcom::BIRTH_EVENTS`/
`DEATH_EVENTS`, already load-bearing for date/lifespan math regardless
of display) with date+place, RESN-filtered. Full `canShowRecord()`/
`canShowByType()` privacy chain (with one intentional, proven-safe
substitution — see below).

**Cut, all in the "reduce what's shown, never what's protected"
direction**:
- No tabs (Relatives/Notes/Sources/Media), no sidebars, no clipboard,
  no shares, no chart links.
- No MARR — it lives on a Family record (`wt_families.f_gedcom`) with
  its own separate `Family::canShowByType()` privacy chain, a second
  record type entirely, same class of cut as TreePage's "Default
  chart" link.
- No slug canonicalization/301 redirect. Real PHP always 301s a
  slug-less/wrong-slug URL to the canonical one (confirmed live — see
  below); Node always renders 200 regardless of the trailing segment.
  Building a pure-JS ICU-transliteration equivalent for
  `SlugFactory::make()` risks silent divergence for non-Latin names, a
  class of approximation this migration avoids elsewhere.
- No `Date::display()` — fact rows show the raw GEDCOM date string
  (e.g. `01 JAN 1850`) rather than a locale-rendered one; lifespan uses
  year-only via `GedcomDate`'s existing `yearValue()`. `Date::display()`
  (multi-calendar rendering, qualifier phrasing) was explicitly out of
  scope in the original `lib/date`/`lib/gedcom-date` porting phase and
  deserves its own future task.
- `isDead()`'s family-graph fallback (checking parents'/spouses'/
  children's own dated events when this individual has none) is not
  ported — proven safe: `isDead()` returning `false` when PHP would say
  `true` only means the privacy chain skips *past* the dead-people-show
  branch into the stricter default, never the reverse.

## Privacy chain — the security-critical core

Mirrors PHP's own function names/order for auditability:
`canShowRecord()` (`GedcomRecord::canShowRecord()`,
`app/GedcomRecord.php:950-992`) → `HIDE_LIVE_PEOPLE` off → show;
self-record exception → show; inline `1 RESN` tag → show/deny per
level; a `wt_default_resn` row for this xref → show/deny; admin bypass
→ show; else `canShowByType()` (`Individual::canShowByType()`,
`app/Individual.php:101-142`) → `SHOW_DEAD_PEOPLE` + `isDead()` (with
the real `KEEP_ALIVE_YEARS_BIRTH`/`_DEATH` override, ported and
scanning **every** matching birth/death fact, not just the primary
display date) → show; else the relationship-privacy gate (see below);
else member-only default. Fact-level privacy
(`Fact::canShow()`, `app/Fact.php:198-238`) is checked separately per
rendered fact, fact-specific `wt_default_resn` rows overriding
tree-wide ones.

## Bugs found and fixed before shipping

**1. The relationship-privacy gate was not a safe cut as originally
proposed.** The initial design (from a Plan-agent pass) proposed
skipping `isRelated()` — PHP's family-graph BFS for relationship-
distance privacy — entirely, always falling through to the plain
member-only default. Verified directly against `app/Individual.php:
129-142` before implementing and found this **was not actually safe**:
`RELATIONSHIP_PATH_LENGTH` is a **per-viewer, per-tree** setting
(`wt_user_gedcom_setting`, confirmed via `Tree::getUserPreference()`),
and whenever a viewer has both a linked `gedcomid` *and* a nonzero
path length, PHP **replaces** the member-only default with
`isRelated()`'s result via an early `return` — meaning an unrelated
member-level viewer gets *denied* by PHP in that case, not shown. The
originally-proposed cut would have shown that same viewer the record
instead — a real, if narrow (only triggers for a viewer who's
explicitly set this preference), leak. Fixed: when a viewer has both a
linked `gedcomid` and `RELATIONSHIP_PATH_LENGTH > 0`, Node denies
outright rather than guessing at `isRelated()`'s result — a proven-safe
upper bound (`isRelated() ∈ {true, false}`, denying is always `<=`
showing). Verified live (below) that this exact scenario now correctly
403s where it would have wrongly 200'd under the original design.

**2. The `KEEP_ALIVE_YEARS_BIRTH`/`_DEATH` override was dropped
entirely in the first implementation pass**, not just narrowed —
caught while writing the code, not during design review. This override
is not one of the accepted scope cuts; skipping it could show a record
PHP would still keep private (a recently-born or recently-deceased
individual, even though `SHOW_DEAD_PEOPLE`+`isDead()` would otherwise
permit showing them). Fixed by porting it properly, scanning **every**
matching birth/death-tagged fact for a recent date (not just the
single "primary" fact used for display) — matching PHP's own
`preg_match_all` scan exactly, since a secondary fact (e.g. both `BIRT`
and `CHR`) could carry the recent date even when the primary one
doesn't.

**3. A stale assumption about `wt_individuals.i_gedcom`'s stored
shape**, caught during live verification against a real row: an
earlier doc comment claimed the column excludes the record's leading
`"0 @Xn@ INDI"` line. It doesn't — confirmed live via `psql` that the
line is present. This didn't cause an actual bug (every fact-tag
lookup in this port requires an exact `"1 TAG"` prefix, which the
`"0 ..."` block never satisfies, so it's silently and harmlessly
ignored everywhere), but it did retroactively resolve a separate
theoretical concern noted during design about `isDead()`'s direct-tag
regex potentially diverging from PHP's own newline-anchored one for a
hypothetical "DEAT as the record's literal first fact" case — since
every real record's first level-1 fact is always preceded by the `"0
..."` line, that edge case cannot actually occur.

## Route matching

`/tree/{tree}/individual/{xref}{/slug}` needs its own matcher shape,
distinct from both the prefix-matched routes (steps 2-7) and
`/tree/{tree}`'s exact-match (step 8): an extra required segment, with
an optional trailing slug accepted and ignored. `pages-server/routes.mjs`'s
`matchIndividualPagePath()` and `proxy/routing.mjs`'s
`isIndividualPagePath()` both confirm via grep that no PHP action route
lives literally under `/individual/{xref}/...` (edit/delete/add-*
actions use distinct prefixes like `/add-child-to-individual/{xref}`)
and that sibling record types (`/family/{xref}`, `/media/{xref}`, ...)
use a different literal segment — so neither pattern can accidentally
swallow either.

## Verification

**Unit tests** (all mocked `pool`, no live DB): `pages_server_individual.test.js`
(64 tests) covers name parsing (including several real PHP quirks
faithfully reproduced — a literal, non-regex `str_replace` no-op on
GIVN; the greedy multi-surname GIVN-derivation regex; `Mc`/`Mac`
normalization), the full privacy-chain branch set (every RESN level at
every access level, the self-record exception, the corrected
relationship gate specifically, the `KEEP_ALIVE_YEARS_BIRTH` override
including the "secondary fact carries the recent date" case), and the
DB-query functions. `pages_server_individual_view.test.js` (9 tests)
covers the view layer. `pages_server_routes.test.js`/`proxy_routing.test.js`
gained matcher tests including the sibling-route negative cases. Full
JS suite: **4282 tests, green** (4194 + 88 new).

**Live verification** (the established `data/config.yaml`
localhost-swap-then-restore pattern, this time running both a local
`pages-server` *and* a local `php -S` sharing the real Postgres
database, disposable fixtures only, never the real admin `mirono`
account):
1. Anonymous visit to the real "ophir" tree's only individual (`X1`,
   "John DOE", born 1850) — name, lifespan, and the `BIRT` fact all
   rendered correctly, traced directly against the real `i_gedcom` row.
2. Cross-checked the slug-less redirect target against a locally-run
   `php -S` instance sharing the same database: confirmed the same
   `301` → correct-slug behavior as the prior TreePage step, and that
   PHP's own router reaches `wt-route-IndividualPage` for the resolved
   URL (PHP's actual page render is currently blocked by an unrelated,
   pre-existing "fact-sorting service" dependency gap in this sandbox —
   confirmed via `git log`/grep this touches no file in this step's
   call path, same finding as the prior step).
3. RESN-restricted individual: inserted a disposable `wt_default_resn`
   row (`resn='confidential'`) — confirmed anonymous 403, member-level
   403, manager-level (`canedit='admin'`) 200 — then deleted the row.
4. Self-record exception: disposable test user with `gedcomid`
   pointing at the restricted individual — 200 for that user
   specifically, 403 before the preference was set.
5. Living individual under `SHOW_DEAD_PEOPLE`: inserted a disposable
   second individual (`X2`, recent birth date, no `DEAT`) — anonymous
   403 (member-only default), member-level 200.
6. **The corrected relationship-privacy gate, the exact scenario the
   fix exists for**: same member-level viewer as above, with
   `RELATIONSHIP_PATH_LENGTH` set to a nonzero value and `gedcomid`
   pointing at an unrelated individual — now correctly 403 (this would
   have wrongly been 200 under the original, uncorrected design).
7. 404 (nonexistent xref) vs. 403 (denied) vs. 302 (nonexistent tree)
   status-code distinction, all confirmed live.
8. All disposable fixtures (test user, session row, preference rows,
   `wt_default_resn` rows, the `X2` test individual) deleted afterward;
   `data/config.yaml` restored; both local test server processes killed.

## Docker note

Same as every prior `pages-server` step: **needs `docker compose
restart pages`** to pick up these changes in the live stack.
