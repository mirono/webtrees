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
 * Characterization script for task 23 (docs/php-to-js-migration/task-23-color-generator.md).
 * Generates a golden fixture from the real app/ColorGenerator.php.
 */

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\ColorGenerator;

if (!is_dir(__DIR__ . '/../golden')) {
    mkdir(__DIR__ . '/../golden');
}

$cases = [];

function runCase(array &$cases, string $label, array $ctor_args, int $calls, int $lightness_step = 10, int $hue_step = 15): void
{
    $generator = new ColorGenerator(...$ctor_args);
    $colors    = [];
    for ($i = 0; $i < $calls; $i++) {
        $colors[] = $generator->getNextColor($lightness_step, $hue_step);
    }

    $cases[] = [
        'label'          => $label,
        'ctor_args'      => $ctor_args,
        'lightness_step' => $lightness_step,
        'hue_step'       => $hue_step,
        'calls'          => $calls,
        'colors'         => $colors,
    ];
}

// Real production usage (LifespansChartModule.php): M/F/U color ramps.
runCase($cases, 'real usage: M (hue=240, range=-120, anticlockwise)', [240, 100, 30, 0.25, -120], 20);
runCase($cases, 'real usage: F (hue=0, range=120, clockwise)', [0, 100, 30, 0.25, 120], 20);
runCase($cases, 'real usage: U (hue=120, range=120, clockwise)', [120, 100, 30, 0.25, 120], 20);

// Default step arguments (lightnessStep=10, hueStep=15).
runCase($cases, 'default steps, small run', [0, 50, 0, 0.5, 60], 15);

// Custom step arguments.
runCase($cases, 'custom steps: lightnessStep=25, hueStep=30', [0, 50, 0, 1.0, 90], 12, 25, 30);
runCase($cases, 'custom steps: lightnessStep=1, hueStep=1 (fine-grained)', [0, 50, 0, 1.0, 5], 30, 1, 1);

// Boundary-exactly-hit case: range is an exact multiple of hueStep, so a
// hue step should land EXACTLY on basehue+range at some point.
runCase($cases, 'boundary exactly hit: range=30, hueStep=15 (lands exactly on basehue+range)', [0, 50, 90, 1.0, 30], 10, 10, 15);

// Negative range with an exact multiple too.
runCase($cases, 'boundary exactly hit, negative range: range=-30, hueStep=15', [100, 50, 90, 1.0, -30], 10, 10, 15);

// Zero range (degenerate case - hue window has zero width).
runCase($cases, 'zero range (degenerate)', [50, 50, 90, 1.0, 0], 8, 10, 15);

// Negative starting hue.
runCase($cases, 'negative starting hue', [-30, 50, 90, 0.5, -60], 10);

// Alpha formatting: various values, including ones needing rounding.
runCase($cases, 'alpha=0', [0, 50, 0, 0.0, 60], 3);
runCase($cases, 'alpha=1', [0, 50, 0, 1.0, 60], 3);
runCase($cases, 'alpha=0.333333 (rounds to 2dp)', [0, 50, 0, 0.333333, 60], 3);
runCase($cases, 'alpha=0.005 (rounding boundary)', [0, 50, 0, 0.005, 60], 3);
runCase($cases, 'alpha=0.995 (rounding boundary near 1)', [0, 50, 0, 0.995, 60], 3);

// Lightness starting already >= 100 - baselightness reset should trigger
// on the very first call.
runCase($cases, 'lightness starts high, resets on first call', [0, 50, 95, 0.5, 60], 5);

// Single call only.
runCase($cases, 'single call', [200, 75, 40, 0.75, 45], 1);

file_put_contents(__DIR__ . '/../golden/color_generator.json', json_encode($cases, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

echo "Done.\n";
