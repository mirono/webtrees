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

// Port of app/SurnameTradition/LithuanianSurnameTradition.php.
// See docs/php-to-js-migration/task-05-surname-tradition-subclasses.md,
// and patrilineal.js's inflect() for the Unicode \b fix this depends on
// (INFLECT_MALE's 'aitė\b'/'ytė\b'/'iūtė\b'/'utė\b' all end right after a
// non-ASCII letter — exactly the case that fix targets, verified directly
// against PHP: '/Petraitytė/' -> '/Petraitis/' for 'ytė\b' -> 'is').
//
// Unlike Patrilineal/Paternal/Matrilineal, none of this class's three
// methods delegate to their parent class on a no-match fallback — each
// has its own self-contained '//' fallback, exactly mirroring the PHP
// source (which calls neither parent:: nor a shared helper here).

import { REGEX_SURN } from './default.js';
import { VALUE_BIRTH, VALUE_MARRIED } from './name-type.js';
import { PaternalSurnameTradition } from './paternal.js';

const INFLECT_WIFE = [
  ['as\\b', 'ienė'],
  ['is\\b', 'ienė'],
  ['ys\\b', 'ienė'],
  ['us\\b', 'ienė'],
];

const INFLECT_DAUGHTER = [
  ['a\\b', 'aitė'],
  ['as\\b', 'aitė'],
  ['is\\b', 'ytė'],
  ['ys\\b', 'ytė'],
  ['ius\\b', 'iūtė'],
  ['us\\b', 'utė'],
];

const INFLECT_MALE = [
  ['aitė\\b', 'as'],
  ['ytė\\b', 'is'],
  ['iūtė\\b', 'ius'],
  ['utė\\b', 'us'],
];

export class LithuanianSurnameTradition extends PaternalSurnameTradition {
  /**
   * The name of this surname tradition.
   */
  name() {
    return this.i18n.translateContext('Surname tradition', 'Lithuanian');
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
      this.i18n.translate('Surnames are inflected to indicate an individual’s sex and marital status.')
    );
  }

  /**
   * What name is given to a new child.
   */
  // eslint-disable-next-line no-unused-vars
  newChildNames(father, mother, sex) {
    const match = this.extractName(father).match(REGEX_SURN);

    if (match) {
      let name;
      let surn;

      if (sex === 'F') {
        name = this.inflect(match.groups.NAME, INFLECT_DAUGHTER);
        surn = this.inflect(match.groups.SURN, INFLECT_MALE);
      } else {
        name = match.groups.NAME;
        surn = match.groups.SURN;
      }

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
      const name = this.inflect(match.groups.NAME, INFLECT_WIFE);
      const surn = this.inflect(match.groups.SURN, INFLECT_MALE);

      return [
        this.buildName('//', { TYPE: VALUE_BIRTH }),
        this.buildName(name, { TYPE: VALUE_MARRIED, SURN: surn }),
      ];
    }

    return [this.buildName('//', { TYPE: VALUE_BIRTH })];
  }
}
