# Task 13 — Port `GedcomService` (4 methods)

**Priority:** 13
**Complexity:** Low
**Status:** Done
**Unblocks (not in this batch):** Potential future HTTP bridging to GEDCOM import/parsing services
(out of scope for this task — pure library port + parity tests only).

---

## Phase 0 — Why this one, thirteenth

Trivially pure — constant lookup tables (TAG_NAMES: 122 entries, TAG_SYNONYMS: 2 entries)
plus coordinate parsing (latitude/longitude). No dependencies at all — no I18N, no Registry,
no database. Four public methods, one private helper. Establishes the first `lib/services/`
directory in the migration (mirroring `app/Services/`), representing pure-logic services
that have no web framework coupling.

**File:** `app/Services/GedcomService.php`
**Namespace:** `Fisharebest\Webtrees\Services`
**Scope of this task:** the whole file — `TAG_NAMES` constant, `TAG_SYNONYMS` constant,
`canonicalTag()`, `readLatitude()`, `readLongitude()`, `readDegrees()` helper.

## Source (current PHP)

```php
class GedcomService
{
    private const array TAG_NAMES = [ /* 122 entries */ ];
    private const array TAG_SYNONYMS = [ /* 2 entries */ ];

    public function canonicalTag(string $tag): string
    {
        $tag = strtoupper($tag);
        $tag = self::TAG_NAMES[$tag] ?? self::TAG_SYNONYMS[$tag] ?? $tag;
        return $tag;
    }

    public function readLatitude(string $text): float|null
    {
        return $this->readDegrees($text, Gedcom::LATITUDE_NORTH, Gedcom::LATITUDE_SOUTH);
    }

    public function readLongitude(string $text): float|null
    {
        return $this->readDegrees($text, Gedcom::LONGITUDE_EAST, Gedcom::LONGITUDE_WEST);
    }

    private function readDegrees(string $text, string $positive, string $negative): float|null
    {
        $text       = trim($text);
        $hemisphere = substr($text, 0, 1);
        $degrees    = substr($text, 1);

        if (is_numeric($degrees)) {
            $hemisphere = strtoupper($hemisphere);
            $degrees    = (float) $degrees;
            if ($hemisphere === $positive) {
                return $degrees;
            }
            if ($hemisphere === $negative) {
                return -$degrees;
            }
        }

        if (is_numeric($text)) {
            return (float) $text;
        }

        return null;
    }
}
```

Full source: `app/Services/GedcomService.php:1-211`.

## Notes

### `canonicalTag()`
- Straightforward uppercasing + lookup cascade: TAG_NAMES, then TAG_SYNONYMS, then unchanged.
- Lookup tables are data; copied verbatim (all keys are non-numeric strings, safe as plain JS objects).

### `readDegrees()` and the edge cases
PHP's `is_numeric()` is more permissive than JavaScript's basic Number checks:
- Accepts leading/trailing whitespace: `'  52.5  '` → numeric
- Accepts scientific notation: `'1e3'` → numeric (1000)
- Accepts +/- prefixes: `'+5'`, `'-5'` → numeric
- Rejects malformed: `'12.5.6'` → not numeric
- Empty string: `''` → not numeric

**Faithfully reproduced in JS:** A helper `isNumeric()` function that trims, then tests
against `/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/` — PHP's actual numeric-string
grammar. **Not** `!isNaN(Number(trimmed))` — see "Corrections found vs. the prompt" below;
that looser check was the port's first draft and is a real divergence, not a
theoretical one.

### Edge cases in coordinate parsing
Real test cases from the characterization (golden data):

- **Empty input** (`''`):
  - `substr('', 0, 1)` → `''`, `substr('', 1)` → `''`
  - Both `is_numeric('')` checks fail
  - `is_numeric('')` again → false
  - Result: **null** ✓

- **Single digit** (`'5'`):
  - `substr('5', 0, 1)` → `'5'`, `substr('5', 1)` → `''`
  - `is_numeric('')` → false (degrees is empty)
  - Falls through to `is_numeric('5')` → true
  - Result: **5.0** ✓
  - (This is a real edge case: a bare digit with no hemisphere is treated as a bare number.)

- **Hemisphere alone** (`'N'`):
  - `substr('N', 0, 1)` → `'N'`, `substr('N', 1)` → `''`
  - `is_numeric('')` → false
  - `is_numeric('N')` → false
  - Result: **null** ✓

- **Scientific notation** (`'N1e3'`):
  - `substr('N1e3', 0, 1)` → `'N'`, `substr('N1e3', 1)` → `'1e3'`
  - `is_numeric('1e3')` → true
  - PHP's `(float) '1e3'` → `1000.0`
  - Result: **1000.0** ✓

