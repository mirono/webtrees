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
 * Characterization script for task 20
 * (docs/php-to-js-migration/task-20-text-wrapper.md).
 * Generates golden fixtures from the real app/Report/{TextWrapper,
 * AbstractTextMeasurer,HtmlTextMeasurer,Style}.php.
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Encodings\UTF8;
use Fisharebest\Webtrees\Report\HtmlTextMeasurer;
use Fisharebest\Webtrees\Report\Style;
use Fisharebest\Webtrees\Report\TextWrapper;

if (!is_dir(__DIR__ . '/../golden')) {
    mkdir(__DIR__ . '/../golden');
}

$measurer = new HtmlTextMeasurer();
$wrapper  = new TextWrapper($measurer);

// ---------------------------------------------------------------------
// 1. Style: constructor validation + fromXmlAttributes().
// ---------------------------------------------------------------------

$style_cases = [];

$style_ctor_cases = [
    ['name' => 'body', 'style' => '', 'size' => 12.0],
    ['name' => 'body', 'style' => 'b', 'size' => 12.0],
    ['name' => 'body', 'style' => 'biud', 'size' => 10.0],
    ['name' => 'body', 'style' => 'du', 'size' => 8.0],
    ['name' => 'body', 'style' => 'x', 'size' => 12.0], // invalid flag
    ['name' => 'body', 'style' => 'B', 'size' => 12.0], // uppercase invalid
];
foreach ($style_ctor_cases as $i => $case) {
    try {
        $style = new Style($case['name'], $case['style'], $case['size']);
        $style_cases[] = [
            'index'  => $i,
            'method' => 'constructor',
            'input'  => $case,
            'result' => ['name' => $style->name, 'style' => $style->style, 'size' => $style->size],
        ];
    } catch (Throwable $e) {
        $style_cases[] = [
            'index'  => $i,
            'method' => 'constructor',
            'input'  => $case,
            'throws' => get_class($e),
        ];
    }
}

$style_xml_cases = [
    ['name' => 'body', 'style' => 'b', 'size' => '14'],
    ['name' => 'body'], // no style/size -> defaults
    [], // missing name
    ['name' => ''], // empty name
];
foreach ($style_xml_cases as $i => $attrs) {
    try {
        $style = Style::fromXmlAttributes($attrs);
        $style_cases[] = [
            'index'  => $i,
            'method' => 'fromXmlAttributes',
            'input'  => $attrs,
            'result' => ['name' => $style->name, 'style' => $style->style, 'size' => $style->size],
        ];
    } catch (Throwable $e) {
        $style_cases[] = [
            'index'  => $i,
            'method' => 'fromXmlAttributes',
            'input'  => $attrs,
            'throws' => get_class($e),
        ];
    }
}

