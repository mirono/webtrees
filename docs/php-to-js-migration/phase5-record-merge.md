# Phase 5 step 45: Record merging (`/tree/{tree}/merge-step1`, `-step2`)

**Done 2026-11-12.** A two-step admin wizard for merging two records of
the same type into one - the first feature in this migration that
needed to go through real PHP's per-record pending-changes path, not
a bulk/admin-only direct-write operation.

## Routes ported

| Route | Real PHP handler |
|---|---|
| `GET/POST /tree/{tree}/merge-step1` | `MergeRecordsPage`/`MergeRecordsAction` |
| `GET/POST /tree/{tree}/merge-step2` | `MergeFactsPage`/`MergeFactsAction` |

AuthManager-gated for the specific tree, same as tree management and
GEDCOM import/export - see `authenticateTreeManager()`.

## Scope, per the user's explicit choices

- **`auto_accept_edits` is fully honored**, not bypassed. A merge
  always writes a real `wt_change` pending-change row first, exactly
  like real PHP's `GedcomRecord::updateRecord()`/`deleteRecord()` -
  this is NOT one of this migration's bulk admin operations (tree
  renumber/delete/merge), which write directly to live tables and skip
  `wt_change` entirely. Record merge goes through the same per-record
  edit path a normal fact edit would in real PHP, and this port
  preserves that distinction deliberately. Only when the acting user's
  own `auto_accept_edits` preference (`wt_user_setting`) is `'1'` is
  the pending change immediately replayed into live tables; otherwise
  it sits as a genuine pending change, visible to a moderator once
  that review UI is built in a later step.
- **Full two-step wizard**, matching real PHP's fact-level
  granularity: step 1 picks two same-type records; step 2 shows the
  real 3-bucket fact comparison (facts identical in both / only in
  record1 / only in record2, individually checkbox-selectable,
  pre-checked) and commits with exactly the facts chosen.
- **UI simplification, not a functional cut**: real PHP's step-1
  record pickers are live-search autocomplete widgets. This port uses
  plain `<select>` dropdowns listing every record of the chosen type
  instead - same end result, simpler to build for an admin-only,
  occasional-use feature.

## Architecture

`pages-server/record-merge.mjs` is the data/logic layer;
`pages-server/record-merge-view.mjs` renders both wizard steps and the
result page. Two small, reusable helpers were added to
`pages-server/gedcom-import.mjs` and exported for reuse here:
`insertTypedRecord()` (already existed, now exported) and
`deleteRecordRows()` (new - the per-record counterpart of
`clearTreeData()`'s whole-tree wipe, mirroring the DELETE phase of
`GedcomImportService::updateRecord()`). Together they let merge replay
an auto-accepted pending change (delete old rows, optionally reinsert
new ones) without duplicating the import pipeline's insert logic.

Real correctness details worth flagging (confirmed by reading real PHP
directly, not assumed):

- **Fact matching is exact md5 of the whole level-1 fact block**, not
  semantic - a fact differing by even one character shows up as "only
  in record1" AND "only in record2" (both pre-checked), never
  recognized as "the same fact". Replicated exactly, matching real
  PHP's own `Fact::id()` = `md5($gedcom_fact)`.
- **The merged record's body is record1's kept facts (its own
  order), then record2's kept facts (its own order) appended after** -
  no interleaving, no sub-field-level merge. A fact is kept wholesale
  or dropped wholesale.
- **`allLinkedXrefs()` unions the committed `wt_link` table with any
  record whose LATEST pending change textually mentions `@xref2@`** -
  a `wt_link`-only query would miss in-flight edits that introduce a
  new link to the record being merged away.
- **Each linking record's gedcom is rewritten with a plain substring
  swap, then a generic exact-duplicate-level-1-block collapse** - a
  direct translation of real PHP's own regex, handling the case where
  a linking record already pointed at both xref1 and xref2 via two
  separate facts (which would otherwise leave two identical facts
  behind after the swap).
- **`wt_user_gedcom_setting`, `wt_block`, `wt_favorite` are repointed
  directly; `wt_hit_counter` rows are SUMMED per `page_name` onto
  xref1, then xref2's rows are deleted outright** (not just
  repointed) - matching real PHP's `MergeFactsAction` exactly.
- **8 record types are mergeable**: individual/family/source/
  repository/note/media/submitter/location (`_LOC`, stored in
  `wt_other`) - matching real PHP's step-1 dropdown.
- **CHAN is only updated for types in `Gedcom::RECORDS_WITH_CHAN`**
  (INDI/FAM/SOUR/REPO/NOTE/OBJE/SUBM) - `_LOC` records never get a
  CHAN event, matching real PHP.
- Self-merge, type-mismatch, and already-pending-deletion guards are
  re-checked independently at both step 1 and step 2 submission -
  same defense-in-depth real PHP's 3 handlers each perform.
- Deliberate scope cut: fact-bucket comparison uses each record's
  current ACCEPTED gedcom only, not merged with that record's own
  separate uncommitted pending edit (a rare case: editing record1 or
  record2 while a merge of it is also in flight). Real PHP's
  `facts()` would merge those in; this port doesn't reproduce that
  narrow edge case.

## Live verification

Validated directly against Postgres (module-level, both
`auto_accept_edits=true` and `=false` cases) before building the HTTP
layer, using a disposable test tree with two "duplicate" individuals
(shared NAME/SEX facts, one with an extra OCCU) and a family linking to
one of them via HUSB:

- `auto_accept_edits=true`: merge applied immediately - surviving
  record's live gedcom includes the kept OCCU fact plus a fresh CHAN
  stamp; the merged-away record's row was deleted; the linking
  family's `f_husb` and raw gedcom were both repointed to the
  survivor; no `wt_link` rows remained referencing the deleted xref;
  all 3 `wt_change` rows (family's link update, survivor's merge
  update, deleted record's delete) ended up `status='accepted'`.
- `auto_accept_edits=false`: merge call succeeded, but live tables
  were completely untouched (the deleted individual was still present,
  the family still pointed at it) - exactly 3 `wt_change` rows were
  inserted, all `status='pending'`, including a genuine pending
  delete (`new_gedcom=''`) for the merged-away record, and
  `isPendingDeletion()` correctly reported `true` for it afterward.

Exercised end to end over real HTTP (proxy on port 8000, disposable
tree + disposable session, real user whose own `auto_accept_edits` is
off): step 1's type-dropdown and record pickers rendered correctly;
step 1 → step 2 redirect carried xref1/xref2; step 2 correctly bucketed
NAME/SEX as "both" (pre-checked) and OCCU as "only in record2"
(pre-checked); submitting step 2 produced the "pending changes,
awaiting moderation" result message, and direct inspection confirmed
the 3 real pending `wt_change` rows existed with live tables
untouched; self-merge, type-mismatch (individual vs. family), and
already-pending-deletion (re-merging the just-merged-away record) were
each correctly rejected with the real PHP's own error messages.
