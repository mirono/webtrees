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

// Port of app/Soundex.php's russell()/compare() (American/Russell Soundex).
// See docs/php-to-js-migration/task-01-soundex-russell.md.
//
// Deviations from PHP, both confirmed against golden/soundex_russell.json
// and golden/soundex_compare.json (PHP 8.5.9, PHP's built-in soundex()):
// - soundexWord() below is a from-scratch reimplementation of PHP's
//   built-in soundex() C function — there is no JS equivalent to call.
//   Matches PHP 8.3-8.6 behavior exactly, including returning '0000' (not
//   '') for input with no ASCII letters (case index 9, 10, 11 in the
//   golden file) — this differs from some documented/older-PHP behavior,
//   but is what this repo's supported PHP range actually does.
// - Non-ASCII letters (accents, etc.) are dropped entirely, not
//   transliterated, matching PHP (case index 13 'é' -> '', case index 14
//   'Müller' -> 'M460', same as plain 'Muller').

const SOUNDEX_CODES = {
  B: '1', F: '1', P: '1', V: '1',
  C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
  D: '3', T: '3',
  L: '4',
  M: '5', N: '5',
  R: '6',
};

/**
 * Reimplementation of PHP's built-in soundex() (American Soundex).
 * Non-letter/non-ASCII characters are ignored entirely (not transliterated).
 * Always returns exactly 4 characters, or '0000' if the input has no
 * recognisable letters at all.
 *
 * Note: unlike the commonly-cited textbook description of Soundex, PHP's
 * built-in soundex() does NOT treat H/W as transparent to the "same digit
 * as the previous letter" collapse rule — it resets the comparison on
 * every non-coded letter (vowels AND H/W alike), so e.g. "ASHC" produces
 * two '2' digits (A220), not one, exactly like "ASAC" would. Verified by
 * probing PHP directly (soundex('ASHC') === soundex('ASAC') === 'A220',
 * while soundex('ASC') === 'A200') and cross-checked against every case in
 * golden/soundex_russell.json, including the classic Ashcraft/Ashcroft
 * (A226), Robert/Rupert (R163), and the collapse-vs-no-collapse cases.
 */
function soundexWord(word) {
  const letters = word.toUpperCase().replace(/[^A-Z]/g, '');

  if (letters === '') {
    return '0000';
  }

  let code = letters[0];
  let lastDigit = SOUNDEX_CODES[letters[0]] ?? '';

  for (let i = 1; i < letters.length && code.length < 4; i++) {
    const digit = SOUNDEX_CODES[letters[i]] ?? '';

    if (digit !== '' && digit !== lastDigit) {
      code += digit;
    }

    lastDigit = digit;
  }

  return (code + '000').slice(0, 4);
}

/**
 * Generate Russell soundex codes for a given text.
 */
export function russell(text) {
  const words = text.split(' ');
  let soundexArray = [];

  for (const word of words) {
    const soundex = soundexWord(word);

    // Only return codes from recognisable sounds
    if (soundex !== '0000') {
      soundexArray.push(soundex);
    }
  }

  // Combine words, e.g. "New York" as "Newyork"
  if (words.length > 1) {
    soundexArray.push(soundexWord(text.split(' ').join('')));
  }

  // A varchar(255) column can only hold 51 4-character codes (plus 50 delimiters)
  soundexArray = [...new Set(soundexArray)].slice(0, 51);

  return soundexArray.join(':');
}

/**
 * Is there a match between two soundex codes?
 */
export function compare(soundex1, soundex2) {
  if (soundex1 !== '' && soundex2 !== '') {
    const codes1 = soundex1.split(':');
    const codes2 = new Set(soundex2.split(':'));

    return codes1.some((code) => codes2.has(code));
  }

  return false;
}

// --- Daitch-Mokotoff Soundex ---------------------------------------------
// Port of app/Soundex.php's daitchMokotoff()/daitchMokotoffWord().
// See docs/php-to-js-migration/task-02-soundex-daitch-mokotoff.md.

// TRANSFORM_NAMES/DM_SOUNDS/MAXCHAR are generated verbatim from the live
// PHP constants via reflection (bin/generate_soundex_dm_tables.php) — not
// hand-transcribed, so there is nothing to diff for dropped entries.
import { MAXCHAR, TRANSFORM_NAMES, DM_SOUNDS as DM_SOUNDS_TABLE } from './soundex-dm-tables.js';

