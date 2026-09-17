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

// One-off characterization script (see
// docs/php-to-js-migration/phase5-postgres-setup-cli.md): dumps the real
// list of languages the browser setup wizard's step 1 offers
// (ModuleService::setupLanguages(), the same call
// SetupWizard::handle() makes), in the same order, with the same
// display strings (Locale::endonym() - confirmed by reading
// resources/views/setup/step-1-language.phtml, the real view template
// step 1 renders) and tag (Locale::languageTag()). This becomes
// golden/setup_languages.json, the source setup-cli/'s language-select
// step reads from - not hand-guessed.
//
// Re-run this if webtrees ever adds/removes a language module.

require_once __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Services\ModuleService;
use Fisharebest\Webtrees\Webtrees;

(new Webtrees())->bootstrap();

$module_service = new ModuleService();

$languages = $module_service->setupLanguages()
    ->map(static fn ($module) => [
        'languageTag' => $module->locale()->languageTag(),
        'endonym'     => $module->locale()->endonym(),
    ])
    ->values()
    ->all();

echo json_encode($languages, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
