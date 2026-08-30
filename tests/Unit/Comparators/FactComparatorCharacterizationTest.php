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

namespace Fisharebest\Webtrees\Tests\Unit\Comparators;

use Fisharebest\Webtrees\Comparators\FactComparator;
use Fisharebest\Webtrees\Fact;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Tests\TestCase;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Characterization test for FactComparator.
 * See docs/php-to-js-migration/task-12-fact-comparator.md.
 */
#[CoversClass(FactComparator::class)]
class FactComparatorCharacterizationTest extends TestCase
{
    protected static bool $uses_database = true;

    public function testFactComparatorCharacterization(): void
    {
        // Create a stub individual with tag returning 'INDI'
        $individual = self::createStub(Individual::class);
        $individual->method('tag')->willReturn('INDI');

        // Build test facts with varied GEDCOM snippets
        $test_cases = [
            // Two dated facts, different dates, different types
            [
                'label' => 'Two dated facts, different dates and types',
                'gedcom1' => "1 BIRT\n2 DATE 12 JAN 1900",
                'id1' => 'birth',
                'gedcom2' => "1 DEAT\n2 DATE 15 JAN 1900",
                'id2' => 'death',
            ],
            // Two facts, SAME date, different types
            [
                'label' => 'Two facts, same date, different types',
                'gedcom1' => "1 BIRT\n2 DATE 12 JAN 1900",
                'id1' => 'birth',
                'gedcom2' => "1 DEAT\n2 DATE 12 JAN 1900",
                'id2' => 'death',
            ],
            // One dated fact, one with no DATE sub-record
            [
                'label' => 'One dated fact, one with no DATE',
                'gedcom1' => "1 BIRT\n2 DATE 12 JAN 1900",
                'id1' => 'birth',
                'gedcom2' => "1 DEAT",
                'id2' => 'death_no_date',
            ],
            // Same tag, one dated and one undated
            [
                'label' => 'Same tag, one dated and one undated',
                'gedcom1' => "1 BIRT\n2 DATE 12 JAN 1900",
                'id1' => 'birth_dated',
                'gedcom2' => "1 BIRT",
                'id2' => 'birth_undated',
            ],
            // Two facts with unrecognized/made-up tags
            [
                'label' => 'Unrecognized tags fallback to EVEN',
                'gedcom1' => "1 FAKE1",
                'id1' => 'fake1',
                'gedcom2' => "1 FAKE2",
                'id2' => 'fake2',
            ],
            // NO (negation) fact
            [
                'label' => 'NO negation fact',
                'gedcom1' => "1 NO BIRT",
                'id1' => 'no_birth',
                'gedcom2' => "1 BIRT",
                'id2' => 'regular_birth',
            ],
            // ASSO (associate) fact
            [
                'label' => 'ASSO associate fact',
                'gedcom1' => "1 ASSO @I2@\n2 RELA godparent",
                'id1' => 'asso',
                'gedcom2' => "1 BIRT",
                'id2' => 'birth',
            ],
        ];

        $results = [];

        foreach ($test_cases as $case) {
            $fact1 = new Fact($case['gedcom1'], $individual, $case['id1']);
            $fact2 = new Fact($case['gedcom2'], $individual, $case['id2']);

            $byDate = FactComparator::byDate($fact1, $fact2);
            $byType = FactComparator::byType($fact1, $fact2);
            $typeOrder1 = FactComparator::typeOrder($fact1);
            $typeOrder2 = FactComparator::typeOrder($fact2);

            $results[] = [
                'label' => $case['label'],
                'fact1' => [
                    'gedcom' => $case['gedcom1'],
                    'id' => $case['id1'],
                    'tag' => $fact1->tag(),
                    'value' => $fact1->value(),
                    'id_method' => $fact1->id(),
                    'attributeDate' => $fact1->attribute('DATE'),
                    'date' => [
                        'qual1' => $fact1->date()->qual1,
                        'minimumJulianDay' => $fact1->date()->minimumJulianDay(),
                        'maximumJulianDay' => $fact1->date()->maximumJulianDay(),
                        'isOK' => $fact1->date()->isOK(),
                    ],
                    'typeOrder' => $typeOrder1,
                ],
                'fact2' => [
                    'gedcom' => $case['gedcom2'],
                    'id' => $case['id2'],
                    'tag' => $fact2->tag(),
                    'value' => $fact2->value(),
                    'id_method' => $fact2->id(),
                    'attributeDate' => $fact2->attribute('DATE'),
                    'date' => [
                        'qual1' => $fact2->date()->qual1,
                        'minimumJulianDay' => $fact2->date()->minimumJulianDay(),
                        'maximumJulianDay' => $fact2->date()->maximumJulianDay(),
                        'isOK' => $fact2->date()->isOK(),
                    ],
                    'typeOrder' => $typeOrder2,
                ],
                'comparisons' => [
                    'byDate' => $byDate,
                    'byType' => $byType,
                ],
            ];
        }

        // Write the golden file
        $golden_dir = realpath(__DIR__ . '/../../..') . '/golden';
        if (!is_dir($golden_dir)) {
            mkdir($golden_dir, 0755, true);
        }

        $filepath = $golden_dir . '/fact_comparator.json';
        $written = file_put_contents(
            $filepath,
            json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );

        // Always pass (characterization writes as side effect)
        $this->assertTrue($written !== false, "Failed to write $filepath");
        $this->assertFileExists($filepath);
    }
}
