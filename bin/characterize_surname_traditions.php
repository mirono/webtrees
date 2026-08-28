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

// One-off characterization script for the 8 SurnameTradition subclasses
// (follow-on batch from task 4 — see
// docs/php-to-js-migration/task-05-surname-tradition-subclasses.md).
//
// newParentNames()/newSpouseNames() take a non-nullable Individual — but
// extractName() (already ported+characterized in task 4) is the ONLY
// thing any of these classes do with that object, and none of the 8
// subclasses override extractName(). So rather than constructing a real
// Individual (needs a Tree, needs a DB), every tradition below is wrapped
// in a tiny anonymous subclass that overrides extractName() to look up a
// canned string by the *identity* of the object it's given
// (spl_object_id()) — this lets newChildNames()'s father and mother
// arguments return two DIFFERENT extracted names in one call, which a
// single shared "current fake name" property couldn't express (needed for
// Portuguese/Spanish, which read both).

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Individual;
use Fisharebest\Webtrees\SurnameTradition\IcelandicSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\LithuanianSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\MatrilinealSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\PaternalSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\PatrilinealSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\PolishSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\PortugueseSurnameTradition;
use Fisharebest\Webtrees\SurnameTradition\SpanishSurnameTradition;

trait FakeExtractName
{
    /** @var array<int,string> spl_object_id() => name */
    private array $fake_names = [];

    public function bind(Individual $individual, string $name): void
    {
        $this->fake_names[spl_object_id($individual)] = $name;
    }

    protected function extractName(Individual|null $individual): string
    {
        if ($individual === null) {
            return '';
        }

        return $this->fake_names[spl_object_id($individual)] ?? '';
    }
}

/** Builds a placeholder Individual bound to $name via the trait above. */
function person(object $tradition, string $name): Individual
{
    $individual = (new ReflectionClass(Individual::class))->newInstanceWithoutConstructor();
    $tradition->bind($individual, $name);

    return $individual;
}

$traditions = [
    'Patrilineal' => new class extends PatrilinealSurnameTradition {
        use FakeExtractName;
    },
    'Paternal' => new class extends PaternalSurnameTradition {
        use FakeExtractName;
    },
    'Matrilineal' => new class extends MatrilinealSurnameTradition {
        use FakeExtractName;
    },
    'Icelandic' => new class extends IcelandicSurnameTradition {
        use FakeExtractName;
    },
    'Lithuanian' => new class extends LithuanianSurnameTradition {
        use FakeExtractName;
    },
    'Polish' => new class extends PolishSurnameTradition {
        use FakeExtractName;
    },
    'Portuguese' => new class extends PortugueseSurnameTradition {
        use FakeExtractName;
    },
    'Spanish' => new class extends SpanishSurnameTradition {
        use FakeExtractName;
    },
];

// Shared name inputs. Covers: simple names, SPFX (surname-prefix) names,
// the byte-vs-Unicode PCRE quirk (REGEX_SPFX_SURN/REGEX_SURN/REGEX_SURNS
// have no /u modifier, so a literal 3-byte UTF-8 character embedded in the
// character class source can behave differently than a "real"
// Unicode-aware match would — see this batch's doc), a name with no
// SPFX/prefix, and an empty/no-match name (falls through to fallback).
$SIMPLE    = 'John /Smith/';
$SPFX_VAN  = 'Jan /van der Berg/';
$SPFX_DE   = 'Jan /de Vries/';
$APOSTROPHE = "Sean /O’Brien/"; // U+2019 RIGHT SINGLE QUOTATION MARK
$NO_MATCH  = '';

$results = [];

// --- Patrilineal: newChildNames reads father; newParentNames reads child (sex === 'M') ---
$t = $traditions['Patrilineal'];
foreach (['simple' => $SIMPLE, 'spfx_van' => $SPFX_VAN, 'spfx_de' => $SPFX_DE, 'apostrophe' => $APOSTROPHE, 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Patrilineal']['newChildNames'][] = [
            'input'  => ['father_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newChildNames(person($t, $name), null, $sex),
        ];
    }
}
foreach (['simple' => $SIMPLE, 'spfx_van' => $SPFX_VAN, 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Patrilineal']['newParentNames'][] = [
            'input'  => ['child_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newParentNames(person($t, $name), $sex),
        ];
    }
}
$results['Patrilineal']['newSpouseNames'][] = [
    'input'  => ['spouse_name' => $SIMPLE, 'sex' => 'F', 'case' => 'always_fixed'],
    'output' => $t->newSpouseNames(person($t, $SIMPLE), 'F'),
];
$results['Patrilineal']['defaultName'] = $t->defaultName();

