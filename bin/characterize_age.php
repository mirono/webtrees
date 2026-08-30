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
// docs/php-to-js-migration/task-15-age.md). Age constructor calculates
// age difference between two GEDCOM dates. Uses I18N and Registry initialization.

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Age;
use Fisharebest\Webtrees\Contracts\TimestampFactoryInterface;
use Fisharebest\Webtrees\Contracts\TimestampInterface;
use Fisharebest\Webtrees\Contracts\UserInterface;
use Fisharebest\Webtrees\Date;
use Fisharebest\Webtrees\Factories\CalendarDateFactory;
use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Registry;

I18N::init('en-US', true);

Registry::calendarDateFactory(new CalendarDateFactory());

// Stub TimestampFactory for Date constructor's potential need for "now"
const FIXED_NOW_JD = 2460700; // 2025-01-24

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

$cases = [
    // Case 1: Normal full-precision case, both dates exact, spanning multiple years+months+days
    [
        '1 JAN 1950',
        '15 MAR 2020',
        'full-precision: 70 years, 2 months, 14 days',
    ],

    // Case 2: Same-year case where years=0 but months>0
    [
        '15 JAN 2020',
        '20 MAR 2020',
        'same-year: 0 years, 2 months, 5 days',
    ],

    // Case 3: Same-month case where years=0, months=0, days>0
    [
        '15 JAN 2020',
        '18 JAN 2020',
        'same-month: 0 years, 0 months, 3 days',
    ],

    // Case 4: IDENTICAL dates (same day)
    [
        '15 JAN 2020',
        '15 JAN 2020',
        'identical dates: 0 years, 0 months, 0 days',
    ],

    // Case 5: Year-ONLY dates on both sides, SAME YEAR
    [
        '2020',
        '2020',
        'year-only same year: 0 years, 0 months, 0 days',
    ],

    // Case 6: Reversed dates (end date is BEFORE start date)
    [
        '15 MAR 2020',
        '1 JAN 1950',
        'reversed dates: negative age',
    ],

    // Case 7: Invalid date (one side is an empty/unparseable GEDCOM date string)
    [
        '',
        '15 JAN 2020',
        'invalid date: empty first date',
    ],

    // Case 8: Month+year precision (no day) on both sides
    [
        'MAR 1950',
        'MAR 2020',
        'month+year precision: 70 years, 0 months, 0 days',
    ],
];

$results = [];
foreach ($cases as [$x_str, $y_str, $description]) {
    $x = new Date($x_str);
    $y = new Date($y_str);

    $age = new Age($x, $y);

    // Get the calendar dates that will be used in Age::__construct
    $start = $x->minimumDate();
    $end   = $y->maximumDate();

    // For the shim, we need the calendar details for:
    // - x.minimumDate (used as 'start' in Age)
    // - y.maximumDate (used as 'end' in Age)
    // For non-range dates, minimumDate and maximumDate are the same.

    $results[] = [
        'input' => [
            'x' => $x_str,
            'y' => $y_str,
            'description' => $description,
        ],
        'xMinimumDate' => [
            'year' => $start->year,
            'month' => $start->month,
            'day' => $start->day,
        ],
        'xIsOK' => $x->isOK(),
        'yMaximumDate' => [
            'year' => $end->year,
            'month' => $end->month,
            'day' => $end->day,
        ],
        'yIsOK' => $y->isOK(),
        'output' => [
            'ageDays' => $age->ageDays(),
            'ageYears' => $age->ageYears(),
            'ageYearsString' => $age->ageYearsString(),
            'toString' => (string) $age,
        ],
    ];
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

file_put_contents($golden_dir . '/age.json', json_encode($results, JSON_PRETTY_PRINT));

echo 'Wrote ' . count($results) . " cases to golden/age.json\n";
