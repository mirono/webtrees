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
// docs/php-to-js-migration/task-02-soundex-daitch-mokotoff.md). Run against
// the real Soundex/I18N classes to generate the golden JSON that the JS
// port's parity tests are checked against.

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Soundex;

// daitchMokotoff() calls I18N::strtoupper()/textScript(), which need
// I18N::$locale set. Full bootstrap (Webtrees::run()) needs a working DB
// and DI container; I18N::init($code, setup: true) skips the DB-backed
// custom-module-translations step and is sufficient for these two methods.
I18N::init('en-US', true);

// Build a text string guaranteed to produce >36 unique DM codes, to
// genuinely exercise the `array_slice(..., 0, 36)` cap in daitchMokotoff().
// A repeated word (e.g. str_repeat('Moskowitz ', 40)) does NOT do this —
// verified by direct execution: it produces only 2 codes ('645740:645746'),
// nowhere near the cap, for the same array_unique-before-slice reason as
// task 01's equivalent bug. This block was used offline (not re-run here
// to keep the script deterministic) to find 22 short random words whose
// combined DM codes exceed 36 unique entries; the words themselves are
// hardcoded below.
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
                                               // exercises array_unique() dedup +
                                               // the blank-trailing-word interaction
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
// (both under this app's default 'en-US' locale, matching how the JS port's
// strtoupper()/textScript() behave — see lib/soundex.js for the documented
// divergence under other locales, e.g. Turkish/Azerbaijani dotless-i).
$strtoupper_cases   = ['abc', 'straße', 'istanbul', 'msg', ''];
$strtoupper_results = array_map(
    static fn (string $s): array => ['input' => $s, 'output' => I18N::strtoupper($s)],
    $strtoupper_cases
);
file_put_contents($golden_dir . '/i18n_strtoupper.json', json_encode($strtoupper_results, $json_flags));

$textscript_cases   = ['Smith', 'משה', 'محمد', '中文', '', 'Кириллица', 'Ελληνικά', '123', '<b>Smith</b>', '&amp;Smith', '@N.N.'];
$textscript_results = array_map(
    static fn (string $s): array => ['input' => $s, 'output' => I18N::textScript($s)],
    $textscript_cases
);
file_put_contents($golden_dir . '/i18n_textscript.json', json_encode($textscript_results, $json_flags));

echo 'Wrote ' . count($results) . " cases to golden/soundex_daitch_mokotoff.json\n";
echo 'Wrote ' . count($strtoupper_results) . " cases to golden/i18n_strtoupper.json\n";
echo 'Wrote ' . count($textscript_results) . " cases to golden/i18n_textscript.json\n";
