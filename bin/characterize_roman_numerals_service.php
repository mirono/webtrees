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

// One-off characterization script (see
// docs/php-to-js-migration/task-14-roman-numerals-service.md). RomanNumeralsService
// is fully dependency-free — no bootstrap needed.

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Services\RomanNumeralsService;

$service = new RomanNumeralsService();

// Test numberToRomanNumerals() with various inputs
$numberToRoman_cases = [
    0,                 // 0 -> "(string) 0"
    -5,                // negative
    -1,                // negative
    1,                 // I
    4,                 // IV
    9,                 // IX
    40,                // XL
    90,                // XC
    400,               // CD
    900,               // CM
    3888,              // multiple repeated symbols: MMMDCCCLXXXVIII
    3999,              // traditional max: MMMCMXCIX
    4000,              // no upper bound: MMMM...
    4888,              // beyond "max": MMMMMDCCCLXXXVIII
];

$numberToRoman_results = [];
foreach ($numberToRoman_cases as $num) {
    $numberToRoman_results[] = [
        'input'  => ['number' => $num],
        'output' => $service->numberToRomanNumerals($num),
        'error'  => null,
    ];
}

// Test romanNumeralsToNumber() with various inputs
$romanToNumber_cases = [
    '',                         // empty string
    'I',                        // 1
    'III',                      // 3
    'IV',                       // 4
    'IX',                       // 9
    'MCMXCIV',                  // 1994
    'IIII',                     // non-canonical 4
    'VX',                       // non-canonical (invalid)
    'mcmxciv',                  // lowercase (won't match due to case sensitivity)
    'XIV',                      // 14
    'XIVfoo',                   // 14 with garbage suffix
    'XYZ123',                   // garbage
];

$romanToNumber_results = [];
foreach ($romanToNumber_cases as $roman) {
    $romanToNumber_results[] = [
        'input'  => ['roman' => $roman],
        'output' => $service->romanNumeralsToNumber($roman),
        'error'  => null,
    ];
}

// Round-trip test
$roundtrip_results = [];
foreach ([1, 4, 9, 14, 40, 90, 400, 900, 1994, 3888, 3999, 4000] as $num) {
    $roman = $service->numberToRomanNumerals($num);
    $back = $service->romanNumeralsToNumber($roman);
    $roundtrip_results[] = [
        'input'      => ['number' => $num],
        'toRoman'    => $roman,
        'backToNum'  => $back,
        'roundtrip'  => ($num === $back) ? 'success' : 'fail',
    ];
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

$output = [
    'numberToRomanNumerals' => $numberToRoman_results,
    'romanNumeralsToNumber' => $romanToNumber_results,
    'roundtrip'             => $roundtrip_results,
];

file_put_contents($golden_dir . '/roman_numerals_service.json', json_encode($output, JSON_PRETTY_PRINT));

echo "Wrote " . count($numberToRoman_results) . " numberToRomanNumerals cases\n";
echo "Wrote " . count($romanToNumber_results) . " romanNumeralsToNumber cases\n";
echo "Wrote " . count($roundtrip_results) . " roundtrip cases\n";
echo "Total output written to golden/roman_numerals_service.json\n";
