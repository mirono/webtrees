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
use Fisharebest\Webtrees\SurnameTradition\BridgedSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\LithuanianSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\PatrilinealSurnameTradition;
use Fisharebest\Webtrees\Tests\Concerns\SharedMigrationService;
use Fisharebest\Webtrees\Tests\Concerns\UsesMigrationServiceTrait;
use Fisharebest\Webtrees\Tests\TestCase;
use Illuminate\Support\Collection;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Cutover test (see docs/php-to-js-migration/phase4-cutover-fact-sort-surname-tradition.md,
 * supersedes docs/php-to-js-migration/phase3-surname-tradition-bridge.md's
 * original bridge test description). BridgedSurnameTradition's three
 * computational methods no longer have a native fallback, so this file
 * proves two things end to end:
 *
 * 1. With a live service, the bridge returns correct results — including
 *    the Lithuanian 'ytė' inflection case, the one behavior that needed a
 *    real fix (see lib/surname-tradition/patrilineal.js).
 * 2. With an unreachable service, the bridge throws
 *    HttpServiceUnavailableException instead of degrading silently.
 *
 * Skips itself if `node`/`npm` aren't available, rather than failing CI on
 * a machine without Node installed.
 */
#[CoversClass(BridgedSurnameTradition::class)]
class SurnameTraditionServiceBridgeTest extends TestCase
{
    use UsesMigrationServiceTrait;

    protected function tearDown(): void
    {
        parent::tearDown();

        self::restoreMigrationServiceUrl();
    }

    public function testRoutesThroughLiveServiceAndAppliesLithuanianInflection(): void
    {
        if (!SharedMigrationService::ensureRunning()) {
            self::markTestSkipped('Could not start server/migration-service.mjs (node/npm unavailable?)');
        }

        $lithuanian = new BridgedSurnameTradition(new LithuanianSurnameTradition(), 'lithuanian');
        $litFather  = $this->individualNamed('John /Whitis/'); // exercises the 'ytė' inflection fix

        $names = $lithuanian->newChildNames($litFather, null, 'F');

        self::assertSame(['1 NAME /Whitytė/' . "\n" . '2 TYPE BIRTH' . "\n" . '2 SURN Whitis'], $names);
    }

    public function testThrowsWhenServiceUnreachable(): void
    {
        $patrilineal = new BridgedSurnameTradition(new PatrilinealSurnameTradition(), 'patrilineal');
        $father      = $this->individualNamed('John /de White/');

        // Nothing listens on this port — connection should be refused
        // quickly, not hang for the full timeout.
        self::overrideMigrationServiceUrl('http://127.0.0.1:1');

        self::expectException(HttpServiceUnavailableException::class);

        $patrilineal->newChildNames($father, null, 'U');
    }

    private function individualNamed(string $name): Individual
    {
        $fact = self::createStub(Fact::class);
        $fact->method('value')->willReturn($name);

        $individual = self::createStub(Individual::class);
        $individual->method('facts')->willReturn(new Collection([$fact]));

        return $individual;
    }

    private static function migrationServiceEnvVar(): string
    {
        return 'WEBTREES_SURNAME_TRADITION_SERVICE_URL';
    }

    private static function migrationServiceUnavailableFlagClass(): string
    {
        return BridgedSurnameTradition::class;
    }
}
