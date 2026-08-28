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

// Port of app/SurnameTradition/PolishSurnameTradition.php.
// See docs/php-to-js-migration/task-05-surname-tradition-subclasses.md and
// lithuanian.js's header — same shape (self-contained '//' fallbacks, no
// delegation to the parent class), same Unicode \b dependency in
// patrilineal.js's inflect() (INFLECT_FEMALE/INFLECT_MALE both end in
// 'żki\b'/'żka\b', right after a non-ASCII letter).

import { REGEX_SURN } from './default.js';
import { VALUE_BIRTH, VALUE_MARRIED } from './name-type.js';
import { PaternalSurnameTradition } from './paternal.js';

const INFLECT_FEMALE = [
  ['cki\\b', 'cka'],
  ['dzki\\b', 'dzka'],
  ['ski\\b', 'ska'],
  ['żki\\b', 'żka'],
];

const INFLECT_MALE = [
  ['cka\\b', 'cki'],
  ['dzka\\b', 'dzki'],
  ['ska\\b', 'ski'],
  ['żka\\b', 'żki'],
];

export class PolishSurnameTradition extends PaternalSurnameTradition {
  /**
   * The name of this surname tradition.
   */
  name() {
    return this.i18n.translateContext('Surname tradition', 'Polish');
  }

  /**
   * A short description of this surname tradition.
   */
  description() {
    return (
      this.i18n.translate('Children take their father’s surname.') +
      ' ' +
      this.i18n.translate('Wives take their husband’s surname.') +
      ' ' +
      this.i18n.translate('Surnames are inflected to indicate an individual’s sex.')
    );
  }

  /**
   * What name is given to a new child.
   */
  // eslint-disable-next-line no-unused-vars
  newChildNames(father, mother, sex) {
    const match = this.extractName(father).match(REGEX_SURN);

    if (match) {
      const name = this.inflect(match.groups.NAME, sex === 'F' ? INFLECT_FEMALE : INFLECT_MALE);
      const surn = this.inflect(match.groups.SURN, INFLECT_MALE);

      return [this.buildName(name, { TYPE: VALUE_BIRTH, SURN: surn })];
    }

    return [this.buildName('//', { TYPE: VALUE_BIRTH })];
  }

  /**
   * What name is given to a new parent.
   */
  newParentNames(child, sex) {
    const match = sex === 'M' ? this.extractName(child).match(REGEX_SURN) : null;

    if (match) {
      const name = this.inflect(match.groups.NAME, INFLECT_MALE);
      const surn = this.inflect(match.groups.SURN, INFLECT_MALE);

      return [this.buildName(name, { TYPE: VALUE_BIRTH, SURN: surn })];
    }

    return [this.buildName('//', { TYPE: VALUE_BIRTH })];
  }

  /**
   * What names are given to a new spouse.
   */
  newSpouseNames(spouse, sex) {
    const match = sex === 'F' ? this.extractName(spouse).match(REGEX_SURN) : null;

    if (match) {
      const name = this.inflect(match.groups.NAME, INFLECT_FEMALE);
      const surn = this.inflect(match.groups.SURN, INFLECT_MALE);

      return [
        this.buildName('//', { TYPE: VALUE_BIRTH }),
        this.buildName(name, { TYPE: VALUE_MARRIED, SURN: surn }),
      ];
    }

    return [this.buildName('//', { TYPE: VALUE_BIRTH })];
  }
}
