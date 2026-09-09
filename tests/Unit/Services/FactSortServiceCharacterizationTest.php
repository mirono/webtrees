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

namespace Fisharebest\Webtrees\Tests\Unit\Services;

use Fisharebest\Webtrees\Fact;
use Fisharebest\Webtrees\Family;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Services\FactSortService;
use Fisharebest\Webtrees\Tests\TestCase;
use Illuminate\Support\Collection;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Characterization test for FactSortService (task 18).
 * See docs/php-to-js-migration/task-18-fact-sort-service.md.
 */
#[CoversClass(FactSortService::class)]
class FactSortServiceCharacterizationTest extends TestCase
{
    protected static bool $uses_database = true;

    private function makeIndividual(): Individual
    {
        $individual = self::createStub(Individual::class);
        $individual->method('tag')->willReturn('INDI');

        return $individual;
    }

    private function makeFamily(string $xref): Family
    {
        $family = self::createStub(Family::class);
        $family->method('tag')->willReturn('FAM');
        $family->method('xref')->willReturn($xref);

        return $family;
    }

    /**
     * @param array<int,array{gedcom: string, record: Individual|Family, id: string}> $specs
     *
     * @return array<int,Fact>
     */
    private function buildFacts(array $specs): array
    {
        $facts = [];
        foreach ($specs as $spec) {
            $facts[] = new Fact($spec['gedcom'], $spec['record'], $spec['id']);
        }

        return $facts;
    }

    /**
     * @return array{
     *     id: string,
     *     tag: string,
     *     value: string,
     *     record_xref: string|null,
     *     date: array{qual1: string, minimumJulianDay: int, maximumJulianDay: int},
     *     attributeDate: string,
     * }
     */
    private function serializeFact(Fact $fact): array
    {
        $record = $fact->record();

        return [
            'id'    => $fact->id(),
            'tag'   => $fact->tag(),
            'value' => $fact->value(),
            'record_xref' => $record instanceof Family ? $record->xref() : null,
            'date'  => [
                'qual1'            => $fact->date()->qual1,
                'minimumJulianDay' => $fact->date()->minimumJulianDay(),
                'maximumJulianDay' => $fact->date()->maximumJulianDay(),
            ],
            'attributeDate' => $fact->attribute('DATE'),
        ];
    }

    /**
     * @param array<int,array{gedcom: string, record: Individual|Family, id: string}> $specs
     *
     * @return array{label: string, input: array<int,array<string,mixed>>, result: array<int,array<string,mixed>>}
     */
    private function runScenario(string $label, array $specs): array
    {
        $facts   = $this->buildFacts($specs);
        $service = new FactSortService();
        $result  = $service->sort(new Collection($facts));

        return [
            'label'  => $label,
            'input'  => array_map(fn (Fact $f) => $this->serializeFact($f), $facts),
            'result' => array_map(fn (Fact $f) => $this->serializeFact($f), $result->all()),
        ];
    }

