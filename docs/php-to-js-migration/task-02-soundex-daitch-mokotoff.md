# Task 02 — Port `Soundex::daitchMokotoff()` / `daitchMokotoffWord()`

**Priority:** 2
**Complexity:** Medium (state-machine logic is small; the lookup table is
large and must be copied exactly, not retyped)
**Status:** Done
**Depends on:** Nothing functionally, but run after
[task 01](task-01-soundex-russell.md) — same source file/class, kept as a
separate LLM session per the checklist's "don't batch more than one
function/module per session" rule.

---

## Phase 0 — Why this one, second

Daitch-Mokotoff Soundex is a distinct algorithm from Russell/American
Soundex (task 01) — it's a branching state machine over a large phonetic
lookup table, purpose-built for Slavic/Germanic/Yiddish surname matching.
It shares the file and the "combine multi-word input, cap result count"
shape with `russell()`, but none of its actual logic. Treat it as its own
port.

**File:** `app/Soundex.php`
**Namespace:** `Fisharebest\Webtrees`
**Scope of this task:** `Soundex::daitchMokotoff()` (public entry point) and
`Soundex::daitchMokotoffWord()` (private state machine), plus the two
`const` lookup tables they depend on:

- `TRANSFORM_NAMES` — `app/Soundex.php:49-66` (18 lines, array of
  `[from, to]` string-replacement pairs)
- `DM_SOUNDS` — `app/Soundex.php:83-595` (~512 lines, the phonetic coding
  table)

## Dependencies to bridge

`daitchMokotoffWord()` calls two `I18N` methods before running the state
machine:

```php
$name = I18N::strtoupper($name);
...
$name_script = I18N::textScript($name);
$noVowels    = $name_script === 'Hebr' || $name_script === 'Arab';
```

These are small enough to port inline rather than stub:

- `I18N::strtoupper()` — locale-aware uppercase. For this task, JS's native
  `.toUpperCase()` is an acceptable first pass **but must be characterized**
  — PHP's version may use `mb_strtoupper` under an ICU locale, which can
  differ from JS's `toUpperCase()` for some Unicode ranges (notably Turkish
  dotless-I, but check what locales this app actually ships). Run this
  specific call through its own tiny characterization pass (see below)
  rather than assuming equivalence.
- `I18N::textScript()` — detects the Unicode script of a string
  (specifically cares about Hebrew `'Hebr'` and Arabic `'Arab'` for the
  `$noVowels` branch). Find its implementation (`app/I18N.php`) before
  porting — if it's already just a Unicode range check, port that directly;
  if it depends on `ext-intl`'s script detection, characterize it
  standalone first since that's its own small pure function worth its own
  golden file.

Do not defer this whole task waiting on a full `I18N` port — these two
calls are narrow enough to characterize and inline here.

## Handling the lookup tables

`TRANSFORM_NAMES` and `DM_SOUNDS` are **data, not logic**. Rather than
having an LLM hand-transcribe ~512 lines of PHP array syntax into JS (and
then diffing entry counts to catch drops), `bin/generate_soundex_dm_tables.php`
generates `lib/soundex-dm-tables.js` directly from the live
`Soundex::TRANSFORM_NAMES`/`DM_SOUNDS`/`MAXCHAR` constants via
`ReflectionClass::getReflectionConstant()`, then `json_encode()`s them into
JS array/object literals (valid JS, since JSON is a syntactic subset).
This is a strictly stronger guarantee than a manual-transcription-plus-diff
process — there is nothing to transcribe, so nothing to drop. Verified
afterward anyway (belt and braces): PHP reflection reports 15
`TRANSFORM_NAMES` entries / 507 `DM_SOUNDS` entries; the generated
`lib/soundex-dm-tables.js` has the same counts.

The `"\x01"` placeholder byte in `TRANSFORM_NAMES` (used in the PHP source
as a temporary marker during multi-step string replacement) survives
`json_encode()` as a standard JSON `\u00XX`-style escape sequence, which JS
parses back to the identical control character — confirmed in the
generated output.

Regenerate with `php bin/generate_soundex_dm_tables.php` if `app/Soundex.php`'s
tables ever change; do not hand-edit `lib/soundex-dm-tables.js`.

## Source (current PHP, state machine only — table omitted, see above)

