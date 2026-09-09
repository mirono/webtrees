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
use Fisharebest\Webtrees\Tests\TestCase;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Nyholm\Psr7\Factory\Psr17Factory;
use PHPUnit\Framework\Attributes\CoversClass;
use ReflectionClass;

use function escapeshellarg;
use function is_resource;
use function proc_close;
use function proc_open;
use function proc_terminate;
use function putenv;
use function str_repeat;
use function usleep;

/**
 * Phase 3 bridge test (see docs/php-to-js-migration/phase3-bridge-decision-pass-2.md).
 * Spins up the real Node migration service and proves two things end to
 * end: GedcomExportService::wrapLongLines() routes through it and returns
 * the same result as native PHP, and it falls back correctly when
 * unreachable.
 */
#[CoversClass(GedcomExportService::class)]
class GedcomExportServiceBridgeTest extends TestCase
{
    private const int PORT = 8196; // dedicated to this test, distinct from the other bridge tests and the dev default (8090)

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

        putenv('WEBTREES_GEDCOM_EXPORT_SERVICE_URL');
        $this->resetServiceUnavailableFlag();
    }

    private function makeService(): GedcomExportService
    {
        $psr17_factory = new Psr17Factory();

        return new GedcomExportService($psr17_factory, $psr17_factory);
    }

    public function testRoutesThroughLiveService(): void
    {
        if (!$this->startService()) {
            self::markTestSkipped('Could not start server/migration-service.mjs (node/npm unavailable?)');
        }

        $service = $this->makeService();
        $gedcom  = '1 NOTE ' . str_repeat('A', 15);

        $native_result = $service->wrapLongLines($gedcom, 20);

        putenv('WEBTREES_GEDCOM_EXPORT_SERVICE_URL=http://127.0.0.1:' . self::PORT);
        $this->resetServiceUnavailableFlag();

        self::assertSame($native_result, $service->wrapLongLines($gedcom, 20));
    }

    public function testFallsBackWhenServiceUnreachable(): void
    {
        $service = $this->makeService();
        $gedcom  = '1 NOTE ' . str_repeat('A', 15);

        $native_result = $service->wrapLongLines($gedcom, 20);

        // Nothing listens on this port — connection should be refused
        // quickly, not hang for the full timeout.
        putenv('WEBTREES_GEDCOM_EXPORT_SERVICE_URL=http://127.0.0.1:1');
        $this->resetServiceUnavailableFlag();

        self::assertSame($native_result, $service->wrapLongLines($gedcom, 20));
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

    private function resetServiceUnavailableFlag(): void
    {
        $property = (new ReflectionClass(GedcomExportService::class))->getProperty('service_unavailable');
        $property->setValue(null, false);
    }
}
