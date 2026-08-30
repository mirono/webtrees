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
use Fisharebest\Webtrees\Gedcom;
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
 */
class GedcomService
{
    // Phase 3 bridge target for the PHP->JS strangler-fig migration (see
    // docs/php-to-js-migration/). When set, canonicalTag()/readLatitude()/
    // readLongitude() try this Node service first and fall back to the
    // native PHP implementation below on any failure — the service is
    // never a single point of failure. Unset by default: with no env var,
    // behavior is byte-for-byte identical to before this migration started.
    private const string SERVICE_URL_ENV_VAR = 'WEBTREES_GEDCOM_SERVICE_URL';

    // Once a call to the service fails (timeout, connection refused, bad
    // response), stop trying it for the rest of this PHP process/request.
    // Shared across all GedcomService instances (static, not instance
    // state) — GedcomImportService constructs a fresh GedcomService per
    // call site in places, and a downed service shouldn't pay its full
    // timeout cost more than once per process. Same pattern as
    // Soundex::$service_unavailable.
    private static bool $service_unavailable = false;

    /**
     * Call the Phase 3 bridge service, if configured and not already known
     * to be unreachable this process. Returns the decoded JSON response
     * body on success, or null on any failure (service not configured,
     * unreachable, timed out, or returned something unusable) — callers
     * must always fall back to the native PHP implementation when this
     * returns null.
     *
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
            // Service down, network issue, timed out, or returned something
            // that couldn't be encoded/decoded — stop trying it for the
            // rest of this process and silently use native PHP.
            self::$service_unavailable = true;

            return null;
        }
    }

    // Some applications, such as FTM, use GEDCOM tag names instead of the tags.
    private const array TAG_NAMES = [
        'ABBREVIATION'      => 'ABBR',
        'ADDRESS'           => 'ADDR',
        'ADDRESS1'          => 'ADR1',
        'ADDRESS2'          => 'ADR2',
        'ADDRESS3'          => 'ADR3',
        'ADOPTION'          => 'ADOP',
        'AGENCY'            => 'AGNC',
        'ALIAS'             => 'ALIA',
        'ANCESTORS'         => 'ANCE',
        'ANCES_INTEREST'    => 'ANCI',
        'ANULMENT'          => 'ANUL',
        'ASSOCIATES'        => 'ASSO',
        'AUTHOR'            => 'AUTH',
        'BAPTISM-LDS'       => 'BAPL',
        'BAPTISM'           => 'BAPM',
        'BAR_MITZVAH'       => 'BARM',
        'BAS_MITZVAH'       => 'BASM',
        'BIRTH'             => 'BIRT',
        'BLESSING'          => 'BLES',
        'BURIAL'            => 'BURI',
        'CALL_NUMBER'       => 'CALN',
        'CASTE'             => 'CAST',
        'CAUSE'             => 'CAUS',
        'CENSUS'            => 'CENS',
        'CHANGE'            => 'CHAN',
        'CHARACTER'         => 'CHAR',
        'CHILD'             => 'CHIL',
        'CHRISTENING'       => 'CHR',
        'ADULT_CHRISTENING' => 'CHRA',
        'CONCATENATION'     => 'CONC',
        'CONFIRMATION'      => 'CONF',
        'CONFIRMATION-LDS'  => 'CONL',
        'CONTINUED'         => 'CONT',
        'COPYRIGHT'         => 'COPY',
        'CORPORTATE'        => 'CORP',
        'CREMATION'         => 'CREM',
        'COUNTRY'           => 'CTRY',
        'DEATH'             => 'DEAT',
        'DESCENDANTS'       => 'DESC',
        'DESCENDANTS_INT'   => 'DESI',
        'DESTINATION'       => 'DEST',
        'DIVORCE'           => 'DIV',
        'DIVORCE_FILED'     => 'DIVF',
        'PHY_DESCRIPTION'   => 'DSCR',
        'EDUCATION'         => 'EDUC',
        'EMIGRATION'        => 'EMIG',
        'ENDOWMENT'         => 'ENDL',
        'ENGAGEMENT'        => 'ENGA',
        'EVENT'             => 'EVEN',
        'FAMILY'            => 'FAM',
        'FAMILY_CHILD'      => 'FAMC',
        'FAMILY_FILE'       => 'FAMF',
        'FAMILY_SPOUSE'     => 'FAMS',
        'FACIMILIE'         => 'FAX',
        'FIRST_COMMUNION'   => 'FCOM',
        'FORMAT'            => 'FORM',
        'PHONETIC'          => 'FONE',
        'GEDCOM'            => 'GEDC',
        'GIVEN_NAME'        => 'GIVN',
        'GRADUATION'        => 'GRAD',
        'HEADER'            => 'HEAD',
        'HUSBAND'           => 'HUSB',
        'IDENT_NUMBER'      => 'IDNO',
        'IMMIGRATION'       => 'IMMI',
        'INDIVIDUAL'        => 'INDI',
        'LANGUAGE'          => 'LANG',
        'LATITUDE'          => 'LATI',
        'LONGITUDE'         => 'LONG',
        'MARRIAGE_BANN'     => 'MARB',
        'MARR_CONTRACT'     => 'MARC',
        'MARR_LICENSE'      => 'MARL',
        'MARRIAGE'          => 'MARR',
        'MEDIA'             => 'MEDI',
        'NATIONALITY'       => 'NATI',
        'NATURALIZATION'    => 'NATU',
        'CHILDREN_COUNT'    => 'NCHI',
        'NICKNAME'          => 'NICK',
        'MARRIAGE_COUNT'    => 'NMR',
        'NAME_PREFIX'       => 'NPFX',
        'NAME_SUFFIX'       => 'NSFX',
        'OBJECT'            => 'OBJE',
        'OCCUPATION'        => 'OCCU',
        'ORDINANCE'         => 'ORDI',
        'ORDINATION'        => 'ORDN',
        'PEDIGREE'          => 'PEDI',
        'PHONE'             => 'PHON',
        'PLACE'             => 'PLAC',
        'POSTAL_CODE'       => 'POST',
        'PROBATE'           => 'PROB',
        'PROPERTY'          => 'PROP',
        'PUBLICATION'       => 'PUBL',
        'QUALITY_OF_DATA'   => 'QUAY',
        'REFERENCE'         => 'REFN',
        'RELATIONSHIP'      => 'RELA',
        'RELIGION'          => 'RELI',
        'REPOSITORY'        => 'REPO',
        'RESIDENCE'         => 'RESI',
        'RESTRICTION'       => 'RESN',
        'RETIREMENT'        => 'RETI',
        'REC_FILE_NUMBER'   => 'RFN',
        'REC_ID_NUMBER'     => 'RIN',
        'ROMANIZED'         => 'ROMN',
        'SEALING_CHILD'     => 'SLGC',
        'SEALING_SPOUSE'    => 'SLGS',
        'SOURCE'            => 'SOUR',
        'SURN_PREFIX'       => 'SPFX',
        'SOC_SEC_NUMBER'    => 'SSN',
        'STATE'             => 'STAE',
        'STATUS'            => 'STAT',
        'SUBMITTER'         => 'SUBM',
        'SUBMISSION'        => 'SUBN',
        'SURNAME'           => 'SURN',
        'TEMPLE'            => 'TEMP',
        'TITLE'             => 'TITL',
        'TRAILER'           => 'TRLR',
        'VERSION'           => 'VERS',
        'WEB'               => 'WWW',
        '_DEATH_OF_SPOUSE'  => 'DETS',
        '_DEGREE'           => '_DEG',
        '_MEDICAL'          => '_MCL',
        '_MILITARY_SERVICE' => '_MILT',
    ];

    // Custom GEDCOM tags used by other applications, with direct synonyms
    private const array TAG_SYNONYMS = [
        // Convert PhpGedView tag to webtrees
        '_PGVU'     => '_WT_USER',
        '_PGV_OBJS' => '_WT_OBJE_SORT',
    ];

    /**
     * Convert a GEDCOM tag to a canonical form.
     */
    public function canonicalTag(string $tag): string
    {
        $service_result = self::callService('/gedcom/canonical-tag', ['tag' => $tag]);

        if (is_array($service_result) && is_string($service_result['tag'] ?? null)) {
            return $service_result['tag'];
        }

        $tag = strtoupper($tag);

        $tag = self::TAG_NAMES[$tag] ?? self::TAG_SYNONYMS[$tag] ?? $tag;

        return $tag;
    }

