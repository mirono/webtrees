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

namespace Fisharebest\Webtrees\SurnameTradition;

use Fig\Http\Message\StatusCodeInterface;
use Fisharebest\Webtrees\Fact;
use Fisharebest\Webtrees\Http\Exceptions\HttpServiceUnavailableException;
use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\Individual;
use GuzzleHttp\Client;
use GuzzleHttp\Psr7\Request;
use Throwable;

use function getenv;
use function is_array;
use function is_string;
use function json_decode;
use function json_encode;
use function rtrim;

use const JSON_THROW_ON_ERROR;

/**
 * Cutover (see docs/php-to-js-migration/phase4-cutover-fact-sort-surname-tradition.md,
 * supersedes docs/php-to-js-migration/phase3-surname-tradition-bridge.md's
 * original bridge description). Wraps a native SurnameTraditionInterface
 * implementation; newChildNames()/newParentNames()/newSpouseNames() have
 * no native fallback any more — they always route through the migration
 * service (server/migration-service.mjs) and throw
 * HttpServiceUnavailableException if it is unreachable or returns
 * something unusable.
 *
 * name()/description()/defaultName() always delegate straight to the
 * native implementation, never the service — they're either pure i18n
 * (name/description, which the service has no locale to translate
 * correctly even if it wanted to) or trivial enough that offloading them
 * has no value (defaultName). Only the three methods with real
 * regex/inflection logic cross the bridge.
 *
 * SurnameTraditionFactory wraps every *built-in* registered tradition in
 * one of these (see its constructor) — traditions registered by modules
 * via SurnameTraditionFactory::register() are left unwrapped, since there
 * is no corresponding server-side implementation to bridge to for an
 * arbitrary custom key.
 */
final class BridgedSurnameTradition implements SurnameTraditionInterface
{
    private const string SERVICE_URL_ENV_VAR = 'WEBTREES_SURNAME_TRADITION_SERVICE_URL';

    // Shared across every BridgedSurnameTradition instance (all traditions
    // share one underlying service) — once one call fails, stop trying
    // the service for the rest of this process and throw immediately on
    // every subsequent call, rather than paying the timeout cost again.
    // Since there is no fallback any more, this does mean one transient
    // failure makes every subsequent call in this process throw until it
    // restarts — a deliberate trade-off for a mandatory dependency (fail
    // fast and loudly), not an oversight.
    private static bool $service_unavailable = false;

    public function __construct(
        private readonly SurnameTraditionInterface $native,
        private readonly string $key,
    ) {
    }

    /**
     * The native (unbridged) implementation this instance wraps.
     */
    public function native(): SurnameTraditionInterface
    {
        return $this->native;
    }

    public function name(): string
    {
        return $this->native->name();
    }

    public function description(): string
    {
        return $this->native->description();
    }

    public function defaultName(): string
    {
        return $this->native->defaultName();
    }

    public function newChildNames(Individual|null $father, Individual|null $mother, string $sex): array
    {
        $result = $this->callService('new-child-names', [
            'father' => self::toNameFacts($father),
            'mother' => self::toNameFacts($mother),
            'sex'    => $sex,
        ]);

        if (is_array($result) && self::isStringArray($result['names'] ?? null)) {
            return $result['names'];
        }

        throw new HttpServiceUnavailableException(
            I18N::translate('The surname-tradition service is unavailable. Please try again shortly.'),
        );
    }

    public function newParentNames(Individual $child, string $sex): array
    {
        $result = $this->callService('new-parent-names', [
            'child' => self::toNameFacts($child),
            'sex'   => $sex,
        ]);

        if (is_array($result) && self::isStringArray($result['names'] ?? null)) {
            return $result['names'];
        }

        throw new HttpServiceUnavailableException(
            I18N::translate('The surname-tradition service is unavailable. Please try again shortly.'),
        );
    }

    public function newSpouseNames(Individual $spouse, string $sex): array
    {
        $result = $this->callService('new-spouse-names', [
            'spouse' => self::toNameFacts($spouse),
            'sex'    => $sex,
        ]);

        if (is_array($result) && self::isStringArray($result['names'] ?? null)) {
            return $result['names'];
        }

        throw new HttpServiceUnavailableException(
            I18N::translate('The surname-tradition service is unavailable. Please try again shortly.'),
        );
    }

    /**
     * @param array<mixed>|null $value
     */
    private static function isStringArray(array|null $value): bool
    {
        if ($value === null) {
            return false;
        }

        foreach ($value as $item) {
            if (!is_string($item)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Converts a real Individual into the plain NAME-fact-array shape the
     * JS port's extractName() expects (see lib/surname-tradition/README.md)
     * — { tag, type, value } per NAME fact, matching exactly what
     * DefaultSurnameTradition::extractName() reads off a real Individual
     * (Fact::attribute('TYPE') / Fact::value()).
     *
     * @return array<int,array{tag:string,type:string,value:string}>
     */
    private static function toNameFacts(Individual|null $individual): array
    {
        if ($individual === null) {
            return [];
        }

        return $individual->facts(['NAME'])
            ->map(static fn (Fact $fact): array => [
                'tag'   => 'NAME',
                'type'  => $fact->attribute('TYPE'),
                'value' => $fact->value(),
            ])
            ->all();
    }

    /**
     * @param array<string,mixed> $payload
     *
     * @return array<string,array<int,string>>|null
     */
    private function callService(string $path, array $payload): array|null
    {
        if (self::$service_unavailable) {
            return null;
        }

        $service_url = (string) getenv(self::SERVICE_URL_ENV_VAR);

        if ($service_url === '') {
            return null;
        }

        $route_key = $this->key === '' ? 'default' : $this->key;

        try {
            $client  = new Client(['timeout' => 0.5, 'connect_timeout' => 0.5]);
            $request = new Request(
                'POST',
                rtrim($service_url, '/') . '/surname-tradition/' . $route_key . '/' . $path,
                ['content-type' => 'application/json'],
                json_encode($payload, JSON_THROW_ON_ERROR),
            );

            $response = $client->send($request);

            if ($response->getStatusCode() !== StatusCodeInterface::STATUS_OK) {
                self::$service_unavailable = true;

                return null;
            }

            $body = json_decode($response->getBody()->getContents(), true);

            return is_array($body) ? $body : null;
        } catch (Throwable) {
            self::$service_unavailable = true;

            return null;
        }
    }
}