// A Map (rather than plain-object `in`/property lookup) sidesteps any
// prototype-chain surprises (e.g. a table key that happened to collide
// with 'constructor' or '__proto__') regardless of what the generated
// table contains.
const DM_SOUNDS = new Map(Object.entries(DM_SOUNDS_TABLE));

// The 18-entry Unicode script-range table behind I18N::textScript()
// (app/I18N.php:82-165, SCRIPT_CHARACTER_RANGES), ported verbatim. Only
// used here to reproduce daitchMokotoff()'s noVowels check ($name_script
// === 'Hebr' || 'Arab'), but ported in full (not simplified to just
// Hebrew/Arabic) since it's small and this is more faithful than guessing
// which ranges matter.
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

const NOMEN_NESCIO = '@N.N.';
const PRAENOMEN_NESCIO = '@P.N.';

/**
 * Port of I18N::textScript() (app/I18N.php:446-489). Returns the Unicode
 * script of the first recognised character in the string (scanning left to
 * right — a string starting with Latin text returns 'Latn' even if
 * non-Latin text follows later), or 'Latn' if the string is empty or has
 * no recognised character at all. Matches PHP's byte-scanning version case
 * for case for every golden/i18n_textscript.json input (Latin, Hebrew,
 * Arabic, CJK, Cyrillic, Greek, empty, HTML tags/entities, and the
 * NOMEN_NESCIO placeholder).
 *
 * Two narrow, documented simplifications versus the PHP source (both
 * operate before the actual script scan, and are only there to strip
 * "noise" so it doesn't get miscounted as Latin — golden/i18n_textscript.json
 * only exercises the basic &amp;-style/tag cases, not PHP's full named-entity
 * table):
 * - Tag stripping uses a regex (`<[^>]*>`) rather than PHP's strip_tags().
 * - Entity decoding only handles numeric refs (&#NNN;/&#xHHH;) and the five
 *   basic named entities (&amp; &lt; &gt; &quot; &apos;/&#039;), not PHP's
 *   full HTML named-entity table.
 */
export function textScript(string) {
  let s = string
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  s = s.split(NOMEN_NESCIO).join('').split(PRAENOMEN_NESCIO).join('');

  for (const char of s) {
    const codePoint = char.codePointAt(0);

    for (const [script, min, max] of SCRIPT_CHARACTER_RANGES) {
      if (codePoint >= min && codePoint <= max) {
        return script;
      }
    }
  }

  return 'Latn';
}

/**
 * Port of I18N::strtoupper() (app/I18N.php:535-542), simplified.
 *
 * PHP's version is locale-aware: under Turkish/Azerbaijani locales it maps
 * lowercase dotless i (ı) to 'I' and dotted i to 'İ' before calling
 * mb_strtoupper(); under every other locale (including this app's default,
 * en-US) it's plain mb_strtoupper(). This JS port has no concept of "the
 * current locale" (the JS module isn't wired into the app's i18n system at
 * all yet), so it always behaves like the non-Turkish/Azerbaijani case —
 * confirmed identical to PHP under en-US via golden/i18n_strtoupper.json.
 *
 * Known, accepted divergence (documented, not implemented): under a
 * Turkish or Azerbaijani locale, PHP's I18N::strtoupper('istanbul') returns
 * 'İSTANBUL' (dotted capital İ); this port always returns 'ISTANBUL', like
 * JS's native toUpperCase(). Verified directly: PHP with I18N::init('tr',
 * true) returns 'İSTANBUL' for the same input. Not fixed here — doing so
 * would require plumbing the app's active locale into this module, which
 * is out of scope for this task (see task-02-soundex-daitch-mokotoff.md's
 * "Dependencies to bridge" section). Follow-up task if/when this port
 * needs to run under a Turkish/Azerbaijani install.
 */
export function strtoupper(string) {
  return string.toUpperCase();
}

