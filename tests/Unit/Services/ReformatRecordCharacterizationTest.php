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

namespace Fisharebest\Webtrees\Tests\Unit\Services;

use Fisharebest\Webtrees\Services\GedcomImportService;
use Fisharebest\Webtrees\Tests\TestCase;
use Fisharebest\Webtrees\Tree;
use PHPUnit\Framework\Attributes\CoversClass;
use ReflectionClass;

/**
 * Characterization test for GedcomImportService::reformatRecord() (task 21).
 * See docs/php-to-js-migration/task-21-reformat-record.md.
 */
#[CoversClass(GedcomImportService::class)]
class ReformatRecordCharacterizationTest extends TestCase
{
    protected static bool $uses_database = true;

    /** @var array<int,array{group: string, label: string, input: string, result: string}> */
    private array $cases = [];

    private function callReformatRecord(string $rec, Tree $tree): string
    {
        $service    = new GedcomImportService();
        $reflection = new ReflectionClass($service);
        $method     = $reflection->getMethod('reformatRecord');

        return $method->invoke($service, $rec, $tree);
    }

    private function addCase(string $group, string $label, string $rec, Tree $tree): void
    {
        $this->cases[] = [
            'group'  => $group,
            'label'  => $label,
            'input'  => $rec,
            'result' => $this->callReformatRecord($rec, $tree),
        ];
    }

