# Task 22 — Port GEDCOM/HTML text-extraction helpers

**Priority:** 22
**Complexity:** Low-medium (small functions, but several genuinely non-obvious findings)
**Status:** Done
**Unblocks:** None directly — a bundled task combining two small, unrelated-but-similarly-shaped candidates, per an explicit survey note that the remaining candidate pool is thinning out.

---

## What this port proves

Two independent, small pure-string helpers were bundled into one task rather than run as two separate full port cycles, since each is only ~35 lines: `GedcomTextReader::getSubRecord()`/`getCont()` (raw GEDCOM sub-record extraction) and `Note::getNote()`/`Note::firstLineOfTextFromHtml()` (NOTE text extraction and an HTML-to-preview-text helper). Both operate on plain strings with no DB/I18N coupling.

---

## Scope

**Files:** `app/Report/GedcomTextReader.php` (`getSubRecord()`, `getCont()` only — ~35 of 189 lines), `app/Note.php` (`getNote()`, `firstLineOfTextFromHtml()` only — ~35 of 123 lines)
**Target:** `lib/report/gedcom-text-reader.js`, `lib/note.js`
**Golden fixture:** `golden/gedcom_text_helpers.json` (35 cases across 4 groups)
**Characterization test:** `tests/Unit/GedcomTextHelpersCharacterizationTest.php`
**Parity test:** `js-tests/parity_gedcom_text_helpers.test.js`

### Excluded

- `GedcomTextReader::getGedcomValue()` — calls `Registry::noteFactory()->make()`, a DB-backed NOTE cross-reference lookup. Already correctly flagged as a trap in earlier surveys; confirmed again by reading it in full.
- `Note::extractNames()` — calls `Registry::markdownFactory()` and `I18N::translate()`. A newly-spotted trap sitting right next to the two ported methods in the same file.
- `Note::canShowByType()` — queries `DB::table('link')`.

### Design note: `getNote()` becomes a plain function of a string

PHP's `getNote()` is an instance method reading `$this->gedcom . $this->pending`. The JS port, `getNoteText(gedcom)`, takes that already-concatenated string directly — the same "take the record/Tree-shaped dependency out, accept plain data" pattern used for `Age` (task 15) and `reformatRecord` (task 21).

---

## Findings — two real (narrow) bugs, one verified non-bug quirk

Both files carry an unstated shared assumption: **GEDCOM nesting never reaches level 10.** Two distinct, real bugs fall out of that assumption, both verified against live PHP execution before porting (not assumed from reading the code):

### 1. `getSubRecord()`'s end-boundary search matches on a bare digit prefix, not a delimited level number

The boundary search is a literal substring search for `"\n" . $level` (e.g. `"\n1"`) — not a properly-delimited number. A deeply-nested line whose level merely *starts* with the same digit (level `10`, `11`, ...) is incorrectly treated as the sub-record's end boundary. Verified: a level-1 `BIRT` sub-record containing a level-10 line (itself followed by more legitimately-nested level-11 and level-2 content) gets truncated right before that level-10 line — silently discarding everything from there on, even though none of it was actually a sibling of the level-1 record.

### 2. `getCont()` can never find CONT lines at level 10+, under any circumstances

The level-prefix check (`substr($line, 0, 2) !== $level . ' '`) always compares exactly 2 characters. A level 10+ prefix needs 3+ characters (`"10 "`), so the comparison can never succeed — `getCont()` silently returns empty for level 10+ regardless of what's actually in the input. Verified with a record containing a real `"10 CONT ..."` line: both `getCont(10, ...)` and `getCont(1, ...)` return `""`.

Both are real, if narrow — they only matter for GEDCOM records nested 10+ levels deep, unusual but not impossible (complex sourced-fact citation structures can occasionally reach that depth). Faithfully reproduced, not fixed, per this migration's established practice: the JS port uses the identical literal-substring/fixed-2-character-slice logic.

### 3. `firstLineOfTextFromHtml()`: a naked `<br>`/`<br/>` is not a break point (verified, not a bug)

