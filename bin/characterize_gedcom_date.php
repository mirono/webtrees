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
 * Characterization script for task 17 (docs/php-to-js-migration/task-17-gedcom-date.md).
 * Generates golden fixtures from the real app/Factories/CalendarDateFactory.php
 * and app/Date.php (constructor + non-display methods only).
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Date;
use Fisharebest\Webtrees\Date\AbstractCalendarDate;
use Fisharebest\Webtrees\Factories\CalendarDateFactory;
use Fisharebest\Webtrees\Registry;

Registry::calendarDateFactory(new CalendarDateFactory());

if (!is_dir(__DIR__ . '/../golden')) {
    mkdir(__DIR__ . '/../golden');
}

function serializeCalendarDate(AbstractCalendarDate $d): array
{
    return [
        'class'        => (new ReflectionClass($d))->getShortName(),
        'escape'       => $d::ESCAPE,
        'year'         => $d->year,
        'month'        => $d->month,
        'day'          => $d->day,
        'minJulianDay' => $d->minimumJulianDay(),
        'maxJulianDay' => $d->maximumJulianDay(),
    ];
}

// ---------------------------------------------------------------------
// 1. CalendarDateFactory::make() — direct, wide-coverage cases.
// ---------------------------------------------------------------------

$factory = new CalendarDateFactory();

$make_cases = [
    // Full DMY, no escape (ambiguous -> Gregorian)
    '1 JAN 2000',
    '31 DEC 1999',
    // MY, no escape
    'FEB 1980',
    // Year only, no escape
    '1980',
    '450',
    // Calendar escapes, explicit
    '@#DGREGORIAN@ 1 JAN 2000',
    '@#DJULIAN@ 1 JAN 2000',
    '@#DHEBREW@ 1 TSH 5760',
    '@#DHIJRI@ 1 MUHAR 1400',
    '@#DFRENCH R@ 1 VEND 1',
    '@#DROMAN@ 1 JAN 2000',
    '@#DJALALI@ 1 FARVA 1400',
    // Escape with no following date
    '@#DGREGORIAN@',
    '@#DGREGORIAN@ ',
    // Unambiguous months override calendar escape entirely (no escape given)
    '1 TSH 5760',    // Jewish
    '1 CSH 5760',
    '1 VEND 1',      // French
    '1 BRUM 1',
    '1 MUHAR 1400',  // Hijri
    '1 RABIA 1400',
    '1 RABIT 1400',
    '1 JUMAA 1400',
    '1 JUMAT 1400',
    '1 FARVA 1400',  // Jalali
    '1 ESFAN 1400',
    // Unambiguous month + wrong escape (should still override to the unambiguous calendar)
    '@#DGREGORIAN@ 1 TSH 5760',
    // Gregorian months (ambiguous, default to Gregorian even without escape)
    '1 JAN 2000',
    '1 DEC 2000',
    // Year range 3000-5999 -> Jewish (no escape, no month)
    '3760',
    '5000',
    '5999',
    '2999', // just below the range -> stays Gregorian
    '6000', // just above the range -> stays Gregorian
    // Dual-year / B.C. — these feed into both the date-array constructor AND
    // the "unambiguous -> Julian" override regex.
    '4 FEB 1750/51',
    '1750/51',
    '100 B.C.',
    '1 JAN 100 B.C.',
    // Malformed/partial dates - "do the best we can" fallback branch
    '',
    'ABCD',
    'the year of our lord 1850',
    'sometime in JAN of 1850',
    'JAN',
    '15',
    'about 15 or so',
    '99 red balloons FEB',
    'text with no year but a FEB month and 15 a day-ish number',
    // Malformed date with a B.C./dual-year-like fragment inside garbage text
    // (exercises the unanchored regex quirk in the unambiguous-Julian check)
    'some text 100 B.C. more text',
    'prefix 1234/56 suffix',
];

$make_results = [];
foreach ($make_cases as $i => $date_string) {
    try {
        $result = $factory->make($date_string);
        $make_results[] = [
            'index' => $i,
            'input' => $date_string,
            'result' => serializeCalendarDate($result),
        ];
    } catch (Throwable $e) {
        $make_results[] = [
            'index' => $i,
            'input' => $date_string,
            'throws' => get_class($e),
        ];
    }
}

