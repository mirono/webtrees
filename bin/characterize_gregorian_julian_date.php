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
// docs/php-to-js-migration/task-08-gregorian-julian-date.md).
//
// Constructing GregorianDate/JulianDate from an int (Julian day) or array
// (GEDCOM y/m/d strings) needs no bootstrap. format() needs I18N::init().
// todayYmd()/today() and the "incomplete date -> anniversary in current
// year" constructor branch call Registry::timestampFactory()->now(),
// which (via TimestampFactory::now() -> Auth::user()) needs the full DI
// container/DB — too heavy for a characterization script. Stubbed with a
// minimal TimestampFactoryInterface/TimestampInterface implementation
// returning a FIXED Julian day, so results are reproducible and the JS
// side can inject the identical fixed `now`.

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Contracts\TimestampFactoryInterface;
use Fisharebest\Webtrees\Contracts\TimestampInterface;
use Fisharebest\Webtrees\Contracts\UserInterface;
use Fisharebest\Webtrees\Date\AbstractCalendarDate;
use Fisharebest\Webtrees\Date\GregorianDate;
use Fisharebest\Webtrees\Date\JulianDate;
use Fisharebest\Webtrees\Date\RomanDate;
use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Registry;

I18N::init('en-US', true);

// A fixed, documented "now" — NOT the real current date — so the golden
// file is reproducible on any machine, any day. The JS parity test must
// inject this exact value as its `now` function.
const FIXED_NOW_JD = 2460700; // 2025-01-24 (Gregorian) — verified via GregorianCalendar::jdToYmd(), not assumed

$stub_timestamp = new class (FIXED_NOW_JD) implements TimestampInterface {
    public function __construct(private int $jd)
    {
    }

    public function julianDay(): int
    {
        return $this->jd;
    }

    public function diffForHumans(): string
    {
        return '';
    }

    public function format(string $format): string
    {
        return '';
    }

    public function isoFormat(string $format): string
    {
        return '';
    }

    public function toDateString(): string
    {
        return '';
    }

    public function toDateTimeString(): string
    {
        return '';
    }

    public function compare(TimestampInterface $timestamp): int
    {
        return 0;
    }

    public function addSeconds(int $seconds): TimestampInterface
    {
        return $this;
    }

    public function addMinutes(int $minutes): TimestampInterface
    {
        return $this;
    }

    public function addHours(int $hours): TimestampInterface
    {
        return $this;
    }

    public function addDays(int $days): TimestampInterface
    {
        return $this;
    }

    public function addMonths(int $months): TimestampInterface
    {
        return $this;
    }

    public function addYears(int $years): TimestampInterface
    {
        return $this;
    }

    public function subtractSeconds(int $seconds): TimestampInterface
    {
        return $this;
    }

    public function subtractMinutes(int $minutes): TimestampInterface
    {
        return $this;
    }

    public function subtractHours(int $hours): TimestampInterface
    {
        return $this;
    }

    public function subtractDays(int $days): TimestampInterface
    {
        return $this;
    }

    public function subtractMonths(int $months): TimestampInterface
    {
        return $this;
    }

    public function subtractYears(int $years): TimestampInterface
    {
        return $this;
    }

    public function timestamp(): int
    {
        return 0;
    }
};

$stub_factory = new class ($stub_timestamp) implements TimestampFactoryInterface {
    public function __construct(private TimestampInterface $timestamp)
    {
    }

    public function make(int $timestamp, UserInterface|null $user = null): TimestampInterface
    {
        return $this->timestamp;
    }

    public function fromString(string|null $string, string $format = 'Y-m-d H:i:s', UserInterface|null $user = null): TimestampInterface
    {
        return $this->timestamp;
    }

    public function now(UserInterface|null $user = null): TimestampInterface
    {
        return $this->timestamp;
    }
};

Registry::timestampFactory($stub_factory);

$results = ['fixedNowJd' => FIXED_NOW_JD];

