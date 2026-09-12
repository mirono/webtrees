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

namespace Fisharebest\Webtrees\Tests\Feature;

use Fisharebest\Webtrees\Fact;
use Fisharebest\Webtrees\Http\Exceptions\HttpServiceUnavailableException;
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\Services\FactSortService;
use Fisharebest\Webtrees\Tests\Concerns\UsesMigrationServiceTrait;
use Fisharebest\Webtrees\Tests\TestCase;
use Illuminate\Support\Collection;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Cutover test (see docs/php-to-js-migration/phase4-cutover-fact-sort-surname-tradition.md):
 * FactSortService::sort() no longer has a native fallback, so this file no
 * longer proves "matches native" — tests/Unit/Services/FactSortServiceTest.php
 * already proves the live bridge is correct, exhaustively, via its 36
 * unchanged test executions now running against a real service. What's
 * left here is the one behavior specific to the bridge itself: an
 * unreachable service must make sort() throw, not silently misbehave.
 */
#[CoversClass(FactSortService::class)]
class FactSortServiceBridgeTest extends TestCase
{
    use UsesMigrationServiceTrait;

    protected static bool $uses_database = true;

    protected function tearDown(): void
    {
        parent::tearDown();

        self::restoreMigrationServiceUrl();
    }

    public function testThrowsWhenServiceUnreachable(): void
    {
        $service = new FactSortService();
        $facts   = $this->buildFacts();

        // Nothing listens on this port — connection should be refused
        // quickly, not hang for the full timeout.
        self::overrideMigrationServiceUrl('http://127.0.0.1:1');

        self::expectException(HttpServiceUnavailableException::class);

        $service->sort($facts);
    }

    /**
     * @return Collection<int,Fact>
     */
    private function buildFacts(): Collection
    {
        $individual = self::createStub(Individual::class);
        $individual->method('tag')->willReturn('INDI');

        return new Collection([
            new Fact("1 DEAT\n2 DATE 1 JAN 1980", $individual, 'death'),
            new Fact("1 BIRT\n2 DATE 1 JAN 1900", $individual, 'birth'),
            new Fact('1 OCCU Farmer', $individual, 'occupation'),
        ]);
    }

    private static function migrationServiceEnvVar(): string
    {
        return 'WEBTREES_FACT_SORT_SERVICE_URL';
    }

    private static function migrationServiceUnavailableFlagClass(): string
    {
        return FactSortService::class;
    }
}
