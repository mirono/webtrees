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

namespace Fisharebest\Webtrees\Tests\Unit;

use Fisharebest\Webtrees\Tests\TestCase;
use Fisharebest\Webtrees\Webtrees;
use PHPUnit\Framework\Attributes\CoversClass;

use function error_reporting;
use function file_exists;
use function file_put_contents;
use function rename;
use function unlink;

#[CoversClass(Webtrees::class)]
class WebtreesTest extends TestCase
{
    public function testInit(): void
    {
        error_reporting(0);

        $webtrees = new Webtrees();
        $webtrees->bootstrap();

        // webtrees sets the error reporting level.
        self::assertNotSame(0, error_reporting());
        self::assertSame(Webtrees::ERROR_REPORTING, error_reporting());
    }

    /**
     * Webtrees::readConfig() reads from data/config.ini.php and/or
     * data/config.yaml, both of which exist as real files in this dev
     * checkout (config.ini.php always; config.yaml only if a previous
     * setup-cli/ run left one behind). Move whichever exist out of the
     * way for the duration of this test, and restore them afterwards
     * regardless of outcome — this test must never permanently disturb
     * a real local install.
     */
    public function testReadConfig(): void
    {
        $ini_backup  = Webtrees::CONFIG_FILE . '.test-backup';
        $yaml_backup = Webtrees::CONFIG_FILE_YAML . '.test-backup';

        $had_ini  = file_exists(Webtrees::CONFIG_FILE);
        $had_yaml = file_exists(Webtrees::CONFIG_FILE_YAML);

        if ($had_ini) {
            rename(Webtrees::CONFIG_FILE, $ini_backup);
        }

        if ($had_yaml) {
            rename(Webtrees::CONFIG_FILE_YAML, $yaml_backup);
        }

        try {
            // Neither file exists.
            $config_neither = Webtrees::readConfig();
            self::assertSame([], $config_neither);

            // ini only.
            file_put_contents(Webtrees::CONFIG_FILE, "; <?php return; ?>\ndbtype = \"sqlite\"\ndbport = \"\"\n");
            $config_ini = Webtrees::readConfig();
            self::assertSame(['dbtype' => 'sqlite', 'dbport' => ''], $config_ini);

            // yaml only, with real (non-string) YAML scalar types — every
            // value must come back as a string, or downstream
            // Validator::string() calls throw HttpBadRequestException on
            // every request (see the readConfig() docblock).
            unlink(Webtrees::CONFIG_FILE);
            file_put_contents(Webtrees::CONFIG_FILE_YAML, "dbtype: \"pgsql\"\ndbport: 5432\nrewrite_urls: true\nblock_asn: null\n");
            $config_yaml = Webtrees::readConfig();
            self::assertSame(['dbtype' => 'pgsql', 'dbport' => '5432', 'rewrite_urls' => '1', 'block_asn' => ''], $config_yaml);

            // Both exist - yaml takes priority.
            file_put_contents(Webtrees::CONFIG_FILE, "; <?php return; ?>\ndbtype = \"sqlite\"\n");
            $config_both = Webtrees::readConfig();
            self::assertSame('pgsql', $config_both['dbtype']);
        } finally {
            if (file_exists(Webtrees::CONFIG_FILE)) {
                unlink(Webtrees::CONFIG_FILE);
            }

            if (file_exists(Webtrees::CONFIG_FILE_YAML)) {
                unlink(Webtrees::CONFIG_FILE_YAML);
            }

            if ($had_ini) {
                rename($ini_backup, Webtrees::CONFIG_FILE);
            }

            if ($had_yaml) {
                rename($yaml_backup, Webtrees::CONFIG_FILE_YAML);
            }
        }
    }
}
