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

/**
 * One-off dev script (phase 5 step 47, editing "Phase A" foundation).
 *
 * Real PHP drives every "add/edit a fact" form from a registry of 216
 * Elements classes (app/Elements/*.php), each describing one GEDCOM
 * tag path (e.g. "INDI:BIRT:DATE"): a label, allowed subtags, an
 * optional controlled vocabulary, and (for ~36 classes) a distinct
 * edit-widget. Hand-porting all 216 classes would be disproportionate
 * - most differ only in static metadata, not behaviour - so, matching
 * this migration's precedent for large PHP metadata tables (step 37's
 * stats tags, step 39's module categories, step 42's hidden-tag keys),
 * this script dumps the REAL registered table mechanically via
 * Gedcom::registerTags() against the real ElementFactory, so the JS
 * port's data table is guaranteed to match real PHP at the moment this
 * was run - then classifies each entry's widget by its PHP class name.
 *
 * Scope: gedcom551Tags() + webtreesTags() only (`include_custom_tags =
 * false`). The 3rd-party import-format custom tag sets (Aldfaer,
 * Ancestry, Legacy, RootsMagic, etc.) require a live site_setting DB
 * lookup (CUSTOM_RESI_VAL and friends) and only ever affect records
 * freshly imported from those products' own GEDCOM exports - they are
 * not offered by the "add a new fact" picker, so they're out of scope
 * for the editing feature this generated table feeds.
 *
 * Usage: php bin/characterize_gedcom_elements.php > pages-server/gedcom-elements-data.mjs
 */

require __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Elements\AbstractXrefElement;
use Fisharebest\Webtrees\Factories\ElementFactory;
use Fisharebest\Webtrees\Gedcom;
use Fisharebest\Webtrees\I18N;

// Needed because Gedcom::gedcom551Tags() calls I18N::translate() for
// labels; `$setup = true` skips the DB/module-translation lookups this
// script doesn't have (and doesn't need - labels are plain English
// here, same simplification as every other characterize_*.php script).
I18N::init('en-US', true);

$factory = new ElementFactory();
$gedcom  = new Gedcom();
$gedcom->registerTags($factory, false);

$reflection = new ReflectionClass($factory);
$prop       = $reflection->getProperty('elements');
$elements   = $prop->getValue($factory);

// Map a PHP element class name to a short JS widget code. Classes not
// listed here (the majority - ~490 of 528 registered tags) get the
// 'text' widget by default, differentiated only by their own
// label/subtags/values/maxLength/pattern - see this element's own
// edit()/values() override (read directly from app/Elements/*.php) for
// why each of these needs a distinct widget.
$widget_for_class = [
    'SubmitterText'            => 'textarea',
    'NoteStructure'            => 'note',
    'DateValue'                => 'date',
    'DateValueExact'           => 'date',
    'DateLdsOrd'                => 'date',
    'TimeValueNow'             => 'text',
    'PlaceName'                => 'place',
    'PlaceLivingOrdinance'     => 'place',
    'PlaceLatitude'            => 'coordinate',
    'PlaceLongtitude'          => 'coordinate',
    'SexValue'                 => 'sex-radio',
    'NamePersonal'             => 'text', // keyboard-helper modal cut; plain text, see doc comment in gedcom-edit-widgets.mjs
    'Census'                   => 'text', // census-assistant modal cut; plain text
    'EmptyElement'             => 'empty',
];

// Classes overriding canonical() to call canonicalText() instead of
// the base canonical() - they preserve embedded newlines (only
// trimming leading/trailing ones) rather than collapsing all
// whitespace runs to a single space, which matters for NOTE:CONC/CONT
// reconstitution in GedcomEditService::editLinesToGedcom().
$uses_canonical_text = [
    'SubmitterText', 'AddressLine', 'DescriptiveTitle', 'SourceOriginator',
    'SourcePublicationFacts', 'TextFromSource',
];

