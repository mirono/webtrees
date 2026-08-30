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
// docs/php-to-js-migration/task-11-calendar-french-hijri-jalali-jewish.md).
//
// Construction from an array/int needs no bootstrap. format() needs
// I18N::init(). Unlike task 08's script, no TimestampFactory stub is
// needed here: none of these 4 classes' characterized behaviors touch
// the "incomplete date -> anniversary in current year" cross-construction
// branch or today()/todayYmd() (verified by reading
// AbstractCalendarDate::__construct() - Registry::timestampFactory() is
// only reached from the "construct from a CalendarDate" branch, which
// this script never exercises).

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Date\AbstractCalendarDate;
use Fisharebest\Webtrees\Date\FrenchDate;
use Fisharebest\Webtrees\Date\HijriDate;
use Fisharebest\Webtrees\Date\JalaliDate;
use Fisharebest\Webtrees\Date\JewishDate;
use Fisharebest\Webtrees\I18N;

I18N::init('en-US', true);

$results = [];

$make = static function (string $class, $date): AbstractCalendarDate {
    return match ($class) {
        'French' => new FrenchDate($date),
        'Hijri'  => new HijriDate($date),
        'Jalali' => new JalaliDate($date),
        'Jewish' => new JewishDate($date),
    };
};

// NUMBER_TO_MONTH tables, copied from each class's source (used to build
// GEDCOM-style construction inputs for every month of a given year).
$number_to_month = [
    'French' => [1 => 'VEND', 2 => 'BRUM', 3 => 'FRIM', 4 => 'NIVO', 5 => 'PLUV', 6 => 'VENT', 7 => 'GERM', 8 => 'FLOR', 9 => 'PRAI', 10 => 'MESS', 11 => 'THER', 12 => 'FRUC', 13 => 'COMP'],
    'Hijri'  => [1 => 'MUHAR', 2 => 'SAFAR', 3 => 'RABIA', 4 => 'RABIT', 5 => 'JUMAA', 6 => 'JUMAT', 7 => 'RAJAB', 8 => 'SHAAB', 9 => 'RAMAD', 10 => 'SHAWW', 11 => 'DHUAQ', 12 => 'DHUAH'],
    'Jalali' => [1 => 'FARVA', 2 => 'ORDIB', 3 => 'KHORD', 4 => 'TIR', 5 => 'MORDA', 6 => 'SHAHR', 7 => 'MEHR', 8 => 'ABAN', 9 => 'AZAR', 10 => 'DEY', 11 => 'BAHMA', 12 => 'ESFAN'],
    'Jewish' => [1 => 'TSH', 2 => 'CSH', 3 => 'KSL', 4 => 'TVT', 5 => 'SHV', 6 => 'ADR', 7 => 'ADS', 8 => 'NSN', 9 => 'IYR', 10 => 'SVN', 11 => 'TMZ', 12 => 'AAV', 13 => 'ELL'],
];

// --- Construction from GEDCOM y/m/d arrays ---
$construction_cases = [
    ['class' => 'French', 'input' => ['12', 'VEND', '1']],
    ['class' => 'French', 'input' => ['3', 'COMP', '6']],   // leap year, epagomenal day 6
    ['class' => 'French', 'input' => ['12', 'COMP', '5']],  // non-leap year, epagomenal day 5
    ['class' => 'French', 'input' => ['12', '', '']],       // year only
    ['class' => 'Hijri', 'input' => ['1445', 'RAMAD', '10']],
    ['class' => 'Hijri', 'input' => ['1445', '', '']],
    ['class' => 'Jalali', 'input' => ['1403', 'MEHR', '1']],
    ['class' => 'Jalali', 'input' => ['1403', '', '']],
    ['class' => 'Jewish', 'input' => ['5784', 'ADR', '1']],  // leap year: ADR -> month 6 (Adar I)
    ['class' => 'Jewish', 'input' => ['5783', 'ADR', '1']],  // non-leap year: ADR remapped -> month 7
    ['class' => 'Jewish', 'input' => ['5784', 'ADS', '1']],  // leap year: ADS -> month 7 (Adar II)
    ['class' => 'Jewish', 'input' => ['5784', '', '']],
];
foreach ($construction_cases as $case) {
    $d                          = $make($case['class'], $case['input']);
    $results['construction'][] = [
        'input'  => $case,
        'output' => [
            'year'             => $d->year(),
            'month'            => $d->month(),
            'day'              => $d->day(),
            'minimumJulianDay' => $d->minimumJulianDay(),
            'maximumJulianDay' => $d->maximumJulianDay(),
        ],
    ];
}

