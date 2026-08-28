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

// Port of app/SurnameTradition/SpanishSurnameTradition.php.
// See docs/php-to-js-migration/task-05-surname-tradition-subclasses.md and
// portuguese.js's header — same shape (switch-with-no-default fallthrough
// in newParentNames()), but SURN1 (not SURN2) is the father's contributed
// surname, and the child/parent name assembly order is reversed relative
// to Portuguese — both differences preserved exactly from the PHP source,
// not "fixed" to match Portuguese.

import { DefaultSurnameTradition, REGEX_SURNS } from './default.js';
import { VALUE_BIRTH } from './name-type.js';

export class SpanishSurnameTradition extends DefaultSurnameTradition {
  /**
   * The name of this surname tradition.
   */
  name() {
    return this.i18n.translateContext('Surname tradition', 'Spanish');
  }

  /**
   * A short description of this surname tradition.
   */
  description() {
    return this.i18n.translate('Children take one surname from the father and one surname from the mother.');
  }

  /**
   * A default/empty name.
   */
  defaultName() {
    return '// //';
  }

  /**
   * What name is given to a new child.
   */
  newChildNames(father, mother, sex) {
    const fatherMatch = this.extractName(father).match(REGEX_SURNS);
    const fatherSurname = fatherMatch ? fatherMatch.groups.SURN1 : '';

    const motherMatch = this.extractName(mother).match(REGEX_SURNS);
    const motherSurname = motherMatch ? motherMatch.groups.SURN1 : '';

    return [
      this.buildName(`/${fatherSurname}/ /${motherSurname}/`, {
        TYPE: VALUE_BIRTH,
        SURN: `${fatherSurname},${motherSurname}`.replace(/^,+|,+$/g, ''),
      }),
    ];
  }

  /**
   * What name is given to a new parent.
   */
  newParentNames(child, sex) {
    const match = this.extractName(child).match(REGEX_SURNS);

    if (match && sex === 'M') {
      return [this.buildName(`/${match.groups.SURN1}/ //`, { TYPE: VALUE_BIRTH, SURN: match.groups.SURN1 })];
    }

    if (match && sex === 'F') {
      return [this.buildName(`/${match.groups.SURN2}/ //`, { TYPE: VALUE_BIRTH, SURN: match.groups.SURN2 })];
    }

    return [this.buildName('// //', { TYPE: VALUE_BIRTH })];
  }

  /**
   * What names are given to a new spouse. Always fixed — ignores $spouse
   * entirely, same as the PHP source.
   */
  // eslint-disable-next-line no-unused-vars
  newSpouseNames(spouse, sex) {
    return [this.buildName('// //', { TYPE: VALUE_BIRTH })];
  }
}
