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
 * Characterization script for task 16 (docs/php-to-js-migration/task-16-encodings.md).
 * Generates golden fixtures from the real app/Encodings/*.php and
 * app/Factories/EncodingFactory.php classes.
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Encodings\ANSEL;
use Fisharebest\Webtrees\Encodings\ASCII;
use Fisharebest\Webtrees\Encodings\CP437;
use Fisharebest\Webtrees\Encodings\CP850;
use Fisharebest\Webtrees\Encodings\EncodingInterface;
use Fisharebest\Webtrees\Encodings\ISO88591;
use Fisharebest\Webtrees\Encodings\ISO88592;
use Fisharebest\Webtrees\Encodings\MacRoman;
use Fisharebest\Webtrees\Encodings\UTF16BE;
use Fisharebest\Webtrees\Encodings\UTF16LE;
use Fisharebest\Webtrees\Encodings\UTF8;
use Fisharebest\Webtrees\Encodings\Windows1250;
use Fisharebest\Webtrees\Encodings\Windows1251;
use Fisharebest\Webtrees\Encodings\Windows1252;
use Fisharebest\Webtrees\Exceptions\InvalidGedcomEncodingException;
use Fisharebest\Webtrees\Factories\EncodingFactory;

if (!is_dir(__DIR__ . '/../golden')) {
    mkdir(__DIR__ . '/../golden');
}

function bytesToHex(string $bytes): string
{
    return bin2hex($bytes);
}

function hexToBytes(string $hex): string
{
    return hex2bin($hex);
}

// ---------------------------------------------------------------------
// 1. Simple byte-table encodings: exhaustive round-trip over every byte
//    0x00-0xFF, plus convertibleBytes edge cases.
// ---------------------------------------------------------------------

$simple_encodings = [
    'ASCII'       => new ASCII(),
    'CP437'       => new CP437(),
    'CP850'       => new CP850(),
    'ISO88591'    => new ISO88591(),
    'ISO88592'    => new ISO88592(),
    'MacRoman'    => new MacRoman(),
    'Windows1250' => new Windows1250(),
    'Windows1251' => new Windows1251(),
    'Windows1252' => new Windows1252(),
    'ANSEL'       => new ANSEL(),
];

$roundtrip_cases = [];

foreach ($simple_encodings as $label => $encoding) {
    for ($byte = 0x00; $byte <= 0xFF; $byte++) {
        $source_byte = chr($byte);
        $utf8        = $encoding->toUtf8($source_byte);

        // Found during characterization: MacRoman's TO_UTF8 table has no
        // entry for byte 0xF0 (the classic "Apple logo" character), so
        // toUtf8() passes it through unconverted, producing invalid UTF-8.
        // Feeding that into fromUtf8() crashes with an uncaught TypeError
        // (preg_split('//u', ...) returns false on invalid input, and
        // array_map(..., false) is a type error) — a real, if narrow, bug:
        // any conversion *from* a MacRoman-imported GEDCOM containing this
        // byte *to* any non-UTF8 encoding fatals the request. Recorded
        // here rather than reproduced as a JS crash — see
        // docs/php-to-js-migration/task-16-encodings.md.
        if (@preg_match('//u', $utf8) !== 1) {
            $roundtrip_cases[] = [
                'encoding'    => $label,
                'source_byte' => bytesToHex($source_byte),
                'to_utf8'     => bytesToHex($utf8),
                'round_trip_throws' => true,
            ];
            continue;
        }

        $back = $encoding->fromUtf8($utf8);

        $roundtrip_cases[] = [
            'encoding'    => $label,
            'source_byte' => bytesToHex($source_byte),
            'to_utf8'     => bytesToHex($utf8),
            'round_trip'  => bytesToHex($back),
        ];
    }

    // A handful of realistic multi-character strings, ASCII mixed with
    // high-bit bytes, to exercise sequences (not just single bytes).
    $strings = [
        "Hello World",
        "Line1\nLine2\rLine3",
        "",
        " ",
        "\n",
        "\r",
    ];

    foreach ($strings as $i => $string) {
        $utf8 = $encoding->toUtf8($string);
        $back = $encoding->fromUtf8($utf8);

        $roundtrip_cases[] = [
            'encoding'    => $label,
            'label'       => 'string_' . $i,
            'source_byte' => bytesToHex($string),
            'to_utf8'     => bytesToHex($utf8),
            'round_trip'  => bytesToHex($back),
        ];
    }
}

// convertibleBytes cases
$convertible_cases = [];
foreach ($simple_encodings as $label => $encoding) {
    $tests = [
        '' ,
        'ABCDE',
        $encoding->fromUtf8("Hello World"),
        $encoding->fromUtf8("Hello World") . 'XY', // trailing partial-ish bytes
        $encoding->fromUtf8("A\nB"),
        $encoding->fromUtf8("A\rB"),
        $encoding->fromUtf8("A B"),
        str_repeat('Z', 10),
    ];

    foreach ($tests as $i => $text) {
        $convertible_cases[] = [
            'encoding' => $label,
            'index'    => $i,
            'input'    => bytesToHex($text),
            'result'   => $encoding->convertibleBytes($text),
        ];
    }
}

file_put_contents(__DIR__ . '/../golden/encodings_roundtrip.json', json_encode($roundtrip_cases, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
file_put_contents(__DIR__ . '/../golden/encodings_convertible_bytes.json', json_encode($convertible_cases, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// ---------------------------------------------------------------------
// 2. ANSEL-specific diacritic/precomposition/horn cases.
// ---------------------------------------------------------------------

$ansel = new ANSEL();

$ansel_cases = [
    // Real accented text (precomposed in UTF-8) round-tripped through ANSEL.
    ['label' => 'e_acute', 'utf8' => "\u{00e9}"], // é
    ['label' => 'e_acute_word', 'utf8' => "Andr\u{00e9}"], // André
    ['label' => 'a_ring', 'utf8' => "\u{00e5}"], // å
    ['label' => 'n_tilde', 'utf8' => "\u{00f1}"], // ñ
    ['label' => 'o_double_acute', 'utf8' => "\u{0151}"], // ő (double diacritic combo)
    ['label' => 'c_cedilla', 'utf8' => "\u{00e7}"], // ç
    ['label' => 'es_zett_capital', 'utf8' => "\u{1e9e}"], // ẞ
    ['label' => 'es_zett_lower', 'utf8' => "\u{00df}"], // ß
    ['label' => 'o_horn', 'utf8' => "o\u{031b}"], // o + combining horn
    ['label' => 'u_horn_capital', 'utf8' => "U\u{031b}"],
    ['label' => 'o_horn_with_acute', 'utf8' => "o\u{031b}\u{0301}"], // horn + additional diacritic
    ['label' => 'euro_sign', 'utf8' => "\u{20ac}"],
    ['label' => 'degree_sign', 'utf8' => "\u{00b0}"],
    ['label' => 'empty_string', 'utf8' => ""],
    ['label' => 'ascii_only', 'utf8' => "Smith"],
    ['label' => 'mixed_multi', 'utf8' => "Jos\u{00e9} Andr\u{00e9} M\u{00fc}ller"],
    // Raw ANSEL bytes (round-trip the other direction) from the docblock's
    // documented double-diacritic pairs.
    ['label' => 'double_tilde_fa_fb', 'ansel_hex' => bin2hex("x" . "\xFA" . "y" . "\xFB")],
    ['label' => 'double_breve_eb_ec', 'ansel_hex' => bin2hex("x" . "\xEB" . "y" . "\xEC")],
    ['label' => 'combining_slash', 'ansel_hex' => bin2hex("N" . "\xFF")],
];

$ansel_results = [];
foreach ($ansel_cases as $case) {
    if (isset($case['utf8'])) {
        $from = $ansel->fromUtf8($case['utf8']);
        $back = $ansel->toUtf8($from);

        $ansel_results[] = [
            'label'       => $case['label'],
            'utf8_hex'    => bytesToHex($case['utf8']),
            'from_utf8'   => bytesToHex($from),
            'round_trip'  => bytesToHex($back),
        ];
    } else {
        $ansel_bytes = hexToBytes($case['ansel_hex']);
        $to          = $ansel->toUtf8($ansel_bytes);
        $back        = $ansel->fromUtf8($to);

        $ansel_results[] = [
            'label'      => $case['label'],
            'ansel_hex'  => $case['ansel_hex'],
            'to_utf8'    => bytesToHex($to),
            'round_trip' => bytesToHex($back),
        ];
    }
}

file_put_contents(__DIR__ . '/../golden/encodings_ansel_special.json', json_encode($ansel_results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// ---------------------------------------------------------------------
// 3. UTF16BE/UTF16LE: fromUtf8 (bug: always zeroes non-ASCII),
//    toUtf8 (bug: 0x80-0xFF treated invalid; no surrogate combining),
//    convertibleBytes.
// ---------------------------------------------------------------------

$utf16_variants = [
    'UTF16BE' => new UTF16BE(),
    'UTF16LE' => new UTF16LE(),
];

$from_utf8_cases = [
    'ascii_a'          => "A",
    'ascii_string'     => "Hello",
    'latin1_e_acute'   => "\u{00e9}",       // 2-byte UTF-8, in the buggy 0x80-0x7FF path
    'cyrillic'         => "\u{0434}",       // 2-byte
    'euro_sign'        => "\u{20ac}",       // 3-byte
    'cjk'              => "\u{4e2d}",       // 3-byte
    'emoji_astral'     => "\u{1f600}",      // 4-byte / astral
    'mixed_a_e_b'      => "A\u{00e9}B",
    'two_letters'      => "\u{00e9}\u{00e8}",
    'empty'            => "",
];

$utf16_from_utf8_results = [];
foreach ($utf16_variants as $label => $encoding) {
    foreach ($from_utf8_cases as $case_label => $text) {
        $utf16_from_utf8_results[] = [
            'encoding' => $label,
            'case'     => $case_label,
            'utf8_hex' => bytesToHex($text),
            'result'   => bytesToHex($encoding->fromUtf8($text)),
        ];
    }
}

file_put_contents(__DIR__ . '/../golden/encodings_utf16_from_utf8.json', json_encode($utf16_from_utf8_results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// toUtf8: build raw UTF-16 byte pairs directly (BE order), covering the
// boundary bug and surrogate handling.
function utf16Bytes(array $code_points, bool $little_endian): string
{
    $out = '';
    foreach ($code_points as $cp) {
        $hi = intdiv($cp, 256);
        $lo = $cp % 256;
        $out .= $little_endian ? (chr($lo) . chr($hi)) : (chr($hi) . chr($lo));
    }
    return $out;
}

$to_utf8_cases = [
    'ascii'                  => [0x0041],
    'boundary_0x7f'          => [0x007F],
    'boundary_0x80'          => [0x0080], // starts the buggy "invalid" range
    'latin1_e_acute_0xE9'    => [0x00E9], // common accented char, hits the bug
    'boundary_0xff'          => [0x00FF],
    'boundary_0x100'         => [0x0100], // just past the buggy range, should decode fine
    'two_byte_0x7ff'         => [0x07FF],
    'three_byte_0x800'       => [0x0800],
    'cjk_0x4e2d'             => [0x4E2D],
    'boundary_0xd7ff'        => [0xD7FF],
    'lone_high_surrogate'    => [0xD800],
    'lone_low_surrogate'     => [0xDFFF],
    'surrogate_pair_emoji'   => [0xD83D, 0xDE00], // U+1F600, not combined
    'boundary_0xe000'        => [0xE000],
    'boundary_0xffff'        => [0xFFFF],
    'multi_char'             => [0x0041, 0x00E9, 0x0042],
];

$utf16_to_utf8_results = [];
foreach (['UTF16BE' => false, 'UTF16LE' => true] as $label => $little_endian) {
    $encoding = $utf16_variants[$label];
    foreach ($to_utf8_cases as $case_label => $code_points) {
        $bytes  = utf16Bytes($code_points, $little_endian);
        $result = $encoding->toUtf8($bytes);

        $utf16_to_utf8_results[] = [
            'encoding'  => $label,
            'case'      => $case_label,
            'input_hex' => bytesToHex($bytes),
            'result'    => bytesToHex($result),
        ];
    }

    // convertibleBytes: even, odd byte counts.
    foreach ([0, 1, 2, 3, 4, 5, 10, 11] as $len) {
        $text = str_repeat('X', $len);
        $utf16_to_utf8_results[] = [
            'encoding'         => $label,
            'case'             => 'convertible_bytes_len_' . $len,
            'convertibleBytes' => $encoding->convertibleBytes($text),
        ];
    }
}

file_put_contents(__DIR__ . '/../golden/encodings_utf16_to_utf8.json', json_encode($utf16_to_utf8_results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// ---------------------------------------------------------------------
// 4. UTF8 class: validate/repair cleanup, verified against Node's
//    TextDecoder('utf-8', {fatal:false}) which implements the same
//    (WHATWG) algorithm as PHP's mb_convert_encoding cleanup.
// ---------------------------------------------------------------------

$utf8 = new UTF8();

$utf8_cleanup_cases = [
    'valid_ascii'                  => "Hello",
    'valid_2byte'                  => "\xC3\xA9",
    'valid_3byte'                  => "\xE2\x82\xAC",
    'valid_4byte_emoji'            => "\xF0\x9F\x98\x80",
    'lone_continuation'            => "\x80",
    'lone_continuation_x2'         => "\x80\x81",
    'truncated_2byte'              => "\xC3",
    'truncated_3byte_1of3'         => "\xE2",
    'truncated_3byte_2of3'         => "\xE2\x82",
    'truncated_4byte_1of4'         => "\xF0",
    'truncated_4byte_3of4'         => "\xF0\x9F\x98",
    'invalid_start_0xFF'           => "\xFF",
    'invalid_start_0xFE'           => "\xFE",
    'invalid_start_0xC0'           => "\xC0",
    'invalid_start_0xC1'           => "\xC1",
    'overlong_c0_80'               => "\xC0\x80",
    'overlong_e0_80_80'            => "\xE0\x80\x80",
    'valid_then_invalid'           => "A\x80B",
    'surrogate_encoded_eda080'     => "\xED\xA0\x80",
    'mixed_valid_truncated'        => "\xC3\xA9\xC3",
    'empty'                        => "",
    'out_of_range_lead_f5'         => "\xF5\x80\x80\x80",
    'valid_string_with_bom'        => "\xEF\xBB\xBF" . "Hello",
    'multiple_errors_in_a_row'     => "\x80\x80\x80\x80",
];

$utf8_results = [];
foreach ($utf8_cleanup_cases as $label => $bytes) {
    $utf8_results[] = [
        'label'      => $label,
        'input_hex'  => bytesToHex($bytes),
        'from_utf8'  => bytesToHex($utf8->fromUtf8($bytes)),
        'to_utf8'    => bytesToHex($utf8->toUtf8($bytes)),
    ];
}

file_put_contents(__DIR__ . '/../golden/encodings_utf8_cleanup.json', json_encode($utf8_results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// ---------------------------------------------------------------------
// 5. EncodingFactory: detect(), make(), list().
// ---------------------------------------------------------------------

$factory = new EncodingFactory();

function makeName(EncodingInterface|null $encoding): string|null
{
    if ($encoding === null) {
        return null;
    }
    return $encoding::NAME;
}

$header_line = "0 HEAD\n1 SOUR Test\n1 GEDC\n2 VERS 5.5.1\n2 FORM LINEAGE-LINKED\n1 CHAR %s\n0 @I1@ INDI\n";

$detect_cases = [];

// BOM cases
$bom_cases = [
    'utf8_bom'    => "\xEF\xBB\xBF" . "0 HEAD\n1 CHAR UTF-8\n",
    'utf16be_bom' => "\xFE\xFF" . "\x000\x00 \x00H\x00E\x00A\x00D",
    'utf16le_bom' => "\xFF\xFE" . "0\x00 \x00H\x00E\x00A\x00D\x00",
];
foreach ($bom_cases as $label => $header) {
    $detect_cases[] = [
        'label'    => $label,
        'header'   => bytesToHex($header),
        'detected' => makeName($factory->detect($header)),
    ];
}

// Null-byte UTF16 heuristic (no BOM)
$null_heuristic_cases = [
    'utf16be_null_heuristic' => "\x000" . "\x00 " . "\x00H",
    'utf16le_null_heuristic' => "0\x00" . " \x00" . "H\x00",
];
foreach ($null_heuristic_cases as $label => $header) {
    $detect_cases[] = [
        'label'    => $label,
        'header'   => bytesToHex($header),
        'detected' => makeName($factory->detect($header)),
    ];
}

// CHAR label cases, covering every entry in the character_sets table plus case variations.
$char_labels = [
    'ASCII', 'ansel', 'ANSEL', 'UTF-8', 'utf-8', 'UNICODE',
    'ASCII/MacOS Roman', 'ASCII/MACINTOSH', 'MACINTOSH',
    'CP437', 'IBMPC', 'IBM', 'IBM-PC', 'OEM',
    'CP850', 'MSDOS', 'IBM-DOS', 'MS-DOS', 'ANSI', 'WINDOWS', 'IBM WINDOWS', 'IBM_WINDOWS',
    'CP1250', 'windows-1250', 'CP1251', 'WINDOWS-1251', 'CP1252',
    'ISO-8859-1', 'ISO8859-1', 'ISO8859', 'LATIN-1', 'LATIN1',
    'ISO-8859-2', 'ISO8859-2', 'LATIN-2', 'LATIN2',
];
foreach ($char_labels as $label) {
    $header = sprintf($header_line, $label);
    $detect_cases[] = [
        'label'    => 'char_label_' . $label,
        'header'   => bytesToHex($header),
        'detected' => makeName($factory->detect($header)),
    ];
}

// CHARACTER keyword variant
$header = "0 HEAD\n1 CHARACTER ASCII\n0 @I1@ INDI\n";
$detect_cases[] = [
    'label'    => 'character_keyword',
    'header'   => bytesToHex($header),
    'detected' => makeName($factory->detect($header)),
];

// No CHAR line at all -> falls through to UTF8 default (if a complete header exists)
$header = "0 HEAD\n1 SOUR Test\n0 @I1@ INDI\n";
$detect_cases[] = [
    'label'    => 'no_char_line_defaults_utf8',
    'header'   => bytesToHex($header),
    'detected' => makeName($factory->detect($header)),
];

// No "\n0" at all -> null (incomplete header)
$header = "0 HEAD\n1 SOUR Test";
$detect_cases[] = [
    'label'    => 'incomplete_header_returns_null',
    'header'   => bytesToHex($header),
    'detected' => makeName($factory->detect($header)),
];

// Whitespace normalization: extra blank lines / spaces around CHAR line
$header = "0 HEAD\n\n1  CHAR   ASCII  \n\n0 @I1@ INDI\n";
$detect_cases[] = [
    'label'    => 'whitespace_normalization',
    'header'   => bytesToHex($header),
    'detected' => makeName($factory->detect($header)),
];

// Leading whitespace (ltrim)
$header = "\n\n  0 HEAD\n1 CHAR ASCII\n0 @I1@ INDI\n";
$detect_cases[] = [
    'label'    => 'leading_whitespace_ltrim',
    'header'   => bytesToHex($header),
    'detected' => makeName($factory->detect($header)),
];

// CRLF / CR line endings
$header = "0 HEAD\r\n1 CHAR ASCII\r\n0 @I1@ INDI\r\n";
$detect_cases[] = [
    'label'    => 'crlf_line_endings',
    'header'   => bytesToHex($header),
    'detected' => makeName($factory->detect($header)),
];
$header = "0 HEAD\r1 CHAR ASCII\r0 @I1@ INDI\r";
$detect_cases[] = [
    'label'    => 'cr_line_endings',
    'header'   => bytesToHex($header),
    'detected' => makeName($factory->detect($header)),
];

file_put_contents(__DIR__ . '/../golden/encoding_factory_detect.json', json_encode($detect_cases, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// Unknown CHAR value -> exception. InvalidGedcomEncodingException's
// constructor calls I18N::translate() for the message, which isn't
// available in this bootstrap-free script — we only need to confirm which
// unrecognized value triggers the exception, which the regex capture
// group in EncodingFactory::detect() already tells us (group 1 of
// '/1 CHAR (.+)/'), not the translated message text itself.
$unknown_header  = "0 HEAD\n1 CHAR BOGUS_ENCODING\n0 @I1@ INDI\n";
$exception_class = null;
try {
    $factory->detect($unknown_header);
} catch (Throwable $exception) {
    $exception_class = get_class($exception);
}
file_put_contents(__DIR__ . '/../golden/encoding_factory_detect_exception.json', json_encode([
    'header'                  => bytesToHex($unknown_header),
    'exception_class'         => $exception_class,
    'unrecognized_char_value' => 'BOGUS_ENCODING',
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// make() for every valid name + an invalid one
$make_names = (new EncodingFactory())->list();
$make_cases = [];
foreach (array_keys($make_names) as $name) {
    $make_cases[] = [
        'name'        => $name,
        'result_name' => $factory->make($name)::NAME,
    ];
}
$make_invalid_message = null;
try {
    $factory->make('NOT-A-REAL-ENCODING');
} catch (DomainException $exception) {
    $make_invalid_message = $exception->getMessage();
}
file_put_contents(__DIR__ . '/../golden/encoding_factory_make.json', json_encode([
    'valid_cases'     => $make_cases,
    'invalid_message' => $make_invalid_message,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// list()
file_put_contents(__DIR__ . '/../golden/encoding_factory_list.json', json_encode($factory->list(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

echo "Done.\n";
