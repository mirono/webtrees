# Task 18 — Port `app/Services/FactSortService.php`

**Priority:** 18
**Complexity:** Medium (a real multi-phase array algorithm, not just a translation exercise)
**Status:** Done
**Unblocks:** None directly — highest-live-traffic port so far, a strong future bridge candidate once a real call site's data shape is worth round-tripping.

---

## What this port proves

`FactSortService::sort()` orders the facts shown on every individual and family page — the single most load-bearing sort in the whole app's page rendering, with more real call-site traffic than any previously-ported cluster: 5 active tab modules (`MediaTabModule`, `NotesTabModule`, `PlacesModule`, `IndividualFactsTabModule`, `SourcesTabModule`) plus the deprecated `Fact::sortFacts()` pass-through all depend on it directly.

---

## Scope

**File:** `app/Services/FactSortService.php` (255 lines, full file ported — no exclusions)
**Target:** `lib/services/fact-sort-service.js` (`class FactSortService`)
**Golden fixture:** `golden/fact_sort_service.json` (8 scenarios)
**Characterization test:** `tests/Unit/Services/FactSortServiceCharacterizationTest.php` (PHPUnit, stubs `Individual`/`Family` the same way task 12's `FactComparatorCharacterizationTest` does)
**Parity test:** `js-tests/parity_fact_sort_service.test.js`

Depends on the already-ported `FactComparator::byDate/byType/typeOrder` (task 12) — no new comparator logic needed, just orchestration around it.

---

## Fact shim shape (extends task 12's, doesn't replace it)

Reuses `lib/comparators/fact-comparator.js`'s existing shim exactly, adding one field:

```js
{
  tag: 'INDI:BIRT', value: '', id: 'birth', attributeDate: '12 JAN 1900',
  date: { qual1: '', minimumJulianDay: 2415032, maximumJulianDay: 2415032 },
  record: { xref: 'F1' } | null,   // null for individual-owned facts; { xref } for family-owned facts
}
```

PHP checks `$fact->record() instanceof Family` and, for grouping, `$existing->record() === $family` (object identity). Two facts belong to "the same family" in practice exactly when they share a family xref — using `record.xref` string equality here instead of relying on JS object reference identity makes shim construction far less fragile in tests without changing what the algorithm actually needs to know. Flagged as a trap to double-check during the pre-task survey; verified it doesn't change behavior anywhere in the characterized cases.

---

## The algorithm, and how it was verified (not just translated)

Five phases, each independently confirmed against real golden output rather than assumed correct from reading the PHP:

1. **Split** into dated/nondated, tracking `family_input_order` — the position at which each family's xref is *first encountered* while scanning the raw, unsorted input (regardless of whether that particular fact is dated).
2. **Sort dated facts** chronologically via `FactComparator::byDate` (already fully tested — task 12's coverage, not re-verified here).
3. **Group nondated facts**: individual facts stay as a flat list; family facts group by xref.
4. **Sort each group** (including the flat individual list) by `FactComparator::byType` — critically, **this happens before insertion**, so `insertFamilyGroup()`'s per-fact loop processes each family's facts in type-order, not original input order. Verified with a scenario where an engagement (lower type order) and a divorce (higher type order) are both undated: the divorce processed second correctly finds the just-inserted engagement as a same-family anchor, while the engagement (processed first) has no anchor and falls to the "insert before all same-family facts" branch — golden output confirms this exact interleaving, not one that would result from processing in original input order.
5. **Insert nondated facts into the dated backbone**, one family group at a time (each insertion sees the results of *all previous* family-group insertions already applied — verified with a 3-family scenario), then individual facts one at a time by type order, **skipping** (but not removing) any dated "close relative" synthetic event (`INDI:EVEN` tagged, `CLOSE_RELATIVE` value — see `IndividualFactsService`) when deciding where to insert, without excluding it as an insertion *position*. Verified: an undated fact can and does land immediately next to a skipped close-relative event, distinguishing "don't use this as a type-order anchor" from "don't ever insert near this."

All five phases' interactions were traced by hand against `golden/fact_sort_service.json`'s actual output before writing a single line of JS — not assumed from the PHP source, since this algorithm's phases interact in ways that aren't obvious from reading the code linearly (e.g., the type-sort-before-insert ordering in point 4 above).

---

## Test scenarios (8 total)

1. Dated facts across individual + family, chronological order, same-date tiebreak by type.
2. Undated individual facts placed by type order; a dated close-relative event doesn't influence placement but stays where the chronological sort put it.
3. A family with an existing dated fact in the backbone: two undated facts from the same family, one inserted before it (lower type order) and one after (higher/equal type order).
4. Three families, none but one with dated facts: the family with the *lowest* input order (despite being entirely undated) is inserted before a later-input family's dated fact; a third, even-later family with no dated facts appends at the very end.
5. Combined: two families (one with dated facts, one without) + individual dated/undated facts + a close-relative event, all interacting in one collection.
6. All facts undated (no dated backbone at all).
7. Empty collection.
8. Single fact.

All 8 pass; full suite (`npm test`) is 3,858/3,858.

---

## Why no bridge was built (yet)

<details>
<summary>Original reasoning (superseded — a bridge was built; see below)</summary>

Same posture as `FactComparator` (task 12): a real, high-traffic algorithm with a clean bounded shape, but out of scope for *this* task (port + parity test only). Unlike `FactComparator`'s payoff assessment, `FactSortService` has more call-site traffic than most already-bridged modules — worth a real look at bridging in a future task, since (unlike `lib/date`) its inputs and outputs are flat arrays of plain data, not polymorphic escaping objects. Left for a deliberate future decision rather than bundled into this one.

</details>

**Update:** a live bridge was built after task 21, as part of a dedicated bridge-decision pass covering `FactSortService`, `wrapLongLines`, `TextWrapper`, and `reformatRecord` together — see [phase3-bridge-decision-pass-2.md](phase3-bridge-decision-pass-2.md). `FactSortService` was the strongest of the four candidates (low call volume — a handful per page, not per-item — and a genuinely clean, non-polymorphic shape).

**Cut over (2026-09-12):** the native fallback has been deleted entirely — see [phase4-cutover-fact-sort-surname-tradition.md](phase4-cutover-fact-sort-surname-tradition.md). `sort()` always routes through the Node service; if `WEBTREES_FACT_SORT_SERVICE_URL` is unset or the service is unreachable, it throws `HttpServiceUnavailableException` rather than falling back to native PHP.

---

## Definition of done

- [x] `lib/services/fact-sort-service.js` exports `class FactSortService` with `sort()` and all 3 private-equivalent helper methods.
- [x] `golden/fact_sort_service.json` generated from the real PHP class via `tests/Unit/Services/FactSortServiceCharacterizationTest.php`.
- [x] `js-tests/parity_fact_sort_service.test.js` — 8/8 scenarios pass.
- [x] Full suite passes: `npm test` → 3,858/3,858 ✓.
- [x] `vendor/bin/phpcs`/`phpstan` clean on the new PHPUnit characterization test.
- [x] Recorded in `phase4-cutover-tracking.md`.
- [x] Task doc written (this file).
