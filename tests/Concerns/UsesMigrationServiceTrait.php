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

namespace Fisharebest\Webtrees\Tests\Concerns;

use ReflectionClass;

use function getenv;
use function putenv;

/**
 * Shared boilerplate for temporarily pointing a bridge's env var somewhere
 * other than the shared migration service (see SharedMigrationService and
 * docs/php-to-js-migration/phase4-shared-test-migration-service.md), most
 * commonly at an unreachable address to prove "throws/falls back when
 * unreachable" behaviour.
 *
 * Every *ServiceBridgeTest that wants a genuine live-service run instead
 * calls SharedMigrationService::ensureRunning() directly — this trait no
 * longer starts or stops any process itself.
 *
 * Members are declared `static` (rather than per-instance) so the same
 * methods work both for a per-test override (called from a test method
 * and restored in tearDown()) and a once-per-class override (called from
 * setUpBeforeClass()/tearDownAfterClass(), which have no $this). Each
 * class that uses this trait gets its own copy of the static state — it
 * is not shared between classes.
 */
trait UsesMigrationServiceTrait
{
    private static string|false $saved_migration_service_env_value = false;

    private static bool $migration_service_url_overridden = false;

    /**
     * The WEBTREES_*_SERVICE_URL env var this bridge reads.
     */
    abstract private static function migrationServiceEnvVar(): string;

    /**
     * The bridge class whose private static $service_unavailable circuit
     * breaker needs resetting between scenarios.
     *
     * @return class-string
     */
    abstract private static function migrationServiceUnavailableFlagClass(): string;

    /**
     * Saves the env var's current value (normally pointing at the shared
     * migration service — see SharedMigrationService) and points it at
     * $url instead. Pair with restoreMigrationServiceUrl() in
     * tearDown()/tearDownAfterClass() so later tests in the same process
     * keep working.
     */
    private static function overrideMigrationServiceUrl(string $url): void
    {
        self::$saved_migration_service_env_value = getenv(self::migrationServiceEnvVar());
        self::$migration_service_url_overridden  = true;

        putenv(self::migrationServiceEnvVar() . '=' . $url);
        self::resetMigrationServiceUnavailableFlag();
    }

    /**
     * Restores the env var to exactly what it was before
     * overrideMigrationServiceUrl() — unset if it was genuinely unset,
     * never just blanked, so a shared default set earlier in the process
     * isn't lost for tests that run afterwards. A no-op if this test never
     * called overrideMigrationServiceUrl() in the first place, so it's
     * safe to call unconditionally from tearDown()/tearDownAfterClass().
     */
    private static function restoreMigrationServiceUrl(): void
    {
        if (!self::$migration_service_url_overridden) {
            return;
        }

        if (self::$saved_migration_service_env_value === false) {
            putenv(self::migrationServiceEnvVar());
        } else {
            putenv(self::migrationServiceEnvVar() . '=' . self::$saved_migration_service_env_value);
        }

        self::$migration_service_url_overridden = false;
        self::resetMigrationServiceUnavailableFlag();
    }

    private static function resetMigrationServiceUnavailableFlag(): void
    {
        $class    = self::migrationServiceUnavailableFlagClass();
        $property = (new ReflectionClass($class))->getProperty('service_unavailable');
        $property->setValue(null, false);
    }
}
