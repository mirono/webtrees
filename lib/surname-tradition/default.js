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

// Port of app/SurnameTradition/DefaultSurnameTradition.php.
// See docs/php-to-js-migration/task-04-surname-tradition-default.md for the
// two bridging decisions this port follows (read before touching this
// file, and before porting any of the 8 SurnameTradition subclasses):
//
// 1. extractName() takes a plain array of NAME-fact objects shaped
//    { tag, type, value } instead of a full Individual domain object —
//    Individual/Fact are NOT ported. This is the actual data dependency;
//    Individual is just how PHP happens to carry it.
// 2. name()/description() take an injected { translate, translateContext }
//    object via the constructor instead of importing an i18n module —
//    this class is runnable in JS today without the i18n system existing.
//    Only the literal keys/context passed to translate matter here
//    (verified against the PHP source, not characterized at runtime,
//    since translated output depends on locale): name() calls
//    translateContext('Surname tradition', 'none'); description() calls
//    nothing and always returns ''.

import { VALUE_BIRTH } from './name-type.js';

// Declared for the 8 SurnameTradition subclasses that extend this one
// (PatrilinealSurnameTradition etc. — ported in the follow-on batch, see
// docs/php-to-js-migration/task-05-surname-tradition-subclasses.md).
// DefaultSurnameTradition itself never uses these; confirmed by reading
// the PHP source, and by the grep-for-usage check below being empty
// within this class's own methods.
export const REGEX_GIVN = /^(?<GIVN>[^/ ]+)/;
export const REGEX_SPFX_SURN = /(?<NAME>\/(?<SPFX>[a-z’']{0,4}(?: [a-z’']{1,4})*) ?(?<SURN>[^/]*)\/)/u;
export const REGEX_SURN = /(?<NAME>\/(?<SURN>[^/]+)\/)/;
export const REGEX_SURNS = /\/(?<SURN1>[^ /]+)(?: | y |\/ \/|\/ y \/)(?<SURN2>[^ /]+)\//;

export class DefaultSurnameTradition {
  constructor(i18n) {
    this.i18n = i18n;
  }

  /**
   * The name of this surname tradition.
   */
  name() {
    return this.i18n.translateContext('Surname tradition', 'none');
  }

  /**
   * A short description of this surname tradition.
   */
  description() {
    return '';
  }

  /**
   * A default/empty name.
   */
  defaultName() {
    return '//';
  }

  /**
   * What name is given to a new child.
   */
  // eslint-disable-next-line no-unused-vars
  newChildNames(father, mother, sex) {
    return [this.buildName('//', { TYPE: VALUE_BIRTH })];
  }

  /**
   * What name is given to a new parent.
   */
  // eslint-disable-next-line no-unused-vars
  newParentNames(child, sex) {
    return [this.buildName('//', { TYPE: VALUE_BIRTH })];
  }

  /**
   * What names are given to a new spouse.
   */
  // eslint-disable-next-line no-unused-vars
  newSpouseNames(spouse, sex) {
    return [this.buildName('//', { TYPE: VALUE_BIRTH })];
  }

  /**
   * Build a GEDCOM name record.
   *
   * PHP's array_filter($parts) with no callback drops every falsy value —
   * not just '', but also the string '0' (PHP's classic falsy-string
   * gotcha). Confirmed by characterization: buildName('John /Smith/',
   * ['TYPE' => '0']) drops the TYPE line entirely, same as ['TYPE' => ''].
   * isPhpFalsy() below replicates that rule explicitly rather than relying
   * on JS truthiness, which would only drop '' (not '0').
   */
  buildName(name, parts) {
    const filteredEntries = Object.entries(parts).filter(([, value]) => !isPhpFalsy(value));
    const lines = filteredEntries.map(([tag, value]) => `\n2 ${tag} ${value}`).join('');

    if (name === '') {
      return '1 NAME' + lines;
    }

    return '1 NAME ' + name + lines;
  }

  /**
   * Extract an individual's name from a plain array of NAME-fact objects
   * (see the bridging decision at the top of this file) — not a real
   * Individual. Returns the value of the first fact whose type is '',
   * 'BIRTH', or 'CHANGE' (matching NameType::VALUE_BIRTH/VALUE_CHANGE,
   * verified against app/Elements/NameType.php), or '' if there's no
   * match, the array is empty, or nameFacts is null/undefined.
   *
   * @param {Array<{tag: string, type: string, value: string}>|null|undefined} nameFacts
   */
  extractName(nameFacts) {
    if (!nameFacts) {
      return '';
    }

    const fact = nameFacts.find((f) => f.type === '' || f.type === 'BIRTH' || f.type === 'CHANGE');

    return fact ? fact.value : '';
  }
}

/**
 * PHP's `(bool) $value` for strings: everything is truthy except '' and
 * '0'. Used by buildName() to replicate array_filter()'s no-callback
 * behavior exactly.
 */
function isPhpFalsy(value) {
  return value === '' || value === '0';
}
