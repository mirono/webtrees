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
// docs/php-to-js-migration/task-13-gedcom-service.md). GedcomService is
// fully dependency-free — no I18N bootstrap needed.

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Services\GedcomService;
use Fisharebest\Webtrees\Gedcom;

$service = new GedcomService();

// ==================== canonicalTag tests ====================
$canonical_cases = [
    // TAG_NAMES examples (uppercase already, check lookup)
    'BIRTH',
    'ADDRESS1',
    'CONCAT',
    // TAG_NAMES examples (lowercase, test strtoupper())
    'birth',
    'address1',
    'concat',
    // Mixed case
    'Birth',
    'ADDRESS_1',
    // TAG_SYNONYMS examples
    '_PGVU',
    '_pgvu',
    '_PGV_OBJS',
    // Unrecognized tags (should pass through uppercased)
    'BIRT',  // Already canonical (doesn't appear in TAG_NAMES keys)
    'ZZZZ',  // Made-up tag
    'XYZ',
    '',      // Empty string
];

$canonical_results = [];
foreach ($canonical_cases as $tag) {
    $canonical_results[] = [
        'input'  => ['tag' => $tag],
        'output' => $service->canonicalTag($tag),
        'error'  => null,
    ];
}

// ==================== readDegrees tests ====================
// Test both latitude and longitude with various inputs
$degrees_cases = [
    // Valid GEDCOM format with latitude
    ['text' => 'N52.1234', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => 'S52.1234', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],

    // Valid GEDCOM format with longitude
    ['text' => 'E010.5', 'method' => 'readLongitude', 'positive' => Gedcom::LONGITUDE_EAST, 'negative' => Gedcom::LONGITUDE_WEST],
    ['text' => 'W010.5', 'method' => 'readLongitude', 'positive' => Gedcom::LONGITUDE_EAST, 'negative' => Gedcom::LONGITUDE_WEST],

    // Bare numbers (no hemisphere prefix)
    ['text' => '52.1234', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => '10.5', 'method' => 'readLongitude', 'positive' => Gedcom::LONGITUDE_EAST, 'negative' => Gedcom::LONGITUDE_WEST],

    // Edge cases
    ['text' => '', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => 'N', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => '5', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],

    // Whitespace variations
    ['text' => '  52.5  ', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => 'N  52.5', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],

    // Scientific notation
    ['text' => '1e3', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => 'N1e3', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],

    // Signed numbers
    ['text' => '+5', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => '-5', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => 'N+5', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],

    // Malformed numeric
    ['text' => '12.5.6', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => 'N12.5.6', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],

    // Garbage strings
    ['text' => 'not a number', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => 'E52.5', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],  // Wrong hemisphere for latitude

    // Lowercase hemisphere
    ['text' => 'n52.5', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => 's52.5', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],

    // Longitude-specific tests
    ['text' => 'N52.5', 'method' => 'readLongitude', 'positive' => Gedcom::LONGITUDE_EAST, 'negative' => Gedcom::LONGITUDE_WEST],  // Wrong hemisphere for longitude

    // is_numeric() vs a naive Number()/isNaN() JS translation: PHP rejects
    // hex strings and the 'Infinity'/'-Infinity'/'NaN' JS-numeric-literal
    // words, but a naive `!isNaN(Number(x))` port would accept them.
    // Verified directly: is_numeric('0x1A') === false, is_numeric('Infinity') === false.
    ['text' => 'N0x1A', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => '0x1A', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => 'NInfinity', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => 'Infinity', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
    ['text' => 'NaN', 'method' => 'readLatitude', 'positive' => Gedcom::LATITUDE_NORTH, 'negative' => Gedcom::LATITUDE_SOUTH],
];

$degrees_results = [];
foreach ($degrees_cases as $case) {
    $text = $case['text'];
    $method = $case['method'];
    $result = $service->$method($text);

    $degrees_results[] = [
        'input'  => ['text' => $text, 'method' => $method],
        'output' => $result,
        'error'  => null,
    ];
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

file_put_contents($golden_dir . '/gedcom_service_canonical_tag.json', json_encode($canonical_results, JSON_PRETTY_PRINT));
file_put_contents($golden_dir . '/gedcom_service_read_degrees.json', json_encode($degrees_results, JSON_PRETTY_PRINT));

echo 'Wrote ' . count($canonical_results) . " cases to golden/gedcom_service_canonical_tag.json\n";
echo 'Wrote ' . count($degrees_results) . " cases to golden/gedcom_service_read_degrees.json\n";
