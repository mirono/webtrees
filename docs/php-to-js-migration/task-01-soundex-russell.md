# Task 01 — Port `Soundex::russell()` (+ `Soundex::compare()`)

**Priority:** 1 (first task in the batch — zero dependencies, builds momentum)
**Complexity:** Low
**Status:** Done

---

## Phase 0 — Why this one, first

- Zero dependencies: no DB, no session, no `$_SESSION`/`$_POST`, no other
  webtrees classes.
- Small: ~15 lines of real logic plus a 6-line comparison helper.
- Deterministic, pure string → string function — ideal for characterization
  testing.
- Its one subtlety is exactly the kind of thing the checklist warns about:
  it delegates to PHP's **built-in** `soundex()` function, which is a C
  implementation with specific quirks (see "PHP-specific behavior" below).
  There is no JS equivalent to import — this has to be reimplemented and
  proven correct via characterization tests, not assumed.

**File:** `app/Soundex.php`
**Namespace:** `Fisharebest\Webtrees`
**Scope of this task:** `Soundex::russell()` and `Soundex::compare()` only.
`Soundex::daitchMokotoff()` is intentionally excluded — see
[task 02](task-02-soundex-daitch-mokotoff.md).

## Source (current PHP)

```php
/**
 * Is there a match between two soundex codes?
 */
public static function compare(string $soundex1, string $soundex2): bool
{
    if ($soundex1 !== '' && $soundex2 !== '') {
        return array_intersect(explode(':', $soundex1), explode(':', $soundex2)) !== [];
    }

    return false;
}

/**
 * Generate Russell soundex codes for a given text.
 */
public static function russell(string $text): string
{
    $words         = explode(' ', $text);
    $soundex_array = [];

    foreach ($words as $word) {
        $soundex = soundex($word);

        // Only return codes from recognisable sounds
        if ($soundex !== '0000') {
            $soundex_array[] = $soundex;
        }
    }

    // Combine words, e.g. “New York” as “Newyork”
    if (count($words) > 1) {
        $soundex_array[] = soundex(str_replace(' ', '', $text));
    }

    // A varchar(255) column can only hold 51 4-character codes (plus 50 delimiters)
    $soundex_array = array_slice(array_unique($soundex_array), 0, 51);

    return implode(':', $soundex_array);
}
```

## PHP-specific behavior to replicate

`soundex()` is a **PHP built-in** (C implementation of the American Soundex
algorithm). It is not exposed anywhere else in this file, so the JS port
must reimplement the algorithm itself. Known quirks to characterize and
match, not guess at:

- Ignores characters that aren't ASCII letters (ignores digits, punctuation,
  spaces, and non-Latin/accented characters entirely when scanning for
  consonant codes — an accented letter like `é` is dropped, not
  transliterated).
- Case-insensitive.
- Always returns exactly 4 characters: 1 letter + 3 digits, zero-padded
  (e.g. `soundex('A')` → `'A000'`).
- Empty string or a string with no letters at all → PHP's built-in
  `soundex()` returns `'0000'` (verified on PHP 8.5.9, in this repo's
  supported 8.3-8.6 range — do not assume the docs/older-PHP-version
  behavior of returning `''`; confirm against whatever PHP version actually
  runs the characterization script). Because `russell()` filters on
  `$soundex !== '0000'`, this means an all-punctuation or empty word
  contributes *nothing* to `$soundex_array` — not an empty-string entry.
  One non-obvious consequence: `russell(' ')` (a single space) evaluates to
  `'0000'`, not `''` — `explode(' ', ' ')` produces two empty-string
  "words" (`count($words) > 1`), so the unconditional multi-word combine
  step (`soundex(str_replace(' ', '', $text))`, no `!== '0000'` guard)
  still appends `'0000'` even though both per-word entries were filtered
  out. Don't "fix" this case if you see it in the golden file — it's
  correct, just non-obvious.
- Adjacent letters that map to the same soundex digit collapse to one digit
  (standard Soundex rule) — including across a silent `H`/`W` (e.g.
  `Ashcraft` vs `Ashcroft` is the classic edge case used to test this).