- **Whitespace variations** (`'  52.5  '`):
  - Trimmed first: `'52.5'`
  - `substr('52.5', 0, 1)` → `'5'`, `substr('52.5', 1)` → `'2.5'`
  - `is_numeric('2.5')` → true
  - `'5'` uppercased is not a valid hemisphere for lat/long
  - Falls through to `is_numeric('52.5')` → true
  - Result: **52.5** ✓

- **Whitespace after hemisphere** (`'N  52.5'`):
  - Trimmed first: `'N  52.5'` (trailing spaces removed)
  - `substr('N  52.5', 0, 1)` → `'N'`, `substr('N  52.5', 1)` → `'  52.5'`
  - `is_numeric('  52.5')` → true (PHP allows leading whitespace in is_numeric)
  - Result: **52.5** ✓

- **Wrong hemisphere for method** (`'E52.5'` via `readLatitude`):
  - `substr('E52.5', 0, 1)` → `'E'`, `substr('E52.5', 1)` → `'52.5'`
  - `is_numeric('52.5')` → true
  - `'E'` uppercased is not LATITUDE_NORTH ('N') or LATITUDE_SOUTH ('S')
  - Falls through to `is_numeric('E52.5')` → false
  - Result: **null** ✓

- **Lowercase hemisphere** (`'n52.5'` via `readLatitude`):
  - `substr('n52.5', 0, 1)` → `'n'`, `substr('n52.5', 1)` → `'52.5'`
  - `is_numeric('52.5')` → true
  - `strtoupper('n')` → `'N'` (matches LATITUDE_NORTH)
  - Result: **52.5** ✓

## Phase 1 — Characterization test

**Script:** `bin/characterize_gedcom_service.php` (no bootstrap needed)

```php
<?php
require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Services\GedcomService;
use Fisharebest\Webtrees\Gedcom;

$service = new GedcomService();

$canonical_cases = [
    'BIRTH', 'ADDRESS1', 'CONCAT',
    'birth', 'address1', 'concat',
    'Birth', 'ADDRESS_1',
    '_PGVU', '_pgvu', '_PGV_OBJS',
    'BIRT', 'ZZZZ', 'XYZ', '',
];

$canonical_results = [];
foreach ($canonical_cases as $tag) {
    $canonical_results[] = [
        'input'  => ['tag' => $tag],
        'output' => $service->canonicalTag($tag),
        'error'  => null,
    ];
}

$degrees_cases = [
    // Valid GEDCOM format
    ['text' => 'N52.1234', 'method' => 'readLatitude'],
    ['text' => 'S52.1234', 'method' => 'readLatitude'],
    ['text' => 'E010.5', 'method' => 'readLongitude'],
    ['text' => 'W010.5', 'method' => 'readLongitude'],

    // Bare numbers
    ['text' => '52.1234', 'method' => 'readLatitude'],
    ['text' => '10.5', 'method' => 'readLongitude'],

    // Edge cases: empty, single char, whitespace, scientific notation,
    // signed numbers, malformed, garbage, case sensitivity, wrong hemisphere
    // (see file for full list)
];

// Write to golden/gedcom_service_canonical_tag.json and golden/gedcom_service_read_degrees.json
```

**Golden data:** `golden/gedcom_service_canonical_tag.json` (15 cases),
`golden/gedcom_service_read_degrees.json` (28 cases — 23 from the initial pass,
5 added during review, see "Corrections found vs. the prompt").

## Phase 2 — Port prompt (ready to hand to an LLM)

```
Port this PHP class to JavaScript. Match its behavior exactly, including
edge cases — do not "improve" or refactor the logic yet, just translate it
faithfully.

The TAG_NAMES and TAG_SYNONYMS objects are data: copy every entry in the exact
order given, do not reorder, dedupe, or alphabetize them even though they may
look arbitrary.

PHP source:
<paste GedcomService class from app/Services/GedcomService.php:24-211>

Gedcom constants:
- Gedcom::LATITUDE_NORTH = 'N'
- Gedcom::LATITUDE_SOUTH = 'S'
- Gedcom::LONGITUDE_EAST = 'E'
- Gedcom::LONGITUDE_WEST = 'W'

Here are characterization test cases it must pass (input → expected output):
<paste golden/gedcom_service_canonical_tag.json and golden/gedcom_service_read_degrees.json>

Tricky behavior to preserve:
- PHP's is_numeric() accepts leading/trailing whitespace, scientific notation, +/- signs.
  Do NOT use JS's Number.isInteger() or basic isNaN() checks — verify the edge cases
  against the golden data, which documents what PHP actually does.
- Edge case: a bare single digit like '5' (no hemisphere) has hemisphere='5', degrees='',
  which fails the first numeric check, but then is checked again as a bare number via
  is_numeric('5') and succeeds. This is faithfully reproduced in the golden data.

Write JS functions `canonicalTag()`, `readLatitude()`, `readLongitude()` (exported) and
`readDegrees()` (internal) from `lib/services/gedcom-service.js`, plus a short note on
any behavior that could not be replicated identically and how you handled it.
```

