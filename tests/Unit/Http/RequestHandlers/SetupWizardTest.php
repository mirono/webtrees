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

namespace Fisharebest\Webtrees\Tests\Unit\Http\RequestHandlers;

use Fisharebest\Webtrees\DB;
use Fisharebest\Webtrees\Http\RequestHandlers\SetupWizard;
use Fisharebest\Webtrees\Registry;
use Fisharebest\Webtrees\Services\MigrationService;
use Fisharebest\Webtrees\Services\ModuleService;
use Fisharebest\Webtrees\Services\PhpService;
use Fisharebest\Webtrees\Services\ServerCheckService;
use Fisharebest\Webtrees\Services\UserService;
use Fisharebest\Webtrees\Tests\TestCase;
use Illuminate\Support\Collection;
use PHPUnit\Framework\Attributes\CoversClass;
use ReflectionClass;
use RuntimeException;

#[CoversClass(SetupWizard::class)]
class SetupWizardTest extends TestCase
{
    // step4DatabaseConnection() renders the full setup layout, which
    // (via the theme's module lookups) needs a real DB connection -
    // same reason most full-page-render tests in this codebase need it.
    protected static bool $uses_database = true;

    public function testClass(): void
    {
        self::assertTrue(class_exists(SetupWizard::class));
    }

    /**
     * Regression test: step4DatabaseConnection() used to call
     * PhpService::pdoMysqlDefaultSocket() unconditionally for every
     * dbtype, not just DB::MYSQL. resources/views/setup/step-4-database-mysql.phtml
     * is the only template that uses the result ($mysql_local) - on any
     * server without the pdo_mysql extension installed (so the
     * pdo_mysql.default_socket ini directive doesn't exist at all),
     * this crashed the wizard with "Cannot read PHP configuration:
     * pdo_mysql.default_socket" even when the user picked Postgres,
     * SQLite, or SQL Server. Reported against a real Docker image that
     * only had pdo_sqlite/pdo_pgsql installed - confirmed live before
     * fixing.
     */
    public function testStep4DoesNotReadMysqlSocketForNonMysqlDbtype(): void
    {
        $php_service = new class extends PhpService {
            public function pdoMysqlDefaultSocket(): string
            {
                throw new RuntimeException('pdo_mysql.default_socket must not be read for a non-mysql dbtype');
            }
        };

        $wizard = new SetupWizard(
            Registry::container()->get(MigrationService::class),
            Registry::container()->get(ModuleService::class),
            $php_service,
            Registry::container()->get(ServerCheckService::class),
            Registry::container()->get(UserService::class),
        );

        $method = (new ReflectionClass($wizard))->getMethod('step4DatabaseConnection');

        $data = [
            'baseurl'      => '',
            'lang'         => 'en-US',
            'dbtype'       => DB::POSTGRESQL,
            'dbhost'       => '',
            'dbport'       => '',
            'dbuser'       => '',
            'dbpass'       => '',
            'dbname'       => '',
            'tblpfx'       => 'wt_',
            'dbkey'        => '',
            'dbcert'       => '',
            'dbca'         => '',
            'dbverify'     => '',
            'wtname'       => '',
            'wtuser'       => '',
            'wtpass'       => '',
            'wtemail'      => '',
            'errors'       => new Collection(),
            'warnings'     => new Collection(),
            'cpu_limit'    => 30,
            'memory_limit' => 128,
            'locales'      => new Collection(),
            'title'        => 'Database connection',
            'tree'         => null,
        ];

        // Every non-mysql dbtype must not reach pdoMysqlDefaultSocket().
        foreach ([DB::POSTGRESQL, DB::SQLITE, DB::SQL_SERVER] as $dbtype) {
            $data['dbtype'] = $dbtype;
            $response       = $method->invoke($wizard, $data);

            self::assertSame(200, $response->getStatusCode(), "dbtype={$dbtype} should render normally");
        }

        // dbtype=mysql legitimately needs it - confirms the guard is a
        // precise dbtype check, not a blanket removal of the call.
        $data['dbtype'] = DB::MYSQL;

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('pdo_mysql.default_socket must not be read for a non-mysql dbtype');

        $method->invoke($wizard, $data);
    }
}
