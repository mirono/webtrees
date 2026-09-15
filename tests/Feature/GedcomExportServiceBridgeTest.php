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
use Fisharebest\Webtrees\Services\GedcomExportService;
use Fisharebest\Webtrees\Tests\Concerns\SharedMigrationService;
use Fisharebest\Webtrees\Tests\Concerns\UsesMigrationServiceTrait;
use Fisharebest\Webtrees\Tests\TestCase;
use Nyholm\Psr7\Factory\Psr17Factory;
use PHPUnit\Framework\Attributes\CoversClass;

use function str_repeat;

/**
 * Cutover test (see docs/php-to-js-migration/phase4-cutover-gedcom-export-service.md):
 * GedcomExportService::wrapLongLines() no longer has a native fallback, so
 * this file no longer proves "matches native" — there's nothing native
 * left to compare against. Instead, testRoutesThroughLiveService() asserts
 * the live bridge against known-good values cross-checked against the
 * committed golden fixture (golden/wrap_long_lines.json), and
 * testThrowsWhenServiceUnreachable() proves an unreachable service makes
 * wrapLongLines() throw, not silently misbehave.
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

        self::assertSame(
            "1 NOTE AAAAAAAAAAAAA\n2 CONC AA",
            $service->wrapLongLines($gedcom, 20),
        );
    }

    public function testThrowsWhenServiceUnreachable(): void
    {
        // Nothing listens on this port — connection should be refused
        // quickly, not hang for the full timeout.
        self::overrideMigrationServiceUrl('http://127.0.0.1:1');

        self::expectException(HttpServiceUnavailableException::class);

        $this->makeService()->wrapLongLines('1 NOTE ' . str_repeat('A', 15), 20);
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
