# Task 16 — Port `app/Encodings/*` + `app/Factories/EncodingFactory.php`

**Priority:** 16
**Complexity:** High (large data tables, byte-level algorithms, three real bugs found and faithfully reproduced)
**Status:** Done
**Unblocks:** None directly — this is foundational for a future JS-side GEDCOM import/export pipeline, not a live bridge target today (see "Why no bridge was built" below).

---

## What this port proves

webtrees supports importing/exporting GEDCOM files in 13 legacy character encodings (ANSEL/MARC-21, ASCII, CP437, CP850, ISO-8859-1/2, MacOS Roman, UTF-8, UTF-16BE/LE, Windows-1250/1251/1252). This port brings all of that byte-level conversion logic — plus the GEDCOM-header encoding-detection heuristic — into JS as pure, dependency-free, well-tested modules, ready for a future Node-side GEDCOM pipeline.

---

## Scope

**Files:** `app/Encodings/*.php` (16 files, ~3,580 lines) + `app/Factories/EncodingFactory.php` (225 lines)
**Target:**
- `lib/encodings/abstract-encoding.js`, `abstract-utf16-encoding.js`
- `lib/encodings/{ascii,cp437,cp850,iso88591,iso88592,mac-roman,windows1250,windows1251,windows1252}.js` (single-byte table encodings)
- `lib/encodings/ansel.js` (table + diacritic-reordering/precomposition/horn-letter overrides)
- `lib/encodings/utf16be.js`, `utf16le.js`
- `lib/encodings/utf8.js` (special case — see below)
- `lib/factories/encoding-factory.js`
- `lib/php-compat/strtr.js` — shared `phpStrtr()`/`phpArrayFlip()` helpers (PHP's `strtr($text, array $table)` does a longest-key-first, non-overlapping scan; needed for ANSEL's multi-character diacritic tables and the factory's whitespace normalization)

**Golden fixtures:** `golden/encodings_roundtrip.json`, `encodings_convertible_bytes.json`, `encodings_ansel_special.json`, `encodings_utf16_from_utf8.json`, `encodings_utf16_to_utf8.json`, `encodings_utf8_cleanup.json`, `encoding_factory_detect.json`, `encoding_factory_detect_exception.json`, `encoding_factory_make.json`, `encoding_factory_list.json`
**Characterization script:** `bin/characterize_encodings.php`
**Table-generation script:** `bin/dump_encoding_tables.php` — one-off, not part of any test/build; used once via PHP Reflection to dump every class's byte-lookup-table constants as ready-to-paste JS object literals, eliminating any risk of hand-transcription error across the ~1,700 total table entries. Re-run only if the PHP source tables themselves change.
**Parity tests:** `js-tests/parity_encodings_roundtrip.test.js`, `parity_encodings_convertible_bytes.test.js`, `parity_encodings_ansel_special.test.js`, `parity_encodings_utf16.test.js`, `parity_encodings_utf8_cleanup.test.js`, `parity_encoding_factory.test.js` — 2,875 test cases total

### Excluded from this port

- **`app/GedcomFilters/GedcomEncodingFilter.php`** — a PHP `php_user_filter` stream filter. Unbridgeable/unportable PHP-API plumbing (same category as previously-rejected traps like `HtmlService`). It's the only real caller of these classes' conversion methods.

---

## The byte-string vs. text convention (the critical design decision)

PHP strings are just byte arrays — there's no type-level distinction between "raw encoded bytes" and "decoded Unicode text." JS has no such luxury: a JS string is always a UTF-16 code-unit sequence. To port this faithfully without either losing byte fidelity or writing an unreadable mess, every module in `lib/encodings/` uses one consistent convention, documented at the top of `abstract-encoding.js`:

- A **"byte string"** is a JS string where each UTF-16 code unit represents one raw byte (value 0-255) — the same convention Node's `Buffer.toString('latin1')` uses. This is what a legacy encoding's raw bytes (ANSEL, CP437, Windows-1252, etc.) are represented as.
- **"Text"** is a real, fully-decoded JS Unicode string (ordinary JS string semantics, code points can exceed 255).

Every class's contract is: **`toUtf8(byteString) → text`**, **`fromUtf8(text) → byteString`**. This lets lookup-table values be written as ordinary, readable JS string literals (`"é"`, `"€"`) rather than opaque `\xNN` byte-escape soup, while keeping the byte-level algorithms (ASCII-passthrough checks, diacritic-byte-range regexes, `strtr`-style substitution) exact.

**One deliberate exception: `UTF8`.** Its real PHP job (both `fromUtf8()` and `toUtf8()` — the latter just delegates to the former) is to validate/repair a byte sequence that's *supposed* to be UTF-8 but might not be (`mb_convert_encoding($text, 'UTF-8', 'UTF-8')` with the substitute character forced to U+FFFD). Its input can't be assumed to already be valid decoded text, so both its methods take **and return a byte string** — documented prominently in `lib/encodings/utf8.js` since it's the one class that breaks the pattern every other class in this tree follows.

Verified empirically that Node's built-in `TextDecoder('utf-8', { fatal: false, ignoreBOM: true })` implements the exact same algorithm as PHP's `mb_convert_encoding` cleanup (both are WHATWG-standard UTF-8 decoders) — tried against 24 malformed/edge-case byte sequences (lone continuation bytes, truncated multi-byte sequences, overlong encodings, encoded surrogates, out-of-range lead bytes, a leading BOM) and got byte-for-byte identical output every time. `ignoreBOM: true` was required — `TextDecoder` strips a leading BOM by default, but PHP's cleanup does not (a BOM is already valid UTF-8, so PHP's fast "already valid" path leaves it untouched). This meant `UTF8.fromUtf8()`/`toUtf8()` could be implemented as a thin wrapper around `TextDecoder`/`TextEncoder` rather than a hand-rolled decoder.

