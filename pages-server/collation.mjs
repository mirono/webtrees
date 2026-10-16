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

// Locale/collation helpers behind FamilyListModule (and, later,
// IndividualListModule): app/I18N.php's static helpers plus
// app/Module/ModuleLanguageTrait.php's default (no-override)
// implementation - this install has no language setting configured
// anywhere (confirmed via the DB: no `wt_site_setting`/`wt_gedcom_setting`
// row for it), so `I18N::language()` always resolves to a language
// module with NO override of normalize()/initialLetter()/alphabet()
// (LanguageEnglishUnitedStates and friends only override locale()/
// relationships() - confirmed by reading the real class). That default
// trait implementation turns out NOT to need ICU at all: normalize() is
// plain Unicode NFKD decomposition + stripping combining marks (a
// standard JS String.prototype.normalize('NFKD') call), initialLetter()
// is just the first Unicode character, and alphabet() is a fixed A-Z
// array. I18N::compare() DOES want ICU collation - ported here via
// Intl.Collator, which Node provides directly (full-icu is Node's
// default build, unlike PHP's optional `intl` extension) - a real
// equivalent, not an approximation.
//
// Deliberately NOT ported: per-language normalizeExceptions()/locale()
// overrides for any OTHER language module (Hebrew, Russian, etc.) -
// this tree's real content includes non-English text (e.g. Hebrew
// repository names, confirmed in earlier list-route work), but the
// install's own UI language is English, so `I18N::language()` is
// ALWAYS the English module regardless of a record's own content
// script - textScript() below (used for primary-name selection, not
// collation) is the one place content script actually matters, and
// that IS ported, as it has nothing to do with the active UI locale.

const COLLATOR = new Intl.Collator('en-US');

/**
 * Mirrors ModuleLanguageTrait::normalize() (app/Module/ModuleLanguageTrait.php:91-106)
 * for the default (no normalizeExceptions() override) case: NFKD-decompose,
 * then strip all remaining Unicode combining marks.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalize(text) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '');
}

/**
 * Mirrors ModuleLanguageTrait::initialLetter() (app/Module/ModuleLanguageTrait.php:83-86):
 * `mb_substr($string, 0, 1)` - the first Unicode character (not byte).
 *
 * @param {string} string
 * @returns {string}
 */
export function initialLetter(string) {
  return [...string][0] ?? '';
}

/**
 * Mirrors ModuleLanguageTrait::alphabet() (app/Module/ModuleLanguageTrait.php:41-71) -
 * the default (no override) A-Z array, which is what every language module this
 * install actually uses (LanguageEnglish*) resolves to.
 *
 * @returns {string[]}
 */
export function alphabet() {
  return [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  ];
}

/**
 * Mirrors I18N::compare() (app/I18N.php:492-501) - locale-aware
 * collation via an ICU Collator (Node ships full ICU, so this is a
 * real equivalent of PHP's `Collator::compare()`, not the strcmp()
 * fallback PHP uses when the `intl` extension is unavailable).
 *
 * @param {string} first
 * @param {string} second
 * @returns {number}
 */
export function compare(first, second) {
  return COLLATOR.compare(first, second);
}

/**
 * Mirrors I18N::strtoupper() (app/I18N.php:517-525) for the
 * non-dotless-i-locale case (this install is always en-US) - plain
 * Unicode-aware uppercasing.
 *
 * @param {string} string
 * @returns {string}
 */
export function strtoupper(string) {
  return string.toUpperCase();
}

// Mirrors I18N.php's private SCRIPT_CHARACTER_RANGES table
// (app/I18N.php:82-171) exactly - used only by textScript() below.
const SCRIPT_CHARACTER_RANGES = [
  ['Latn', 0x0041, 0x005a],
  ['Latn', 0x0061, 0x007a],
  ['Latn', 0x0100, 0x02af],
  ['Grek', 0x0370, 0x03ff],
  ['Cyrl', 0x0400, 0x052f],
  ['Hebr', 0x0590, 0x05ff],
  ['Arab', 0x0600, 0x06ff],
  ['Arab', 0x0750, 0x077f],
  ['Arab', 0x08a0, 0x08ff],
  ['Deva', 0x0900, 0x097f],
  ['Taml', 0x0b80, 0x0bff],
  ['Sinh', 0x0d80, 0x0dff],
  ['Thai', 0x0e00, 0x0e7f],
  ['Geor', 0x10a0, 0x10ff],
  ['Grek', 0x1f00, 0x1fff],
  ['Deva', 0xa8e0, 0xa8ff],
  ['Hans', 0x3000, 0x303f],
  ['Hans', 0x3400, 0xfaff],
  ['Hans', 0x20000, 0x2fa1f],
];

/**
 * Mirrors I18N::textScript() (app/I18N.php:446-488) - identifies the
 * Unicode script of the first recognized letter in a string, 'Latn' if
 * none is found (same default PHP falls back to). Unlike PHP's manual
 * UTF-8 byte-walk (needed because PHP strings are byte arrays), this
 * iterates actual Unicode code points directly via `[...string]` - the
 * same algorithm, simpler expression. HTML-tag/entity stripping and the
 * NOMEN_NESCIO/PRAENOMEN_NESCIO placeholder removal PHP does first are
 * omitted: this is called on plain extracted name text (sort key),
 * never raw HTML, in every real caller in this codebase.
 *
 * @param {string} string
 * @returns {string}
 */
export function textScript(string) {
  for (const char of string) {
    const codePoint = char.codePointAt(0);

    for (const [script, min, max] of SCRIPT_CHARACTER_RANGES) {
      if (codePoint >= min && codePoint <= max) {
        return script;
      }
    }
  }

  return 'Latn';
}