file_put_contents(__DIR__ . '/../golden/report_style.json', json_encode($style_cases, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

// ---------------------------------------------------------------------
// 2. HtmlTextMeasurer::getStringWidth()
// ---------------------------------------------------------------------

$width_cases = [
    ['text' => '', 'style' => ['', 1.0]],
    ['text' => 'a', 'style' => ['', 1.0]],
    ['text' => 'Hello', 'style' => ['', 1.0]],
    ['text' => 'Hello', 'style' => ['b', 1.0]], // bold multiplier
    ['text' => 'Hello World', 'style' => ['', 12.0]], // realistic size
    ['text' => '???', 'style' => ['', 1.0]], // unknown chars -> default 0.55
    ['text' => 'MMMiiiWWWlll', 'style' => ['', 1.0]], // wide vs narrow chars
    ['text' => UTF8::FIRST_STRONG_ISOLATE . 'a' . UTF8::POP_DIRECTIONAL_ISOLATE, 'style' => ['', 1.0]], // zero-width isolates
];

$width_results = [];
foreach ($width_cases as $i => $case) {
    [$style_flags, $size] = $case['style'];
    $style = new Style('s', $style_flags, $size);
    $width_results[] = [
        'index'  => $i,
        'text'   => $case['text'],
        'style'  => ['style' => $style_flags, 'size' => $size],
        'result' => $measurer->getStringWidth($case['text'], $style),
    ];
}

file_put_contents(__DIR__ . '/../golden/html_text_measurer_width.json', json_encode($width_results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

// ---------------------------------------------------------------------
// 3. AbstractTextMeasurer::truncate() (via HtmlTextMeasurer)
// ---------------------------------------------------------------------

$truncate_cases = [
    ['text' => 'short', 'width' => 100.0, 'size' => 1.0],
    ['text' => 'this is a longer piece of text that needs truncating', 'width' => 5.0, 'size' => 1.0],
    ['text' => 'aaaaaaaaaa', 'width' => 3.0, 'size' => 1.0], // narrow chars, moderate truncation
    ['text' => 'a', 'width' => 0.1, 'size' => 1.0], // nothing fits
    ['text' => "line one is long enough to truncate\nline two also long enough to truncate", 'width' => 5.0, 'size' => 1.0], // multi-line
    ['text' => UTF8::FIRST_STRONG_ISOLATE . 'some bidi text here that is long' . UTF8::POP_DIRECTIONAL_ISOLATE, 'width' => 3.0, 'size' => 1.0], // bidi isolate accounting
    ['text' => 'exactfitcase', 'width' => null, 'size' => 1.0], // width computed to be exactly the text width (see below)
];

$truncate_results = [];
foreach ($truncate_cases as $i => $case) {
    $style = new Style('s', '', $case['size']);
    $width = $case['width'];
    if ($width === null) {
        $width = $measurer->getStringWidth($case['text'], $style);
    }
    $truncate_results[] = [
        'index'  => $i,
        'text'   => $case['text'],
        'width'  => $width,
        'size'   => $case['size'],
        'result' => $measurer->truncate($case['text'], $width, $style),
    ];
}

file_put_contents(__DIR__ . '/../golden/text_measurer_truncate.json', json_encode($truncate_results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

// ---------------------------------------------------------------------
// 4. TextWrapper::wrapText() / countLines() / textHeight() / lastLineWidth()
// ---------------------------------------------------------------------

$wrap_cases = [
    ['label' => 'short text, no wrap needed', 'text' => 'Hello World', 'size' => 1.0, 'first_width' => 100.0, 'subsequent_width' => null],
    ['label' => 'wraps at word boundary', 'text' => 'aaaaa bbbbb ccccc ddddd', 'size' => 1.0, 'first_width' => 8.0, 'subsequent_width' => null],
    ['label' => 'leading space preserved (footnote continuation)', 'text' => ' word after a footnote reference', 'size' => 1.0, 'first_width' => 10.0, 'subsequent_width' => null],
    ['label' => 'first_width differs from subsequent_width', 'text' => 'aaaa bbbb cccc dddd eeee', 'size' => 1.0, 'first_width' => 5.0, 'subsequent_width' => 15.0],
    ['label' => 'explicit newline creates a new logical line', 'text' => "line one\nline two", 'size' => 1.0, 'first_width' => 100.0, 'subsequent_width' => null],
    ['label' => 'long word broken at URL punctuation', 'text' => 'https://example.com/some/long/path/that/is/very/long', 'size' => 1.0, 'first_width' => 10.0, 'subsequent_width' => null],
    ['label' => 'long word with no URL punctuation, breaks at width limit', 'text' => str_repeat('m', 40), 'size' => 1.0, 'first_width' => 10.0, 'subsequent_width' => null],
    ['label' => 'word too long for first line but fits a full subsequent line', 'text' => str_repeat('i', 30) . ' short', 'size' => 1.0, 'first_width' => 3.0, 'subsequent_width' => 20.0],
    ['label' => 'empty text', 'text' => '', 'size' => 1.0, 'first_width' => 10.0, 'subsequent_width' => null],
    ['label' => 'single very long word spanning multiple full-width chunks', 'text' => str_repeat('w', 100), 'size' => 1.0, 'first_width' => 10.0, 'subsequent_width' => null],
    ['label' => 'realistic size and width', 'text' => 'The quick brown fox jumps over the lazy dog', 'size' => 12.0, 'first_width' => 80.0, 'subsequent_width' => null],
];

$wrap_results = [];
foreach ($wrap_cases as $i => $case) {
    $style = new Style('s', '', $case['size']);
    try {
        $lines = $wrapper->wrapText($case['text'], $style, $case['first_width'], $case['subsequent_width']);
        $wrap_results[] = [
            'index'             => $i,
            'label'             => $case['label'],
            'text'              => $case['text'],
            'size'              => $case['size'],
            'first_width'       => $case['first_width'],
            'subsequent_width'  => $case['subsequent_width'],
            'lines'             => $lines,
            'countLines'        => $wrapper->countLines($case['text'], $case['first_width'], $style),
            'textHeight'        => $wrapper->textHeight($case['text'], $case['first_width'], $style),
            'lastLineWidth'     => $wrapper->lastLineWidth($case['text'], $case['first_width'], $style),
        ];
    } catch (Throwable $e) {
        $wrap_results[] = [
            'index'  => $i,
            'label'  => $case['label'],
            'text'   => $case['text'],
            'throws' => get_class($e),
        ];
    }
}

// width <= 0 throws
try {
    $wrapper->wrapText('text', new Style('s', '', 1.0), 0.0);
    $wrap_results[] = ['index' => count($wrap_cases), 'label' => 'zero width throws', 'result' => 'did not throw'];
} catch (Throwable $e) {
    $wrap_results[] = ['index' => count($wrap_cases), 'label' => 'zero width throws', 'throws' => get_class($e)];
}
try {
    $wrapper->wrapText('text', new Style('s', '', 1.0), -5.0);
    $wrap_results[] = ['index' => count($wrap_cases) + 1, 'label' => 'negative width throws', 'result' => 'did not throw'];
} catch (Throwable $e) {
    $wrap_results[] = ['index' => count($wrap_cases) + 1, 'label' => 'negative width throws', 'throws' => get_class($e)];
}

file_put_contents(__DIR__ . '/../golden/text_wrapper.json', json_encode($wrap_results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

echo "Done.\n";
