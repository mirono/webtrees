# Phase 5, step 11: IndividualPage "Families" section

**Status: done and verified live (2026-09-22).**

## What this is

Closes the navigation loop the other way: FamilyPage (step 10) already
links each member card to their own `/tree/{tree}/individual/{xref}`
page, but until now an individual's own page had no way to reach the
families they belong to at all. This step adds a "Families" section
to IndividualPage listing the individual's parent family (or families)
and spouse family (or families), each linking to the now-real
`/tree/{tree}/family/{xref}` page.

This is a deliberately narrow port of `RelativesTabModule`
(`app/Module/RelativesTabModule.php`) — a flat list of family links,
not the full per-member chart-box + relationship-name rendering
`modules/relatives/family.phtml` does (that would mean re-embedding
FamilyPage's own member cards inline, a bigger lift than this step's
scope). No step-families (adoption-driven second parent/spouse sets —
`Individual::spouseStepFamilies()`/`childStepFamilies()`, a rarer
relationship type), no `SHOW_PRIVATE_RELATIONSHIPS` bypass (same
accepted, display-only cut already made for FamilyPage's own cards).

## Key finding: `wt_link`, a ready-made fact-target index

Rather than regex-scanning every family's `f_gedcom` for a
`1 CHIL @I1@` match (the only way to find an individual's *parent*
families, since `wt_families` has no denormalized column for that,
unlike `f_husb`/`f_wife`), the real schema already has a
general-purpose link/edge table for exactly this: `wt_link`
(`l_file`/`l_from`/`l_type`/`l_to`). Confirmed live it indexes **both**
directions of every relationship (e.g. both `I1 FAMS F1` from the
individual's own gedcom *and* the reciprocal `F1 HUSB I1` from the
family's) — a single indexed query (`WHERE l_file = ? AND l_from = ?
AND l_type IN ('FAMC', 'FAMS')`) replaces what would otherwise be a
full-table scan.

## Implementation

- **`pages-server/family.mjs`**: new `loadRelatedFamilyXrefs(pool, gedcomId, xref)`
  → `{parentFamilies: string[], spouseFamilies: string[]}` via `wt_link`.
- **`pages-server/index.mjs`**: new `resolveFamilySummary()` — reuses
  the *exact* member-resolution and family-level privacy chain
  `handleFamilyPage()` already uses (`resolveFamilyMember()`,
  `familyMemberViewModel()`, `familyCanShowRecord()`), since a family
  referenced from an individual's page needs the identical "every
  member must be showable" gate as visiting the family's own page
  directly — not a separate, weaker check. Returns `null` for a family
  that shouldn't be shown to this viewer at all, matching how
  `Individual::childFamilies()`/`spouseFamilies()` already filter via
  `canShow()` internally in real PHP (not something `IndividualPage`
  does as a separate step). `handleIndividualPage()` calls this for
  every related family xref and passes the surviving summaries
  (`{titleHtml, url}`) into the view model.
- **`pages-server/individual-view.mjs`**: new `renderFamiliesSection()`,
  reusing the real `wt-facts-table`/`table table-sm` wrapper classes
  (visually consistent with the vital-facts table below it) rather
  than inventing new ones — the lesson from this session's earlier
  invented-CSS-class bugs applied proactively this time.

## Verification

**Unit tests**: `pages_server_family.test.js` gained tests for
`loadRelatedFamilyXrefs()` (FAMC/FAMS separation, empty case).
`pages_server_individual_view.test.js` gained a `describe('the
Families section')` block (omitted when empty, "Parents"/"Spouse
family" labels, multiple families each on their own row). Full JS
suite: **4350 tests, green** (4344 + 6 new).

**Live verification** against the real imported tree, using the
established `data/config.yaml` localhost-swap-then-restore pattern and
a disposable test admin account (never the real `mirono` account):
1. Miron Ophir's own page (a living individual, admin-level access via
   the disposable test account) correctly shows his parent family
   (Raphael Ophir + Sara Granek) and his own spouse family (Miron
   Ophir + Yael Ryvka Koblinsky), both linking to the real, already-
   working `/tree/{tree}/family/{xref}` pages — followed both links,
   confirmed `200`.
2. Anonymous visit to the same page correctly 403s (Miron is a living
   individual, already gated at the record level — the same privacy
   chain from step 9, not something new this step could bypass).
3. Anonymous visit to a publicly-visible deceased individual (Arie
   Leib Gutgold, already used in step 10's own verification) correctly
   shows both his parent family and spouse family without needing to
   be logged in at all — confirming the per-family privacy gate is
   independently correct for the common "public record" case, not
   just the has-a-test-account case.
4. Disposable fixtures cleaned up afterward; `data/config.yaml`
   restored; local test server processes killed.

## Docker note

Same as every prior `pages-server` step: **needs `docker compose
restart pages`** to pick up these changes in the live stack.