// --- Paternal: newChildNames inherited from Patrilineal (father); newParentNames/newSpouseNames overridden (sex === 'F', VALUE_MARRIED) ---
$t = $traditions['Paternal'];
foreach (['simple' => $SIMPLE, 'spfx_van' => $SPFX_VAN, 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Paternal']['newChildNames'][] = [
            'input'  => ['father_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newChildNames(person($t, $name), null, $sex),
        ];
    }
}
foreach (['simple' => $SIMPLE, 'spfx_van' => $SPFX_VAN, 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Paternal']['newParentNames'][] = [
            'input'  => ['child_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newParentNames(person($t, $name), $sex),
        ];
        $results['Paternal']['newSpouseNames'][] = [
            'input'  => ['spouse_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newSpouseNames(person($t, $name), $sex),
        ];
    }
}
$results['Paternal']['defaultName'] = $t->defaultName();

// --- Matrilineal: newChildNames reads mother; newParentNames reads child (sex === 'F') ---
$t = $traditions['Matrilineal'];
foreach (['simple' => $SIMPLE, 'spfx_van' => $SPFX_VAN, 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Matrilineal']['newChildNames'][] = [
            'input'  => ['mother_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newChildNames(null, person($t, $name), $sex),
        ];
    }
}
foreach (['simple' => $SIMPLE, 'spfx_van' => $SPFX_VAN, 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Matrilineal']['newParentNames'][] = [
            'input'  => ['child_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newParentNames(person($t, $name), $sex),
        ];
    }
}
$results['Matrilineal']['newSpouseNames'][] = [
    'input'  => ['spouse_name' => $SIMPLE, 'sex' => 'F', 'case' => 'always_fixed'],
    'output' => $t->newSpouseNames(person($t, $SIMPLE), 'F'),
];
$results['Matrilineal']['defaultName'] = $t->defaultName();

// --- Icelandic: newChildNames reads father (GIVN + patronymic suffix); newParentNames reverse-matches sson/sdottir on child; newSpouseNames always fixed ---
$t = $traditions['Icelandic'];
foreach (['simple' => 'Bjorn /Petursson/', 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Icelandic']['newChildNames'][] = [
            'input'  => ['father_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newChildNames(person($t, $name), null, $sex),
        ];
    }
}
// Icelandic GEDCOM NAME values are typically unslashed for this tradition
// (defaultName() is '', and newChildNames() builds names via buildName($givn, ...)
// with no surrounding //) — confirmed the reverse-match regexes
// (~(?<GIVN>[^ /]+)(:?sson)$~ / ~(?<GIVN>[^ /]+)(:?sdottir)$~) require the
// string to literally END in the suffix, which a slash-wrapped
// "Jon /Bjornsson/" never does (verified: 0 matches). Using unslashed
// names here is the realistic case, not a simplification.
foreach (['sson_suffix' => ['name' => 'Jon Bjornsson', 'sex' => 'M'], 'sdottir_suffix' => ['name' => 'Anna Bjornsdottir', 'sex' => 'F'], 'slashed_never_matches' => ['name' => 'Jon /Bjornsson/', 'sex' => 'M'], 'no_match' => ['name' => $NO_MATCH, 'sex' => 'M']] as $case => $c) {
    $results['Icelandic']['newParentNames'][] = [
        'input'  => ['child_name' => $c['name'], 'sex' => $c['sex'], 'case' => $case],
        'output' => $t->newParentNames(person($t, $c['name']), $c['sex']),
    ];
}
$results['Icelandic']['newSpouseNames'][] = [
    'input'  => ['spouse_name' => $SIMPLE, 'sex' => 'F', 'case' => 'always_fixed_ignores_spouse'],
    'output' => $t->newSpouseNames(person($t, $SIMPLE), 'F'),
];
$results['Icelandic']['defaultName'] = $t->defaultName();

// --- Lithuanian: newChildNames/newParentNames/newSpouseNames all read+inflect via REGEX_SURN ---
// The full INFLECT_DAUGHTER/INFLECT_MALE suffix matrices below mirror
// tests/Unit/SurnameTradition/LithuanianSurnameTraditionTest.php's
// testNewDaughterNamesInflected()/testNewFatherNamesInflected() exactly
// (found and cross-checked against that pre-existing, independently
// authored PHPUnit suite after this batch's own smaller test set already
// passed — a stronger cross-validation than characterizing in isolation).
$t = $traditions['Lithuanian'];
foreach (['as_suffix' => 'Jonas /Petraitis/', 'us_suffix' => 'Antanas /Adamus/', 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Lithuanian']['newChildNames'][] = [
            'input'  => ['father_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newChildNames(person($t, $name), null, $sex),
        ];
    }
}
// INFLECT_DAUGHTER: every suffix rule, sex=F (mother name is irrelevant to
// this tradition's newChildNames(), only father is read).
foreach (
    [
        'daughter_a'   => 'John /Whita/',
        'daughter_as'  => 'John /Whitas/',
        'daughter_is'  => 'John /Whitis/',
        'daughter_ys'  => 'John /Whitys/',
        'daughter_ius' => 'John /Whitius/',
        'daughter_us'  => 'John /Whitus/',
    ] as $case => $name
) {
    $results['Lithuanian']['newChildNames'][] = [
        'input'  => ['father_name' => $name, 'sex' => 'F', 'case' => $case],
        'output' => $t->newChildNames(person($t, $name), null, 'F'),
    ];
}
foreach (['as_suffix' => 'Jonas /Petraitis/', 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Lithuanian']['newParentNames'][] = [
            'input'  => ['child_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newParentNames(person($t, $name), $sex),
        ];
        $results['Lithuanian']['newSpouseNames'][] = [
            'input'  => ['spouse_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newSpouseNames(person($t, $name), $sex),
        ];
    }
}
// INFLECT_MALE reverse rules, sex=M (newParentNames()).
foreach (
    [
        'male_aite' => 'Mary /Whitaitė/',
        'male_yte'  => 'Mary /Whitytė/',
        'male_iute' => 'Mary /Whitiūtė/',
        'male_ute'  => 'Mary /Whitutė/',
    ] as $case => $name
) {
    $results['Lithuanian']['newParentNames'][] = [
        'input'  => ['child_name' => $name, 'sex' => 'M', 'case' => $case],
        'output' => $t->newParentNames(person($t, $name), 'M'),
    ];
}
$results['Lithuanian']['defaultName'] = $t->defaultName();

// --- Polish: same shape as Lithuanian, different inflection tables ---
// Suffix matrix cross-checked against
// tests/Unit/SurnameTradition/PolishSurnameTraditionTest.php's
// testNewDaughterNamesInflected()/testNewFatherNamesInflected() —
// includes 'żki\b'/'żka\b' (the accented-boundary case, same class of
// PHP-\b-under-/u divergence as Lithuanian's 'ytė\b' etc.).
$t = $traditions['Polish'];
foreach (['ski_suffix' => 'Jan /Kowalski/', 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Polish']['newChildNames'][] = [
            'input'  => ['father_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newChildNames(person($t, $name), null, $sex),
        ];
    }
}
foreach (
    [
        'female_cki'  => 'John /Whitecki/',
        'female_dzki' => 'John /Whitedzki/',
        'female_ski'  => 'John /Whiteski/',
        'female_zki'  => 'John /Whiteżki/',
    ] as $case => $name
) {
    $results['Polish']['newChildNames'][] = [
        'input'  => ['father_name' => $name, 'sex' => 'F', 'case' => $case],
        'output' => $t->newChildNames(person($t, $name), null, 'F'),
    ];
}
foreach (['ski_suffix' => 'Jan /Kowalski/', 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Polish']['newParentNames'][] = [
            'input'  => ['child_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newParentNames(person($t, $name), $sex),
        ];
        $results['Polish']['newSpouseNames'][] = [
            'input'  => ['spouse_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newSpouseNames(person($t, $name), $sex),
        ];
    }
}
foreach (
    [
        'male_cka'  => 'Chris /Whitecka/',
        'male_dzka' => 'Chris /Whitedzka/',
        'male_ska'  => 'Chris /Whiteska/',
        'male_zka'  => 'Chris /Whiteżka/',
    ] as $case => $name
) {
    $results['Polish']['newParentNames'][] = [
        'input'  => ['child_name' => $name, 'sex' => 'M', 'case' => $case],
        'output' => $t->newParentNames(person($t, $name), 'M'),
    ];
}
$results['Polish']['defaultName'] = $t->defaultName();

// --- Portuguese: newChildNames reads BOTH father and mother; newParentNames reads child; newSpouseNames always fixed ---
$t = $traditions['Portuguese'];
$TWO_SURN_1 = 'Jose /Cccc/ /Dddd/';
$TWO_SURN_2 = 'Maria /Aaaa/ /Bbbb/';
foreach (
    [
        'both'        => ['father' => $TWO_SURN_1, 'mother' => $TWO_SURN_2],
        'father_only' => ['father' => $TWO_SURN_1, 'mother' => $NO_MATCH],
        'mother_only' => ['father' => $NO_MATCH, 'mother' => $TWO_SURN_2],
        'neither'     => ['father' => $NO_MATCH, 'mother' => $NO_MATCH],
    ] as $case => $c
) {
    $results['Portuguese']['newChildNames'][] = [
        'input'  => ['father_name' => $c['father'], 'mother_name' => $c['mother'], 'sex' => 'M', 'case' => $case],
        'output' => $t->newChildNames(person($t, $c['father']), person($t, $c['mother']), 'M'),
    ];
}
foreach (['two_surnames' => $TWO_SURN_1, 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Portuguese']['newParentNames'][] = [
            'input'  => ['child_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newParentNames(person($t, $name), $sex),
        ];
    }
}
$results['Portuguese']['newSpouseNames'][] = [
    'input'  => ['spouse_name' => $SIMPLE, 'sex' => 'F', 'case' => 'always_fixed'],
    'output' => $t->newSpouseNames(person($t, $SIMPLE), 'F'),
];
// REGEX_SURNS's ' y ' alternative (Spanish/Portuguese "compound" surname
// separator) — cross-checked against
// tests/Unit/SurnameTradition/PortugueseSurnameTraditionTest.php's
// testNewChildNamesCompunds().
$results['Portuguese']['newChildNames'][] = [
    'input'  => ['father_name' => 'Gabriel /Garcia/ y /Iglesias/', 'mother_name' => 'Maria /Ruiz/ y /Lorca/', 'sex' => 'M', 'case' => 'y_separator'],
    'output' => $t->newChildNames(person($t, 'Gabriel /Garcia/ y /Iglesias/'), person($t, 'Maria /Ruiz/ y /Lorca/'), 'M'),
];
$results['Portuguese']['defaultName'] = $t->defaultName();

// --- Spanish: same shape as Portuguese, different surname assembly order ---
$t = $traditions['Spanish'];
foreach (
    [
        'both'        => ['father' => $TWO_SURN_1, 'mother' => $TWO_SURN_2],
        'father_only' => ['father' => $TWO_SURN_1, 'mother' => $NO_MATCH],
        'mother_only' => ['father' => $NO_MATCH, 'mother' => $TWO_SURN_2],
        'neither'     => ['father' => $NO_MATCH, 'mother' => $NO_MATCH],
    ] as $case => $c
) {
    $results['Spanish']['newChildNames'][] = [
        'input'  => ['father_name' => $c['father'], 'mother_name' => $c['mother'], 'sex' => 'M', 'case' => $case],
        'output' => $t->newChildNames(person($t, $c['father']), person($t, $c['mother']), 'M'),
    ];
}
foreach (['two_surnames' => $TWO_SURN_1, 'no_match' => $NO_MATCH] as $case => $name) {
    foreach (['M', 'F'] as $sex) {
        $results['Spanish']['newParentNames'][] = [
            'input'  => ['child_name' => $name, 'sex' => $sex, 'case' => $case],
            'output' => $t->newParentNames(person($t, $name), $sex),
        ];
    }
}
$results['Spanish']['newSpouseNames'][] = [
    'input'  => ['spouse_name' => $SIMPLE, 'sex' => 'F', 'case' => 'always_fixed'],
    'output' => $t->newSpouseNames(person($t, $SIMPLE), 'F'),
];
$results['Spanish']['defaultName'] = $t->defaultName();

$golden_dir = __DIR__ . '/../golden';
if (!is_dir($golden_dir)) {
    mkdir($golden_dir, 0755, true);
}

file_put_contents($golden_dir . '/surname_traditions.json', json_encode($results, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));

echo 'Wrote golden/surname_traditions.json (' . count($results) . " traditions)\n";
