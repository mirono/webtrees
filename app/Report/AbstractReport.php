<?php
/**
 * webtrees: online genealogy
 * Copyright (C) 2019 webtrees development team
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */
declare(strict_types=1);

namespace Fisharebest\Webtrees\Report;

use DomainException;
use Fisharebest\Webtrees\I18N;
use Fisharebest\Webtrees\MediaFile;
use Fisharebest\Webtrees\Webtrees;

/**
 * Class AbstractReport - base for PDF and HTML reports
 */
abstract class AbstractReport
{
    // Reports layouts are measured in points.
    protected const UNITS = 'pt';

    // A point is 1/72 of an inch
    protected const INCH_TO_POINTS = 1.0 / 72.0;
    protected const MM_TO_POINTS   = 25.4 / 72.0;

    protected const PAPER_SIZES = [
        // ISO 216
        'A0'         => [841.0 * self::MM_TO_POINTS, 1189.0 * self::MM_TO_POINTS],
        'A1'         => [594.0 * self::MM_TO_POINTS, 841.0 * self::MM_TO_POINTS],
        'A2'         => [420.0 * self::MM_TO_POINTS, 594.0 * self::MM_TO_POINTS],
        'A3'         => [297.0 * self::MM_TO_POINTS, 420.0 * self::MM_TO_POINTS],
        'A4'         => [210.0 * self::MM_TO_POINTS, 297.0 * self::MM_TO_POINTS],
        // US
        'US-Letter'  => [8.5 * self::INCH_TO_POINTS, 11.0 * self::INCH_TO_POINTS],
        'US-Legal'   => [8.5 * self::INCH_TO_POINTS, 14.0 * self::INCH_TO_POINTS],
        'US-Tabloid' => [11.0 * self::INCH_TO_POINTS, 17.0 * self::INCH_TO_POINTS],
    ];

    protected const DEFAULT_PAPER_SIZE = 'A4';

    /** @var float Left Margin */
    public $left_margin = 18.0 * self::MM_TO_POINTS;

    /** @var float Right Margin */
    public $right_margin = 18.0 * self::MM_TO_POINTS;

    /** @var float Top Margin */
    public $top_margin = 18.0 * self::MM_TO_POINTS;

    /** @var float Bottom Margin */
    public $bottom_margin = 18.0 * self::MM_TO_POINTS;

    /** @var float Header Margin */
    public $header_margin = 5.0 * self::MM_TO_POINTS;

    /** @var float Footer Margin */
    public $footer_margin = 10.0 * self::MM_TO_POINTS;

    /** @var string Page orientation (portrait, landscape) */
    public $orientation = 'portrait';

    /** @var string Page format name */
    public $page_format = 'A4';

    /** @var float Height of page format in points */
    public $page_height = 0.0;

    /** @var float Width of page format in points */
    public $page_width = 0.0;

    /** @var string[][] An array of the Styles elements found in the document */
    public $styles = [];

    /** @var string The default Report font name */
    public $default_font = 'dejavusans';

    /** @var float The default Report font size */
    public $default_font_size = 12.0;

    /** @var string Header (H), Page header (PH), Body (B) or Footer (F) */
    public $processing = 'H';

    /** @var bool RTL Language (false=LTR, true=RTL) */
    public $rtl = false;

    /** @var bool Show the Generated by... (true=show the text) */
    public $show_generated_by = true;

    /** @var string Generated By... text */
    public $generated_by = '';

    /** @var string The report title */
    public $title = '';

    /** @var string Author of the report, the users full name */
    public $rauthor = Webtrees::NAME . ' ' . Webtrees::VERSION;

    /** @var string Keywords */
    public $rkeywords = '';

    /** @var string Report Description / Subject */
    public $rsubject = '';

    /**
     * Clear the Header.
     *
     * @return void
     */
    abstract public function clearHeader();

    /**
     * Create a new Page Header object
     *
     * @return ReportBasePageheader
     */
    abstract public function createPageHeader(): ReportBasePageheader;

    /**
     * Add an element.
     *
     * @param ReportBaseElement|string $element
     *
     * @return void
     */
    abstract public function addElement($element);

    /**
     * Run the report.
     *
     * @return void
     */
    abstract public function run();

    /**
     * Create a new Cell object.
     *
     * @param int    $width   cell width (expressed in points)
     * @param int    $height  cell height (expressed in points)
     * @param mixed  $border  Border style
     * @param string $align   Text alignement
     * @param string $bgcolor Background color code
     * @param string $style   The name of the text style
     * @param int    $ln      Indicates where the current position should go after the call
     * @param mixed  $top     Y-position
     * @param mixed  $left    X-position
     * @param int    $fill    Indicates if the cell background must be painted (1) or transparent (0). Default value: 1
     * @param int    $stretch Stretch carachter mode
     * @param string $bocolor Border color
     * @param string $tcolor  Text color
     * @param bool   $reseth
     *
     * @return ReportBaseCell
     */
    abstract public function createCell($width, $height, $border, $align, $bgcolor, $style, $ln, $top, $left, $fill, $stretch, $bocolor, $tcolor, $reseth): ReportBaseCell;

