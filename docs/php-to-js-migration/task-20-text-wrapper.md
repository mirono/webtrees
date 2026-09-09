# Task 20 — Port `TextWrapper` + `Style` + `AbstractTextMeasurer` + `HtmlTextMeasurer`

**Priority:** 20
**Complexity:** Medium (a genuine multi-branch word-wrap algorithm, but no PHP bugs found this time)
**Status:** Done
**Unblocks:** None directly — largest self-contained algorithmic cluster ported so far, and a real future bridge candidate for the HTML report backend.

---

## What this port proves

`TextWrapper` is the shared word-wrap engine behind both the HTML and PDF report backends. Only the HTML half is portable: `HtmlTextMeasurer` estimates character widths from a static lookup table (no rendering, no I/O), while `PdfTextMeasurer` delegates to TCPDF's live font-metrics engine and correctly stays PHP-side (already excluded in earlier surveys). The interface boundary (`TextMeasurerInterface`) was already cleanly drawn by the PHP authors — this port just needed to fill in the portable side of it.

---

## Scope

**Files:** `app/Report/TextWrapper.php` (206 lines), `app/Report/Style.php` (59), `app/Report/AbstractTextMeasurer.php` (73), `app/Report/HtmlTextMeasurer.php` (132) — ~470 lines total, all ported in full
**Target:** `lib/report/text-wrapper.js`, `lib/report/style.js`, `lib/report/abstract-text-measurer.js`, `lib/report/html-text-measurer.js`
**Golden fixtures:** `golden/report_style.json` (10 cases), `golden/html_text_measurer_width.json` (8 cases), `golden/text_measurer_truncate.json` (7 cases), `golden/text_wrapper.json` (13 cases)
**Characterization script:** `bin/characterize_text_wrapper.php`
**Parity tests:** `js-tests/parity_report_style.test.js`, `parity_html_text_measurer.test.js`, `parity_text_wrapper.test.js` — 38 cases total

### Excluded

- `app/Report/PdfTextMeasurer.php` — real TCPDF font-metrics delegate, unbridgeable (already identified as a trap in an earlier survey).
- `app/Report/TextMeasurerInterface.php` — a pure interface; JS has no equivalent construct, its contract is documented via JSDoc on `AbstractTextMeasurer` instead.

---

## Non-obvious branches, verified against real golden output before porting

Following the same discipline as tasks 18/19: every interesting branch was traced against actual PHP execution, not assumed from reading the source.

- **A word too long for the first line but not for a subsequent one** produces an *empty first result line*: if the very first word in a paragraph doesn't fit `firstWidth` but does fit `subsequentWidth`, the algorithm pushes the (empty) `currentLine` before starting the word on the next line — verified with a 30-character word at `firstWidth = 3, subsequentWidth = 20`, which correctly produces `["", "iiii...iiii short"]`, not just the combined line.
- **A single word longer than several full lines** breaks into as many full-width chunks as needed, with the *final* remainder handled as a distinct third step (fill current line → full subsequent-width chunks in a loop → final partial chunk becomes the new current line) — verified with a 100-character word wrapping into 8 lines (7 full-width chunks + 1 remainder), hand-traced against the golden output character-count by character-count.
- **URL-aware breaking** prefers the last URL-punctuation character (`/`, `-`, `.`, `?`, `&`, `=`, `#`, `:`) within the fitting range over the raw last-fitting-character cutoff — verified with a long URL that breaks cleanly after `/` and `.` characters rather than mid-token.
- **Bidi-isolate accounting in `truncate()`**: when truncation cuts a string containing an unclosed `FIRST STRONG ISOLATE` (U+2068) character, the result appends enough `POP DIRECTIONAL ISOLATE` (U+2069) characters to rebalance before the ellipsis — verified with a golden case where the count of appended closers is `count(FSI) - count(PDI)` in the truncated substring, exactly matching PHP's `mb_substr_count()`-based arithmetic.
- **`Style`'s regex validation** (`/^[biud]*$/`) translates identically to JS — no PCRE/JS regex divergence for this simple character class, unlike task 17's PCRE-anchoring quirk.

No PHP bugs were found in this cluster — a contrast to tasks 16, 17, and 19, which each turned up at least one real defect. Worth noting explicitly rather than silently: not every characterization pass finds one.

---

## Test cases (38 total)

`Style`: constructor validation (valid flag combinations, an invalid lowercase flag, an invalid uppercase flag) and `fromXmlAttributes()` (defaults, missing/empty `name` throwing). `HtmlTextMeasurer.getStringWidth()`: known characters, the bold multiplier, unknown characters falling back to the default width, zero-width bidi isolate characters. `truncate()`: text under width (unchanged), moderate and extreme truncation, "nothing fits" (bare ellipsis), independent per-line truncation of multi-line text, and the bidi-isolate rebalancing case above. `TextWrapper.wrapText()`/`countLines()`/`textHeight()`/`lastLineWidth()`: word-boundary wrapping, leading-space preservation (footnote continuation), differing first/subsequent widths, explicit newlines, URL-aware long-word breaking, plain long-word breaking with no punctuation, the "empty first line" branch, a 100-character single-word multi-chunk break, an empty-text edge case, a realistic sentence at realistic size, and zero/negative width both throwing.

All 38 pass; full suite (`npm test`) is 3,913/3,913.

---

## Why no bridge was built (yet)

Same posture as `FactSortService` and `wrapLongLines` (tasks 18-19): a clean, bounded interface (`wrapText()` takes/returns flat string arrays and floats, no polymorphic escaping objects) with a confirmed real call site (`HtmlRenderer.php` genuinely does use `HtmlTextMeasurer` for the HTML report backend) — a real future bridge candidate, left as a deliberate later decision rather than bundled into this port-only task.

---

## Definition of done

- [x] `lib/report/{style,abstract-text-measurer,html-text-measurer,text-wrapper}.js` port all four classes in full.
- [x] Golden fixtures generated from the real PHP classes via `bin/characterize_text_wrapper.php`.
- [x] 38/38 new parity test cases pass.
- [x] Full suite passes: `npm test` → 3,913/3,913 ✓.
- [x] Every non-obvious branch (empty-first-line, multi-chunk break, URL-aware breaking, bidi rebalancing) traced against real golden output before porting, not assumed.
- [x] Recorded in `phase4-cutover-tracking.md`.
- [x] Task doc written (this file).
