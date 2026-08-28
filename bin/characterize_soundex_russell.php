<?php

/**
 * webtrees: online genealogy
 * Copyright (C) 2026 webtrees development team
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

declare(strict_types=1);

// One-off characterization script (see docs/php-to-js-migration/task-01-soundex-russell.md).
// Run against the real Soundex class to generate the golden JSON that the
// JS port's parity tests are checked against. Not part of the app, not
// covered by phpcs/phpstan (see bin/README.md).

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
$seen_codes       = [];
foreach (str_split('ABCDEFGHIJKLMNOPQRSTUVWXYZ') as $first) {
    foreach (['b', 'c', 'd', 'l', 'm', 'r'] as $g1) {
        foreach (['b', 'c', 'd', 'l', 'm', 'r'] as $g2) {
            if (count($cap_stress_words) >= 78) {
                break 3;
            }
            $word = $first . $g1 . $g2;
            $code = soundex($word);
            if (!isset($seen_codes[$code])) {
                $seen_codes[$code]  = true;
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
    ['text' => ' '],                   // whitespace only -> '0000', see note below (NOT '')
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

echo 'Wrote ' . count($results) . " cases to golden/soundex_russell.json\n";
echo 'Wrote ' . count($compare_results) . " cases to golden/soundex_compare.json\n";