---

## Three real bugs found — faithfully reproduced, not fixed

Per explicit user decision: port faithfully (preserving migration parity discipline), document clearly, don't fix the PHP. All three are live/reachable, not dead code.

### 1. `AbstractUTF16Encoding::fromUtf8()` always zeroes non-ASCII characters

`app/Encodings/AbstractUTF16Encoding.php:59,69` has an operator-precedence bug: `$code_point << 6 + $byte2 & 0x3F` parses as `($code_point << (6 + $byte2)) & 0x3F`, not the intended `($code_point << 6) + ($byte2 & 0x3F)`. Verified against live PHP execution: the resulting shift amount always exceeds 64 bits for any 2- or 3-byte UTF-8 input character (continuation bytes are always ≥ 0x80), and PHP's "shift ≥ width is 0" rule means the decoded code point is **always exactly 0** — every non-ASCII character silently becomes NUL, unconditionally, regardless of which character it is.

**This is live**: `ExportGedcomClient.php` and `ClippingsCartModule.php` both offer "UTF-16" as a real GEDCOM export encoding choice. Exporting a GEDCOM as UTF-16 today silently destroys every accented name, place, or note.

A separate, related design limitation (not itself a bug): 4-byte/astral UTF-8 sequences aren't handled at all — the lead-byte switch has no branch for 0xF0-0xFF, so it falls into "invalid" and emits one replacement character, then each of the 3 continuation bytes is independently revisited by the same byte-at-a-time loop and independently found "invalid" too — 4 replacement characters per astral input character. Verified against live PHP.

Ported faithfully by observing that the buggy arithmetic's output is a **constant** (always 0) rather than reimplementing the actual broken bit-shifting — verified equivalent by testing ASCII, 2-byte, 3-byte, and 4-byte/astral inputs (including a mixed string) against real PHP output.

### 2. `AbstractUTF16Encoding::toUtf8()` treats the entire Latin-1 Supplement block as invalid

`app/Encodings/AbstractUTF16Encoding.php`'s decode branch explicitly treats decoded code points **U+0080-U+00FF** — ordinary accented Latin letters (é, à, ü, ñ, ö, etc.) — as invalid and emits U+FFFD instead of decoding them. These are perfectly valid Unicode code points; this branch appears to be a mistaken attempt at rejecting UTF-16 surrogates (which are actually U+D800-U+DFFF, handled correctly and separately later in the same method).

