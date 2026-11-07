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
 * One-off dev script (phase 5 step 39, ControlPanel/admin dashboard).
 *
 * The real control panel classifies every one of ~120 core modules into
 * 18 category sections (analytics/block/chart/data-fix/footer/historic-
 * events/language/list/map-autocomplete/map-geolocation/map-link/
 * map-provider/menu/report/share/sidebar/tab/theme), each driven by
 * `instanceof SomeInterface`. Rather than hand-transcribing or
 * delegating that classification (real risk of a miscopy nobody would
 * notice until a live count looked wrong), this dumps it mechanically
 * via Reflection against `ModuleService::CORE_MODULES` - the exact
 * authoritative module_name -> class map real PHP itself uses - so the
 * JS port's own static table is guaranteed to match real PHP class
 * declarations at the moment this was run.
 *
 * Usage: php bin/characterize_control_panel_modules.php
 */

require __DIR__ . '/../vendor/autoload.php';

use Fisharebest\Webtrees\Module\ModuleAnalyticsInterface;
use Fisharebest\Webtrees\Module\ModuleBlockInterface;
use Fisharebest\Webtrees\Module\ModuleChartInterface;
use Fisharebest\Webtrees\Module\ModuleConfigInterface;
use Fisharebest\Webtrees\Module\ModuleCustomInterface;
use Fisharebest\Webtrees\Module\ModuleDataFixInterface;
use Fisharebest\Webtrees\Module\ModuleFooterInterface;
use Fisharebest\Webtrees\Module\ModuleHistoricEventsInterface;
use Fisharebest\Webtrees\Module\ModuleLanguageInterface;
use Fisharebest\Webtrees\Module\ModuleListInterface;
use Fisharebest\Webtrees\Module\ModuleMapAutocompleteInterface;
use Fisharebest\Webtrees\Module\ModuleMapGeoLocationInterface;
use Fisharebest\Webtrees\Module\ModuleMapLinkInterface;
use Fisharebest\Webtrees\Module\ModuleMapProviderInterface;
use Fisharebest\Webtrees\Module\ModuleMenuInterface;
use Fisharebest\Webtrees\Module\ModuleReportInterface;
use Fisharebest\Webtrees\Module\ModuleShareInterface;
use Fisharebest\Webtrees\Module\ModuleSidebarInterface;
use Fisharebest\Webtrees\Module\ModuleTabInterface;
use Fisharebest\Webtrees\Module\ModuleThemeInterface;
use Fisharebest\Webtrees\Services\ModuleService;

// Short category codes, matching the order the real control panel
// template groups them in - not alphabetical, so the JS port's own
// section order can match the real page exactly.
$interfaces = [
    'analytics'       => ModuleAnalyticsInterface::class,
    'block'           => ModuleBlockInterface::class,
    'chart'           => ModuleChartInterface::class,
    'custom'          => ModuleCustomInterface::class,
    'dataFix'         => ModuleDataFixInterface::class,
    'footer'          => ModuleFooterInterface::class,
    'historicEvents'  => ModuleHistoricEventsInterface::class,
    'language'        => ModuleLanguageInterface::class,
    'list'            => ModuleListInterface::class,
    'mapAutocomplete' => ModuleMapAutocompleteInterface::class,
    'mapGeoLocation'  => ModuleMapGeoLocationInterface::class,
    'mapLink'         => ModuleMapLinkInterface::class,
    'mapProvider'     => ModuleMapProviderInterface::class,
    'menu'            => ModuleMenuInterface::class,
    'report'          => ModuleReportInterface::class,
    'share'           => ModuleShareInterface::class,
    'sidebar'         => ModuleSidebarInterface::class,
    'tab'             => ModuleTabInterface::class,
    'theme'           => ModuleThemeInterface::class,
    'config'          => ModuleConfigInterface::class,
];

// Mirrors ModuleService::COMPONENTS - "other" modules are exactly
// those implementing NONE of these (ModuleConfigInterface/
// ModuleCustomInterface are NOT in this list, matching real PHP).
$component_keys = ['analytics', 'block', 'chart', 'dataFix', 'footer', 'historicEvents', 'language', 'list', 'mapAutocomplete', 'mapLink', 'mapProvider', 'mapGeoLocation', 'menu', 'report', 'share', 'sidebar', 'tab', 'theme'];

$reflection     = new ReflectionClass(ModuleService::class);
$core_modules   = $reflection->getConstant('CORE_MODULES');

$rows = [];

foreach ($core_modules as $module_name => $class) {
    $class_reflection = new ReflectionClass($class);
    $categories       = [];

    foreach ($interfaces as $key => $interface) {
        if ($class_reflection->implementsInterface($interface)) {
            $categories[] = $key;
        }
    }

    $is_other = true;

    foreach ($component_keys as $key) {
        if (in_array($key, $categories, true)) {
            $is_other = false;
            break;
        }
    }

    if ($is_other) {
        $categories[] = 'other';
    }

    $rows[$module_name] = $categories;
}

echo "// Generated by bin/characterize_control_panel_modules.php - do not hand-edit.\n";
echo "// module_name -> array of category keys (see that script for the full list).\n";
echo "export const MODULE_CATEGORIES = {\n";

foreach ($rows as $module_name => $categories) {
    $categories_js = implode(', ', array_map(static fn (string $c): string => "'" . $c . "'", $categories));
    echo "  '" . $module_name . "': [" . $categories_js . "],\n";
}

echo "};\n";
