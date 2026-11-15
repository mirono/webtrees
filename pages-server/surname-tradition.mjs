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

// Mirrors SurnameTraditionFactory::make() (app/Factories/SurnameTraditionFactory.php) -
// maps a tree's SURNAME_TRADITION preference string to the right
// `lib/surname-tradition/*.js` instance (phase 4 already ported and
// parity-tested all 9 native traditions; this is just the first
// pages-server/ consumer of them, for editing Phase C's "add a
// relative" routes). An unrecognized key falls back to Default, same
// as real PHP's own `?? new BridgedSurnameTradition(new
// DefaultSurnameTradition(), self::DEFAULT)`.
//
// name()/description() are never called here (Phase C doesn't build
// the SURNAME_TRADITION preference-picker UI, just consumes the
// tree's already-chosen value) - the injected i18n object is a
// trivial identity stub, not real translation, since its output is
// never read.

import { DefaultSurnameTradition } from '../lib/surname-tradition/default.js';
import { PatrilinealSurnameTradition } from '../lib/surname-tradition/patrilineal.js';
import { PaternalSurnameTradition } from '../lib/surname-tradition/paternal.js';
import { MatrilinealSurnameTradition } from '../lib/surname-tradition/matrilineal.js';
import { PortugueseSurnameTradition } from '../lib/surname-tradition/portuguese.js';
import { SpanishSurnameTradition } from '../lib/surname-tradition/spanish.js';
import { PolishSurnameTradition } from '../lib/surname-tradition/polish.js';
import { LithuanianSurnameTradition } from '../lib/surname-tradition/lithuanian.js';
import { IcelandicSurnameTradition } from '../lib/surname-tradition/icelandic.js';

const IDENTITY_I18N = { translate: (s) => s, translateContext: (_c, s) => s };

const TRADITION_CLASSES = {
  paternal: PaternalSurnameTradition,
  patrilineal: PatrilinealSurnameTradition,
  matrilineal: MatrilinealSurnameTradition,
  portuguese: PortugueseSurnameTradition,
  spanish: SpanishSurnameTradition,
  polish: PolishSurnameTradition,
  lithuanian: LithuanianSurnameTradition,
  icelandic: IcelandicSurnameTradition,
  '': DefaultSurnameTradition,
};

/**
 * @param {string} key The tree's SURNAME_TRADITION preference value.
 * @returns {import('../lib/surname-tradition/default.js').DefaultSurnameTradition}
 */
export function surnameTraditionFor(key) {
  const SurnameTraditionClass = TRADITION_CLASSES[key] ?? DefaultSurnameTradition;
  return new SurnameTraditionClass(IDENTITY_I18N);
}

/**
 * Converts a record's raw GEDCOM into the plain `{tag, type, value}[]`
 * NAME-fact array `extractName()` expects (mirrors
 * BridgedSurnameTradition::toNameFacts(), minus the HTTP round-trip -
 * this port calls the native class directly, so there is no bridge).
 *
 * @param {string|null} gedcom Full record GEDCOM, or null (absent individual).
 * @returns {Array<{tag: string, type: string, value: string}>}
 */
export function toNameFacts(gedcom) {
  if (gedcom === null || gedcom === undefined) {
    return [];
  }

  const facts = [];

  for (const match of gedcom.matchAll(/^1 NAME ?(.*)((?:\n[2-9].*)*)/gm)) {
    const value = match[1];
    const typeMatch = /\n2 TYPE (.+)/.exec(match[2]);

    facts.push({ tag: 'NAME', type: typeMatch ? typeMatch[1] : '', value });
  }

  return facts;
}
