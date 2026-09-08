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
 * One-off dev script (task 16, docs/php-to-js-migration/task-16-encodings.md).
 *
 * Dumps every app/Encodings/*.php class's byte-lookup-table constants as
 * ready-to-paste JS object-literal source. These tables are pure data
 * (hundreds of entries each for ANSEL/CP437/etc.) — generating them
 * mechanically from the real PHP constants via Reflection eliminates any
 * risk of transcription error, which hand-typing or LLM-copying would not.
 *
 * Table keys are raw single encoded bytes (0x80-0xFF) -> emitted as JS
 * \xNN byte-string escapes (one JS UTF-16 code unit per raw byte, the same
 * "binary string" convention Node's Buffer.toString('latin1') uses).
 * Table values are real UTF-8 text -> emitted as ordinary JSON-escaped JS
 * string literals (JSON string syntax is valid inside a JS object literal).
 *
 * This script is not part of any test suite or build step. It was run once
 * to generate the literal tables pasted into lib/encodings/*.js. Re-run it
 * only if app/Encodings/*.php's data tables themselves change.
 *
 * Usage: php bin/dump_encoding_tables.php > /tmp/encoding-tables.js.txt
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Encodings\ANSEL;
use Fisharebest\Webtrees\Encodings\ASCII;
use Fisharebest\Webtrees\Encodings\CP437;
use Fisharebest\Webtrees\Encodings\CP850;
use Fisharebest\Webtrees\Encodings\ISO88591;
use Fisharebest\Webtrees\Encodings\ISO88592;
use Fisharebest\Webtrees\Encodings\MacRoman;
use Fisharebest\Webtrees\Encodings\Windows1250;
use Fisharebest\Webtrees\Encodings\Windows1251;
use Fisharebest\Webtrees\Encodings\Windows1252;

/**
 * Emit a single raw byte (0x00-0xFF) as a JS single-quoted string escape.
 */
function jsByteKey(string $byte): string
{
    return sprintf("'\\x%02X'", ord($byte));
}

/**
 * Emit a real UTF-8 string as a JS double-quoted string literal.
 * json_encode is UTF-8 aware and produces valid JS string syntax.
 *
 * A few of ANSEL's tables (HORN_CONVERT_STEP_2's values, the placeholder
 * markers used as HORN_CONVERT_STEP_1's values) are not valid UTF-8 text —
 * they're raw output-encoding bytes or ASCII-safe placeholder tokens. For
 * those, fall back to a byte-by-byte \xNN escape (still a valid, exact JS
 * string literal, just not JSON syntax).
 */
function jsStringValue(string $text): string
{
    $json = json_encode($text, JSON_UNESCAPED_SLASHES);

    if ($json !== false) {
        return $json;
    }

    $escaped = '';
    foreach (str_split($text) as $byte) {
        $escaped .= sprintf('\\x%02X', ord($byte));
    }

    return "'{$escaped}'";
}

/**
 * @param array<string,string> $table
 */
function dumpByteTable(string $name, array $table): string
{
    ksort($table);

    $lines = [];
    foreach ($table as $key => $value) {
        $lines[] = '  ' . jsByteKey($key) . ': ' . jsStringValue($value) . ',';
    }

    return "export const {$name} = {\n" . implode("\n", $lines) . "\n};\n";
}

/**
 * @param array<string,string> $table
 */
function dumpStringTable(string $name, array $table): string
{
    $lines = [];
    foreach ($table as $key => $value) {
        $lines[] = '  ' . jsStringValue($key) . ': ' . jsStringValue($value) . ',';
    }

    return "export const {$name} = {\n" . implode("\n", $lines) . "\n};\n";
}

$simple_classes = [
    'ASCII'       => ASCII::class,
    'CP437'       => CP437::class,
    'CP850'       => CP850::class,
    'ISO88591'    => ISO88591::class,
    'ISO88592'    => ISO88592::class,
    'MacRoman'    => MacRoman::class,
    'Windows1250' => Windows1250::class,
    'Windows1251' => Windows1251::class,
    'Windows1252' => Windows1252::class,
];

foreach ($simple_classes as $label => $class) {
    $rc = new ReflectionClass($class);
    echo "// ---- {$label} ----\n";
    echo dumpByteTable('TO_UTF8', $rc->getConstant('TO_UTF8'));
    echo "\n";
}

echo "// ---- ANSEL ----\n";
$rc = new ReflectionClass(ANSEL::class);
echo dumpByteTable('TO_UTF8', $rc->getConstant('TO_UTF8'));
echo "\n";
echo dumpStringTable('PRECOMPOSED_CHARACTERS', $rc->getConstant('PRECOMPOSED_CHARACTERS'));
echo "\n";
echo dumpStringTable('HORN_CONVERT_STEP_1', $rc->getConstant('HORN_CONVERT_STEP_1'));
echo "\n";
echo dumpStringTable('HORN_CONVERT_STEP_2', $rc->getConstant('HORN_CONVERT_STEP_2'));
echo "\n";
