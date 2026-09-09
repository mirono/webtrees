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
use Fisharebest\Webtrees\Comparators\FactComparator;
use Fisharebest\Webtrees\Fact;
use Fisharebest\Webtrees\Family;
use GuzzleHttp\Client;
use GuzzleHttp\Psr7\Request;
use Illuminate\Support\Collection;
use Throwable;

use function array_key_exists;
use function array_splice;
use function count;
use function getenv;
use function is_array;
use function is_int;
use function json_decode;
use function json_encode;
use function rtrim;
use function usort;

use const JSON_THROW_ON_ERROR;

final class FactSortService
{
    // Phase 3 bridge target for the PHP->JS strangler-fig migration (see
    // docs/php-to-js-migration/). When set, sort() tries this Node service
    // first and falls back to the native PHP implementation below on any
    // failure — the service is never a single point of failure. Unset by
    // default: with no env var, behavior is byte-for-byte identical to
    // before this migration started.
    private const string SERVICE_URL_ENV_VAR = 'WEBTREES_FACT_SORT_SERVICE_URL';

    // Same static circuit-breaker pattern as GedcomService/Soundex.
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

        $dated    = [];
        $nondated = [];

        // Track the input order of families for tiebreaking
        $family_input_order = [];
        $order              = 0;

        // Phase 1: Split into dated and nondated facts
        foreach ($unsorted as $fact) {
            if ($fact->record() instanceof Family) {
                $xref = $fact->record()->xref();

                if (!isset($family_input_order[$xref])) {
                    $family_input_order[$xref] = $order++;
                }
            }

            if ($fact->date()->isOK()) {
                $dated[] = $fact;
            } else {
                $nondated[] = $fact;
            }
        }

        // Phase 2: Sort dated facts chronologically
        usort($dated, FactComparator::byDate(...));

        // Phase 3: Group nondated facts by source record.
        // Individual facts are inserted one at a time by type order.
        // Family facts are kept together as a unit to preserve family grouping.
        $individual_nondated = [];
        $family_groups       = [];

        foreach ($nondated as $fact) {
            if ($fact->record() instanceof Family) {
                $key = $fact->record()->xref();
                $family_groups[$key][] = $fact;
            } else {
                $individual_nondated[] = $fact;
            }
        }

        // Phase 4: Sort within each group by type order
        usort($individual_nondated, FactComparator::byType(...));

        foreach ($family_groups as &$group) {
            usort($group, FactComparator::byType(...));
        }
        unset($group);

        // Phase 5: Build the result by merging nondated facts into the dated backbone.
        $sorted = $dated;

        // Insert each family group near its family's existing dated facts.
        foreach ($family_groups as $group) {
            $sorted = $this->insertFamilyGroup($sorted, $group, $family_input_order);
        }

        // Insert individual nondated facts at their type-order positions.
        foreach ($individual_nondated as $fact) {
            $sorted = $this->insertByTypeOrder($sorted, $fact);
        }

        return new Collection($sorted);
    }

    /**
     * Insert a family's undated facts near the same family's dated facts.
     * If no dated facts exist for this family, insert before facts from any
     * later-input family (preserving the original family order from the input).
     *
     * @param array<int,Fact>       $sorted
     * @param array<int,Fact>       $group
     * @param array<int|string,int> $family_input_order
     *
     * @return array<int,Fact>
     */
    private function insertFamilyGroup(array $sorted, array $group, array $family_input_order): array
    {
        /** @var Family $family */
        $family      = $group[0]->record();
        $family_xref = $family->xref();

        // Check whether this family already has facts in the sorted array
        $has_family_facts = false;

        foreach ($sorted as $existing) {
            if ($existing->record() === $family) {
                $has_family_facts = true;
                break;
            }
        }

        if ($has_family_facts) {
            // Insert each fact at the correct type-order position relative to same-family facts
            foreach ($group as $fact) {
                $sorted = $this->insertInFamilyContext($sorted, $fact, $family);
            }
        } else {
            // No dated facts from this family.
            // Insert before the first fact from a family that was input later.
            $this_order = $family_input_order[$family_xref];
            $insert_pos = count($sorted);

            foreach ($sorted as $i => $existing) {
                if ($existing->record() instanceof Family) {
                    $existing_xref  = $existing->record()->xref();
                    $existing_order = $family_input_order[$existing_xref] ?? 0;

                    if ($existing_order > $this_order) {
                        $insert_pos = $i;
                        break;
                    }
                }
            }

            array_splice($sorted, $insert_pos, 0, $group);
        }

        return $sorted;
    }

    /**
     * Insert a single undated family fact at the correct position relative to
     * facts from the same family, using type order.
     *
     * @param array<int,Fact> $sorted
     *
     * @return array<int,Fact>
     */
    private function insertInFamilyContext(array $sorted, Fact $fact, Family $family): array
    {
        $fact_type_order = FactComparator::typeOrder($fact);

        // Find the last same-family fact with type order ≤ this fact's type order
        $insert_after = -1;

        foreach ($sorted as $i => $existing) {
            if ($existing->record() === $family && FactComparator::typeOrder($existing) <= $fact_type_order) {
                $insert_after = $i;
            }
        }

        if ($insert_after >= 0) {
            array_splice($sorted, $insert_after + 1, 0, [$fact]);

            return $sorted;
        }

        // This fact has lower type order than all existing same-family facts.
        // Insert before the first same-family fact.
        foreach ($sorted as $i => $existing) {
            if ($existing->record() === $family) {
                array_splice($sorted, $i, 0, [$fact]);

                return $sorted;
            }
        }

        return $sorted;
    }

    /**
     * Insert an undated individual fact at the position determined by type order.
     * The fact is placed before the first existing fact with a higher type order.
     *
     * @param array<int,Fact> $sorted
     *
     * @return array<int,Fact>
     */
    private function insertByTypeOrder(array $sorted, Fact $fact): array
    {
        $fact_type_order = FactComparator::typeOrder($fact);

        for ($i = 0; $i < count($sorted); $i++) {
            $existing = $sorted[$i];

            // Dated events of close relatives should not influence placement of
            // undated personal/family facts.
            if ($this->isDatedCloseRelativeEvent($existing)) {
                continue;
            }

            if (FactComparator::typeOrder($existing) > $fact_type_order) {
                array_splice($sorted, $i, 0, [$fact]);

                return $sorted;
            }
        }

        // All existing facts have lower or equal type order; append at end
        $sorted[] = $fact;

        return $sorted;
    }

    /**
     * Is this a dated event synthesized from a close relative's record?
     *
     * These are represented as EVEN CLOSE_RELATIVE in IndividualFactsService.
     */
    private function isDatedCloseRelativeEvent(Fact $fact): bool
    {
        return $fact->date()->isOK() && $fact->tag() === 'INDI:EVEN' && $fact->value() === 'CLOSE_RELATIVE';
    }
}
