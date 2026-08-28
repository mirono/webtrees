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

namespace Fisharebest\Webtrees\Factories;

use Fisharebest\Webtrees\Contracts\SurnameTraditionFactoryInterface;
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

/**
 * Create a surname tradition.
 */
class SurnameTraditionFactory implements SurnameTraditionFactoryInterface
{
    /** @var array<SurnameTraditionInterface> */
    private array $surname_traditions = [];

    /**
     * Register the surname traditions.
     */
    public function __construct()
    {
        // Every built-in tradition is wrapped in the Phase 3 bridge (see
        // BridgedSurnameTradition) — this is the single place all 9 get
        // it, rather than editing the 5 HTTP request handlers that
        // actually call newChildNames()/newParentNames()/newSpouseNames().
        // Traditions registered later via register() (e.g. by modules)
        // are NOT wrapped — there's no server-side implementation to
        // bridge an arbitrary custom key to.
        $this->register(self::PATERNAL, new BridgedSurnameTradition(new PaternalSurnameTradition(), self::PATERNAL));
        $this->register(self::PATRILINEAL, new BridgedSurnameTradition(new PatrilinealSurnameTradition(), self::PATRILINEAL));
        $this->register(self::MATRILINEAL, new BridgedSurnameTradition(new MatrilinealSurnameTradition(), self::MATRILINEAL));
        $this->register(self::PORTUGUESE, new BridgedSurnameTradition(new PortugueseSurnameTradition(), self::PORTUGUESE));
        $this->register(self::SPANISH, new BridgedSurnameTradition(new SpanishSurnameTradition(), self::SPANISH));
        $this->register(self::POLISH, new BridgedSurnameTradition(new PolishSurnameTradition(), self::POLISH));
        $this->register(self::LITHUANIAN, new BridgedSurnameTradition(new LithuanianSurnameTradition(), self::LITHUANIAN));
        $this->register(self::ICELANDIC, new BridgedSurnameTradition(new IcelandicSurnameTradition(), self::ICELANDIC));
        $this->register(self::DEFAULT, new BridgedSurnameTradition(new DefaultSurnameTradition(), self::DEFAULT));
    }

    /**
     * A list of supported surname traditions and their names.
     *
     * @return array<string,string>
     */
    public function list(): array
    {
        $fn = static fn (SurnameTraditionInterface $surname_tradition): string => $surname_tradition->name() . ' — ' . $surname_tradition->description();

        return array_map($fn, $this->surname_traditions);
    }

    /**
     * Create a named surname tradition.
     */
    public function make(string $name): SurnameTraditionInterface
    {
        return $this->surname_traditions[$name] ?? new BridgedSurnameTradition(new DefaultSurnameTradition(), self::DEFAULT);
    }

    public function register(string $name, SurnameTraditionInterface $surname_tradition): void
    {
        $this->surname_traditions[$name] = $surname_tradition;
    }
}
