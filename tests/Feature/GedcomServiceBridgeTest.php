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
use Fisharebest\Webtrees\Tests\TestCase;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use PHPUnit\Framework\Attributes\CoversClass;
use ReflectionClass;

use function escapeshellarg;
use function is_resource;
use function proc_close;
use function proc_open;
use function proc_terminate;
use function putenv;
use function usleep;

/**
 * Phase 3 bridge test (see docs/php-to-js-migration/). Spins up the real
 * Node migration service (server/migration-service.mjs) as a child process
 * and proves two things end to end:
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
    private const int PORT = 8198; // dedicated to this test, distinct from SoundexServiceBridgeTest's 8199 and the dev default 8090

    /** @var resource|null */
    private $process = null;

    protected function tearDown(): void
    {
        parent::tearDown();

        if (is_resource($this->process)) {
            proc_terminate($this->process);
            proc_close($this->process);
            $this->process = null;
        }

        putenv('WEBTREES_GEDCOM_SERVICE_URL');
        $this->resetServiceUnavailableFlag();
    }

    public function testRoutesThroughLiveService(): void
    {
        if (!$this->startService()) {
            self::markTestSkipped('Could not start server/migration-service.mjs (node/npm unavailable?)');
        }

        $service = new GedcomService();

        // Native results, computed with the bridge disabled — the baseline
        // this test proves the service-routed path matches.
        $native_tag       = $service->canonicalTag('birth');
        $native_latitude  = $service->readLatitude('N52.1234');
        $native_longitude = $service->readLongitude('W010.5');
        $native_null      = $service->readLatitude('not a number');

        putenv('WEBTREES_GEDCOM_SERVICE_URL=http://127.0.0.1:' . self::PORT);
        $this->resetServiceUnavailableFlag();

        self::assertSame($native_tag, $service->canonicalTag('birth'));
        self::assertSame($native_latitude, $service->readLatitude('N52.1234'));
        self::assertSame($native_longitude, $service->readLongitude('W010.5'));
        self::assertSame($native_null, $service->readLatitude('not a number'));
    }

    public function testFallsBackWhenServiceUnreachable(): void
    {
        $service = new GedcomService();

        $native_tag      = $service->canonicalTag('birth');
        $native_latitude = $service->readLatitude('N52.1234');

        // Nothing listens on this port — connection should be refused
        // quickly, not hang for the full timeout.
        putenv('WEBTREES_GEDCOM_SERVICE_URL=http://127.0.0.1:1');
        $this->resetServiceUnavailableFlag();

        self::assertSame($native_tag, $service->canonicalTag('birth'));
        self::assertSame($native_latitude, $service->readLatitude('N52.1234'));
    }

    private function startService(): bool
    {
        $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $command     = 'PORT=' . self::PORT . ' node ' . escapeshellarg(__DIR__ . '/../../server/migration-service.mjs');

        $process = proc_open($command, $descriptors, $pipes, __DIR__ . '/../../');

        if (!is_resource($process)) {
            return false;
        }

        $this->process = $process;

        $client = new Client(['timeout' => 0.2, 'connect_timeout' => 0.2]);

        for ($attempt = 0; $attempt < 25; $attempt++) {
            try {
                $response = $client->get('http://127.0.0.1:' . self::PORT . '/health');

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
     * GedcomService::$service_unavailable is a private static "circuit
     * breaker" that latches true after the first failed call and is never
     * reset in production (a fresh PHP process starts fresh). Tests share
     * one process across many test methods, so it has to be reset by hand
     * between scenarios — there's no production reason to expose a public
     * reset method for this.
     */
    private function resetServiceUnavailableFlag(): void
    {
        $property = (new ReflectionClass(GedcomService::class))->getProperty('service_unavailable');
        $property->setValue(null, false);
    }
}