```php
public static function daitchMokotoff(string $text): string
{
    $words         = explode(' ', $text);
    $soundex_array = [];

    foreach ($words as $word) {
        $soundex_array = array_merge($soundex_array, self::daitchMokotoffWord($word));
    }
    // Combine words, e.g. “New York” as “Newyork”
    if (count($words) > 1) {
        $soundex_array = array_merge($soundex_array, self::daitchMokotoffWord(str_replace(' ', '', $text)));
    }

    // A varchar(255) column can only hold 36 6-character codes (plus 35 delimiters)
    $soundex_array = array_slice(array_unique($soundex_array), 0, 36);

    return implode(':', $soundex_array);
}

private static function daitchMokotoffWord(string $name): array
{
    $name = I18N::strtoupper($name);
    foreach (self::TRANSFORM_NAMES as $transformRule) {
        $name = str_replace($transformRule[0], $transformRule[1], $name);
    }

    $name_script = I18N::textScript($name);
    $noVowels    = $name_script === 'Hebr' || $name_script === 'Arab';

    $lastPos         = strlen($name) - 1;
    $currPos         = 0;
    $state           = 1; // 1: start of input string, 2: before vowel, 3: other
    $result          = [];
    $partialResult   = [];
    $partialResult[] = ['!'];

    while ($partialResult !== [] && $currPos <= $lastPos) {
        $thisEntry = substr($name, $currPos, self::MAXCHAR);
        while ($thisEntry !== '') {
            if (isset(self::DM_SOUNDS[$thisEntry])) {
                break;
            }
            $thisEntry = substr($thisEntry, 0, -1);
        }
        if ($thisEntry === '') {
            $currPos++;
            continue;
        }

        $soundTableEntry = self::DM_SOUNDS[$thisEntry];
        $workingResult   = $partialResult;
        $partialResult   = [];
        $currPos += strlen($thisEntry);

        if ($state !== 1) {
            if ($currPos <= $lastPos) {
                $nextEntry = substr($name, $currPos, self::MAXCHAR);
                while ($nextEntry !== '') {
                    if (isset(self::DM_SOUNDS[$nextEntry])) {
                        break;
                    }
                    $nextEntry = substr($nextEntry, 0, -1);
                }
            } else {
                $nextEntry = '';
            }
            if ($nextEntry !== '' && self::DM_SOUNDS[$nextEntry][0] !== '0') {
                $state = 2;
            } else {
                $state = 3;
            }
        }

        while ($state < count($soundTableEntry)) {
            if ($soundTableEntry[$state] === '') {
                foreach ($workingResult as $workingEntry) {
                    $tempEntry                        = $workingEntry;
                    $tempEntry[count($tempEntry) - 1] .= '!';
                    $partialResult[]                  = $tempEntry;
                }
            } else {
                foreach ($workingResult as $workingEntry) {
                    if ($soundTableEntry[$state] !== $workingEntry[count($workingEntry) - 1]) {
                        $workingEntry[] = $soundTableEntry[$state];
                    } elseif ($noVowels) {
                        $workingEntry[] = $soundTableEntry[$state];
                    }

                    if (count($workingEntry) < 7) {
                        $partialResult[] = $workingEntry;
                    } else {
                        $tempResult = str_replace('!', '', implode('', $workingEntry));
                        if ($tempResult !== '') {
                            $result[] = substr($tempResult . '000000', 0, 6);
                        }
                    }
                }
            }
            $state += 3;
        }
    }

    foreach ($partialResult as $workingEntry) {
        $tempResult = str_replace('!', '', implode('', $workingEntry));
        if ($tempResult !== '') {
            $result[] = substr($tempResult . '000000', 0, 6);
        }
    }

    return $result;
}
```

`MAXCHAR` is `private const int MAXCHAR = 7;` (`app/Soundex.php:34`).

## Phase 1 — Characterization test

Bootstrapping note (discovered during implementation, not obvious from the
source alone): `daitchMokotoff()` calls `I18N::strtoupper()`/`textScript()`,
which read `I18N::$locale` — a typed static property that throws if
accessed uninitialized. Full app bootstrap (`Webtrees::run()`) needs a
working DB and DI container, but `I18N::init($code, setup: true)` is
sufficient — it skips the DB-backed custom-module-translations step and
initializes everything these two methods need. Confirmed by direct
execution: `I18N::init('en-US', true)` followed by
`Soundex::daitchMokotoff(...)` works with only `vendor/autoload.php`
loaded, no database, no `Registry` container calls beyond what
`I18N::init()` itself needs.