    /**
     * Create a new TextBox object.
     *
     * @param float  $width   Text box width
     * @param float  $height  Text box height
     * @param bool   $border
     * @param string $bgcolor Background color code in HTML
     * @param bool   $newline
     * @param float  $left
     * @param float  $top
     * @param bool   $pagecheck
     * @param string $style
     * @param bool   $fill
     * @param bool   $padding
     * @param bool   $reseth
     *
     * @return ReportBaseTextbox
     */
    abstract public function createTextBox(
        float $width,
        float $height,
        bool $border,
        string $bgcolor,
        bool $newline,
        float $left,
        float $top,
        bool $pagecheck,
        string $style,
        bool $fill,
        bool $padding,
        bool $reseth
    ): ReportBaseTextbox;

    /**
     * Create a text element.
     *
     * @param string $style
     * @param string $color
     *
     * @return ReportBaseText
     */
    abstract public function createText(string $style, string $color): ReportBaseText;

    /**
     * Create an HTML element.
     *
     * @param string   $tag
     * @param string[] $attrs
     *
     * @return ReportBaseHtml
     */
    abstract public function createHTML(string $tag, array $attrs): ReportBaseHtml;

    /**
     * Create a line.
     *
     * @param float $x1
     * @param float $y1
     * @param float $x2
     * @param float $y2
     *
     * @return ReportBaseLine
     */
    abstract public function createLine(float $x1, float $y1, float $x2, float $y2): ReportBaseLine;

    /**
     * Create a new image object.
     *
     * @param string $file  Filename
     * @param float  $x
     * @param float  $y
     * @param float  $w     Image width
     * @param float  $h     Image height
     * @param string $align L:left, C:center, R:right or empty to use x/y
     * @param string $ln    T:same line, N:next line
     *
     * @return ReportBaseImage
     */
    abstract public function createImage(string $file, float $x, float $y, float $w, float $h, string $align, string $ln): ReportBaseImage;

    /**
     * Create a new image object from Media Object.
     *
     * @param MediaFile $media_file
     * @param float     $x
     * @param float     $y
     * @param float     $w     Image width
     * @param float     $h     Image height
     * @param string    $align L:left, C:center, R:right or empty to use x/y
     * @param string    $ln    T:same line, N:next line
     *
     * @return ReportBaseImage
     */
    abstract public function createImageFromObject(MediaFile $media_file, float $x, float $y, float $w, float $h, string $align, string $ln): ReportBaseImage;

    /**
     * Create a new Footnote object.
     *
     * @param string $style Style name
     *
     * @return ReportBaseFootnote
     */
    abstract public function createFootnote($style): ReportBaseFootnote;

    /**
     * Initial Setup
     * Setting up document wide defaults that will be inherited of the report modules
     * As DEFAULT A4 and Portrait will be used if not set
     *
     * @return void
     */
    public function setup(): void
    {
        // Set RTL direction
        if (I18N::direction() === 'rtl') {
            $this->rtl = true;
        }
        // Set the Keywords
        $this->rkeywords = '';

        // Generated By...text
        // I18N: This is a report footer. %s is the name of the application.
        $this->generated_by = I18N::translate('Generated by %s', Webtrees::NAME . ' ' . Webtrees::VERSION);

        // For known size pages
        if ($this->page_width === 0 && $this->page_height === 0) {
            [$this->page_width, $this->page_height] = self::PAPER_SIZES[$this->page_format] ?? self::PAPER_SIZES['A4'];
        }
    }

    /**
     * Process the Header , Page header, Body or Footer
     *
     * @param string $p Header (H), Page header (PH), Body (B) or Footer (F)
     *
     * @return void
     */
    public function setProcessing(string $p)
    {
        $this->processing = $p;
    }

    /**
     * Add the Title when raw character data is used in Title
     *
     * @param string $data
     *
     * @return void
     */
    public function addTitle(string $data)
    {
        $this->title .= $data;
    }

    /**
     * Add the Description when raw character data is used in Description
     *
     * @param string $data
     *
     * @return void
     */
    public function addDescription(string $data)
    {
        $this->rsubject .= $data;
    }

    /**
     * Add Style to Styles array
     *
     * @param string[] $style
     *
     * @return void
     */
    public function addStyle(array $style)
    {
        $this->styles[$style['name']] = $style;
    }

    /**
     * Get a style from the Styles array
     *
     * @param string $s Style name
     *
     * @return array
     */
    public function getStyle(string $s): array
    {
        if (!isset($this->styles[$s])) {
            return current($this->styles);
        }

        return $this->styles[$s];
    }
}
