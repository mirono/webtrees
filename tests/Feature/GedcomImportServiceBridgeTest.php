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

use Fisharebest\Webtrees\Http\Exceptions\HttpServiceUnavailableException;
use Fisharebest\Webtrees\Services\GedcomImportService;
use Fisharebest\Webtrees\Tests\Concerns\UsesMigrationServiceTrait;
use Fisharebest\Webtrees\Tests\TestCase;
use Fisharebest\Webtrees\Tree;
use PHPUnit\Framework\Attributes\CoversClass;
use ReflectionClass;

/**
 * Cutover test (see docs/php-to-js-migration/phase4-cutover-gedcom-import-service.md):
 * GedcomImportService::reformatRecord() no longer has a native fallback,
 * so this file no longer proves "matches native" — there's nothing
 * native left to compare against. Instead, testRoutesThroughLiveService()
 * asserts the live bridge against a known-good value cross-checked
 * against the committed golden fixture (golden/reformat_record.json —
 * the "lowercase uppercased" date case, chosen because it doesn't touch
 * the FILE/CONC branches, so it's independent of the tree's
 * GEDCOM_MEDIA_PATH/WORD_WRAPPED_NOTES preferences), and
 * testThrowsWhenServiceUnreachable() proves an unreachable service makes
 * reformatRecord() throw, not silently misbehave. reformatRecord() is
 * private, so it's invoked via ReflectionMethod, same as the task-21
 * characterization test.
 *
 * importTree() (called by both tests below) already starts the shared
 * service and skips the test if Node/npm aren't available — see
 * tests/TestCase.php and tests/Concerns/SharedMigrationService.php.
 */
#[CoversClass(GedcomImportService::class)]
class GedcomImportServiceBridgeTest extends TestCase
{
    use UsesMigrationServiceTrait;

    protected static bool $uses_database = true;

    protected function tearDown(): void
    {
        parent::tearDown();

        self::restoreMigrationServiceUrl();
    }

    private function callReformatRecord(GedcomImportService $service, string $rec, Tree $tree): string
    {
        $method = (new ReflectionClass($service))->getMethod('reformatRecord');

        return $method->invoke($service, $rec, $tree);
    }

    public function testRoutesThroughLiveService(): void
    {
        $tree    = $this->importTree('demo.ged');
        $service = new GedcomImportService();
        $rec     = "0 @I1@ INDI\n1 BIRT\n2 DATE 1 jan 2000";

        self::assertSame(
            "0 @I1@ INDI\n1 BIRT\n2 DATE 1 JAN 2000",
            $this->callReformatRecord($service, $rec, $tree),
        );
    }

    public function testThrowsWhenServiceUnreachable(): void
    {
        $tree    = $this->importTree('demo.ged');
        $service = new GedcomImportService();

        // Nothing listens on this port — connection should be refused
        // quickly, not hang for the full timeout.
        self::overrideMigrationServiceUrl('http://127.0.0.1:1');

        self::expectException(HttpServiceUnavailableException::class);

        $this->callReformatRecord($service, "0 @I1@ INDI\n1 BIRT\n2 DATE 1 jan 2000", $tree);
    }

    private static function migrationServiceEnvVar(): string
    {
        return 'WEBTREES_GEDCOM_IMPORT_SERVICE_URL';
    }

    private static function migrationServiceUnavailableFlagClass(): string
    {
        return GedcomImportService::class;
    }
}
