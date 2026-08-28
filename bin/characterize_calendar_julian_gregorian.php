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
// docs/php-to-js-migration/task-07-calendar-julian-gregorian.md).
// fisharebest/ext-calendar's Julian/Gregorian calendar classes are
// dependency-free — no I18N bootstrap needed, unlike the Soundex
// daitchMokotoff task.

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\ExtCalendar\CalendarInterface;
use Fisharebest\ExtCalendar\GregorianCalendar;
use Fisharebest\ExtCalendar\JulianCalendar;

/**
 * @return array<string,mixed>
 */
function characterizeCalendar(CalendarInterface $calendar): array
{
    $results = [
        'constants' => [
            'daysInWeek'           => $calendar->daysInWeek(),
            'monthsInYear'         => $calendar->monthsInYear(),
            'gedcomCalendarEscape' => $calendar->gedcomCalendarEscape(),
            'jdStart'              => $calendar->jdStart(),
            // jdEnd (PHP_INT_MAX) deliberately NOT characterized
            // byte-for-byte — see task doc's "adapted, not replicated" note.
        ],
        'jdToYmd'     => [],
        'ymdToJd'     => [],
        'isLeapYear'  => [],
        'daysInMonth' => [],
        'easterDays'  => [],
    ];

    // Round-trip a wide range of Julian day numbers, including BCE-era
    // and the classic JD epoch reference points.
    foreach ([0, 1, 328, 366, 1721060, 1721424, 1721426, 2451545, 2460000, 2500000] as $jd) {
        $results['jdToYmd'][] = ['input' => ['jd' => $jd], 'output' => $calendar->jdToYmd($jd), 'error' => null];
    }

    foreach (
        [
            [1, 1, 1], [0, 1, 1], [-1, 1, 1], [-4713, 11, 24], [-4714, 11, 24],
            [2000, 1, 1], [1900, 2, 28], [2024, 2, 29], [100, 3, 1],
        ] as [$y, $m, $d]
    ) {
        $entry = ['input' => ['year' => $y, 'month' => $m, 'day' => $d]];
        try {
            $entry['output'] = $calendar->ymdToJd($y, $m, $d);
            $entry['error']  = null;
        } catch (Throwable $e) {
            $entry['output'] = null;
            $entry['error']  = $e->getMessage();
        }
        $results['ymdToJd'][] = $entry;
    }
    // Invalid month
    foreach ([0, 13, -1] as $bad_month) {
        $entry = ['input' => ['year' => 2024, 'month' => $bad_month, 'day' => 1]];
        try {
            $entry['output'] = $calendar->ymdToJd(2024, $bad_month, 1);
            $entry['error']  = null;
        } catch (Throwable $e) {
            $entry['output'] = null;
            $entry['error']  = $e->getMessage();
        }
        $results['ymdToJd'][] = $entry;
    }

    foreach ([1900, 2000, 2024, 2023, -4, -100, -400, 0, 1] as $y) {
        $results['isLeapYear'][] = ['input' => ['year' => $y], 'output' => $calendar->isLeapYear($y), 'error' => null];
    }

    foreach ([[2024, 2], [2023, 2], [1900, 2], [2000, 2], [2024, 4], [2024, 1], [-4, 2]] as [$y, $m]) {
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
    // Invalid month / year=0 (Julian only throws for year 0; characterize
    // both calendars anyway so the golden file proves the difference)
    foreach ([0, 13, -1] as $bad_month) {
        $entry = ['input' => ['year' => 2024, 'month' => $bad_month]];
        try {
            $entry['output'] = $calendar->daysInMonth(2024, $bad_month);
            $entry['error']  = null;
        } catch (Throwable $e) {
            $entry['output'] = null;
            $entry['error']  = $e->getMessage();
        }
        $results['daysInMonth'][] = $entry;
    }
    $entry = ['input' => ['year' => 0, 'month' => 1]];
    try {
        $entry['output'] = $calendar->daysInMonth(0, 1);
        $entry['error']  = null;
    } catch (Throwable $e) {
        $entry['output'] = null;
        $entry['error']  = $e->getMessage();
    }
    $results['daysInMonth'][] = $entry;

    // 1016/1019/1020 deliberately included: confirmed offline (see task
    // doc) to be years where GregorianCalendar::easterDays()'s float-lunar
    // bug actually changes the result versus a "correctly" parenthesized
    // version — these are the cases that would catch a too-clean JS port.
    foreach ([2024, 2025, 1900, 2000, 1600, 1700, 2100, 1016, 1019, 1020] as $y) {
        $results['easterDays'][] = ['input' => ['year' => $y], 'output' => $calendar->easterDays($y), 'error' => null];
    }

    return $results;
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

file_put_contents(
    $golden_dir . '/calendar_julian.json',
    json_encode(characterizeCalendar(new JulianCalendar()), JSON_PRETTY_PRINT)
);
file_put_contents(
    $golden_dir . '/calendar_gregorian.json',
    json_encode(characterizeCalendar(new GregorianCalendar()), JSON_PRETTY_PRINT)
);

echo "Wrote golden/calendar_julian.json and golden/calendar_gregorian.json\n";
