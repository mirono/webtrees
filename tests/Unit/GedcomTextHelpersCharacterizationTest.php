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

use Fisharebest\Webtrees\Note;
use Fisharebest\Webtrees\Report\GedcomTextReader;
use Fisharebest\Webtrees\Tests\TestCase;
use Fisharebest\Webtrees\Tree;
use PHPUnit\Framework\Attributes\CoversClass;

/**
 * Characterization test for task 22 (docs/php-to-js-migration/task-22-gedcom-text-helpers.md):
 * GedcomTextReader::getSubRecord()/getCont() and Note::getNote()/firstLineOfTextFromHtml().
 */
#[CoversClass(GedcomTextReader::class)]
#[CoversClass(Note::class)]
class GedcomTextHelpersCharacterizationTest extends TestCase
{
    protected static bool $uses_database = true;

    /** @var array<int,array{group: string, label: string, input: array<string,mixed>, result: mixed}> */
    private array $cases = [];

    private function addSubRecordCase(string $label, int $level, string $tag, string $gedrec, int $num = 1): void
    {
        $this->cases[] = [
            'group'  => 'getSubRecord',
            'label'  => $label,
            'input'  => ['level' => $level, 'tag' => $tag, 'gedrec' => $gedrec, 'num' => $num],
            'result' => GedcomTextReader::getSubRecord($level, $tag, $gedrec, $num),
        ];
    }

    private function addContCase(string $label, int $level, string $record): void
    {
        $this->cases[] = [
            'group'  => 'getCont',
            'label'  => $label,
            'input'  => ['level' => $level, 'record' => $record],
            'result' => GedcomTextReader::getCont($level, $record),
        ];
    }

    private function addNoteCase(string $label, string $gedcom, Tree $tree): void
    {
        $note = new Note('N1', $gedcom, null, $tree);

        $this->cases[] = [
            'group'  => 'getNote',
            'label'  => $label,
            'input'  => ['gedcom' => $gedcom],
            'result' => $note->getNote(),
        ];
    }

    private function addFirstLineCase(string $label, string $html): void
    {
        $this->cases[] = [
            'group'  => 'firstLineOfTextFromHtml',
            'label'  => $label,
            'input'  => ['html' => $html],
            'result' => Note::firstLineOfTextFromHtml($html),
        ];
    }

