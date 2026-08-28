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

// Port of app/SurnameTradition/IcelandicSurnameTradition.php.
// See docs/php-to-js-migration/task-05-surname-tradition-subclasses.md.
//
// The reverse-lookup regexes (~(?<GIVN>[^ /]+)(:?sson)$~ /
// ~(?<GIVN>[^ /]+)(:?sdottir)$~) require the raw NAME value to literally
// END in the suffix — Icelandic GEDCOM NAME values in this tradition are
// typically unslashed (e.g. "Jon Bjornsson", not "Jon /Bjornsson/",
// matching defaultName() being '' and newChildNames() building names with
// no surrounding //). Verified directly: a slash-wrapped name never
// matches (golden case 'slashed_never_matches'), which is correct PHP
// behavior, not a JS porting bug — don't "fix" this if you see it.
//
// Also preserves PHP's `(:?sson)`/`(:?sdottir)` capturing groups exactly
// as written (an apparent typo for `(?:sson)` non-capturing groups) —
// confirmed behaviorally identical to the "intended" form for every
// realistic name (no genealogical name contains a literal ':' before the
// suffix), so faithfully porting the literal source is both correct and
// harmless here.

import { DefaultSurnameTradition, REGEX_GIVN } from './default.js';
import { VALUE_BIRTH } from './name-type.js';

const REGEX_SSON = /(?<GIVN>[^ /]+)(:?sson)$/;
const REGEX_SDOTTIR = /(?<GIVN>[^ /]+)(:?sdottir)$/;

export class IcelandicSurnameTradition extends DefaultSurnameTradition {
  /**
   * The name of this surname tradition.
   */
  name() {
    return this.i18n.translateContext('Surname tradition', 'Icelandic');
  }

  /**
   * A short description of this surname tradition.
   */
  description() {
    return this.i18n.translate('Children take a patronym instead of a surname.');
  }

  /**
   * A default/empty name.
   */
  defaultName() {
    return '';
  }

  /**
   * What name is given to a new child.
   */
  // eslint-disable-next-line no-unused-vars
  newChildNames(father, mother, sex) {
    const match = this.extractName(father).match(REGEX_GIVN);

    if (match) {
      if (sex === 'M') {
        const givn = match.groups.GIVN + 'sson';

        return [this.buildName(givn, { TYPE: VALUE_BIRTH, GIVN: givn })];
      }

      if (sex === 'F') {
        const givn = match.groups.GIVN + 'sdottir';

        return [this.buildName(givn, { TYPE: VALUE_BIRTH, GIVN: givn })];
      }
    }

    return [this.buildName('', { TYPE: VALUE_BIRTH })];
  }

  /**
   * What name is given to a new parent.
   */
  newParentNames(child, sex) {
    if (sex === 'M') {
      const match = this.extractName(child).match(REGEX_SSON);

      if (match) {
        return [this.buildName(match.groups.GIVN, { TYPE: VALUE_BIRTH, GIVN: match.groups.GIVN })];
      }
    }

    if (sex === 'F') {
      const match = this.extractName(child).match(REGEX_SDOTTIR);

      if (match) {
        return [this.buildName(match.groups.GIVN, { TYPE: VALUE_BIRTH, GIVN: match.groups.GIVN })];
      }
    }

    return [this.buildName('', { TYPE: VALUE_BIRTH })];
  }

  /**
   * What names are given to a new spouse. Always fixed — ignores $spouse
   * entirely, same as the PHP source.
   */
  // eslint-disable-next-line no-unused-vars
  newSpouseNames(spouse, sex) {
    return [this.buildName('', { TYPE: VALUE_BIRTH })];
  }
}