`strip_tags($html, ['br'])` preserves a `<br>` tag exactly as written — it does not normalize `<br>` or `<br/>` to the canonical `<br />` form. The subsequent split, however, looks for the *exact literal string* `"<br />"` (the same constant the block-tag substitution table above it always produces). Verified: a naked `<br>` or `<br/>` already present in source HTML survives the tag-stripping step unchanged but does **not** act as a line break. In practice this likely never triggers on real webtrees-generated HTML, since the Markdown renderer that feeds this function always emits the canonical `<br />` form — documented here as a verified behavior of the function in isolation, not a live bug.

---

## `htmlspecialchars_decode($text, ENT_QUOTES)` ported precisely, not approximated

Rather than assume this reverses "all HTML entities," its exact behavior was characterized against real PHP execution: it decodes only the 5 characters `htmlspecialchars()` itself encodes (`&`, `<`, `>`, `"`, `'`) — via their lowercase named forms (`&amp;`, `&lt;`, `&gt;`, `&quot;`; **not** `&apos;`, which is never decoded) and via decimal or hex numeric entities for those same 5 characters specifically (any number of leading zeros, hex prefix/digits case-insensitive). A numeric entity for an unrelated character (e.g. `&#40;` for `(`) is left untouched — this is not a general-purpose entity decoder. Verified with `htmlspecialchars_decode('&amp;lt;')` → `'&lt;'` (a single simultaneous pass, not sequential — critical, since sequential replacement would double-decode this into `'<'`). The JS port uses one regex pass with a callback that dispatches on which alternative matched, replicating the single-pass semantics exactly rather than risking a naive chained-`.replace()` implementation.

---

## Test cases (35 total)

`getSubRecord` (11): empty input, a simple sibling lookup, `num`-th occurrence selection (including beyond-range), no-end-boundary (last record in the string), nested children correctly included up to the real boundary, a level-2 request falling back through the boundary-search chain, and the verified level-10+ finding. `getCont` (5): no CONT lines, multiple CONT lines merged, CONC lines correctly ignored, and the verified level-10+ finding (checked at both the true level and a mismatched level, both empty). `getNote` (5): a simple note, CONT-line merging, an empty note, an xref exercising every character `Gedcom::REGEX_XREF` allows, and a malformed record. `firstLineOfTextFromHtml` (14): every block-tag-to-break mapping (blockquote/h1-h6/li/p/pre/hr), table cells becoming spaces, the canonical-`<br />`-is-a-break-point case plus both verified not-a-break-point cases, full `ENT_QUOTES` entity decoding, inline tags that are stripped without becoming breaks, and empty input.

All 35 pass; full suite (`npm test`) is 3,996/3,996.

---

## Why no bridge was built

`getSubRecord()`/`getCont()`'s only real callers are inside `ParserGenerate.php`, the legacy XML report engine — tightly bound to `Registry`/rendering context, the same posture as `lib/report`'s "do not bridge" conclusion in the phase 3 decision pass. `getNote()`/`firstLineOfTextFromHtml()` are called from several places (`Media.php`, `NoteStructure.php`, `ManageMediaData.php`) but are thin, cheap string operations with no meaningful latency to save via a network round-trip. Pure foundation work, not bridge candidates.

---

## Definition of done

- [x] `lib/report/gedcom-text-reader.js` exports `getSubRecord()`, `getCont()`.
- [x] `lib/note.js` exports `getNoteText()`, `firstLineOfTextFromHtml()`.
- [x] `golden/gedcom_text_helpers.json` generated from the real PHP classes via `tests/Unit/GedcomTextHelpersCharacterizationTest.php`.
- [x] `js-tests/parity_gedcom_text_helpers.test.js` — 35/35 cases pass.
- [x] Full suite passes: `npm test` → 3,996/3,996 ✓.
- [x] `vendor/bin/phpcs`/`phpstan` clean on the new PHPUnit characterization test.
- [x] Two real bugs (level-10+ boundary mismatch in `getSubRecord()`, level-10+ total failure in `getCont()`) and one verified non-bug quirk (naked `<br>` isn't a break point) found, verified with dedicated golden cases, and faithfully reproduced — not fixed.
- [x] Recorded in `phase4-cutover-tracking.md`.
- [x] Task doc written (this file).
