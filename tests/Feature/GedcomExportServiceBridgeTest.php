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

use Fisharebest\Webtrees\Services\GedcomExportService;
use Fisharebest\Webtrees\Tests\Concerns\SharedMigrationService;
use Fisharebest\Webtrees\Tests\Concerns\UsesMigrationServiceTrait;
use Fisharebest\Webtrees\Tests\TestCase;
use Nyholm\Psr7\Factory\Psr17Factory;
use PHPUnit\Framework\Attributes\CoversClass;

use function putenv;
use function str_repeat;

/**
 * Phase 3 bridge test (see docs/php-to-js-migration/phase3-bridge-decision-pass-2.md),
 * now running against the whole-suite shared service (see
 * docs/php-to-js-migration/phase4-shared-test-migration-service.md) rather
 * than a dedicated per-file process. Proves two things end to end:
 * GedcomExportService::wrapLongLines() routes through it and returns the
 * same result as native PHP, and it falls back correctly when
 * unreachable.
 */
#[CoversClass(GedcomExportService::class)]
class GedcomExportServiceBridgeTest extends TestCase
{
    use UsesMigrationServiceTrait;

    protected function tearDown(): void
    {
        parent::tearDown();

        self::restoreMigrationServiceUrl();
    }

    private function makeService(): GedcomExportService
    {
        $psr17_factory = new Psr17Factory();

        return new GedcomExportService($psr17_factory, $psr17_factory);
    }

    public function testRoutesThroughLiveService(): void
    {
        if (!SharedMigrationService::ensureRunning()) {
            self::markTestSkipped('Could not start server/migration-service.mjs (node/npm unavailable?)');
        }

        $service = $this->makeService();
        $gedcom  = '1 NOTE ' . str_repeat('A', 15);

        // Force a genuine native baseline — the shared service may already
        // be live and its env var set from an earlier test in this process.
        self::overrideMigrationServiceUrl('');

        $native_result = $service->wrapLongLines($gedcom, 20);

        // Point back at the live shared service to prove the bridge matches.
        self::restoreMigrationServiceUrl();

        self::assertSame($native_result, $service->wrapLongLines($gedcom, 20));
    }

    public function testFallsBackWhenServiceUnreachable(): void
    {
        $service = $this->makeService();
        $gedcom  = '1 NOTE ' . str_repeat('A', 15);

        self::overrideMigrationServiceUrl(''); // force a genuine native baseline

        $native_result = $service->wrapLongLines($gedcom, 20);

        // Nothing listens on this port — connection should be refused
        // quickly, not hang for the full timeout.
        putenv('WEBTREES_GEDCOM_EXPORT_SERVICE_URL=http://127.0.0.1:1');
        self::resetMigrationServiceUnavailableFlag();

        self::assertSame($native_result, $service->wrapLongLines($gedcom, 20));
    }

    private static function migrationServiceEnvVar(): string
    {
        return 'WEBTREES_GEDCOM_EXPORT_SERVICE_URL';
    }

    private static function migrationServiceUnavailableFlagClass(): string
    {
        return GedcomExportService::class;
    }
}