/**
 * Reimplementation of Soundex::daitchMokotoffWord() (app/Soundex.php).
 *
 * Deliberate unit change from the PHP source, verified not to affect
 * output: PHP operates on the string's raw UTF-8 *bytes* (strlen/substr
 * are byte-oriented; the MAXCHAR=7 cap is explicitly documented as "in
 * ASCII bytes -- NOT in UTF-8 characters"). This port operates on JS
 * string *characters* (UTF-16 code units) instead — natural for a JS
 * string, and every character in TRANSFORM_NAMES/DM_SOUNDS/this algorithm's
 * inputs is within the Basic Multilingual Plane (Hebrew U+0590-05FF, Arabic
 * U+0600-06FF, etc.), so there's no surrogate-pair mismatch. Since the
 * algorithm always advances position by exactly the matched entry's own
 * length (never a hardcoded byte count) and MAXCHAR is only an upper bound
 * for the initial greedy lookup (real table keys are 1-2 characters), using
 * character length instead of byte length everywhere is self-consistent
 * and produces identical results — confirmed against every case in
 * golden/soundex_daitch_mokotoff.json, including the Hebrew/Arabic cases
 * that actually exercise multi-byte input.
 */
function daitchMokotoffWord(name) {
  let word = strtoupper(name);

  for (const [from, to] of TRANSFORM_NAMES) {
    word = word.split(from).join(to);
  }

  const nameScript = textScript(word);
  const noVowels = nameScript === 'Hebr' || nameScript === 'Arab';

  const lastPos = word.length - 1;
  let currPos = 0;
  let state = 1; // 1: start of input string, 2: before vowel, 3: other
  const result = [];
  let partialResult = [['!']];

  while (partialResult.length !== 0 && currPos <= lastPos) {
    let thisEntry = word.slice(currPos, currPos + MAXCHAR);
    while (thisEntry !== '' && !DM_SOUNDS.has(thisEntry)) {
      thisEntry = thisEntry.slice(0, -1);
    }
    if (thisEntry === '') {
      currPos++;
      continue;
    }

    const soundTableEntry = DM_SOUNDS.get(thisEntry);
    const workingResult = partialResult;
    partialResult = [];
    currPos += thisEntry.length;

    if (state !== 1) {
      let nextEntry = '';
      if (currPos <= lastPos) {
        nextEntry = word.slice(currPos, currPos + MAXCHAR);
        while (nextEntry !== '' && !DM_SOUNDS.has(nextEntry)) {
          nextEntry = nextEntry.slice(0, -1);
        }
      }
      if (nextEntry !== '' && DM_SOUNDS.get(nextEntry)[0] !== '0') {
        state = 2;
      } else {
        state = 3;
      }
    }

    while (state < soundTableEntry.length) {
      if (soundTableEntry[state] === '') {
        for (const workingEntry of workingResult) {
          const tempEntry = [...workingEntry];
          tempEntry[tempEntry.length - 1] += '!';
          partialResult.push(tempEntry);
        }
      } else {
        for (const workingEntry of workingResult) {
          let entry = workingEntry;
          if (soundTableEntry[state] !== entry[entry.length - 1]) {
            entry = [...entry, soundTableEntry[state]];
          } else if (noVowels) {
            entry = [...entry, soundTableEntry[state]];
          }

          if (entry.length < 7) {
            partialResult.push(entry);
          } else {
            const tempResult = entry.join('').split('!').join('');
            if (tempResult !== '') {
              result.push((tempResult + '000000').slice(0, 6));
            }
          }
        }
      }
      state += 3;
    }
  }

  for (const workingEntry of partialResult) {
    const tempResult = workingEntry.join('').split('!').join('');
    if (tempResult !== '') {
      result.push((tempResult + '000000').slice(0, 6));
    }
  }

  return result;
}

/**
 * Generate Daitch-Mokotoff soundex codes for a given text.
 */
export function daitchMokotoff(text) {
  const words = text.split(' ');
  let soundexArray = [];

  for (const word of words) {
    soundexArray = soundexArray.concat(daitchMokotoffWord(word));
  }
  // Combine words, e.g. "New York" as "Newyork"
  if (words.length > 1) {
    soundexArray = soundexArray.concat(daitchMokotoffWord(text.split(' ').join('')));
  }

  // A varchar(255) column can only hold 36 6-character codes (plus 35 delimiters)
  soundexArray = [...new Set(soundexArray)].slice(0, 36);

  return soundexArray.join(':');
}