**This is live**: `GedcomExportService.php` maps a `"UNICODE"` GEDCOM `CHAR` header value to `UTF16BE`/`UTF16LE` (some legacy Windows genealogy software exports GEDCOM this way). Importing such a file with any common accented character shows it as the replacement character.

A related design limitation: lone UTF-16 surrogate units are never combined into a surrogate pair — each 16-bit unit is decoded (or rejected) completely independently, so even a validly-paired surrogate pair (e.g. an emoji) decodes as two separate replacement characters, never the intended astral character.

### 3. `MacRoman`'s `TO_UTF8` table has no entry for byte `0xF0`

Found while characterizing: `MacRoman::toUtf8("\xF0")` (the classic Mac OS "Apple logo" character position) isn't in the lookup table at all, so `strtr()` passes it through **unconverted** — the output contains the raw, un-decoded byte 0xF0, which is not valid standalone UTF-8. Feeding that into any encoding's `fromUtf8()` (including `MacRoman`'s own) crashes with an uncaught `TypeError`, since `AbstractEncoding::fromUtf8()`'s `preg_split('//u', $text, ...)` returns `false` on invalid UTF-8 input, and `array_map(..., false)` is a type error.

Narrower than bugs 1-2 (requires the specific MacRoman encoding *and* that specific legacy byte), but still real and live: importing a MacRoman-encoded GEDCOM containing that byte, then converting/exporting it to any encoding, fatals the request. Reproduced faithfully — the JS `MacRoman` table (generated directly from the real PHP constant via Reflection, see `bin/dump_encoding_tables.php`) has the exact same gap, so `toUtf8("\xF0")` produces the same passthrough artifact. Not reproduced as a JS crash (there's nothing meaningful to assert about *how* it fails); `js-tests/parity_encodings_roundtrip.test.js` documents the artifact instead and skips the round-trip half of that one case.

---

## ANSEL: diacritic reordering, precomposition, and the "horn" letters

ANSEL stores diacritics as **prefix** bytes (0xE0-0xFF) — the base character follows. Unicode combining diacritics are **suffix** code points — the base character precedes them. Converting between the two requires byte/character reordering in both directions (`ANSEL.php`'s `toUtf8()`/`fromUtf8()` overrides), implemented in JS with the same regex-based reordering (`/([\xE0-\xFF]+)(.)/` and its mirror) operating on the byte-string convention.

On top of reordering, `toUtf8()` folds decomposed base+combining sequences into precomposed single characters where Unicode has one (`PRECOMPOSED_CHARACTERS`, 411 entries — e.g. `"a" + combining-breve + combining-acute → "ắ"`), and `fromUtf8()` does the reverse. Since some decomposed keys are prefixes of longer ones (e.g. `"a" + breve` vs. `"a" + breve + acute`), this needs PHP's `strtr()` longest-match-first semantics exactly — not a naive `String.replaceAll()` per key, which would apply one pattern at a time rather than scanning once with all patterns considered together. Implemented as `phpStrtr()` in `lib/php-compat/strtr.js`, shared with the factory's whitespace-normalization logic (see below).

ANSEL also supports two "horn" letters (o/u with horn) as their own single bytes, but Unicode only has them as base+combining-horn sequences — handled via a two-step placeholder-token substitution (`HORN_CONVERT_STEP_1`/`STEP_2`) ported unchanged.

---

## `EncodingFactory.detect()`

Detects a GEDCOM's character encoding from its raw header bytes: BOM sniffing (UTF-8/16BE/16LE), a null-byte heuristic for BOM-less UTF-16 (checking whether the header starts with a NUL+digit or digit+NUL pair, since GEDCOM headers always start with `"0 HEAD"`), then falls back to matching the `1 CHAR ...` line's declared value against ~30 known program-specific labels (Reunion, MacFamilyTree, GenoPro, Lifelines, etc. — collected from real-world webtrees users' GEDCOM files over the years). Ported the exact whitespace-normalization pass (`ltrim` + CRLF/CR-to-LF + collapsing repeated newline/space runs) using the same `phpStrtr()` longest-match scan, verified this doesn't accidentally diverge from PHP's `strtr()` semantics for the specific 2-character keys involved (`"\n "`, `" \n"`, `"  "` — none is a prefix of another, so simultaneous vs. sequential replacement coincide here, but `phpStrtr()` is correct by construction rather than by coincidence).

Throws `InvalidGedcomEncodingException` (a plain JS `Error` subclass) when a `CHAR` value doesn't match any known label — same condition as PHP, though the JS version doesn't attempt to reproduce PHP's translated (`I18N::translate()`) exception message text, since that requires the full webtrees I18N bootstrap and has no meaning outside a PHP request context; both carry the same raw unrecognized value.

---

## Test cases

- **2,620 round-trip cases** (`encodings_roundtrip.json`): every byte 0x00-0xFF, for all 10 single-table encodings (9 simple + ANSEL), plus a handful of representative multi-character strings.
- **80 `convertibleBytes()` cases**, covering empty input, ASCII, encoded multi-byte content, and boundary/trailing-byte scenarios.
- **19 ANSEL-specific cases**: real accented names and characters (é, å, ñ, ő, ç, ẞ/ß in both forms), horn letters (o/u, with and without an additional diacritic), the docblock's documented double-diacritic byte pairs (0xFA/0xFB, 0xEB/0xEC), and the combining-slash character.
- **20 UTF-16 `fromUtf8()` cases** covering ASCII, 2-byte, 3-byte, and 4-byte/astral inputs (bug 1) for both BE and LE.
- **48 UTF-16 `toUtf8()`/`convertibleBytes()` cases** covering every relevant code-point boundary (0x7F/0x80/0xFF/0x100/0x7FF/0x800/0xD7FF/0xD800/0xDFFF/0xE000/0xFFFF — bug 2), a real (non-combined) surrogate pair, and odd/even byte-length inputs.
- **24 UTF8 cleanup cases**: valid ASCII/2/3/4-byte sequences, lone continuation bytes, truncated sequences at every length, invalid lead bytes (0xC0/0xC1/0xFE/0xFF), overlong encodings, an encoded surrogate, a leading BOM, and runs of consecutive errors.
- **48 `EncodingFactory.detect()` cases**: all 3 BOM variants, both null-byte heuristic variants, every character-set label (with case-insensitivity spot checks), the `CHARACTER` keyword variant, no-`CHAR`-line default-to-UTF8, incomplete-header-returns-null, whitespace normalization, leading-whitespace trimming, and CRLF/CR line endings — plus a dedicated exception case and full `make()`/`list()` coverage.

All 2,875 new test cases pass; full suite (`npm test`) is 3,771/3,771.

---

## Why no bridge was built

Same category of decision as `RomanNumeralsService` (task 14) and the `lib/date`/`lib/ext-calendar` clusters: these classes' only real PHP caller is `GedcomEncodingFilter`, a `php_user_filter` stream-filter implementation — unbridgeable PHP-API plumbing, not something an HTTP round-trip can stand in for. There is currently no other live call site and no JS-side GEDCOM import/export pipeline for this to plug into. This port is a foundation for that future pipeline, not a live cutover candidate today.

---

## Definition of done

- [x] `lib/encodings/*.js` (14 files) + `lib/factories/encoding-factory.js` + `lib/php-compat/strtr.js` port all 12 concrete encoding classes, both abstract base classes, and `EncodingFactory`.
- [x] `golden/encodings_*.json` + `golden/encoding_factory_*.json` generated from the real PHP classes via `bin/characterize_encodings.php`.
- [x] `bin/dump_encoding_tables.php` used to generate every lookup table mechanically (no hand-transcription of ~1,700 table entries).
- [x] All 6 new parity test files pass: 2,875/2,875 new cases.
- [x] Full suite passes: `npm test` → 3,771/3,771 ✓.
- [x] Three real PHP bugs found, faithfully reproduced (not fixed), and documented above.
- [x] Recorded in `phase4-cutover-tracking.md` as a new `lib/encodings` row.
- [x] Task doc written (this file).
