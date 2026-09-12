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

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use ReflectionClass;

use function escapeshellarg;
use function is_resource;
use function proc_close;
use function proc_open;
use function proc_terminate;
use function putenv;
use function usleep;

/**
 * Shared boilerplate for spinning up a real server/migration-service.mjs
 * child process in a test (see docs/php-to-js-migration/phase4-cutover-fact-sort-surname-tradition.md).
 * Extracted from the near-identical code duplicated across every
 * tests/Feature/*ServiceBridgeTest.php file.
 *
 * Members are declared `static` (rather than per-instance) so the same
 * three methods work both for a per-test start/stop (called from a test
 * method and torn down in tearDown()) and a once-per-class start/stop
 * (called from setUpBeforeClass()/tearDownAfterClass(), which have no
 * $this). Each class that uses this trait gets its own copy of the static
 * state — it is not shared between classes.
 */
trait UsesMigrationServiceTrait
{
    /** @var resource|null */
    private static $migration_service_process = null;

    /**
     * Port this class's service instance listens on. Must be distinct from
     * every other *ServiceBridgeTest's port so parallel/overlapping runs
     * don't collide.
     */
    abstract private static function migrationServicePort(): int;

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
     * Starts the real Node service as a child process and waits (up to
     * ~2.5s) for its /health endpoint to respond, so tests don't race a
     * cold start.
     */
    private static function startMigrationService(): bool
    {
        $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $script      = escapeshellarg(__DIR__ . '/../../server/migration-service.mjs');
        $command     = 'PORT=' . self::migrationServicePort() . ' node ' . $script;

        $process = proc_open($command, $descriptors, $pipes, __DIR__ . '/../../');

        if (!is_resource($process)) {
            return false;
        }

        self::$migration_service_process = $process;

        $client = new Client(['timeout' => 0.2, 'connect_timeout' => 0.2]);

        for ($attempt = 0; $attempt < 25; $attempt++) {
            try {
                $response = $client->get('http://127.0.0.1:' . self::migrationServicePort() . '/health');

                if ($response->getStatusCode() === 200) {
                    return true;
                }
            } catch (GuzzleException) {
                // Not ready yet.
            }

            usleep(100_000); // 100ms
        }

        return false;
    }

    /**
     * Kills the child process (if running), clears the env var, and resets
     * the bridge's circuit breaker.
     */
    private static function stopMigrationService(): void
    {
        if (is_resource(self::$migration_service_process)) {
            proc_terminate(self::$migration_service_process);
            proc_close(self::$migration_service_process);
            self::$migration_service_process = null;
        }

        putenv(self::migrationServiceEnvVar());
        self::resetMigrationServiceUnavailableFlag();
    }

    private static function resetMigrationServiceUnavailableFlag(): void
    {
        $class    = self::migrationServiceUnavailableFlagClass();
        $property = (new ReflectionClass($class))->getProperty('service_unavailable');
        $property->setValue(null, false);
    }
}