file_put_contents(__DIR__ . '/../golden/calendar_date_factory_make.json', json_encode($make_results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// ---------------------------------------------------------------------
// 2. Date::__construct() — qualifiers, ranges, parenthetical text.
// ---------------------------------------------------------------------

function serializeDate(Date $date): array
{
    $reflection = new ReflectionClass($date);

    $date1_prop = $reflection->getProperty('date1');
    $date2_prop = $reflection->getProperty('date2');
    $text_prop  = $reflection->getProperty('text');

    $date2 = $date2_prop->getValue($date);

    return [
        'qual1'        => $date->qual1,
        'qual2'        => $date->qual2,
        'date1'        => serializeCalendarDate($date1_prop->getValue($date)),
        'date2'        => $date2 !== null ? serializeCalendarDate($date2) : null,
        'text'         => $text_prop->getValue($date),
        'minJulianDay' => $date->minimumJulianDay(),
        'maxJulianDay' => $date->maximumJulianDay(),
        'julianDay'    => $date->julianDay(),
        'isOK'         => $date->isOK(),
        'gregorianYear' => $date->gregorianYear(),
    ];
}

$date_cases = [
    // Plain, no qualifier
    '1 JAN 2000',
    '1980',
    // Single qualifiers
    'ABT 1980',
    'CAL 1 JAN 2000',
    'EST 1980',
    'BEF 1 JAN 2000',
    'AFT 1 JAN 2000',
    'FROM 1980',
    'TO 1990',
    'INT 1980 (about then)',
    // BET...AND / FROM...TO ranges
    'BET 1980 AND 1990',
    'BET 1 JAN 1980 AND 31 DEC 1990',
    'FROM 1980 TO 1990',
    // Parenthetical explanatory text (any qualifier or none)
    '1980 (approximate)',
    'ABT 1980 (from family bible)',
    'BET 1980 AND 1990 (from two sources)',
    // Invalid / incomplete dates -> isOK() false
    'JAN',
    '',
    'BEF JAN',
    // Qualifier with a calendar escape inside
    'BET @#DJULIAN@ 1 JAN 1700 AND @#DGREGORIAN@ 1 JAN 1710',
    // No qualifier match falls through to plain make() of the whole string
    'sometime around 1980ish',
];

$date_results = [];
foreach ($date_cases as $i => $date_string) {
    try {
        $date = new Date($date_string);
        $date_results[] = [
            'index'  => $i,
            'input'  => $date_string,
            'result' => serializeDate($date),
        ];
    } catch (Throwable $e) {
        $date_results[] = [
            'index'  => $i,
            'input'  => $date_string,
            'throws' => get_class($e),
        ];
    }
}

file_put_contents(__DIR__ . '/../golden/gedcom_date_construct.json', json_encode($date_results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// ---------------------------------------------------------------------
// 3. Date::addYears()
// ---------------------------------------------------------------------

$add_years_cases = [
    ['date' => '1 JAN 2000', 'years' => 18, 'qualifier' => 'AFT'],
    ['date' => '1980', 'years' => -5, 'qualifier' => 'BEF'],
    ['date' => 'BET 1980 AND 1990', 'years' => 10, 'qualifier' => ''],
    ['date' => '15 MAR 2000', 'years' => 0, 'qualifier' => 'EST'],
];

$add_years_results = [];
foreach ($add_years_cases as $i => $case) {
    $date    = new Date($case['date']);
    $result  = $date->addYears($case['years'], $case['qualifier']);
    $add_years_results[] = [
        'index'  => $i,
        'input'  => $case,
        'result' => serializeDate($result),
    ];
}

file_put_contents(__DIR__ . '/../golden/gedcom_date_add_years.json', json_encode($add_years_results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

// ---------------------------------------------------------------------
// 4. Date::compare() — a handful of end-to-end cases via real GEDCOM
//    date strings (task 12 already ported the core algorithm against
//    plain shim objects; this checks the whole pipeline: string parse
//    -> Date -> compare()).
// ---------------------------------------------------------------------

$compare_cases = [
    ['a' => '1 JAN 2000', 'b' => '1 JAN 2001'],
    ['a' => '1 JAN 2000', 'b' => '1 JAN 2000'],
    ['a' => 'BEF 1 JAN 2000', 'b' => '1 JAN 2000'],
    ['a' => 'AFT 1 JAN 2000', 'b' => '1 JAN 2000'],
    ['a' => 'BET 1980 AND 1990', 'b' => '1985'],
    ['a' => '1980', 'b' => 'BET 1980 AND 1990'],
];

$compare_results = [];
foreach ($compare_cases as $i => $case) {
    $a = new Date($case['a']);
    $b = new Date($case['b']);
    $compare_results[] = [
        'index'  => $i,
        'input'  => $case,
        'result' => Date::compare($a, $b),
    ];
}

file_put_contents(__DIR__ . '/../golden/gedcom_date_compare.json', json_encode($compare_results, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

echo "Done.\n";