    public function readLatitude(string $text): float|null
    {
        $service_result = self::callService('/gedcom/read-latitude', ['text' => $text]);

        if (is_array($service_result) && array_key_exists('value', $service_result)) {
            return $service_result['value'] === null ? null : (float) $service_result['value'];
        }

        return $this->readDegrees($text, Gedcom::LATITUDE_NORTH, Gedcom::LATITUDE_SOUTH);
    }

    public function readLongitude(string $text): float|null
    {
        $service_result = self::callService('/gedcom/read-longitude', ['text' => $text]);

        if (is_array($service_result) && array_key_exists('value', $service_result)) {
            return $service_result['value'] === null ? null : (float) $service_result['value'];
        }

        return $this->readDegrees($text, Gedcom::LONGITUDE_EAST, Gedcom::LONGITUDE_WEST);
    }

    private function readDegrees(string $text, string $positive, string $negative): float|null
    {
        $text       = trim($text);
        $hemisphere = substr($text, 0, 1);
        $degrees    = substr($text, 1);

        // Match a valid GEDCOM format
        if (is_numeric($degrees)) {
            $hemisphere = strtoupper($hemisphere);
            $degrees    = (float) $degrees;

            if ($hemisphere === $positive) {
                return $degrees;
            }

            if ($hemisphere === $negative) {
                return -$degrees;
            }
        }

        // Just a number?
        if (is_numeric($text)) {
            return (float) $text;
        }

        // Can't match anything.
        return null;
    }
}
