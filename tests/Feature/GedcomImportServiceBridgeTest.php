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

use Fisharebest\Webtrees\Services\GedcomImportService;
use Fisharebest\Webtrees\Tests\Concerns\UsesMigrationServiceTrait;
use Fisharebest\Webtrees\Tests\TestCase;
use Fisharebest\Webtrees\Tree;
use PHPUnit\Framework\Attributes\CoversClass;
use ReflectionClass;

use function putenv;

/**
 * Phase 3 bridge test (see docs/php-to-js-migration/phase3-bridge-decision-pass-2.md),
 * now running against the whole-suite shared service (see
 * docs/php-to-js-migration/phase4-shared-test-migration-service.md) rather
 * than a dedicated per-file process. Proves two things end to end:
 * GedcomImportService::reformatRecord() routes through it and returns the
 * same result as native PHP, and it falls back correctly when
 * unreachable. reformatRecord() is private, so it's invoked via
 * ReflectionMethod, same as the task-21 characterization test.
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
        $rec     = "0 @I1@ INDI\n1 NAME   John   /Smith/\n1 SEX m\n1 BIRT y\n2 DATE cir 1900";

        // Force a genuine native baseline — the shared service may already
        // be live and its env var set from an earlier test in this process.
        self::overrideMigrationServiceUrl('');

        $native_result = $this->callReformatRecord($service, $rec, $tree);

        // Point back at the live shared service to prove the bridge matches.
        self::restoreMigrationServiceUrl();

        self::assertSame($native_result, $this->callReformatRecord($service, $rec, $tree));
    }

    public function testFallsBackWhenServiceUnreachable(): void
    {
        $tree    = $this->importTree('demo.ged');
        $service = new GedcomImportService();
        $rec     = "0 @I1@ INDI\n1 NAME   John   /Smith/\n1 SEX m\n1 BIRT y\n2 DATE cir 1900";

        self::overrideMigrationServiceUrl(''); // force a genuine native baseline

        $native_result = $this->callReformatRecord($service, $rec, $tree);

        // Nothing listens on this port — connection should be refused
        // quickly, not hang for the full timeout.
        putenv('WEBTREES_GEDCOM_IMPORT_SERVICE_URL=http://127.0.0.1:1');
        self::resetMigrationServiceUnavailableFlag();

        self::assertSame($native_result, $this->callReformatRecord($service, $rec, $tree));
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