    public function testFactSortServiceCharacterization(): void
    {
        $indi  = $this->makeIndividual();
        $fam1  = $this->makeFamily('F1');
        $fam2  = $this->makeFamily('F2');
        $fam3  = $this->makeFamily('F3');

        $results = [];

        // Scenario 1: dated facts across individual + family, chronological
        // order, with a same-date tiebreak by type.
        $results[] = $this->runScenario('dated facts, chronological with same-date tiebreak', [
            ['gedcom' => "1 DEAT\n2 DATE 1 JAN 1950", 'record' => $indi, 'id' => 'death'],
            ['gedcom' => "1 BIRT\n2 DATE 1 JAN 1900", 'record' => $indi, 'id' => 'birth'],
            ['gedcom' => "1 MARR\n2 DATE 1 JUN 1920", 'record' => $fam1, 'id' => 'marriage'],
            ['gedcom' => "1 CHR\n2 DATE 1 JAN 1900", 'record' => $indi, 'id' => 'christening'],
        ]);

        // Scenario 2: undated individual facts placed by type order; a dated
        // synthetic "close relative" event must NOT influence placement.
        $results[] = $this->runScenario('undated individual facts placed by type order, close-relative event skipped', [
            ['gedcom' => "1 BIRT\n2 DATE 1 JAN 1900", 'record' => $indi, 'id' => 'birth'],
            ['gedcom' => "1 DEAT\n2 DATE 1 JAN 1980", 'record' => $indi, 'id' => 'death'],
            ['gedcom' => "1 EVEN CLOSE_RELATIVE\n2 DATE 1 JUN 1940", 'record' => $indi, 'id' => 'close_relative'],
            ['gedcom' => "1 OCCU Farmer", 'record' => $indi, 'id' => 'occupation'],
            ['gedcom' => "1 RESI Anytown", 'record' => $indi, 'id' => 'residence'],
        ]);

        // Scenario 3: a family with EXISTING dated facts in the sorted
        // backbone; undated family facts get inserted relative to it by
        // type order (one before, one after).
        $results[] = $this->runScenario('family with dated facts: undated facts inserted by type order', [
            ['gedcom' => "1 MARR\n2 DATE 1 JUN 1920", 'record' => $fam1, 'id' => 'marriage'],
            ['gedcom' => "1 DIV", 'record' => $fam1, 'id' => 'divorce_undated'],
            ['gedcom' => "1 ENGA", 'record' => $fam1, 'id' => 'engagement_undated'],
        ]);

        // Scenario 4: three families. F2's only fact is undated (input
        // first -> lowest family_input_order). F1 has a dated fact (input
        // second). F3's only fact is undated (input last -> highest
        // family_input_order, no later family exists -> appended at end).
        // Expect F2's undated group to be inserted BEFORE F1's dated fact.
        $results[] = $this->runScenario('family with no dated facts: ordered by family_input_order', [
            ['gedcom' => "1 ENGA", 'record' => $fam2, 'id' => 'f2_engagement_undated'],
            ['gedcom' => "1 MARR\n2 DATE 1 JUN 1920", 'record' => $fam1, 'id' => 'f1_marriage'],
            ['gedcom' => "1 DIV", 'record' => $fam3, 'id' => 'f3_divorce_undated'],
        ]);

        // Scenario 5: mix of everything - two families (one with dated
        // facts, one without), individual dated+undated facts, and a
        // close-relative synthetic event, all in one collection.
        $results[] = $this->runScenario('combined: two families, individual facts, close-relative event', [
            ['gedcom' => "1 BIRT\n2 DATE 1 JAN 1900", 'record' => $indi, 'id' => 'birth'],
            ['gedcom' => "1 MARR\n2 DATE 1 JUN 1925", 'record' => $fam1, 'id' => 'f1_marriage'],
            ['gedcom' => "1 EVEN CLOSE_RELATIVE\n2 DATE 1 JUN 1930", 'record' => $indi, 'id' => 'close_relative'],
            ['gedcom' => "1 DEAT\n2 DATE 1 JAN 1980", 'record' => $indi, 'id' => 'death'],
            ['gedcom' => "1 ENGA", 'record' => $fam2, 'id' => 'f2_engagement_undated'],
            ['gedcom' => "1 DIV", 'record' => $fam1, 'id' => 'f1_divorce_undated'],
            ['gedcom' => "1 OCCU Farmer", 'record' => $indi, 'id' => 'occupation'],
        ]);

        // Scenario 6: all facts undated (no dated backbone at all).
        $results[] = $this->runScenario('all facts undated', [
            ['gedcom' => "1 OCCU Farmer", 'record' => $indi, 'id' => 'occupation'],
            ['gedcom' => "1 ENGA", 'record' => $fam1, 'id' => 'f1_engagement'],
            ['gedcom' => "1 RESI Anytown", 'record' => $indi, 'id' => 'residence'],
        ]);

        // Scenario 7: empty collection.
        $results[] = $this->runScenario('empty collection', []);

        // Scenario 8: single fact.
        $results[] = $this->runScenario('single dated fact', [
            ['gedcom' => "1 BIRT\n2 DATE 1 JAN 1900", 'record' => $indi, 'id' => 'birth'],
        ]);

        $golden_dir = realpath(__DIR__ . '/../../..') . '/golden';
        if (!is_dir($golden_dir)) {
            mkdir($golden_dir, 0755, true);
        }

        $filepath = $golden_dir . '/fact_sort_service.json';
        $written  = file_put_contents(
            $filepath,
            json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );

        $this->assertTrue($written !== false, "Failed to write $filepath");
        $this->assertFileExists($filepath);
    }
}