    public function testCharacterization(): void
    {
        // -----------------------------------------------------------
        // getSubRecord()
        // -----------------------------------------------------------
        $this->addSubRecordCase('empty gedrec', 1, '1 BIRT', '');

        $rec = "1 BIRT\n2 DATE 1 JAN 1900\n2 PLAC Anytown\n1 DEAT\n2 DATE 1 JAN 1980";
        $this->addSubRecordCase('simple sub-record among siblings', 1, '1 BIRT', $rec);
        $this->addSubRecordCase('second sibling by tag', 1, '1 DEAT', $rec);

        $rec2 = "1 OCCU Farmer\n1 OCCU Blacksmith\n1 OCCU Sailor";
        $this->addSubRecordCase('num=1 (first occurrence)', 1, '1 OCCU', $rec2, 1);
        $this->addSubRecordCase('num=2 (second occurrence)', 1, '1 OCCU', $rec2, 2);
        $this->addSubRecordCase('num=3 (third occurrence)', 1, '1 OCCU', $rec2, 3);
        $this->addSubRecordCase('num beyond available occurrences', 1, '1 OCCU', $rec2, 4);

        $rec3 = "1 BIRT\n2 DATE 1 JAN 1900";
        $this->addSubRecordCase('sub-record is the last one, no end boundary found', 1, '1 BIRT', $rec3);

        $rec4 = "1 SOUR @S1@\n2 DATA\n3 DATE 1 JAN 1900\n1 DEAT";
        $this->addSubRecordCase('nested children included, cut at next level-1 line', 1, '1 SOUR', $rec4);

        // Requesting a level-2 sub-record whose exact level-2 boundary
        // isn't the next line encountered (there's a level-3 line before
        // the next level-2 sibling); falls back to using a level-1 line
        // as the cutoff when the requested level's own boundary marker
        // isn't found immediately, then finally to "no boundary found".
        $rec5   = "1 SOUR @S1@\n2 DATA\n3 DATE 1 JAN 1900\n1 DEAT";
        $label5 = 'level-2 request, no level-2 sibling, falls back to level-1 boundary';
        $this->addSubRecordCase($label5, 2, '2 DATA', $rec5);

        // Verified finding: the end-boundary search is a literal substring
        // search for "\n$level" (e.g. "\n1"), not a properly-delimited
        // number - so a deeply-nested line whose level number happens to
        // *start* with the same digit (e.g. level 10, 11, ...) is
        // incorrectly treated as a boundary, silently truncating the
        // sub-record and losing legitimate nested content that follows.
        $rec6   = "1 BIRT\n2 DATE 1 JAN 1900\n10 FAKE deep nesting\n11 EVEN more nested content"
            . "\n2 PLAC Anytown\n1 DEAT";
        $label6 = 'verified finding: level-10+ line falsely terminates a level-1 boundary search';
        $this->addSubRecordCase($label6, 1, '1 BIRT', $rec6);

        // -----------------------------------------------------------
        // getCont()
        // -----------------------------------------------------------
        $this->addContCase('no CONT lines', 2, "1 NOTE Hello\n2 SOUR @S1@");

        $rec7 = "1 NOTE Hello\n2 CONT World\n2 CONT Again";
        $this->addContCase('multiple CONT lines merged', 2, $rec7);

        $rec8 = "1 NOTE Hello\n2 CONC World\n2 CONT NewLine";
        $this->addContCase('CONC lines ignored, only CONT extracted', 2, $rec8);

        // Verified finding: substr($line, 0, 2) can only ever match a
        // single-digit level followed by a space, so getCont() can never
        // find CONT lines at level 10+ at all - not even when a real one
        // exists in the input.
        $rec9 = "10 CONT should be found but is not\n1 NOTE something";
        $this->addContCase('verified finding: level 10+ CONT lines are never found', 10, $rec9);
        $this->addContCase('verified finding: same input, level 1 also finds nothing', 1, $rec9);

        // -----------------------------------------------------------
        // Note::getNote()
        // -----------------------------------------------------------
        $tree = $this->importTree('demo.ged');
        $this->addNoteCase('simple single-line note', '0 @N1@ NOTE This is a simple note.', $tree);
        $note_gedcom = "0 @N1@ NOTE Line one\n1 CONT Line two\n1 CONT Line three";
        $this->addNoteCase('multi-line note with CONT merging', $note_gedcom, $tree);
        $this->addNoteCase('empty note text', '0 @N1@ NOTE', $tree);
        $this->addNoteCase('xref with allowed special characters', "0 @N:1_2.3-4@ NOTE Special xref chars", $tree);
        $this->addNoteCase('malformed record, no match', 'not a valid gedcom record at all', $tree);

        // -----------------------------------------------------------
        // Note::firstLineOfTextFromHtml()
        // -----------------------------------------------------------
        $this->addFirstLineCase('plain text, no tags', 'no break tags at all here');
        $this->addFirstLineCase('paragraph closing tags become breaks', '<p>para one</p><p>para two</p>');
        $this->addFirstLineCase('heading tags become breaks', '<h1>Heading</h1>Body text');
        $this->addFirstLineCase('list item tags become breaks', '<ul><li>item one</li><li>item two</li></ul>');
        $this->addFirstLineCase('blockquote becomes a break', '<blockquote>quoted</blockquote>after');
        $this->addFirstLineCase('pre becomes a break', '<pre>code</pre>after');
        $this->addFirstLineCase('hr (no closing tag) becomes a break', '<hr><p>after hr</p>');
        $table_html = '<table><tr><td>cell1</td><td>cell2</td></tr></table>';
        $this->addFirstLineCase('table cells become spaces, not breaks', $table_html);
        $this->addFirstLineCase('canonical <br /> is a break point', 'line one<br />line two');
        // Verified finding: strip_tags() preserves a <br> tag exactly as
        // written (it doesn't normalize it to the canonical "<br />"
        // form), and the break-detection step splits on the literal
        // string "<br />" - so a naked <br> or <br/> tag in the source
        // HTML does NOT create a line break in the preview text.
        $this->addFirstLineCase('verified finding: naked <br> (no slash) is NOT a break point', 'line one<br>line two');
        $this->addFirstLineCase('verified finding: <br/> (no space) is NOT a break point', 'line one<br/>line two');
        $entities_html = 'special &amp; &lt;chars&gt; &quot;quoted&quot; &#039;apos&#039;';
        $this->addFirstLineCase('html entities are decoded, including quotes (ENT_QUOTES)', $entities_html);
        $this->addFirstLineCase('empty html', '');
        $inline_html = '<strong>bold</strong> and <em>italic</em> text';
        $this->addFirstLineCase('other inline tags stripped without becoming breaks', $inline_html);

        $golden_dir = realpath(__DIR__ . '/../..') . '/golden';
        if (!is_dir($golden_dir)) {
            mkdir($golden_dir, 0755, true);
        }

        $filepath = $golden_dir . '/gedcom_text_helpers.json';
        $written  = file_put_contents(
            $filepath,
            json_encode($this->cases, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)
        );

        $this->assertTrue($written !== false, "Failed to write $filepath");
        $this->assertFileExists($filepath);
    }
}
