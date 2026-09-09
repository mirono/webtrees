# Task 21 — Port `GedcomImportService::reformatRecord()`

**Priority:** 21
**Complexity:** High (dense multi-branch normalization logic; three real findings)
**Status:** Done
**Unblocks:** None directly — highest-traffic port so far (runs on every line of every GEDCOM import).

---

## What this port proves

`reformatRecord()` normalizes a raw GEDCOM record before it's parsed further — tag canonicalization, DATE string cleanup, PLAC comma/lat-long normalization, NAME whitespace tidying, CONC-line merging, FILE path handling, and a "Y" suppression heuristic. It runs on **every line of every record of every GEDCOM import**, web and CLI — the highest real invocation volume of any module ported in this migration.

---

## Scope

**File:** `app/Services/GedcomImportService.php::reformatRecord()` (lines 76-219, 144 lines; the rest of the class — `importRecord()` and everything after it — is DB-write-heavy import orchestration, out of scope)
**Target:** `lib/services/gedcom-import-service.js` (`reformatRecord()`)
**Golden fixture:** `golden/reformat_record.json` (48 cases across 9 groups)
**Characterization test:** `tests/Unit/Services/ReformatRecordCharacterizationTest.php` (PHPUnit, uses a real imported tree via `TestCase::importTree()` and `Tree::setPreference()`, invoking the private method via `ReflectionMethod`)
**Parity test:** `js-tests/parity_gedcom_import_service.test.js`

Depends on the already-ported `GedcomService.canonicalTag()` (task 13).

### Tree-preference shim adapter

`reformatRecord()` reads two `Tree::getPreference()` values (`GEDCOM_MEDIA_PATH`, `WORD_WRAPPED_NOTES`). Same pattern as `Age` (task 15): the JS port takes a plain `{ gedcomMediaPath, wordWrappedNotes }` object instead of a `Tree`. Both are accepted as raw strings — matching `Tree::getPreference()`'s actual return type — and PHP's string-truthiness rule (`''` and `'0'` are falsy, everything else truthy) is applied internally for `wordWrappedNotes`, rather than asking the caller to pre-convert to a boolean.

---

## Three findings — two real bugs, one real (non-bug) quirk

### 1. The "Y" suppression lookahead never checks the record's last line

`reformatRecord()` suppresses a level-1 fact's `Y` value when a `DATE` or `PLAC` sub-record follows it (the presence of a date/place makes the bare "yes, this happened" marker redundant). The lookahead loop is bounded `$i < $num_matches - 1` — which excludes the very last match index. Verified with two contrasting golden cases: `"1 BIRT Y\n2 DATE 1 JAN 1900"` (the `DATE` line is the record's absolute last line) keeps the `Y` — **not suppressed**, a real miss — while the same input with one harmless trailing line appended (`"...\n2 NOTE trailing"`) correctly suppresses it. Faithfully reproduced: the JS port's loop uses the identical `i < numMatches - 1` bound.

### 2. The same lookahead compares the *raw* captured tag, not the canonicalized one

The outer loop canonicalizes every tag it processes (`GedcomService.canonicalTag()`), but the lookahead indexes back into the original, frozen regex-match array and compares `matches[i][3]` (the raw capture) against the literal strings `'DATE'`/`'PLAC'` — never canonicalizing it first. `GedcomService.canonicalTag('PLACE') === 'PLAC'`, so a sub-line spelled `PLACE` (a real, if uncommon, non-canonical GEDCOM tag variant) **does** get normalized to `PLAC` in the output, but the lookahead's raw-string comparison misses it. Verified with matching golden cases: `"1 BIRT Y\n2 PLAC Anytown"` suppresses correctly; `"1 BIRT Y\n2 PLACE Anytown"` (canonicalizes to the identical output tag) does not, even though the visible output is otherwise the same. Faithfully reproduced: the JS port compares against the same raw `matches[i][3]` value, not the canonicalized `tag`.

Both findings are real but narrow — the first only matters for a `Y` fact whose only qualifying sub-line happens to be the record's absolute last line; the second only matters for the one non-canonical tag alias (`PLACE`) that happens to canonicalize to a tag this specific check looks for. Neither corrupts data outright; both just mean an occasional `Y` marker isn't suppressed when it arguably should be — cosmetic rather than destructive, unlike task 16's or 19's bugs.

### 3. TMG's "EITHER X OR Y" conversion is blocked by a preceding calendar escape (a real ordering quirk, not a bug)

