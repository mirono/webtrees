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

// Port of app/SurnameTradition/PatrilinealSurnameTradition.php.
// See docs/php-to-js-migration/task-05-surname-tradition-subclasses.md.
//
// PHP's REGEX_SPFX_SURN has no /u (Unicode) modifier — PCRE byte-mode
// matching. Verified this doesn't produce observably different results
// than a natural Unicode-aware JS regex for any realistic name (including
// one containing U+2019 RIGHT SINGLE QUOTATION MARK, golden case
// 'apostrophe') — see default.js's REGEX_SPFX_SURN export, which uses the
// /u flag. Documented as an accepted simplification, not silently ignored.

import { DefaultSurnameTradition, REGEX_SPFX_SURN } from './default.js';
import { VALUE_BIRTH } from './name-type.js';

export class PatrilinealSurnameTradition extends DefaultSurnameTradition {
  /**
   * The name of this surname tradition.
   */
  name() {
    return this.i18n.translate('patrilineal');
  }

  /**
   * A short description of this surname tradition.
   */
  description() {
    return this.i18n.translate('Children take their father’s surname.');
  }

  /**
   * What name is given to a new child.
   */
  newChildNames(father, mother, sex) {
    const match = this.extractName(father).match(REGEX_SPFX_SURN);

    if (match) {
      const { NAME: name, SPFX: spfx, SURN: surn } = match.groups;

      return [this.buildName(name, { TYPE: VALUE_BIRTH, SPFX: spfx, SURN: surn })];
    }

    return super.newChildNames(father, mother, sex);
  }

  /**
   * What name is given to a new parent.
   */
  newParentNames(child, sex) {
    const match = sex === 'M' ? this.extractName(child).match(REGEX_SPFX_SURN) : null;

    if (match) {
      const { NAME: name, SPFX: spfx, SURN: surn } = match.groups;

      return [this.buildName(name, { TYPE: VALUE_BIRTH, SPFX: spfx, SURN: surn })];
    }

    return super.newParentNames(child, sex);
  }

  /**
   * Inflect a name using a table of regex-suffix -> replacement rules,
   * applied in order (later rules can act on earlier rules' output).
   *
   * PHP builds each pattern as `~$from~u` (Unicode mode) from a plain
   * string key, e.g. 'ytė\b', and calls preg_replace() — which replaces
   * ALL matches, not just the first, hence the JS 'g' flag below.
   *
   * PHP's `\b` under `/u` is Unicode-aware: it treats accented letters
   * like 'ė' as word characters. JS's `\b` is always ASCII-only, even
   * with the 'u' flag — verified directly: PHP's preg_replace('~ytė\b~u',
   * 'is', '/Petraitytė/') correctly produces '/Petraitis/', but the
   * equivalent JS `'/Petraitytė/'.replace(/ytė\b/gu, 'is')` silently does
   * NOT match at all (JS's \b sees no boundary between 'ė' and '/', since
   * neither is an ASCII word character to it). Every inflection table in
   * this codebase uses \b only as a trailing boundary (end of the matched
   * suffix) — cross-checked against every rule in Patrilineal/Lithuanian/
   * Polish's INFLECT_* tables, not just the one case above — so a
   * trailing `\b` is rewritten to an equivalent Unicode-aware negative
   * lookahead before building the RegExp.
   *
   * @param {string} name
   * @param {Array<[string, string]>} inflections [fromPattern, to] pairs
   */
  inflect(name, inflections) {
    let result = name;

    for (const [from, to] of inflections) {
      const pattern = from.replace(/\\b$/, '(?![\\p{L}\\p{N}_])');
      result = result.replace(new RegExp(pattern, 'gu'), to);
    }

    return result;
  }
}
