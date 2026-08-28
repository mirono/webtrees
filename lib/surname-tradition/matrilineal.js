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

// Port of app/SurnameTradition/MatrilinealSurnameTradition.php.
// See docs/php-to-js-migration/task-05-surname-tradition-subclasses.md.

import { DefaultSurnameTradition, REGEX_SPFX_SURN } from './default.js';
import { VALUE_BIRTH } from './name-type.js';

export class MatrilinealSurnameTradition extends DefaultSurnameTradition {
  /**
   * The name of this surname tradition.
   */
  name() {
    return this.i18n.translate('matrilineal');
  }

  /**
   * A short description of this surname tradition.
   */
  description() {
    return this.i18n.translate('Children take their mother’s surname.');
  }

  /**
   * What name is given to a new child.
   */
  newChildNames(father, mother, sex) {
    const match = this.extractName(mother).match(REGEX_SPFX_SURN);

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
    const match = sex === 'F' ? this.extractName(child).match(REGEX_SPFX_SURN) : null;

    if (match) {
      const { NAME: name, SPFX: spfx, SURN: surn } = match.groups;

      return [this.buildName(name, { TYPE: VALUE_BIRTH, SPFX: spfx, SURN: surn })];
    }

    return super.newParentNames(child, sex);
  }
}
