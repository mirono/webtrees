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

use function escapeshellarg;
use function is_resource;
use function proc_close;
use function proc_open;
use function proc_terminate;
use function putenv;
use function register_shutdown_function;
use function usleep;

/**
 * One live server/migration-service.mjs process, shared by the whole
 * PHPUnit run (see docs/php-to-js-migration/phase4-shared-test-migration-service.md).
 *
 * Started lazily on first use — plain unit tests that never touch a
 * bridge never pay the startup cost and never need Node installed.
 * tests/TestCase.php::importTree() calls ensureRunning() before doing
 * anything else, since it's the funnel point for every test that imports
 * a GEDCOM file (which, once the remaining bridged modules lose their
 * native fallback, will need a live service). Every *ServiceBridgeTest
 * that wants to prove the "live service" path also calls ensureRunning()
 * directly instead of spinning up its own dedicated process.
 *
 * A `UsesMigrationServiceTrait`-using test that needs to prove
 * "unreachable" behaviour temporarily overrides its own env var (see that
 * trait) — it does not stop this shared process.
 */
final class SharedMigrationService
{
    private const int PORT = 8090;

    /**
     * Every bridge's env var. Set unconditionally on a successful start so
     * that a module cut over later needs no new test wiring here.
     *
     * @var list<string>
     */
    private const array ENV_VARS = [
        'WEBTREES_SOUNDEX_SERVICE_URL',
        'WEBTREES_GEDCOM_SERVICE_URL',
        'WEBTREES_SURNAME_TRADITION_SERVICE_URL',
        'WEBTREES_FACT_SORT_SERVICE_URL',
        'WEBTREES_GEDCOM_EXPORT_SERVICE_URL',
        'WEBTREES_GEDCOM_IMPORT_SERVICE_URL',
    ];

    /** @var resource|null */
    private static $process = null;

    private static bool $start_attempted = false;

    private static bool $started = false;

    /**
     * Starts the shared service on first call; every later call is a
     * cheap boolean check. Returns false (without throwing) if Node isn't
     * available or the service didn't come up — callers should
     * self::markTestSkipped() in that case rather than fail hard.
     */
    public static function ensureRunning(): bool
    {
        if (self::$start_attempted) {
            return self::$started;
        }

        self::$start_attempted = true;
        self::$started         = self::start();

        return self::$started;
    }

    private static function start(): bool
    {
        // File descriptors, not unread pipes: this process is meant to
        // outlive the PHPUnit run that started it (killed only via
        // register_shutdown_function() below). Pipes here would leak a
        // duplicate of the calling process's own stdout/stderr into this
        // long-lived child (a known proc_open quirk) — when the caller's
        // output is itself piped (e.g. `phpunit ... | tail`), that leaked
        // descriptor keeps the pipe open forever, hanging the reader long
        // after PHPUnit itself has exited. /dev/null redirection handles
        // fds 0-2, but proc_open() also passes through any OTHER open
        // descriptor the calling PHP process happens to hold (e.g.
        // PHPUnit's own printer re-opening `php://stdout`, which is a
        // second, independent duplicate of the same pipe, at some fd
        // number PHP doesn't tell us) — confirmed by hitting this exact
        // hang again with 0-2 alone redirected, tracked via
        // /proc/<node-pid>/fd to a leaked write end at fd 4. The shell
        // wrapper below closes every inherited fd above 2 before exec'ing
        // node, so no descriptor of the calling process — known or not —
        // survives into the long-lived child.
        $descriptors = [
            0 => ['file', '/dev/null', 'r'],
            1 => ['file', '/dev/null', 'w'],
            2 => ['file', '/dev/null', 'w'],
        ];
        $script      = escapeshellarg(__DIR__ . '/../../server/migration-service.mjs');
        $command     = 'for fd in $(ls /proc/self/fd 2>/dev/null); do '
            . 'case "$fd" in 0|1|2) ;; *) eval "exec ' . '${fd}>&-" 2>/dev/null ;; esac; '
            . 'done; exec env PORT=' . self::PORT . ' node ' . $script;

        $process = proc_open($command, $descriptors, $pipes, __DIR__ . '/../../');

        if (!is_resource($process)) {
            return false;
        }

        self::$process = $process;

        $client = new Client(['timeout' => 0.2, 'connect_timeout' => 0.2]);

        for ($attempt = 0; $attempt < 25; $attempt++) {
            try {
                $response = $client->get('http://127.0.0.1:' . self::PORT . '/health');

                if ($response->getStatusCode() === 200) {
                    foreach (self::ENV_VARS as $env_var) {
                        putenv($env_var . '=http://127.0.0.1:' . self::PORT);
                    }

                    register_shutdown_function(static function (): void {
                        self::stop();
                    });

                    return true;
                }
            } catch (GuzzleException) {
                // Not ready yet.
            }

            usleep(100_000); // 100ms
        }

        self::stop();

        return false;
    }

    private static function stop(): void
    {
        if (is_resource(self::$process)) {
            proc_terminate(self::$process);
            proc_close(self::$process);
            self::$process = null;
        }
    }
}
