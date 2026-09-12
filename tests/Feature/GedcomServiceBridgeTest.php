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

use Fisharebest\Webtrees\Services\GedcomService;
use Fisharebest\Webtrees\Tests\Concerns\SharedMigrationService;
use Fisharebest\Webtrees\Tests\Concerns\UsesMigrationServiceTrait;
use Fisharebest\Webtrees\Tests\TestCase;
use PHPUnit\Framework\Attributes\CoversClass;

use function putenv;

/**
 * Phase 3 bridge test (see docs/php-to-js-migration/), now running against
 * the whole-suite shared service (see
 * docs/php-to-js-migration/phase4-shared-test-migration-service.md) rather
 * than a dedicated per-file process. Proves two things end to end:
 *
 * 1. When WEBTREES_GEDCOM_SERVICE_URL points at a live service,
 *    GedcomService::canonicalTag()/readLatitude()/readLongitude() route
 *    through it and return the same results as the native PHP
 *    implementation.
 * 2. When it points at an unreachable address, the same methods still
 *    return correct (native) results — the bridge never breaks callers.
 *
 * Skips itself if `node`/`npm` aren't available in this environment,
 * rather than failing CI on a machine without Node installed.
 */
#[CoversClass(GedcomService::class)]
class GedcomServiceBridgeTest extends TestCase
{
    use UsesMigrationServiceTrait;

    protected function tearDown(): void
    {
        parent::tearDown();

        self::restoreMigrationServiceUrl();
    }

    public function testRoutesThroughLiveService(): void
    {
        if (!SharedMigrationService::ensureRunning()) {
            self::markTestSkipped('Could not start server/migration-service.mjs (node/npm unavailable?)');
        }

        $service = new GedcomService();

        // Force a genuine native baseline — the shared service may already
        // be live and its env var set from an earlier test in this process.
        self::overrideMigrationServiceUrl('');

        $native_tag       = $service->canonicalTag('birth');
        $native_latitude  = $service->readLatitude('N52.1234');
        $native_longitude = $service->readLongitude('W010.5');
        $native_null      = $service->readLatitude('not a number');

        // Point back at the live shared service to prove the bridge matches.
        self::restoreMigrationServiceUrl();

        self::assertSame($native_tag, $service->canonicalTag('birth'));
        self::assertSame($native_latitude, $service->readLatitude('N52.1234'));
        self::assertSame($native_longitude, $service->readLongitude('W010.5'));
        self::assertSame($native_null, $service->readLatitude('not a number'));
    }

    public function testFallsBackWhenServiceUnreachable(): void
    {
        $service = new GedcomService();

        self::overrideMigrationServiceUrl(''); // force a genuine native baseline

        $native_tag      = $service->canonicalTag('birth');
        $native_latitude = $service->readLatitude('N52.1234');

        // Nothing listens on this port — connection should be refused
        // quickly, not hang for the full timeout.
        putenv('WEBTREES_GEDCOM_SERVICE_URL=http://127.0.0.1:1');
        self::resetMigrationServiceUnavailableFlag();

        self::assertSame($native_tag, $service->canonicalTag('birth'));
        self::assertSame($native_latitude, $service->readLatitude('N52.1234'));
    }

    private static function migrationServiceEnvVar(): string
    {
        return 'WEBTREES_GEDCOM_SERVICE_URL';
    }

    private static function migrationServiceUnavailableFlagClass(): string
    {
        return GedcomService::class;
    }
}
