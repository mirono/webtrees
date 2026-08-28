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

use Fisharebest\Webtrees\Contracts\SurnameTraditionFactoryInterface;
use Fisharebest\Webtrees\Factories\SurnameTraditionFactory;
use Fisharebest\Webtrees\SurnameTradition\BridgedSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\DefaultSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\IcelandicSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\LithuanianSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\MatrilinealSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\PaternalSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\PatrilinealSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\PolishSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\PortugueseSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\SpanishSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\SurnameTraditionInterface;
use PHPUnit\Framework\Attributes\CoversClass;
use Fisharebest\Webtrees\Registry;
use Fisharebest\Webtrees\Tests\TestCase;

#[CoversClass(SurnameTraditionFactory::class)]
class SurnameTraditionFactoryTest extends TestCase
{
    public function testCreate(): void
    {
        $factory = new SurnameTraditionFactory();

        // Every built-in tradition is wrapped in the Phase 3 bridge (see
        // BridgedSurnameTradition) — check both that make() returns a
        // bridged instance, and that it wraps the expected concrete
        // native implementation.
        self::assertInstanceOf(DefaultSurnameTradition::class, $this->native($factory, SurnameTraditionFactoryInterface::DEFAULT));
        self::assertInstanceOf(IcelandicSurnameTradition::class, $this->native($factory, SurnameTraditionFactoryInterface::ICELANDIC));
        self::assertInstanceOf(LithuanianSurnameTradition::class, $this->native($factory, SurnameTraditionFactoryInterface::LITHUANIAN));
        self::assertInstanceOf(MatrilinealSurnameTradition::class, $this->native($factory, SurnameTraditionFactoryInterface::MATRILINEAL));
        self::assertInstanceOf(PaternalSurnameTradition::class, $this->native($factory, SurnameTraditionFactoryInterface::PATERNAL));
        self::assertInstanceOf(PatrilinealSurnameTradition::class, $this->native($factory, SurnameTraditionFactoryInterface::PATRILINEAL));
        self::assertInstanceOf(PolishSurnameTradition::class, $this->native($factory, SurnameTraditionFactoryInterface::POLISH));
        self::assertInstanceOf(PortugueseSurnameTradition::class, $this->native($factory, SurnameTraditionFactoryInterface::PORTUGUESE));
        self::assertInstanceOf(SpanishSurnameTradition::class, $this->native($factory, SurnameTraditionFactoryInterface::SPANISH));
    }

    public function testCreateInvalid(): void
    {
        $factory = new SurnameTraditionFactory();

        self::assertInstanceOf(DefaultSurnameTradition::class, $this->native($factory, 'FOOBAR'));
    }

    /**
     * Every built-in tradition make() returns is a BridgedSurnameTradition
     * (SurnameTraditionInterface itself doesn't declare native()) —
     * narrows that for the assertions above.
     */
    private function native(SurnameTraditionFactory $factory, string $name): SurnameTraditionInterface
    {
        $tradition = $factory->make($name);

        self::assertInstanceOf(BridgedSurnameTradition::class, $tradition);

        return $tradition->native();
    }

    public function testAllDescriptions(): void
    {
        $descriptions = Registry::surnameTraditionFactory()->list();
        self::assertCount(9, $descriptions);
    }
}