Because this is undocumented-by-us C behavior, **do not port this function
without running the PHP characterization script first** — the golden file
is the actual spec here, more so than for typical business logic.

## Phase 1 — Characterization test

Create `golden/soundex_russell.json` by running
`bin/characterize_soundex_russell.php` (repo root, run after
`composer install`) against the real `app/Soundex.php`:

```php
<?php
// bin/characterize_soundex_russell.php
require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Soundex;

// Build a text string guaranteed to produce >51 unique Soundex codes, to
// genuinely exercise the `array_slice(..., 0, 51)` cap in russell(). A
// repeated word (e.g. str_repeat('Smith ', 60)) does NOT do this —
// array_unique() runs before the slice, so 60 copies of the same word
// collapse to 1 code long before the cap is ever reached. Verified by
// direct execution: 78 words with distinct leading-letter/consonant
// patterns produce exactly 51 codes after truncation.
$cap_stress_words = [];
$seen_codes        = [];
foreach (str_split('ABCDEFGHIJKLMNOPQRSTUVWXYZ') as $first) {
    foreach (['b', 'c', 'd', 'l', 'm', 'r'] as $g1) {
        foreach (['b', 'c', 'd', 'l', 'm', 'r'] as $g2) {
            if (count($cap_stress_words) >= 78) {
                break 3;
            }
            $word = $first . $g1 . $g2;
            $code = soundex($word);
            if (!isset($seen_codes[$code])) {
                $seen_codes[$code] = true;
                $cap_stress_words[] = $word;
            }
        }
    }
}

$cases = [
    // Basic single words
    ['text' => 'Smith'],
    ['text' => 'Smyth'],
    ['text' => 'Robert'],
    ['text' => 'Rupert'],
    // Classic Soundex edge case: silent H/W between same-code consonants
    ['text' => 'Ashcraft'],
    ['text' => 'Ashcroft'],
    // Multi-word: combined + per-word codes
    ['text' => 'New York'],
    ['text' => 'van der Berg'],
    // Edge cases
    ['text' => ''],                    // empty string
    ['text' => ' '],                   // whitespace only -> '0000', see note above (NOT '')
    ['text' => '123'],                 // digits only -> '0000' on PHP 8.3-8.6, filtered out
    ['text' => '!!!'],                 // punctuation only -> '0000', filtered out
    ['text' => 'A'],                   // single letter
    ['text' => 'é'],                   // accented letter, no ASCII fallback
    ['text' => 'Müller'],              // accented letter mid-word
    ['text' => 'O\'Brien'],            // apostrophe
    ['text' => 'Mary-Jane Smith-Jones'], // hyphenated, multi-word
    ['text' => str_repeat('Smith ', 60)], // NOT the 51-cap case (see below) — exercises
                                           // array_unique() dedup + the blank-trailing-word
                                           // interaction with the combine step (result:
                                           // 'S530:S532', only 2 codes, not 51)
    ['text' => implode(' ', $cap_stress_words)], // genuinely exceeds the 51-code cap
    ['text' => 'smith'],               // lowercase
    ['text' => 'SMITH'],               // uppercase
];

$results = [];
foreach ($cases as $case) {
    $results[] = [
        'input'  => $case,
        'output' => Soundex::russell($case['text']),
        'error'  => null,
    ];
}

// Also characterize compare(), independently — it has no PHP-builtin dependency
// but is the consumer-facing API and needs its own parity proof.
$compare_cases = [
    ['a' => 'S530', 'b' => 'S530'],
    ['a' => 'S530:S000', 'b' => 'S000:X100'],
    ['a' => 'S530', 'b' => 'S531'],
    ['a' => '', 'b' => 'S530'],
    ['a' => '', 'b' => ''],
];
$compare_results = [];
foreach ($compare_cases as $case) {
    $compare_results[] = [
        'input'  => $case,
        'output' => Soundex::compare($case['a'], $case['b']),
        'error'  => null,
    ];
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

file_put_contents($golden_dir . '/soundex_russell.json', json_encode($results, JSON_PRETTY_PRINT));
file_put_contents($golden_dir . '/soundex_compare.json', json_encode($compare_results, JSON_PRETTY_PRINT));
```

