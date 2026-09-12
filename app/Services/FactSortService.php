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

namespace Fisharebest\Webtrees\Services;

use Fig\Http\Message\StatusCodeInterface;
use Fisharebest\Webtrees\Fact;
use Fisharebest\Webtrees\Family;
use Fisharebest\Webtrees\Http\Exceptions\HttpServiceUnavailableException;
use Fisharebest\Webtrees\I18N;
use GuzzleHttp\Client;
use GuzzleHttp\Psr7\Request;
use Illuminate\Support\Collection;
use Throwable;

use function array_key_exists;
use function count;
use function getenv;
use function is_array;
use function is_int;
use function json_decode;
use function json_encode;
use function rtrim;

use const JSON_THROW_ON_ERROR;

final class FactSortService
{
    // Cutover (see docs/php-to-js-migration/phase4-cutover-fact-sort-surname-tradition.md):
    // sort() has no native fallback any more. It always routes through
    // this Node service; if the service is unreachable or returns
    // something unusable, it throws HttpServiceUnavailableException
    // rather than silently degrading. Configure the service location with
    // this env var — there is no default URL, so an unset env var is
    // treated the same as an unreachable service (explicit configuration
    // is required for this feature to work at all).
    private const string SERVICE_URL_ENV_VAR = 'WEBTREES_FACT_SORT_SERVICE_URL';

    // Circuit breaker: once a call fails, stop trying for the rest of
    // this process and throw immediately on every subsequent call, rather
    // than paying the timeout cost again. Since there is no fallback any
    // more, this does mean one transient failure makes every subsequent
    // sort() call in this process throw until it restarts — a deliberate
    // trade-off for a mandatory dependency (fail fast and loudly), not an
    // oversight.
    private static bool $service_unavailable = false;

    /**
     * @param array<string,mixed> $payload
     *
     * @return array<string,mixed>|null
     */
    private static function callService(string $path, array $payload): array|null
    {
        if (self::$service_unavailable) {
            return null;
        }

        $service_url = (string) getenv(self::SERVICE_URL_ENV_VAR);

        if ($service_url === '') {
            return null;
        }

        try {
            $client  = new Client(['timeout' => 0.5, 'connect_timeout' => 0.5]);
            $request = new Request(
                'POST',
                rtrim($service_url, '/') . $path,
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

    /**
     * Build the plain-data shim payload for one fact, matching the shape
     * lib/comparators/fact-comparator.js and lib/services/fact-sort-service.js
     * already expect (tasks 12 & 18). `index` round-trips through the
     * service so the response can be mapped back to the original Fact
     * objects without needing to reconstruct them from JSON.
     *
     * @return array<string,mixed>
     */
    private static function factShim(int $index, Fact $fact): array
    {
        $record = $fact->record();

        return [
            'index'         => $index,
            'tag'           => $fact->tag(),
            'value'         => $fact->value(),
            'id'            => $fact->id(),
            'attributeDate' => $fact->attribute('DATE'),
            'date'          => [
                'qual1'            => $fact->date()->qual1,
                'minimumJulianDay' => $fact->date()->minimumJulianDay(),
                'maximumJulianDay' => $fact->date()->maximumJulianDay(),
            ],
            'record' => $record instanceof Family ? ['xref' => $record->xref()] : null,
        ];
    }

    /**
     * Sort a collection of facts.
     *
     * 1. Split facts into dated (have a parseable date) and nondated.
     * 2. Sort dated facts chronologically, using type order as tiebreaker.
     * 3. Group nondated facts: individual facts stay separate; family facts
     *    are grouped by family identity so they are inserted as a unit.
     * 4. Insert each family group near its family's dated facts, or before
     *    any later-input families' facts (preserving original family order).
     * 5. Insert individual nondated facts at their type-order position in the result.
     *
     * @param Collection<int,Fact> $unsorted
     *
     * @return Collection<int,Fact>
     */
    public function sort(Collection $unsorted): Collection
    {
        $original = $unsorted->values()->all();

        $shims = [];
        foreach ($original as $index => $fact) {
            $shims[] = self::factShim($index, $fact);
        }

        $service_result = self::callService('/fact-sort/sort', ['facts' => $shims]);

        $service_facts = is_array($service_result) ? ($service_result['facts'] ?? null) : null;

        if (is_array($service_facts) && count($service_facts) === count($original)) {
            $reordered    = [];
            $seen_indices = [];
            foreach ($service_facts as $shim) {
                $index      = is_array($shim) ? ($shim['index'] ?? null) : null;
                $index_seen = is_int($index) && array_key_exists($index, $seen_indices);

                if (!is_int($index) || !array_key_exists($index, $original) || $index_seen) {
                    $reordered = null;
                    break;
                }

                $seen_indices[$index] = true;
                $reordered[]          = $original[$index];
            }

            // Every returned index must map back to a distinct original
            // fact — reject anything else (duplicate/missing indices)
            // rather than risk silently dropping or duplicating a fact.
            if ($reordered !== null && count($reordered) === count($original)) {
                return new Collection($reordered);
            }
        }

        throw new HttpServiceUnavailableException(
            I18N::translate('The fact-sorting service is unavailable. Please try again shortly.'),
        );
    }
}