Also corrected here (found the same way as task 01's equivalent bug):
`str_repeat('Moskowitz ', 40)` does **not** exercise the 36-code cap —
traced and confirmed by execution: `array_unique()` collapses the 40
identical `daitchMokotoffWord('Moskowitz')` results (which only ever
produce 2 distinct codes) before the slice ever runs, so real output is
`'645740:645746'` — 2 codes, nowhere near 36. To genuinely stress the cap,
22 short randomly-generated words were found (offline, not part of the
deterministic script) whose combined DM branch-codes exceed 36 unique
entries; verified the real function truncates them to exactly 36.

`bin/characterize_soundex_daitch_mokotoff.php` (repo root, run after
`composer install`):

```php
<?php
// bin/characterize_soundex_daitch_mokotoff.php
require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Soundex;

I18N::init('en-US', true);

// Verified (see above) to produce exactly 36 unique DM codes when passed
// through daitchMokotoff() — genuinely exercises the 36-code cap, unlike
// a repeated word.
$cap_stress_words = 'SVGEE LWUSHE CSYJWVB PGZO XBBFV ZFZOMF BRYNUKI OSPT BBVCN FEZYRK HFGMAUO GQEJ BYRPV HQVORL HGXQDSL GCXQ TNBDL TJTRBJ OSXHTBP LHVO XWXHA FCNDKF';

$cases = [
    // Names the algorithm is specifically designed for
    ['text' => 'Moskowitz'],
    ['text' => 'Moskovitz'],   // classic DM pair: different spelling, should share a code
    ['text' => 'Auerbach'],
    ['text' => 'Uhrbach'],
    ['text' => 'Peters'],
    ['text' => 'Peterson'],
    ['text' => 'Levine'],
    ['text' => 'Lewin'],
    // Multi-word
    ['text' => 'van der Berg'],
    // Hebrew / Arabic script — exercises the $noVowels branch and TRANSFORM_NAMES
    ['text' => 'משה'],
    ['text' => 'דוד'],
    // Edge cases
    ['text' => ''],
    ['text' => ' '],
    ['text' => 'A'],
    ['text' => '123'],
    ['text' => str_repeat('Moskowitz ', 40)], // NOT the 36-cap case (see above) —
                                               // exercises array_unique() dedup
                                               // (result: '645740:645746', only 2 codes)
    ['text' => $cap_stress_words],            // genuinely exceeds the 36-code cap
    ['text' => 'ß'],           // German sharp s — check TRANSFORM_NAMES/DM_SOUNDS coverage
    ['text' => 'straße'],      // sharp s mid-word
];

$results = [];
foreach ($cases as $case) {
    $results[] = [
        'input'  => $case,
        'output' => Soundex::daitchMokotoff($case['text']),
        'error'  => null,
    ];
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

$json_flags = JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE;

file_put_contents($golden_dir . '/soundex_daitch_mokotoff.json', json_encode($results, $json_flags));

// Separately characterize the two I18N calls this depends on, in isolation
// (under this app's default 'en-US' locale — see lib/soundex.js for the
// documented divergence under other locales, e.g. Turkish/Azerbaijani).
$strtoupper_cases   = ['abc', 'straße', 'istanbul', 'msg', ''];
$strtoupper_results = array_map(
    static fn (string $s): array => ['input' => $s, 'output' => I18N::strtoupper($s)],
    $strtoupper_cases
);
file_put_contents($golden_dir . '/i18n_strtoupper.json', json_encode($strtoupper_results, $json_flags));

// Includes Cyrillic/Greek/CJK, not just Hebrew/Arabic, since the JS port
// ended up porting I18N::textScript()'s full script-range table (small
// enough to be worth doing properly rather than simplifying).
$textscript_cases   = ['Smith', 'משה', 'محمد', '中文', '', 'Кириллица', 'Ελληνικά', '123', '<b>Smith</b>', '&amp;Smith', '@N.N.'];
$textscript_results = array_map(
    static fn (string $s): array => ['input' => $s, 'output' => I18N::textScript($s)],
    $textscript_cases
);
file_put_contents($golden_dir . '/i18n_textscript.json', json_encode($textscript_results, $json_flags));
```

```js
// js-tests/parity_soundex_daitch_mokotoff.test.js
import { daitchMokotoff, strtoupper, textScript } from '../lib/soundex.js';
import golden from '../golden/soundex_daitch_mokotoff.json';
import goldenStrtoupper from '../golden/i18n_strtoupper.json';
import goldenTextscript from '../golden/i18n_textscript.json';

describe('Soundex.daitchMokotoff parity with PHP', () => {
  golden.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input.text).slice(0, 60)}`, () => {
      expect(daitchMokotoff(input.text)).toEqual(output);
    });
  });
});