// --- Construction from GEDCOM y/m/d arrays, including incomplete dates ---
$construction_cases = [
    ['class' => 'Gregorian', 'input' => ['2024', 'FEB', '15']],
    ['class' => 'Gregorian', 'input' => ['2024', '', '']],       // year only
    ['class' => 'Gregorian', 'input' => ['2024', 'FEB', '']],    // year+month
    ['class' => 'Gregorian', 'input' => ['', 'FEB', '15']],      // month+day, no year (uses `now`)
    ['class' => 'Gregorian', 'input' => ['', '', '']],           // all-empty
    ['class' => 'Julian', 'input' => ['2024', 'FEB', '15']],
    ['class' => 'Julian', 'input' => ['100 B.C.', 'JAN', '1']],  // BCE
    ['class' => 'Julian', 'input' => ['1743/44', 'FEB', '2']],   // old-style/new-style
    ['class' => 'Roman', 'input' => ['100', 'JAN', '1']],
];

$make = static function (string $class, $date): AbstractCalendarDate {
    return match ($class) {
        'Gregorian' => new GregorianDate($date),
        'Julian'    => new JulianDate($date),
        'Roman'     => new RomanDate($date),
    };
};

foreach ($construction_cases as $case) {
    $d                        = $make($case['class'], $case['input']);
    $results['construction'][] = [
        'input'  => $case,
        'output' => [
            'year'              => $d->year(),
            'month'             => $d->month(),
            'day'               => $d->day(),
            'minimumJulianDay'  => $d->minimumJulianDay(),
            'maximumJulianDay'  => $d->maximumJulianDay(),
        ],
    ];
}

// --- Construction from an int (Julian day) ---
foreach ([2460000, 1721060, 328] as $jd) {
    foreach (['Gregorian', 'Julian'] as $class) {
        $d = $make($class, $jd);
        $results['constructionFromJd'][] = [
            'input'  => ['class' => $class, 'jd' => $jd],
            'output' => ['year' => $d->year(), 'month' => $d->month(), 'day' => $d->day()],
        ];
    }
}

// --- Cross-construction (convert between the two ported calendars) ---
$cross_cases = [
    ['from' => 'Gregorian', 'to' => 'Julian', 'input' => ['2024', 'FEB', '15']],
    ['from' => 'Julian', 'to' => 'Gregorian', 'input' => ['2024', 'FEB', '15']],
    ['from' => 'Gregorian', 'to' => 'Julian', 'input' => ['', 'FEB', '15']], // incomplete -> uses `now` for the anniversary
];
foreach ($cross_cases as $case) {
    $source = $make($case['from'], $case['input']);
    $target = $make($case['to'], $source);
    $results['crossConstruction'][] = [
        'input'  => $case,
        'output' => ['year' => $target->year(), 'month' => $target->month(), 'day' => $target->day()],
    ];
}

// --- compare() / ageDifference() ---
// Same class on both sides of each pair (Gregorian-vs-Gregorian,
// Julian-vs-Julian) — ageDifference()'s doc comment says calculations use
// "the calendar of the first date", so mixing classes belongs in its own,
// more carefully designed cross-calendar case, not bolted on here.
$gregorian_pairs = [
    [['2000', 'JAN', '1'], ['2024', 'FEB', '15']],
    [['2024', 'FEB', '15'], ['2000', 'JAN', '1']],
    [['2024', 'FEB', '15'], ['2024', 'FEB', '15']],
    // NOT the [-1,-1,-1] "incomplete" case — ageDifference()'s early return
    // only fires when year === 0 (a fully-unknown date), not when month/day
    // alone are unset. A year-only date's minimum_julian_day already points
    // at Jan 1 of that year (see the "construction" cases above), so this
    // computes as if comparing Jan 1 2024 -> Jan 1 2025: verified output is
    // [1, 0, 0], not [-1, -1, -1] — confirmed by running this case, not
    // assumed from reading ageDifference()'s docblock alone.
    [['2024', '', ''], ['2025', 'JAN', '1']],
];
foreach ($gregorian_pairs as [$a, $b]) {
    $da = new GregorianDate($a);
    $db = new GregorianDate($b);
    $results['compareAndAgeDifference'][] = [
        'input'  => ['class' => 'Gregorian', 'a' => $a, 'b' => $b],
        'output' => [
            'compare'       => AbstractCalendarDate::compare($da, $db),
            'ageDifference' => $da->ageDifference($db),
        ],
    ];
}
$julian_pairs = [
    [['100 B.C.', 'JAN', '1'], ['2024', 'FEB', '15']],
    [['1743/44', 'FEB', '2'], ['2024', 'FEB', '15']],
];
foreach ($julian_pairs as [$a, $b]) {
    $da = new JulianDate($a);
    $db = new JulianDate($b);
    $results['compareAndAgeDifference'][] = [
        'input'  => ['class' => 'Julian', 'a' => $a, 'b' => $b],
        'output' => [
            'compare'       => AbstractCalendarDate::compare($da, $db),
            'ageDifference' => $da->ageDifference($db),
        ],
    ];
}

