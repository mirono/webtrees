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
// docs/php-to-js-migration/task-09-calendar-french-arabic-persian.md).
// All three calendars are dependency-free — no bootstrap needed.

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\ExtCalendar\ArabicCalendar;
use Fisharebest\ExtCalendar\CalendarInterface;
use Fisharebest\ExtCalendar\FrenchCalendar;
use Fisharebest\ExtCalendar\PersianCalendar;

/**
 * @return array<string,mixed>
 */
function characterizeCalendar(CalendarInterface $calendar, array $ymd_test_years, array $jd_test_days, array $days_in_month_cases): array
{
    $results = [
        'constants' => [
            'daysInWeek'           => $calendar->daysInWeek(),
            'monthsInYear'         => $calendar->monthsInYear(),
            'gedcomCalendarEscape' => $calendar->gedcomCalendarEscape(),
            'jdStart'              => $calendar->jdStart(),
            'jdEnd'                => $calendar->jdEnd(),
        ],
        'jdToYmd'     => [],
        'ymdToJd'     => [],
        'isLeapYear'  => [],
        'daysInMonth' => [],
    ];

    foreach ($jd_test_days as $jd) {
        $results['jdToYmd'][] = ['input' => ['jd' => $jd], 'output' => $calendar->jdToYmd($jd), 'error' => null];
    }

    foreach ($ymd_test_years as $y) {
        $entry = ['input' => ['year' => $y, 'month' => 1, 'day' => 1]];
        try {
            $entry['output'] = $calendar->ymdToJd($y, 1, 1);
            $entry['error']  = null;
        } catch (Throwable $e) {
            $entry['output'] = null;
            $entry['error']  = $e->getMessage();
        }
        $results['ymdToJd'][] = $entry;

        $results['isLeapYear'][] = ['input' => ['year' => $y], 'output' => $calendar->isLeapYear($y), 'error' => null];
    }
    // Invalid month for ymdToJd
    foreach ([0, $calendar->monthsInYear() + 1] as $bad_month) {
        $entry = ['input' => ['year' => $ymd_test_years[0], 'month' => $bad_month, 'day' => 1]];
        try {
            $entry['output'] = $calendar->ymdToJd($ymd_test_years[0], $bad_month, 1);
            $entry['error']  = null;
        } catch (Throwable $e) {
            $entry['output'] = null;
            $entry['error']  = $e->getMessage();
        }
        $results['ymdToJd'][] = $entry;
    }

    foreach ($days_in_month_cases as [$y, $m]) {
        $entry = ['input' => ['year' => $y, 'month' => $m]];
        try {
            $entry['output'] = $calendar->daysInMonth($y, $m);
            $entry['error']  = null;
        } catch (Throwable $e) {
            $entry['output'] = null;
            $entry['error']  = $e->getMessage();
        }
        $results['daysInMonth'][] = $entry;
    }

    return $results;
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

// --- French (existed 1792-1805; jdStart=2375840, jdEnd=2380687) ---
$french         = new FrenchCalendar();
$french_results = characterizeCalendar(
    $french,
    [1, 5, 7, 11, 14],           // years 3/7/11 (mod 4 == 3) are leap; also boundary year 14
    [$french->jdStart(), $french->jdEnd(), 2378000],
    [[1, 1], [1, 13], [3, 13], [4, 13], [0, 1], [-1, 1]] // year<=0 -> exception
);
file_put_contents($golden_dir . '/calendar_french.json', json_encode($french_results, JSON_PRETTY_PRINT));

// --- Arabic (Hijri) ---
$arabic         = new ArabicCalendar();
$arabic_results = characterizeCalendar(
    $arabic,
    [1, 100, 1445, 1446],
    [$arabic->jdStart(), 2460000, 2450000],
    [[1445, 1], [1445, 2], [1445, 12], [1445, 0], [1445, 13], [1445, -5]] // no exceptions expected, ever
);
file_put_contents($golden_dir . '/calendar_arabic.json', json_encode($arabic_results, JSON_PRETTY_PRINT));

// --- Persian (Jalali) ---
$persian         = new PersianCalendar();
$persian_results = characterizeCalendar(
    $persian,
    [1, 100, 1403, 1404],
    [$persian->jdStart(), 2460000, 2450000],
    [[1403, 1], [1403, 6], [1403, 7], [1403, 12], [1404, 12], [1403, 0], [1403, 13]]
);
// Persian-specific: mod() helper, and the documented negative-year limitation.
$persian_results['mod'] = [];
foreach ([[-5, 3], [5, 3], [-1029982, 1029983], [0, 5], [-2820, 2820]] as [$a, $b]) {
    $persian_results['mod'][] = ['input' => ['dividend' => $a, 'divisor' => $b], 'output' => $persian->mod($a, $b)];
}
// Negative-year round-trip: PHP's own jdToYmd() does not correctly invert
// ymdToJd() for negative years (source comment: "If we allowed negative
// years, we would deal with them here.") — characterized as-is, not fixed.
$persian_results['negativeYearLimitation'] = [];
foreach ([-1, -100] as $y) {
    $entry = ['input' => ['year' => $y]];
    try {
        $jd                    = $persian->ymdToJd($y, 1, 1);
        $entry['ymdToJdOutput'] = $jd;
        $entry['ymdToJdError']  = null;
        try {
            $entry['roundTripOutput'] = $persian->jdToYmd($jd);
            $entry['roundTripError']  = null;
        } catch (Throwable $e) {
            $entry['roundTripOutput'] = null;
            $entry['roundTripError']  = $e->getMessage();
        }
    } catch (Throwable $e) {
        $entry['ymdToJdOutput']  = null;
        $entry['ymdToJdError']   = $e->getMessage();
        $entry['roundTripOutput'] = null;
        $entry['roundTripError']  = null;
    }
    $persian_results['negativeYearLimitation'][] = $entry;
}
file_put_contents($golden_dir . '/calendar_persian.json', json_encode($persian_results, JSON_PRETTY_PRINT));

echo "Wrote golden/calendar_french.json, golden/calendar_arabic.json, golden/calendar_persian.json\n";
