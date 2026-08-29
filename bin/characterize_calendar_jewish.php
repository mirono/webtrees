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
// docs/php-to-js-migration/task-10-calendar-jewish.md). No bootstrap
// needed — JewishCalendar is dependency-free, same as every other
// ext-calendar class.

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\ExtCalendar\JewishCalendar;

$jc = new JewishCalendar();

$results = [
    'constants' => [
        'daysInWeek'           => $jc->daysInWeek(),
        'gedcomCalendarEscape' => $jc->gedcomCalendarEscape(),
        'jdStart'              => $jc->jdStart(),
    ],
    'jdToYmd'         => [],
    'ymdToJd'         => [],
    'isLeapYear'      => [],
    'monthsInYear'    => [],
    'daysInMonth'     => [],
    'emulateBug54254' => [],
];

// --- jdToYmd / ymdToJd round trips ---
foreach ([347998, 2460000, 2415021, 2299161] as $jd) {
    $ymd = $jc->jdToYmd($jd);
    $results['jdToYmd'][] = ['input' => ['jd' => $jd], 'output' => $ymd, 'error' => null];

    $roundTrip = $jc->ymdToJd($ymd[0], $ymd[1], $ymd[2]);
    $results['ymdToJd'][] = ['input' => ['year' => $ymd[0], 'month' => $ymd[1], 'day' => $ymd[2]], 'output' => $roundTrip, 'error' => null];
}

// --- isLeapYear / monthsInYear across a full 19-year Metonic cycle ---
for ($y = 5780; $y <= 5799; $y++) {
    $results['isLeapYear'][]   = ['input' => ['year' => $y], 'output' => $jc->isLeapYear($y), 'error' => null];
    $results['monthsInYear'][] = ['input' => ['year' => $y], 'output' => $jc->monthsInYear($y), 'error' => null];
}
$results['monthsInYearNoArg'] = $jc->monthsInYear();

// --- daysInMonth for every month of a leap (5784) and non-leap (5783) year ---
foreach ([5783, 5784] as $y) {
    for ($m = 1; $m <= 13; $m++) {
        $entry = ['input' => ['year' => $y, 'month' => $m]];
        try {
            $entry['output'] = $jc->daysInMonth($y, $m);
            $entry['error']  = null;
        } catch (Throwable $e) {
            $entry['output'] = null;
            $entry['error']  = $e->getMessage();
        }
        $results['daysInMonth'][] = $entry;
    }
}
// Exceptions
foreach ([[0, 1], [5784, 0], [5784, 14]] as [$y, $m]) {
    $entry = ['input' => ['year' => $y, 'month' => $m]];
    try {
        $entry['output'] = $jc->daysInMonth($y, $m);
        $entry['error']  = null;
    } catch (Throwable $e) {
        $entry['output'] = null;
        $entry['error']  = $e->getMessage();
    }
    $results['daysInMonth'][] = $entry;
}

// --- EMULATE_BUG_54254 option: genuinely changes jdToYmd() output ---
$jc_bug = new JewishCalendar([JewishCalendar::EMULATE_BUG_54254 => true]);
foreach ([5783, 5784] as $y) {
    $jd = $jc->ymdToJd($y, $jc->isLeapYear($y) ? 7 : 6, 1);
    $results['emulateBug54254'][] = [
        'input'  => ['year' => $y, 'jd' => $jd],
        'output' => ['normal' => $jc->jdToYmd($jd), 'withBugEmulation' => $jc_bug->jdToYmd($jd)],
    ];
}

// --- numberToHebrewNumerals(): every branch, including the byte/char trap ---
$numeral_cases = [
    ['n' => 1, 'showThousands' => true],
    ['n' => 1, 'showThousands' => false],
    ['n' => 15, 'showThousands' => false],  // special combo entry (avoids spelling a divine name)
    ['n' => 16, 'showThousands' => false],
    ['n' => 17, 'showThousands' => false],
    ['n' => 18, 'showThousands' => false],
    ['n' => 19, 'showThousands' => false],
    ['n' => 20, 'showThousands' => false],  // exact table entry, single character
    ['n' => 100, 'showThousands' => false],
    ['n' => 400, 'showThousands' => false],
    ['n' => 613, 'showThousands' => false], // 3-character result -> final-form substitution
    ['n' => 5784, 'showThousands' => true],
    ['n' => 5784, 'showThousands' => false],
    ['n' => 5000, 'showThousands' => true],  // exact multiple of 1000 -> "X אלפים" branch
    ['n' => 5000, 'showThousands' => false],
    ['n' => 5001, 'showThousands' => true],
    ['n' => 5001, 'showThousands' => false],
];
$results['numberToHebrewNumerals'] = [];
foreach ($numeral_cases as $case) {
    $output                              = $jc->numberToHebrewNumerals($case['n'], $case['showThousands']);
    $results['numberToHebrewNumerals'][] = [
        'input'  => $case,
        'output' => $output,
        // Byte length too, to make the byte-vs-character trap this task's
        // doc describes directly visible/verifiable in the golden file.
        'byteLength' => strlen($output),
    ];
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

file_put_contents($golden_dir . '/calendar_jewish.json', json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo "Wrote golden/calendar_jewish.json\n";
