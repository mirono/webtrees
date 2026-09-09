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

/**
 * Characterization script for task 19
 * (docs/php-to-js-migration/task-19-wrap-long-lines.md).
 * Generates a golden fixture from the real
 * app/Services/GedcomExportService.php::wrapLongLines().
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Services\GedcomExportService;
use Nyholm\Psr7\Factory\Psr17Factory;

if (!is_dir(__DIR__ . '/../golden')) {
    mkdir(__DIR__ . '/../golden');
}

// wrapLongLines() touches neither constructor-injected dependency - any
// real PSR-17 factory implementation satisfies the constructor.
$psr17_factory = new Psr17Factory();
$service       = new GedcomExportService($psr17_factory, $psr17_factory);

$cases = [];

// 1. Short line - well under the limit, unchanged.
$cases[] = [
    'label'          => 'short line, no wrapping',
    'gedcom'         => "0 HEAD\n1 SOUR webtrees",
    'max_line_length' => 253,
];

// 2. Line exactly at the boundary - unchanged (only lines STRICTLY longer wrap).
$exact_value = str_repeat('A', 253 - strlen('1 NOTE '));
$cases[] = [
    'label'          => 'line exactly at max_line_length, unchanged',
    'gedcom'         => '1 NOTE ' . $exact_value,
    'max_line_length' => 253,
];

// 3. Line one character over the boundary - simplest single split, using a
// small max_line_length to keep the fixture readable and hand-verifiable.
$cases[] = [
    'label'          => 'one char over a small max_line_length, single split',
    'gedcom'         => '1 NOTE ' . str_repeat('A', 15),
    'max_line_length' => 20,
];

// 4. Needs multiple splits (long value, small max_line_length).
$cases[] = [
    'label'          => 'multiple splits needed',
    'gedcom'         => '1 NOTE ' . str_repeat('B', 70),
    'max_line_length' => 20,
];

// 5. CONT line: level is NOT incremented (continuation stays at the same level).
$cases[] = [
    'label'          => 'CONT tag: level not incremented',
    'gedcom'         => '2 CONT ' . str_repeat('C', 30),
    'max_line_length' => 20,
];

// 6. Non-CONT tag: level IS incremented for the CONC lines.
$cases[] = [
    'label'          => 'non-CONT tag: level incremented for CONC lines',
    'gedcom'         => '3 NOTE ' . str_repeat('D', 30),
    'max_line_length' => 20,
];

// 7. Split point requires backing up over trailing spaces near the boundary.
$cases[] = [
    'label'          => 'split point backs up over trailing spaces',
    'gedcom'         => '1 NOTE 1234567890123     4567890',
    'max_line_length' => 20,
];

// 8. A long run of a single non-space "word" with no spaces at all: this
// does NOT trigger the give-up branch, because the split position never
// needs to back up in the first place (the character right at the
// boundary is never a space) - it just splits mid-word. Characterization
// found this contradicts a naive reading of the "no non-spaces in the
// data" comment: that refers to a value with NO non-space characters
// (i.e. all spaces), not a value with no space characters at all.
$cases[] = [
    'label'          => 'one long word, no spaces at all - splits mid-word, does NOT give up',
    'gedcom'         => '1 NOTE ' . str_repeat('E', 30),
    'max_line_length' => 12,
];

// 9. The TRUE give-up case: the value is entirely spaces from the
// tag-value separator up to (and past) max_line_length, so backing up
// walks all the way back to the tag-value separator space itself
// (`$pos === strpos($line, ' ', 3)`) and gives up, leaving the line
// unmodified (still too long).
$cases[] = [
    'label'          => 'value is entirely spaces - genuinely cannot split, gives up',
    'gedcom'         => '1 NOTE ' . str_repeat(' ', 30),
    'max_line_length' => 20,
];

// 9b. One real space near the middle of an otherwise single-word value:
// backing up finds THIS space (not the tag separator), so it splits
// normally - included to contrast directly with case 9.
$cases[] = [
    'label'          => 'single space in the value - splits normally at that space',
    'gedcom'         => '1 NOTE ' . str_repeat('F', 12) . ' ' . str_repeat('F', 12),
    'max_line_length' => 20,
];

// 10. Multiple lines in one gedcom blob - only long ones wrap, order preserved.
$cases[] = [
    'label'          => 'multiple lines, mixed lengths',
    'gedcom'         => "0 HEAD\n1 NOTE " . str_repeat('G', 30) . "\n1 SOUR webtrees\n2 CONT " . str_repeat('H', 30),
    'max_line_length' => 20,
];

// 11. Multi-byte UTF-8 content, to check mb_strlen()/mb_substr() semantics
// (character-based, not byte-based) are followed for the split itself.
$cases[] = [
    'label'          => 'multi-byte UTF-8 content, single split',
    'gedcom'         => '1 NOTE ' . str_repeat('é', 15), // é = 2 UTF-8 bytes, 1 character
    'max_line_length' => 20,
];

// 12. Multi-byte UTF-8 content, one long "word" with no spaces at all -
// splits mid-word (does not give up; see case 8's note), and exercises
// strpos() (byte-based) vs mb_strlen()/mb_substr() (char-based) together,
// since 'é' is 1 character but 2 bytes.
$cases[] = [
    'label'          => 'multi-byte UTF-8 content, one long word, splits mid-word',
    'gedcom'         => '1 NOTE ' . str_repeat('é', 30),
    'max_line_length' => 20,
];

// 13. Multi-byte UTF-8 content WITH a splittable space, past the multi-byte run.
$cases[] = [
    'label'          => 'multi-byte UTF-8 content with a later splittable space',
    'gedcom'         => '1 NOTE ' . str_repeat('é', 12) . ' ' . str_repeat('é', 12),
    'max_line_length' => 20,
];

// 14. Empty gedcom string.
$cases[] = [
    'label'          => 'empty string',
    'gedcom'         => '',
    'max_line_length' => 253,
];

// 15. Real-world realistic default (253) with a genuinely long note.
$cases[] = [
    'label'          => 'realistic long note, default max_line_length 253',
    'gedcom'         => '1 NOTE ' . str_repeat('The quick brown fox jumps over the lazy dog. ', 12),
    'max_line_length' => 253,
];

$results = [];
foreach ($cases as $case) {
    $results[] = [
        'label'           => $case['label'],
        'gedcom'          => $case['gedcom'],
        'max_line_length' => $case['max_line_length'],
        'result'          => $service->wrapLongLines($case['gedcom'], $case['max_line_length']),
    ];
}

file_put_contents(__DIR__ . '/../golden/wrap_long_lines.json', json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

echo "Done.\n";
