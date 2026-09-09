# Task 19 — Port `GedcomExportService::wrapLongLines()`

**Priority:** 19
**Complexity:** Low-medium (small function, but two genuinely non-obvious bugs found)
**Status:** Done
**Unblocks:** None directly — a small, self-contained, very high-traffic port.

---

## What this port proves

`wrapLongLines()` splits GEDCOM lines exceeding the spec's max length into `CONT`/`CONC` continuation lines. It's tiny (33 lines) but runs on **every line of every GEDCOM export** (`GedcomExportService.php:270`), giving it more real invocation volume than almost anything else ported so far, packed into a function small enough to characterize completely.

---

## Scope

**File:** `app/Services/GedcomExportService.php::wrapLongLines()` (lines 336-368 of the file; the rest of the class is DB/stream/HTTP-factory-coupled export orchestration, out of scope)
**Target:** `lib/services/gedcom-export-service.js` (`wrapLongLines()`)
**Golden fixture:** `golden/wrap_long_lines.json` (17 cases)
**Characterization script:** `bin/characterize_wrap_long_lines.php`
**Parity test:** `js-tests/parity_wrap_long_lines.test.js` — 16 golden cases + 1 dedicated non-hanging safety test

---

## Two findings that contradicted an initial reading of the code

### 1. The "give up, can't split" comment doesn't mean what it says

Reading the PHP source, the natural assumption is: *"no spaces anywhere in the value → can't split → give up."* Characterization proved this wrong. A single unbroken "word" longer than the line limit (e.g. a 30-character run with no spaces at all) **splits mid-word without any trouble** — the walk-back loop that looks for a non-space character to split after never needs to move at all, because the character sitting exactly at the boundary is never a space in that case.

The give-up condition (`$pos === strpos($line, ' ', 3)`) actually fires only when the walk-back retreats **all the way back to the tag-value separator space itself** — i.e. the value is entirely spaces (or otherwise contains no non-space character anywhere between the tag and the boundary). Verified with both a "one giant word" case (splits fine) and a genuinely all-spaces value (gives up, line left unmodified) in the golden fixture — see cases 8 and 9.

### 2. A real infinite loop for small `max_line_length` + all-space values

Investigating the give-up condition's exact boundary led to testing very small `max_line_length` values. For `max_line_length` from 1 to 5 combined with an all-space value, **PHP hangs forever** — confirmed by running it and killing the hung process (`timeout 3 php -r '...'` after several successful larger values, then a wall of timeouts for 1-5). Root cause: the walk-back loop (`while (mb_substr($line, $pos - 1, 1) === ' ')`) has no lower bound on `$pos`. Once it decrements past 0, `mb_substr()`'s negative-start semantics wrap around to count from the *end* of the string — and if that end is also spaces (as in an all-space value), it keeps finding spaces and keeps decrementing, forever.

**This is not reachable through any real call site today** — `GedcomExportService`'s only caller always passes the constant `Gedcom::LINE_LENGTH` (253), never a small or attacker-influenced value. But it's a genuine latent defect in a public method, distinct in kind from task 16's UTF-16 bugs: those had a well-defined (if wrong) output to faithfully reproduce; an infinite loop has no output at all, so there is nothing to "faithfully" match — a test asserting parity would itself hang forever. The JS port converges to PHP's real, correct output for every input where PHP terminates (verified against all 16 golden cases, including every real give-up case), and additionally never hangs, verified by a dedicated test exercising the exact failing PHP input range. See `lib/services/gedcom-export-service.js`'s file-level comment for the exact reasoning about why `pos <= giveUpPos` (not just `pos === giveUpPos`) is behaviorally identical everywhere PHP produces an answer.

---

## A verified simplification: one search instead of two index spaces

PHP's give-up check compares a **character-indexed** position (`$pos`, built via `mb_substr`/`mb_strlen`) against a **byte-indexed** one (`strpos($line, ' ', 3)`, not `mb_strpos`). Mixing units like this only matters if the line contains a multi-byte character at or before the tag-value separator — which never happens for well-formed GEDCOM (a level number and a fixed ASCII tag keyword always precede it). Confirmed rather than assumed: a dedicated multi-byte golden case (`'1 NOTE ' . str_repeat('é', ...)`) produces character-correct splits, since the multi-byte content only ever appears *after* the (always-ASCII) separator PHP's byte-based search is looking for. The JS port uses a single character-indexed search throughout — see cases 11-13 in the golden fixture.

---

## Test cases (17 total)

Short line (no wrap), a line exactly at the boundary (unchanged — only *strictly* longer lines wrap), a single split, multiple splits, `CONT` vs. non-`CONT` level-increment behavior, a split point that must back up over several trailing spaces, the two "give up" findings above (one long word that splits fine vs. an all-space value that genuinely can't split), a single space inside an otherwise long word (splits normally at it), multiple lines in one blob (only long ones wrap, order and non-wrapped lines preserved), three multi-byte UTF-8 cases, an empty string, and a realistic 253-char-limit case with real sentence text. Plus a dedicated safety test exercising the exact PHP-hanging input range (`max_line_length` 1-5, all-space value) to confirm the JS port terminates.

All 17 pass; full suite (`npm test`) is 3,875/3,875.

---

## Why no bridge was built (yet)

Same posture as `FactSortService` (task 18): a clean, bounded, high-traffic, string-in/string-out shape with real bridge potential, but left as a deliberate future decision rather than bundled into this port-only task.

---

## Definition of done

- [x] `lib/services/gedcom-export-service.js` exports `wrapLongLines()`.
- [x] `golden/wrap_long_lines.json` generated from the real PHP method via `bin/characterize_wrap_long_lines.php`.
- [x] `js-tests/parity_wrap_long_lines.test.js` — 16/16 golden cases + 1/1 safety test pass.
- [x] Full suite passes: `npm test` → 3,875/3,875 ✓.
- [x] Two real findings (the give-up condition's true trigger, and the infinite-loop bug) investigated with real PHP execution, not assumed, and documented above and in the port's own comments.
- [x] Recorded in `phase4-cutover-tracking.md`.
- [x] Task doc written (this file).
