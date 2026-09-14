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
use Fisharebest\Webtrees\Http\Exceptions\HttpServiceUnavailableException;
use Fisharebest\Webtrees\I18N;
use GuzzleHttp\Client;
use GuzzleHttp\Psr7\Request;
use Throwable;

use function array_key_exists;
use function getenv;
use function is_array;
use function is_string;
use function json_decode;
use function json_encode;
use function rtrim;

use const JSON_THROW_ON_ERROR;

/**
 * Utilities for manipulating GEDCOM data.
 *
 * Cutover (see docs/php-to-js-migration/phase4-cutover-gedcom-service.md):
 * canonicalTag()/readLatitude()/readLongitude() have no native fallback
 * any more. They always route through the Node service; if it's
 * unreachable or returns something unusable, they throw
 * HttpServiceUnavailableException rather than silently degrading.
 */
class GedcomService
{
    // Configure the service location with this env var — there is no
    // default URL, so an unset env var is treated the same as an
    // unreachable service (explicit configuration is required for this
    // feature to work at all).
    private const string SERVICE_URL_ENV_VAR = 'WEBTREES_GEDCOM_SERVICE_URL';

    // Circuit breaker: once a call fails, stop trying for the rest of
    // this process and throw immediately on every subsequent call, rather
    // than paying the timeout cost again. Shared across all GedcomService
    // instances (static, not instance state) — GedcomImportService
    // constructs a fresh GedcomService per call site in places. Since
    // there is no fallback any more, this does mean one transient failure
    // makes every subsequent call in this process throw until it
    // restarts — a deliberate trade-off for a mandatory dependency (fail
    // fast and loudly), not an oversight.
    private static bool $service_unavailable = false;

    /**
     * @param array<string,string> $payload
     *
     * @return array<string,bool|float|string|null>|null
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
     * Convert a GEDCOM tag to a canonical form.
     */
    public function canonicalTag(string $tag): string
    {
        $service_result = self::callService('/gedcom/canonical-tag', ['tag' => $tag]);

        if (is_array($service_result) && is_string($service_result['tag'] ?? null)) {
            return $service_result['tag'];
        }

        throw new HttpServiceUnavailableException(
            I18N::translate('The GEDCOM service is unavailable. Please try again shortly.'),
        );
    }

    public function readLatitude(string $text): float|null
    {
        $service_result = self::callService('/gedcom/read-latitude', ['text' => $text]);

        if (is_array($service_result) && array_key_exists('value', $service_result)) {
            return $service_result['value'] === null ? null : (float) $service_result['value'];
        }

        throw new HttpServiceUnavailableException(
            I18N::translate('The GEDCOM service is unavailable. Please try again shortly.'),
        );
    }

    public function readLongitude(string $text): float|null
    {
        $service_result = self::callService('/gedcom/read-longitude', ['text' => $text]);

        if (is_array($service_result) && array_key_exists('value', $service_result)) {
            return $service_result['value'] === null ? null : (float) $service_result['value'];
        }

        throw new HttpServiceUnavailableException(
            I18N::translate('The GEDCOM service is unavailable. Please try again shortly.'),
        );
    }
}