// --- Construction from an int (Julian day) ---
foreach ([2378000, 2460600, 2460700] as $jd) {
    foreach (['French', 'Hijri', 'Jalali', 'Jewish'] as $class) {
        $d = $make($class, $jd);
        if (!$d->inValidRange()) {
            continue;
        }
        $results['constructionFromJd'][] = [
            'input'  => ['class' => $class, 'jd' => $jd],
            'output' => ['year' => $d->year(), 'month' => $d->month(), 'day' => $d->day()],
        ];
    }
}

// --- isLeapYear / daysInMonth / daysInWeek / monthsInYear / inValidRange ---
$year_cases = [
    ['class' => 'French', 'year' => 3],    // leap
    ['class' => 'French', 'year' => 12],   // non-leap
    ['class' => 'Hijri', 'year' => 1445],  // leap
    ['class' => 'Hijri', 'year' => 1444],  // non-leap
    ['class' => 'Jalali', 'year' => 1404], // leap
    ['class' => 'Jalali', 'year' => 1403], // non-leap
    ['class' => 'Jewish', 'year' => 5784], // leap
    ['class' => 'Jewish', 'year' => 5783], // non-leap
];
foreach ($year_cases as $case) {
    $month_1                     = $number_to_month[$case['class']][1];
    $d                            = $make($case['class'], [(string) $case['year'], $month_1, '1']);
    $results['dateProperties'][] = [
        'input'  => $case,
        'output' => [
            'isLeapYear'   => $d->isLeapYear(),
            'daysInMonth'  => $d->daysInMonth(),
            'daysInWeek'   => $d->daysInWeek(),
            'monthsInYear' => $d->monthsInYear(),
            'inValidRange' => $d->inValidRange(),
        ],
    ];
}

// --- daysInMonth() for every month of a leap and a non-leap year ---
$days_in_month_years = [
    'French' => [3, 12],
    'Hijri'  => [1445, 1444],
    'Jalali' => [1404, 1403],
    'Jewish' => [5784, 5783],
];
foreach ($days_in_month_years as $class => $years) {
    foreach ($years as $year) {
        foreach ($number_to_month[$class] as $month_number => $month_name) {
            $d                             = $make($class, [(string) $year, $month_name, '1']);
            $results['daysInMonth'][] = [
                'input'  => ['class' => $class, 'year' => $year, 'monthNumber' => $month_number, 'monthName' => $month_name],
                'output' => ['resolvedMonth' => $d->month(), 'daysInMonth' => $d->daysInMonth()],
            ];
        }
    }
}

