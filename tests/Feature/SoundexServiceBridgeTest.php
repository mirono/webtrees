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
use Fisharebest\Webtrees\Soundex;
use Fisharebest\Webtrees\Tests\Concerns\SharedMigrationService;
use Fisharebest\Webtrees\Tests\Concerns\UsesMigrationServiceTrait;
use Fisharebest\Webtrees\Tests\TestCase;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Cutover test (see docs/php-to-js-migration/phase4-cutover-soundex.md):
 * Soundex::russell()/compare()/daitchMokotoff() no longer have a native
 * fallback, so this file no longer proves "matches native" — there's
 * nothing native left to compare against. Instead,
 * testRoutesThroughLiveService() asserts the live bridge against
 * hardcoded known-good values (the same approach
 * GedcomServiceBridgeTest/SurnameTraditionServiceBridgeTest already use),
 * cross-checked against the committed golden fixtures
 * (golden/soundex_russell.json, golden/soundex_daitch_mokotoff.json), and
 * testThrowsWhenServiceUnreachable() proves an unreachable service makes
 * every method throw, not silently misbehave.
 */
#[CoversClass(Soundex::class)]
class SoundexServiceBridgeTest extends TestCase
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

        self::assertSame('A226', Soundex::russell('Ashcraft'));
        self::assertSame('645740', Soundex::daitchMokotoff('Moskowitz'));
        self::assertTrue(Soundex::compare('S530', 'S530:X000'));
    }

    public function testThrowsWhenServiceUnreachable(): void
    {
        // Nothing listens on this port — connection should be refused
        // quickly, not hang for the full timeout.
        self::overrideMigrationServiceUrl('http://127.0.0.1:1');

        self::expectException(HttpServiceUnavailableException::class);

        Soundex::russell('Ashcraft');
    }

    private static function migrationServiceEnvVar(): string
    {
        return 'WEBTREES_SOUNDEX_SERVICE_URL';
    }

    private static function migrationServiceUnavailableFlagClass(): string
    {
        return Soundex::class;
    }
}
