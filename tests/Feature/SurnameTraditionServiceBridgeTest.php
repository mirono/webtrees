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
use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\SurnameTradition\BridgedSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\LithuanianSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\PatrilinealSurnameTradition;
use Fisharebest\Webtrees\Tests\TestCase;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Support\Collection;
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
 * Phase 3 bridge test (see docs/php-to-js-migration/phase3-surname-tradition-bridge.md).
 * Spins up the real Node migration service (server/migration-service.mjs)
 * as a child process and proves two things end to end:
 *
 * 1. When WEBTREES_SURNAME_TRADITION_SERVICE_URL points at a live service,
 *    BridgedSurnameTradition routes through it and returns the same
 *    results as the wrapped native implementation — including a case with
 *    a non-ASCII inflection suffix (Lithuanian 'ytė'), the one behavior
 *    that needed a real fix (see lib/surname-tradition/patrilineal.js).
 * 2. When it points at an unreachable address, the same calls still
 *    return correct (native) results — the bridge never breaks callers.
 *
 * Skips itself if `node`/`npm` aren't available, rather than failing CI on
 * a machine without Node installed.
 */
#[CoversClass(BridgedSurnameTradition::class)]
class SurnameTraditionServiceBridgeTest extends TestCase
{
    private const int PORT = 8198; // distinct from SoundexServiceBridgeTest's 8199 and the dev default (8090)

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

        putenv('WEBTREES_SURNAME_TRADITION_SERVICE_URL');
        $this->resetServiceUnavailableFlag();
    }

    public function testRoutesThroughLiveService(): void
    {
        if (!$this->startService()) {
            self::markTestSkipped('Could not start server/migration-service.mjs (node/npm unavailable?)');
        }

        $patrilineal = new BridgedSurnameTradition(new PatrilinealSurnameTradition(), 'patrilineal');
        $lithuanian  = new BridgedSurnameTradition(new LithuanianSurnameTradition(), 'lithuanian');

        $father       = $this->individualNamed('John /de White/');
        $mother       = $this->individualNamed('Mary /van Black/');
        $litFather    = $this->individualNamed('John /Whitis/'); // exercises the 'ytė' inflection fix

        $native_child     = $patrilineal->newChildNames($father, $mother, 'U');
        $native_lithuanian = $lithuanian->newChildNames($litFather, null, 'F');

        putenv('WEBTREES_SURNAME_TRADITION_SERVICE_URL=http://127.0.0.1:' . self::PORT);
        $this->resetServiceUnavailableFlag();

        self::assertSame($native_child, $patrilineal->newChildNames($father, $mother, 'U'));
        self::assertSame($native_lithuanian, $lithuanian->newChildNames($litFather, null, 'F'));
        self::assertSame(['1 NAME /Whitytė/' . "\n" . '2 TYPE BIRTH' . "\n" . '2 SURN Whitis'], $native_lithuanian);
    }

    public function testFallsBackWhenServiceUnreachable(): void
    {
        $patrilineal = new BridgedSurnameTradition(new PatrilinealSurnameTradition(), 'patrilineal');
        $father      = $this->individualNamed('John /de White/');

        $native_child = $patrilineal->newChildNames($father, null, 'U');

        // Nothing listens on this port — connection should be refused
        // quickly, not hang for the full timeout.
        putenv('WEBTREES_SURNAME_TRADITION_SERVICE_URL=http://127.0.0.1:1');
        $this->resetServiceUnavailableFlag();

        self::assertSame($native_child, $patrilineal->newChildNames($father, null, 'U'));
    }

    private function individualNamed(string $name): Individual
    {
        $fact = self::createStub(Fact::class);
        $fact->method('value')->willReturn($name);

        $individual = self::createStub(Individual::class);
        $individual->method('facts')->willReturn(new Collection([$fact]));

        return $individual;
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
     * BridgedSurnameTradition::$service_unavailable is a private static
     * "circuit breaker" shared across every bridged tradition — see
     * SoundexServiceBridgeTest's equivalent helper for why this needs
     * resetting by hand between test scenarios.
     */
    private function resetServiceUnavailableFlag(): void
    {
        $property = (new ReflectionClass(BridgedSurnameTradition::class))->getProperty('service_unavailable');
        $property->setValue(null, false);
    }
}