```js
// parity_soundex_russell.test.js
import { russell, compare } from '../lib/soundex.js';
import golden from '../golden/soundex_russell.json';
import goldenCompare from '../golden/soundex_compare.json';

describe('Soundex.russell parity with PHP', () => {
  golden.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input.text)}`, () => {
      expect(russell(input.text)).toEqual(output);
    });
  });
});

describe('Soundex.compare parity with PHP', () => {
  goldenCompare.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input)}`, () => {
      expect(compare(input.a, input.b)).toEqual(output);
    });
  });
});
```

## Phase 2 — Port prompt (ready to hand to an LLM)

```
Port this PHP function to JavaScript. Match its behavior exactly, including
edge cases (null handling, type coercion, error conditions) — do not
"improve" or refactor the logic yet, just translate it faithfully.

IMPORTANT: `russell()` calls PHP's built-in `soundex()` function, which has
no JavaScript equivalent — you must implement the American Soundex algorithm
yourself. Do not guess at PHP's exact behavior for edge cases (empty input,
non-letter-only input, accented characters, case handling) — those are
covered by the golden test cases below; make your implementation match them
exactly, even if that means the behavior looks arbitrary.

PHP source:

    public static function compare(string $soundex1, string $soundex2): bool
    {
        if ($soundex1 !== '' && $soundex2 !== '') {
            return array_intersect(explode(':', $soundex1), explode(':', $soundex2)) !== [];
        }

        return false;
    }

    public static function russell(string $text): string
    {
        $words         = explode(' ', $text);
        $soundex_array = [];

        foreach ($words as $word) {
            $soundex = soundex($word);

            // Only return codes from recognisable sounds
            if ($soundex !== '0000') {
                $soundex_array[] = $soundex;
            }
        }

        // Combine words, e.g. “New York” as “Newyork”
        if (count($words) > 1) {
            $soundex_array[] = soundex(str_replace(' ', '', $text));
        }

        // A varchar(255) column can only hold 51 4-character codes (plus 50 delimiters)
        $soundex_array = array_slice(array_unique($soundex_array), 0, 51);

        return implode(':', $soundex_array);
    }

Here are characterization test cases it must pass (input → expected output):
<paste golden/soundex_russell.json and golden/soundex_compare.json here>

Write the JS functions `russell(text)` and `compare(soundex1, soundex2)` as
named exports from `lib/soundex.js`, plus a short note on any behavior that
could not be replicated identically (e.g. PHP's built-in soundex() edge
cases) and how you handled it.
```

Then actually run `parity_soundex_russell.test.js` against the golden file
— don't take the LLM's word for it.

## Definition of done

- [x] `golden/soundex_russell.json` and `golden/soundex_compare.json`
      generated from the real PHP class (not hand-written).
- [x] `lib/soundex.js` exports `russell()` and `compare()`.
- [x] `parity_soundex_russell.test.js` passes 100% against the golden file
      (26/26 — 21 russell cases + 5 compare cases, via `npm test`).
- [x] Any behavior that couldn't be replicated identically is written down
      in the JS file as a comment, with the specific golden case that
      exposes it. (`lib/soundex.js`'s `soundexWord()` doc comment records
      the H/W-reset finding discovered during the port, verified against
      probe strings and cross-checked against every golden case — no
      unreplicated behavior remains; PHP's `soundex()` was fully
      reimplemented.)
- [x] Recorded in the Phase 4 cutover table under module `lib/soundex`. See
      [phase4-cutover-tracking.md](phase4-cutover-tracking.md). The Phase 3
      bridging strategy (how PHP callers actually reach this code) is
      implemented — see [phase3-soundex-bridge.md](phase3-soundex-bridge.md)
      — though not enabled by default in any environment yet.