// --- format() ---
$format_strings = ['%F %j, %Y', '%Y-%m-%d', '%A %O %E', '%@', '%d/%m/%Y', '%l, %F %j', '%D'];
$qualifiers     = ['', 'ABT', 'BEF', 'AFT', 'FROM', 'AND'];
$format_dates   = [
    'French' => ['12', 'VEND', '1'],
    'Hijri'  => ['1445', 'RAMAD', '10'],
    'Jalali' => ['1403', 'MEHR', '1'],
    'Jewish' => ['5784', 'ADS', '15'], // leap year, Adar II -> exercises the Adar-II month-name branch
];
foreach ($format_dates as $class => $date) {
    $d = $make($class, $date);
    foreach ($format_strings as $fmt) {
        $results['format'][] = [
            'input'  => ['class' => $class, 'date' => $date, 'format' => $fmt, 'qualifier' => ''],
            'output' => $d->format($fmt),
        ];
    }
    foreach ($qualifiers as $q) {
        $results['format'][] = [
            'input'  => ['class' => $class, 'date' => $date, 'format' => '%F', 'qualifier' => $q],
            'output' => $d->format('%F', $q),
        ];
    }
    // Incomplete dates strip format codes.
    foreach ([[$date[0], '', ''], [$date[0], $date[1], ''], ['', '', '']] as $incomplete) {
        $d_incomplete                   = $make($class, $incomplete);
        $results['formatIncomplete'][] = [
            'input'  => ['class' => $class, 'date' => $incomplete, 'format' => '%F %j, %Y'],
            'output' => $d_incomplete->format('%F %j, %Y'),
        ];
    }
}

// --- Jewish-specific: Adar/Adar II month names across all 4 grammatical cases ---
$jewish_adar_cases = [
    ['year' => '5784', 'month' => 'ADR', 'label' => 'Adar I (leap year)'],
    ['year' => '5784', 'month' => 'ADS', 'label' => 'Adar II (leap year)'],
    ['year' => '5783', 'month' => 'ADR', 'label' => 'Adar (non-leap year, remapped)'],
];
foreach ($jewish_adar_cases as $case) {
    $d = $make('Jewish', [$case['year'], $case['month'], '1']);
    $results['jewishAdarMonthNames'][] = [
        'input'  => $case,
        'output' => [
            'resolvedMonth' => $d->month(),
            'nominative'    => $d->format('%F'),
            'genitive'      => $d->format('%F', 'ABT'),
            'locative'      => $d->format('%F', 'AFT'),
            'instrumental'  => $d->format('%F', 'BEF'),
        ],
    ];
}

// --- Jewish-specific: nextMonth() around the Adar I/II boundary (via setJdFromYmd -> month-only construction) ---
$jewish_next_month_cases = [
    ['year' => '5784', 'month' => 'ADR'], // leap year: Adar I's nextMonth() should be Adar II (7), not Nissan
    ['year' => '5783', 'month' => 'ADR'], // non-leap year: remapped to month 7 (ADR->7), nextMonth() should be Nissan (8)
];
foreach ($jewish_next_month_cases as $case) {
    // Constructing with day="" (month-only precision) forces setJdFromYmd() to call nextMonth().
    $d                                  = $make('Jewish', [$case['year'], $case['month'], '']);
    $results['jewishNextMonth'][] = [
        'input'  => $case,
        'output' => ['resolvedMonth' => $d->month(), 'minimumJulianDay' => $d->minimumJulianDay(), 'maximumJulianDay' => $d->maximumJulianDay()],
    ];
}

// --- Jewish-specific: numberToHebrewNumerals()-based formatting under the 'he' (Hebr script) locale ---
// Isolated at the end of the script, under its own I18N::init() call — see
// task-11's "Verified behaviors" for why switching locale mid-script is
// safe here (I18N::init() just reassigns static properties, no
// once-only guard).
I18N::init('he', true);
$jewish_hebrew_script_cases = [
    ['year' => '5784', 'month' => 'TSH', 'day' => '15'],
    ['year' => '5001', 'month' => 'TSH', 'day' => '1'],
];
foreach ($jewish_hebrew_script_cases as $case) {
    $d = $make('Jewish', [$case['year'], $case['month'], $case['day']]);
    $results['jewishHebrewScriptFormatting'][] = [
        'input'  => $case,
        'output' => [
            'formatDay'       => $d->format('%j'),
            'formatShortYear' => $d->format('%y'),
            'formatLongYear'  => $d->format('%Y'),
        ],
    ];
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

file_put_contents($golden_dir . '/date_french_hijri_jalali_jewish.json', json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo "Wrote golden/date_french_hijri_jalali_jewish.json\n";