// --- isLeapYear / daysInMonth / daysInWeek / monthsInYear / inValidRange ---
foreach (['Gregorian', 'Julian'] as $class) {
    foreach ([1900, 2000, 2024, 2023] as $year) {
        $d                             = $make($class, [(string) $year, 'JAN', '1']);
        $results['dateProperties'][] = [
            'input'  => ['class' => $class, 'year' => $year],
            'output' => [
                'isLeapYear'   => $d->isLeapYear(),
                'daysInMonth'  => $d->daysInMonth(),
                'daysInWeek'   => $d->daysInWeek(),
                'monthsInYear' => $d->monthsInYear(),
                'inValidRange' => $d->inValidRange(),
            ],
        ];
    }
    // daysInMonth() on a day-only-precision date (month=0) should fall back to 0
    // via the caught InvalidArgumentException, not throw.
    $d_no_month                    = $make($class, ['2024', '', '']);
    $results['daysInMonthFallback'][] = [
        'input'  => ['class' => $class, 'value' => ['2024', '', '']],
        'output' => $d_no_month->daysInMonth(),
    ];
}

// --- format() ---
$format_strings = ['%F %j, %Y', '%Y-%m-%d', '%A %O %E', '%@', '%d/%m/%Y', '%l, %F %j'];
$qualifiers      = ['', 'ABT', 'BEF', 'AFT', 'FROM', 'AND'];
foreach (['Gregorian', 'Julian'] as $class) {
    $d = $make($class, ['2024', 'FEB', '15']);
    foreach ($format_strings as $fmt) {
        $results['format'][] = [
            'input'  => ['class' => $class, 'date' => ['2024', 'FEB', '15'], 'format' => $fmt, 'qualifier' => ''],
            'output' => $d->format($fmt),
        ];
    }
    foreach ($qualifiers as $q) {
        $results['format'][] = [
            'input'  => ['class' => $class, 'date' => ['2024', 'FEB', '15'], 'format' => '%F', 'qualifier' => $q],
            'output' => $d->format('%F', $q),
        ];
    }
    // Incomplete dates strip format codes.
    foreach ([['2024', '', ''], ['2024', 'FEB', ''], ['', '', '']] as $incomplete) {
        $d_incomplete = $make($class, $incomplete);
        $results['formatIncomplete'][] = [
            'input'  => ['class' => $class, 'date' => $incomplete, 'format' => '%F %j, %Y'],
            'output' => $d_incomplete->format('%F %j, %Y'),
        ];
    }
}

// --- Julian-specific: BCE / old-style-new-style long-year formatting ---
foreach (
    [
        ['100 B.C.', 'JAN', '1'],
        ['1743/44', 'FEB', '2'],
        ['2024', 'FEB', '15'],
    ] as $input
) {
    $d = new JulianDate($input);
    $results['julianYearFormats'][] = [
        'input'  => $input,
        'output' => ['longYear' => $d->format('%Y'), 'gedcomYear' => $d->format('%E')],
    ];
}

// --- RomanDate AUC suffix ---
$roman = new RomanDate(['100', 'JAN', '1']);
$results['romanYearFormats'] = ['longYear' => $roman->format('%Y'), 'gedcomYear' => $roman->format('%E')];

// --- todayYmd() / today() — using the FIXED stub `now` ---
$g_today = new GregorianDate(['2024', 'FEB', '15']);
$results['todayYmd'] = $g_today->todayYmd();
$today_date          = $g_today->today();
$results['today']    = ['year' => $today_date->year(), 'month' => $today_date->month(), 'day' => $today_date->day()];

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

file_put_contents($golden_dir . '/gregorian_julian_date.json', json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo "Wrote golden/gregorian_julian_date.json\n";