The `EITHER`/`OR` → `BET`/`AND` conversion regex is anchored to the *start* of the (space-padded) date string: `/^ EITHER (.+) OR (.+)/`. Calendar-escape repositioning (moving `@#DJULIAN@` etc. to sit after a qualifier like `BET`/`FROM`) happens in *later* steps of the same pipeline. Verified: `"@#DJULIAN@ EITHER 1700-1701 OR 1702"` is left as literal, unconverted `"@#DJULIAN@ EITHER 1700 1701 OR 1702"` text (only the dash-to-space punctuation cleanup applies) — not a valid GEDCOM date qualifier at all. This is a real, reproducible pipeline-ordering limitation of webtrees' TMG-format import support, not a crash or data-loss bug — documented and faithfully reproduced (the JS port runs the exact same step order), not "fixed" by reordering the pipeline.

---

## Other verified behaviors worth recording

- **Blank lines are silently collapsed away**: the very first step (`/[\r\n]+/` → `\n`) collapses *any* run of line-ending characters into a single `\n`, which also erases blank lines entirely — verified with a dedicated golden case.
- **Malformed lines are silently dropped**: a line that doesn't match the level/tag/data pattern simply doesn't appear in the parsed match list at all — no error, no placeholder.
- **NOTE/TEXT/DATA/CONT preserve internal whitespace**; every other tag (the `default` reassembly bucket) collapses runs of spaces and strips tabs. `NAME` is processed *twice* — once by its own tag-specific tidying (which uses PHP's *default* `trim()` charlist: space, tab, newline, CR, NUL, vertical tab) and then again by the `default` bucket's *space-only* `trim($data, ' ')` pass, since `NAME` isn't one of the reassembly switch's explicitly-listed cases. The JS port implements both trim variants precisely (`phpTrimDefault()` vs. `trimSpaces()`) rather than conflating them, even though in practice the second pass is a no-op after the first.
- **`CONC` bypasses line reassembly entirely**: it does not reconstruct a `level tag data` line at all — it directly concatenates its `data` onto whatever `newrec` already contains, with no newline, optionally prefixed by a single space when `WORD_WRAPPED_NOTES` is on. The `CONC` line's own level and tag are discarded.
- **`FILE`'s media-path-prefix check runs on the raw (pre-backslash-conversion) data**, so a configured `GEDCOM_MEDIA_PATH` using backslashes matches correctly against the original Windows-style path before any slash conversion happens.
- **TMG lat/long extraction correctly computes nested levels** (`MAP` at `level+1`, `LATI`/`LONG` at `level+2`) regardless of how deeply nested the `PLAC` line itself is — verified with a `PLAC` at level 4 (nested under `SOUR`/`DATA`), not just the common level-2 case.

---

## Test cases (48 total, across 9 groups)

`date` (19: one isolated case per transformation rule, plus the calendar-escape/EITHER-OR combination above), `head_trlr` (2), `name` (1), `plac` (5: ASCII/fullwidth/Arabic comma variants, TMG lat/long at two nesting depths), `sex` (1), `y_suppress` (8: both real findings above, plus the straightforward suppress/keep/lowercase-input cases), `whitespace` (3), `conc` (2: `WORD_WRAPPED_NOTES` on/off), `file` (3: no path configured, matching prefix, non-matching prefix), `lines` (3: CRLF normalization, blank-line collapse, malformed-line drop), and one fully combined realistic record exercising most of the above together.

All 48 pass; full suite (`npm test`) is 3,961/3,961.

---

## Why no bridge was built (yet)

<details>
<summary>Original reasoning (superseded — a bridge was built; see below)</summary>

Same posture as `FactSortService`/`wrapLongLines`/`TextWrapper` (tasks 18-20): a clean string-in/string-out shape (plus the small preference-object shim) with the highest real invocation volume found in this migration, but left as a deliberate future decision rather than bundled into this port-only task.

</details>

**Update:** a live bridge was built immediately after this task, in the same decision pass as `FactSortService` and `wrapLongLines` — see [phase3-bridge-decision-pass-2.md](phase3-bridge-decision-pass-2.md). Same "one round-trip per record, no batching yet" tradeoff already accepted for `Soundex`/`wrapLongLines`. Not enabled by default; `WEBTREES_GEDCOM_IMPORT_SERVICE_URL` is unset until a deployer opts in.

---

## Definition of done

- [x] `lib/services/gedcom-import-service.js` exports `reformatRecord(rec, preferences)`.
- [x] `golden/reformat_record.json` generated from the real PHP method via `tests/Unit/Services/ReformatRecordCharacterizationTest.php`.
- [x] `js-tests/parity_gedcom_import_service.test.js` — 48/48 cases pass.
- [x] Full suite passes: `npm test` → 3,961/3,961 ✓.
- [x] `vendor/bin/phpcs`/`phpstan` clean on the new PHPUnit characterization test.
- [x] Two real bugs (last-line lookahead miss, raw-vs-canonical tag comparison) and one real ordering quirk (EITHER/OR blocked by a calendar escape) found, verified with dedicated golden cases, and faithfully reproduced — not fixed.
- [x] Recorded in `phase4-cutover-tracking.md`.
- [x] Task doc written (this file).
