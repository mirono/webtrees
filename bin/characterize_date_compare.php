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
// docs/php-to-js-migration/task-12-fact-comparator.md). Date::compare()
// is pure Julian-day-number arithmetic. Uses I18N and Registry initialization.

require_once __DIR__ . '/../vendor/autoload.php';

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
    // Basic ordering: strictly before, reverse, identical
    ['12 JAN 1900', '15 JAN 1900', 'a strictly before b'],
    ['15 JAN 1900', '12 JAN 1900', 'reverse, opposite sign'],
    ['12 JAN 1900', '12 JAN 1900', 'identical, equal'],

    // Range vs exact: year-only (wide) vs exact day inside it
    ['1900', '12 JAN 1900', 'a year-only (wide range) vs b exact day inside it'],

    // Qualifiers: BEF nudges to minJD-1, AFT to maxJD+1
    ['BEF 12 JAN 1900', '12 JAN 1900', 'BEF nudges a to minJD-1'],
    ['AFT 12 JAN 1900', '12 JAN 1900', 'AFT nudges a to maxJD+1'],
    ['BEF 12 JAN 1900', 'AFT 12 JAN 1900', 'both nudged: BEF vs AFT'],

    // Invalid/empty dates: a empty (JD=0), b empty (JD=0)
    // These exercise the asymmetric guard in the source: `&& $bmax > 0`
    ['', '12 JAN 1900', 'a is empty GEDCOM date (JD=0) — exercises $bmax > 0 guard'],
    ['12 JAN 1900', '', 'b is empty GEDCOM date (JD=0)'],
    ['', '', 'both empty'],
];

$results = [];
foreach ($cases as [$a_str, $b_str, $description]) {
    $a = new Date($a_str);
    $b = new Date($b_str);

    $result = Date::compare($a, $b);

    $results[] = [
        'input' => [
            'a' => $a_str,
            'b' => $b_str,
            'description' => $description,
        ],
        'a_details' => [
            'gedcom' => $a_str,
            'qual1' => $a->qual1,
            'minimumJulianDay' => $a->minimumJulianDay(),
            'maximumJulianDay' => $a->maximumJulianDay(),
        ],
        'b_details' => [
            'gedcom' => $b_str,
            'qual1' => $b->qual1,
            'minimumJulianDay' => $b->minimumJulianDay(),
            'maximumJulianDay' => $b->maximumJulianDay(),
        ],
        'output' => $result,
    ];
}

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

file_put_contents($golden_dir . '/date_compare.json', json_encode($results, JSON_PRETTY_PRINT));

echo 'Wrote ' . count($results) . " cases to golden/date_compare.json\n";