// Every *EventElement subclass ("this event occurred, but details are
// unknown" checkbox+hidden field) gets the 'boolean-y' widget - these
// are all direct AbstractEventElement descendants, which is simplest
// to detect by walking the class hierarchy rather than listing all ~20
// by name (FamilyEvent, IndividualEvent, Adoption, Annulment, ...).
function widgetFor(string $class, array $widget_for_class): string
{
    $short = substr(strrchr($class, '\\') ?: $class, 1);

    if (isset($widget_for_class[$short])) {
        return $widget_for_class[$short];
    }

    if (is_a($class, AbstractXrefElement::class, true)) {
        // e.g. 'XrefIndividual' -> 'INDI'
        $map = [
            'XrefIndividual'  => 'INDI',
            'XrefFamily'      => 'FAM',
            'XrefMedia'       => 'OBJE',
            'XrefNote'        => 'NOTE',
            'XrefSharedNote'  => 'NOTE',
            'XrefRepository'  => 'REPO',
            'XrefSource'      => 'SOUR',
            'XrefSubmitter'   => 'SUBM',
            'XrefSubmission'  => 'SUBN',
            'XrefLocation'    => 'LOC',
            'XrefAssociate'   => 'INDI',
        ];

        return 'xref:' . ($map[$short] ?? 'INDI');
    }

    if (is_a($class, 'Fisharebest\\Webtrees\\Elements\\AbstractEventElement', true)) {
        return 'boolean-y';
    }

    return 'text';
}

$rows = [];

foreach ($elements as $tag => $element) {
    $class  = get_class($element);
    $widget = widgetFor($class, $widget_for_class);

    $values = [];
    try {
        $raw_values = $element->values();
        foreach ($raw_values as $k => $v) {
            $values[(string) $k] = (string) $v;
        }
    } catch (Throwable) {
        // Some values() implementations need DB/request context
        // (e.g. a module lookup) that this standalone CLI script
        // doesn't have - those elements fall back to a plain text
        // widget with no controlled vocabulary, same as any other
        // element with an empty values() list.
    }

    $class_reflection = new ReflectionClass($element);
    $max_length       = $class_reflection->getConstant('MAXIMUM_LENGTH');
    $pattern          = $class_reflection->getConstant('PATTERN');

    try {
        $subtags = $element->subtags();
    } catch (Throwable) {
        // A handful of record-level elements (FamilyRecord,
        // IndividualRecord, ...) override subtags() to drop entries
        // based on a site-wide HIDE_* preference (e.g. HIDE_FAM_RESI),
        // which needs a live DB connection this standalone CLI script
        // doesn't have. Both HIDE_* preferences default to unset
        // (i.e. "don't hide") when there is no DB row, so falling back
        // to the un-filtered SUBTAGS constant matches real PHP's own
        // default (fresh-install) behaviour exactly.
        $subtags = $class_reflection->getConstant('SUBTAGS');
    }

    $short = substr(strrchr($class, '\\') ?: $class, 1);

    $rows[$tag] = [
        'label'            => $element->label(),
        'widget'           => $widget,
        'values'           => $values,
        'subtags'          => $subtags,
        'maxLength'        => $max_length ?: null,
        'pattern'          => $pattern ?: null,
        'collapseChildren' => $element->collapseChildren(),
        'preserveNewlines' => in_array($short, $uses_canonical_text, true),
    ];
}

ksort($rows);

function jsString(string $s): string
{
    return json_encode($s, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

echo "// Generated by bin/characterize_gedcom_elements.php - do not hand-edit.\n";
echo "// Full tag path (e.g. 'INDI:BIRT:DATE') -> element metadata.\n";
echo "// See that script's doc comment for scope (gedcom551+webtrees tags only,\n";
echo "// no 3rd-party custom-tag sets) and widget-classification rules.\n";
echo "export const GEDCOM_ELEMENTS = {\n";

foreach ($rows as $tag => $row) {
    echo '  ' . jsString((string) $tag) . ': {' . "\n";
    echo '    label: ' . jsString($row['label']) . ",\n";
    echo '    widget: ' . jsString($row['widget']) . ",\n";

    if ($row['values'] !== []) {
        echo "    values: {\n";
        foreach ($row['values'] as $k => $v) {
            echo '      ' . jsString((string) $k) . ': ' . jsString((string) $v) . ",\n";
        }
        echo "    },\n";
    }

    if ($row['subtags'] !== []) {
        echo "    subtags: {\n";
        foreach ($row['subtags'] as $k => $v) {
            echo '      ' . jsString((string) $k) . ': ' . jsString((string) $v) . ",\n";
        }
        echo "    },\n";
    }

    if ($row['maxLength'] !== null) {
        echo '    maxLength: ' . (int) $row['maxLength'] . ",\n";
    }

    if ($row['pattern'] !== null) {
        echo '    pattern: ' . jsString($row['pattern']) . ",\n";
    }

    if ($row['collapseChildren']) {
        echo "    collapseChildren: true,\n";
    }

    if ($row['preserveNewlines']) {
        echo "    preserveNewlines: true,\n";
    }

    echo "  },\n";
}

echo "};\n";