Then actually run `parity_gedcom_service.test.js` against the golden file — don't take
the LLM's word for it.

## Phase 3 bridging

**Update:** built after this task landed — see
[phase3-gedcom-service-bridge.md](phase3-gedcom-service-bridge.md). The
reasoning below is kept for the record (it was correct at the time — no
bridge was justified without a follow-on decision to actually build one),
but is now superseded: `GedcomService::canonicalTag()`/`readLatitude()`/
`readLongitude()` do route through `server/migration-service.mjs` when
`WEBTREES_GEDCOM_SERVICE_URL` is set, with automatic native-PHP fallback,
following the exact `/gedcom/canonical-tag` route shape anticipated below.

<details>
<summary>Original reasoning (superseded)</summary>

Unlike Soundex (tasks [01](task-01-soundex-russell.md)/[02](task-02-soundex-daitch-mokotoff.md))
or SurnameTradition (tasks [04](task-04-default-surname-tradition.md)/[05](task-05-patrilineal-surname-tradition.md)),
this task does not wire `GedcomService` into a live Node-service bridge.
Reasoning:

- Its real callers (anywhere that calls `new GedcomService()` in the PHP app) are:
  - GEDCOM import services (`app/Services/GedcomImportService.php`)
  - GEDCOM editing services (`app/Services/GedcomEditService.php`)
  - Embedded in fact/place processing
  All high-traffic, all currently untouched by the migration.

- A bridge would be valuable *only if* Node services (currently being written in
  JavaScript) started needing to parse GEDCOM coordinates or canonicalize tags. Right
  now, there's no JavaScript caller — it's a library port for completeness and future use.

If this reasoning changes — e.g., if a GEDCOM import/export service is built in Node —
`server/migration-service.mjs` already hosts Soundex and SurnameTradition bridges;
adding a `/gedcom/canonical-tag` route there and repeating the short-circuit-with-fallback
pattern would follow the exact same shape as [phase3-soundex-bridge.md](phase3-soundex-bridge.md).

</details>

## Definition of done

- [x] `golden/gedcom_service_canonical_tag.json` (15 cases) and
      `golden/gedcom_service_read_degrees.json` (23 cases) generated from the
      real PHP class (run `php bin/characterize_gedcom_service.php`).
- [x] `lib/services/gedcom-service.js` exports `canonicalTag()`, `readLatitude()`,
      `readLongitude()`. Private helper `readDegrees()` also exported (or not — either is fine).
- [x] `js-tests/parity_gedcom_service.test.js` passes 100% (43/43), covering:
      - `canonicalTag()` with TAG_NAMES lookups, TAG_SYNONYMS lookups, lowercase/mixed-case input,
        and unrecognized tags.
      - `readLatitude()` and `readLongitude()` with valid GEDCOM format, bare numbers,
        and all edge cases (empty, single character, whitespace, scientific notation,
        signed numbers, malformed, garbage, wrong hemisphere).
- [x] TAG_NAMES entry count (122) verified to match the PHP source exactly.
- [x] TAG_SYNONYMS entry count (2) verified to match the PHP source exactly.
- [x] PHP's `is_numeric()` behavior faithfully reproduced via a helper function that
      mimics its permissiveness (whitespace, scientific notation, +/- signs).
- [x] All edge cases from the characterization (golden data) pass without modification
      to the algorithm — no "simplifications" of the coordinate parsing logic.
- [x] Recorded in the Phase 4 cutover table under a new module `lib/services` (first file
      in that directory). Marked "N/A by design — not bridged".

## Corrections found vs. the prompt

**One, found during review, not by the initial port.** The first draft's `isNumeric()`
helper used `!isNaN(Number(trimmed))` — this passes every case the prompt's golden data
covered, but diverges from real `is_numeric()` for inputs the prompt didn't think to
test: `Number()` parses hex strings (`'0x1A'` → `26`) and the JS-specific numeric
literals `'Infinity'`/`'-Infinity'`/`'NaN'`, none of which PHP's `is_numeric()` accepts
— verified directly (`is_numeric('0x1A')`, `is_numeric('Infinity')`, `is_numeric('NaN')`
all return `false`). Low probability of occurring in real GEDCOM coordinate text, but a
real faithfulness gap, not a theoretical one — `readLatitude('N0x1A')` would have silently
returned `26` instead of `null`. Fixed by replacing the `Number()`/`isNaN()` check with a
regex matching PHP's actual numeric-string grammar
(`/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/`, applied post-trim), and added 5 golden
cases (`'N0x1A'`, `'0x1A'`, `'NInfinity'`, `'Infinity'`, `'NaN'`, all expecting `null`)
to `golden/gedcom_service_read_degrees.json` so the divergence is caught by the parity
test, not just fixed ad hoc.
