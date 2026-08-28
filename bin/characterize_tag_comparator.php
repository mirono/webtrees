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
// docs/php-to-js-migration/task-03-tag-comparator.md). TagComparator is
// fully dependency-free — no I18N bootstrap needed, unlike task 02.

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Comparators\TagComparator;

$order_cases = [
    'SEX', 'NAME', 'BIRT', 'DEAT', 'CHAN', '_UID',   // spread across the list
    'EVEN',                                          // the fallback target itself
    'NOT_A_REAL_TAG',                                 // unknown tag -> falls back to EVEN's order
    '',                                                // empty string -> also falls back
];

$order_results = [];
foreach ($order_cases as $tag) {
    $order_results[] = ['input' => ['tag' => $tag], 'output' => TagComparator::order($tag), 'error' => null];
}

$byOrder_cases = [
    ['first' => 'BIRT', 'second' => 'DEAT'],   // BIRT before DEAT
    ['first' => 'DEAT', 'second' => 'BIRT'],   // reverse -> opposite sign
    ['first' => 'BIRT', 'second' => 'BIRT'],   // equal -> 0
    ['first' => 'UNKNOWN1', 'second' => 'UNKNOWN2'], // both fall back to EVEN -> 0
    ['first' => 'SEX', 'second' => '_UID'],    // first and (near) last entries
];

$byOrder_results = [];
foreach ($byOrder_cases as $case) {
    $byOrder_results[] = [
        'input'  => $case,
        'output' => TagComparator::byOrder($case['first'], $case['second']),
        'error'  => null,
    ];
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

file_put_contents($golden_dir . '/tag_comparator_order.json', json_encode($order_results, JSON_PRETTY_PRINT));
file_put_contents($golden_dir . '/tag_comparator_byorder.json', json_encode($byOrder_results, JSON_PRETTY_PRINT));

echo 'Wrote ' . count($order_results) . " cases to golden/tag_comparator_order.json\n";
echo 'Wrote ' . count($byOrder_results) . " cases to golden/tag_comparator_byorder.json\n";
