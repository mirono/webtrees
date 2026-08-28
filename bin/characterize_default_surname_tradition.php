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
// docs/php-to-js-migration/task-04-surname-tradition-default.md).
//
// name()/description() are NOT characterized here: per this task's Phase 3
// bridging decision, only the literal keys/context passed to
// I18N::translate*() matter (verified directly from the source:
// I18N::translateContext('Surname tradition', 'none') / description()
// returns '' with no translate call at all) — not translated output, which
// depends on locale and needs I18N::init() bootstrap this task doesn't
// otherwise require.
//
// extractName() is NOT characterized here either — per the same bridging
// decision, its JS port takes a plain NAME-fact array, not a real
// Individual, so there is no PHP call to generate golden output from.
// Its test cases live directly in js-tests/parity_default_surname_tradition.test.js,
// derived from the documented matching rule (Fact::attribute('TYPE') /
// Fact::value(), see this task's doc) and cross-checked against
// Fact::attribute()/value() (app/Fact.php:91-165) reading the PHP source directly.

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\SurnameTradition\DefaultSurnameTradition;

$tradition = new DefaultSurnameTradition();

$results = [
    'defaultName'   => $tradition->defaultName(),
    'newChildNames' => $tradition->newChildNames(null, null, 'M'),
];

// buildName() is protected — characterize via reflection rather than
// changing its visibility in production code.
$reflection = new ReflectionClass($tradition);
$buildName  = $reflection->getMethod('buildName');

$buildName_cases = [
    ['name' => '', 'parts' => []],
    ['name' => '', 'parts' => ['TYPE' => 'BIRTH']],
    ['name' => 'John /Smith/', 'parts' => []],
    ['name' => 'John /Smith/', 'parts' => ['TYPE' => 'BIRTH', 'SPFX' => 'van', 'SURN' => 'Berg']],
    ['name' => 'John /Smith/', 'parts' => ['TYPE' => '']], // empty value -> array_filter drops it
    ['name' => 'John /Smith/', 'parts' => ['TYPE' => '0']], // '0' is also falsy in PHP -> array_filter drops it too
];

$buildName_results = [];
foreach ($buildName_cases as $case) {
    $buildName_results[] = [
        'input'  => $case,
        'output' => $buildName->invoke($tradition, $case['name'], $case['parts']),
        'error'  => null,
    ];
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

file_put_contents($golden_dir . '/default_surname_tradition.json', json_encode($results, JSON_PRETTY_PRINT));
file_put_contents($golden_dir . '/default_surname_tradition_buildname.json', json_encode($buildName_results, JSON_PRETTY_PRINT));

echo "Wrote golden/default_surname_tradition.json\n";
echo 'Wrote ' . count($buildName_results) . " cases to golden/default_surname_tradition_buildname.json\n";