    public function testReformatRecordCharacterization(): void
    {
        $tree = $this->importTree('demo.ged');

        // ---------------------------------------------------------------
        // DATE normalization: one rule at a time.
        // ---------------------------------------------------------------
        $date_cases = [
            'plain date, unchanged'                     => '1 JAN 2000',
            'INT date preserves parenthetical text'      => 'INT 2000 (from family bible)',
            'lowercase uppercased'                       => '1 jan 2000',
            'letter-digit spacing inserted'              => 'JAN1900',
            'digit-letter spacing inserted'              => '1JAN',
            'calendar escape spacing'                    => '@#DJULIAN@1JAN1700',
            'BET-dot stripped'                           => '1 JAN 2000 BET.',
            'CIR becomes ABT'                            => 'CIR 1900',
            'APX becomes ABT'                            => 'APX 1900',
            'B.C. round-trips'                           => '100 B.C.',
            'TMG EITHER-OR becomes BET-AND'              => 'EITHER 1900 OR 1901',
            'BET-dash becomes BET-AND'                   => 'BET 1900 - 1901',
            'FROM-dash becomes FROM-TO'                  => 'FROM 1900 - 1901',
            'calendar escape repositioned for FROM-TO'   => '@#DJULIAN@ FROM 1700 TO 1710',
            'calendar escape repositioned for BET-AND'   => '@#DJULIAN@ BET 1700 AND 1710',
            'calendar escape repositioned for AFT'       => '@#DJULIAN@ AFT 1700',
            'punctuation cleaned to spaces'              => '14-MAY, 1900',
            'slash preserved for NS-OS dates'            => '4 FEB 1750/51',
        ];
        foreach ($date_cases as $label => $date_value) {
            $rec = "0 @I1@ INDI\n1 BIRT\n2 DATE " . $date_value;
            $this->addCase('date', $label, $rec, $tree);
        }
        // Combined: calendar escape + EITHER/OR + dashes, all at once.
        // Verified finding: EITHER/OR is NOT converted here, because its
        // regex is anchored to the start of the date and a calendar
        // escape sits in front of it - see the task doc.
        $rec = "0 @I1@ INDI\n1 BIRT\n2 DATE @#DJULIAN@ EITHER 1700-1701 OR 1702";
        $this->addCase('date', 'calendar escape with EITHER-OR and dash', $rec, $tree);

        // ---------------------------------------------------------------
        // HEAD/TRLR: xref and data stripped at level 0.
        // ---------------------------------------------------------------
        $this->addCase('head_trlr', 'HEAD at level 0 strips xref/data', '0 @H@ HEAD garbage-data', $tree);
        $this->addCase('head_trlr', 'TRLR at level 0 strips xref/data', '0 @T@ TRLR garbage-data', $tree);

        // ---------------------------------------------------------------
        // NAME: whitespace tidied.
        // ---------------------------------------------------------------
        $rec = "0 @I1@ INDI\n1 NAME   John   /Smith/  ";
        $this->addCase('name', 'NAME extra whitespace collapsed', $rec, $tree);

        // ---------------------------------------------------------------
        // PLAC: comma normalization + TMG lat/long extraction.
        // ---------------------------------------------------------------
        $rec = "0 @I1@ INDI\n1 BIRT\n2 PLAC Paris,France";
        $this->addCase('plac', 'ASCII comma normalized', $rec, $tree);

        $rec = "0 @I1@ INDI\n1 BIRT\n2 PLAC Paris\xef\xbc\x8cFrance";
        $this->addCase('plac', 'fullwidth comma normalized', $rec, $tree);

        $rec = "0 @I1@ INDI\n1 BIRT\n2 PLAC Paris\xd8\x8cFrance";
        $this->addCase('plac', 'arabic comma normalized', $rec, $tree);

        $rec = "0 @I1@ INDI\n1 BIRT\n2 PLAC Pennsylvania, USA, 395945N0751013W";
        $this->addCase('plac', 'TMG lat/long extracted into MAP/LATI/LONG', $rec, $tree);

        $rec = "0 @I1@ INDI\n1 BIRT\n2 SOUR @S1@\n3 DATA\n4 PLAC Pennsylvania, USA, 395945N0751013W";
        $this->addCase('plac', 'TMG lat/long at a deeper level', $rec, $tree);

        // ---------------------------------------------------------------
        // SEX: uppercased.
        // ---------------------------------------------------------------
        $this->addCase('sex', 'lowercase sex uppercased', "0 @I1@ INDI\n1 SEX m", $tree);

        // ---------------------------------------------------------------
        // "Y" suppression for facts with a DATE or PLAC sub-record.
        // ---------------------------------------------------------------
        $rec = "0 @I1@ INDI\n1 BIRT Y\n2 DATE 1 JAN 1900\n1 DEAT";
        $this->addCase('y_suppress', 'Y suppressed when followed by DATE', $rec, $tree);

        $rec = "0 @I1@ INDI\n1 BIRT Y\n2 PLAC Anytown\n1 DEAT";
        $this->addCase('y_suppress', 'Y suppressed when followed by PLAC', $rec, $tree);

        $rec = "0 @I1@ INDI\n1 BIRT Y\n2 NOTE nothing relevant\n1 DEAT";
        $this->addCase('y_suppress', 'Y kept when no DATE/PLAC follows', $rec, $tree);

        $rec = "0 @I1@ INDI\n1 BIRT y\n2 DATE 1 JAN 1900\n1 DEAT";
        $this->addCase('y_suppress', 'lowercase y uppercased then suppressed', $rec, $tree);

        // Off-by-one investigation: the DATE sub-line is the absolute LAST
        // line in the whole record (nothing follows it at all).
        $rec = "0 @I1@ INDI\n1 BIRT Y\n2 DATE 1 JAN 1900";
        $this->addCase('y_suppress', 'Y with DATE as the absolute last line in the record', $rec, $tree);

        // Contrast: one more harmless trailing line after the DATE, so the
        // DATE is no longer the absolute last match.
        $rec = "0 @I1@ INDI\n1 BIRT Y\n2 DATE 1 JAN 1900\n2 NOTE trailing";
        $this->addCase('y_suppress', 'Y with DATE followed by one more sub-line', $rec, $tree);

        // Raw-vs-canonical investigation: the lookahead compares against
        // $matches[$i][3], the RAW captured tag, not the canonicalized one
        // - even though the outer loop canonicalizes every tag it
        // processes. GedcomService::canonicalTag('PLACE') === 'PLAC', so a
        // non-canonical "PLACE" spelling should behave differently from
        // "PLAC" here if that raw-vs-canonical distinction is real.
        $rec = "0 @I1@ INDI\n1 BIRT Y\n2 PLAC Anytown\n1 DEAT";
        $this->addCase('y_suppress', 'Y followed by canonical PLAC spelling', $rec, $tree);

        $rec = "0 @I1@ INDI\n1 BIRT Y\n2 PLACE Anytown\n1 DEAT";
        $this->addCase('y_suppress', 'Y followed by non-canonical PLACE spelling', $rec, $tree);

        // ---------------------------------------------------------------
        // Whitespace handling differs: NOTE/TEXT/DATA/CONT preserve
        // internal whitespace; every other tag (the "default" bucket)
        // collapses it.
        // ---------------------------------------------------------------
        $rec = "0 @I1@ INDI\n1 NOTE some   text  with  gaps";
        $this->addCase('whitespace', 'NOTE preserves internal double spaces', $rec, $tree);

        $rec = "0 @I1@ INDI\n1 OCCU some   text  with  gaps";
        $this->addCase('whitespace', 'OCCU (default bucket) collapses internal double spaces', $rec, $tree);

        $rec = "0 @I1@ INDI\n1 OCCU \t padded \t ";
        $this->addCase('whitespace', 'default bucket strips tabs and trims', $rec, $tree);

        // ---------------------------------------------------------------
        // CONC merging, with WORD_WRAPPED_NOTES on and off.
        // ---------------------------------------------------------------
        $rec = "0 @I1@ INDI\n1 NOTE Hello\n2 CONC World";

        $tree->setPreference('WORD_WRAPPED_NOTES', '');
        $this->addCase('conc', 'CONC merges without a space (WORD_WRAPPED_NOTES off)', $rec, $tree);

        $tree->setPreference('WORD_WRAPPED_NOTES', '1');
        $this->addCase('conc', 'CONC merges with a space (WORD_WRAPPED_NOTES on)', $rec, $tree);

        $tree->setPreference('WORD_WRAPPED_NOTES', '');

        // ---------------------------------------------------------------
        // FILE: media path prefix stripping + backslash conversion.
        // ---------------------------------------------------------------
        $tree->setPreference('GEDCOM_MEDIA_PATH', '');
        $rec = "0 @M1@ OBJE\n1 FILE C:\\photos\\me.jpg";
        $this->addCase('file', 'FILE backslashes converted, no media path set', $rec, $tree);

        $tree->setPreference('GEDCOM_MEDIA_PATH', 'C:\\photos\\');
        $rec = "0 @M1@ OBJE\n1 FILE C:\\photos\\me.jpg";
        $this->addCase('file', 'FILE strips matching media path prefix', $rec, $tree);

        $rec = "0 @M1@ OBJE\n1 FILE D:\\other\\me.jpg";
        $this->addCase('file', 'FILE with non-matching prefix left alone (backslashes still converted)', $rec, $tree);

        $tree->setPreference('GEDCOM_MEDIA_PATH', '');

        // ---------------------------------------------------------------
        // Line-ending / blank-line collapsing, malformed line dropping.
        // ---------------------------------------------------------------
        $this->addCase('lines', 'CRLF line endings normalized', "0 @I1@ INDI\r\n1 SEX M\r\n", $tree);
        $this->addCase('lines', 'blank line collapsed away', "0 @I1@ INDI\n\n1 SEX M", $tree);

        $rec = "0 @I1@ INDI\n***not a valid line***\n1 SEX M";
        $this->addCase('lines', 'malformed line silently dropped', $rec, $tree);

        // ---------------------------------------------------------------
        // A realistic, fully combined record.
        // ---------------------------------------------------------------
        $tree->setPreference('WORD_WRAPPED_NOTES', '1');
        $tree->setPreference('GEDCOM_MEDIA_PATH', '');
        $rec = "0 @I1@ INDI\n1 NAME   John   /Smith/\n1 SEX m\n1 BIRT y\n2 DATE cir 1900\n"
            . "2 PLAC Anytown,USA\n1 DEAT Y\n2 NOTE nothing relevant\n1 NOTE Hello\n2 CONC  World";
        $this->addCase('combined', 'realistic combined record', $rec, $tree);

        $golden_dir = realpath(__DIR__ . '/../../..') . '/golden';
        if (!is_dir($golden_dir)) {
            mkdir($golden_dir, 0755, true);
        }

        $filepath = $golden_dir . '/reformat_record.json';
        $written  = file_put_contents(
            $filepath,
            json_encode($this->cases, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );

        $this->assertTrue($written !== false, "Failed to write $filepath");
        $this->assertFileExists($filepath);
    }
}