describe('I18N.strtoupper parity with PHP (en-US locale)', () => {
  goldenStrtoupper.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input)}`, () => {
      expect(strtoupper(input)).toEqual(output);
    });
  });
});

describe('I18N.textScript parity with PHP', () => {
  goldenTextscript.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input)}`, () => {
      expect(textScript(input)).toEqual(output);
    });
  });
});
```

## Phase 2 — Port prompt (ready to hand to an LLM)

```
Port this PHP function to JavaScript. Match its behavior exactly, including
edge cases (null handling, type coercion, error conditions) — do not
"improve" or refactor the logic yet, just translate it faithfully.

This is a branching state machine (Daitch-Mokotoff Soundex) driven by two
large lookup tables. Preserve the state machine's control flow exactly —
even parts that look odd (e.g. the '!' placeholder marker, the state += 3
stepping, the 7-character truncation) are load-bearing, not incidental.

For the two lookup tables (TRANSFORM_NAMES and DM_SOUNDS), copy every entry
verbatim — do not summarize, reorder, merge, or "clean up" table data. I
will diff the entry count and a sample of keys against the PHP source
afterward, so an incomplete table will be caught, but transcribe carefully
the first time.

This function also calls two small helpers you should implement inline:
- I18N::strtoupper($name) — for a first pass, use the JS equivalent
  (locale-aware uppercase); I will characterize this separately against
  the golden/i18n_strtoupper.json cases and flag if it diverges.
- I18N::textScript($name) — returns a Unicode script name; only 'Hebr' and
  'Arab' are checked here. Implement this as a Unicode-range-based script
  detector for at least those two scripts (Hebrew: U+0590–U+05FF, Arabic:
  U+0600–U+06FF), and note that as a simplification versus PHP's version
  (which may use ext-intl) — I will characterize
  golden/i18n_textscript.json separately to confirm.

PHP source:
<paste daitchMokotoff() + daitchMokotoffWord() from above, plus the
TRANSFORM_NAMES and DM_SOUNDS consts from app/Soundex.php:49-66 and
app/Soundex.php:83-595>

Here are characterization test cases it must pass (input → expected output):
<paste golden/soundex_daitch_mokotoff.json here>

Write the JS function `daitchMokotoff(text)` as a named export from
`lib/soundex.js` (same file as task 01's russell()/compare()), plus a short
note on any behavior that could not be replicated identically and how you
handled it.
```

Then actually run `parity_soundex_daitch_mokotoff.test.js` against the
golden file — don't take the LLM's word for it, and specifically verify the
Hebrew/Arabic test cases, since that's the branch most likely to be
subtly wrong.

## Definition of done

- [x] `golden/soundex_daitch_mokotoff.json` (19 cases), `golden/i18n_strtoupper.json`
      (5 cases), `golden/i18n_textscript.json` (11 cases) generated from the
      real PHP classes (`I18N::init('en-US', true)` bootstrap).
- [x] `lib/soundex.js` gains `daitchMokotoff()` (plus `strtoupper()` and
      `textScript()`, needed as its own bridging helpers) alongside task
      01's exports.
- [x] `js-tests/parity_soundex_daitch_mokotoff.test.js` passes 100% against
      the golden file (35/35 across all three describe blocks), including
      the Hebrew/Arabic script cases and the corrected 36-code-cap case.
- [x] Lookup-table entry counts verified to match between PHP source and JS
      port: not just diffed — `lib/soundex-dm-tables.js` is *generated*
      from the live PHP constants via reflection
      (`bin/generate_soundex_dm_tables.php`), so there's nothing to diff
      against; counts independently re-confirmed anyway (15/15
      `TRANSFORM_NAMES`, 507/507 `DM_SOUNDS`).
- [x] Divergence in `I18N::strtoupper`/`textScript` written down in
      `lib/soundex.js`'s doc comments: `strtoupper()` always behaves like
      the non-Turkish/Azerbaijani case (JS has no "current locale" to
      consult) — confirmed identical to PHP under `en-US`, confirmed to
      diverge under `tr` (`'istanbul'` → `'İSTANBUL'` in PHP,
      `'ISTANBUL'` in this port). Accepted as-is; follow-up only if this
      port needs to run under a Turkish/Azerbaijani install. `textScript()`
      was ported in full (not simplified to just Hebrew/Arabic) with two
      narrow, documented simplifications: tag-stripping via regex instead
      of `strip_tags()`, and entity-decoding limited to numeric refs plus
      the five basic named entities instead of PHP's full named-entity
      table — both confirmed sufficient for every golden case.
- [x] Recorded in the Phase 4 cutover table under module `lib/soundex`.
      See [phase4-cutover-tracking.md](phase4-cutover-tracking.md). The
      Phase 3 bridging strategy is implemented — see
      [phase3-soundex-bridge.md](phase3-soundex-bridge.md) — though not
      enabled by default in any environment yet.
