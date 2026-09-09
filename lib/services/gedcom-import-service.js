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

// Port of app/Services/GedcomImportService.php::reformatRecord() (task 21).
// Tidies up a raw GEDCOM record on import, for consistent/efficient access.
//
// Takes plain preference values instead of a Tree object (same shim-
// adapter pattern used for Age, task 15): `preferences.gedcomMediaPath`
// and `preferences.wordWrappedNotes` stand in for
// Tree::getPreference('GEDCOM_MEDIA_PATH') / ('WORD_WRAPPED_NOTES'). Both
// are accepted as raw strings, matching Tree::getPreference()'s actual
// return type, and PHP string-truthiness is applied internally (see
// phpTruthy() below) rather than asking the caller to pre-convert.
//
// Two real bugs found during characterization, faithfully reproduced (not
// fixed) — see docs/php-to-js-migration/task-21-reformat-record.md:
//
// 1. The "suppress Y for a fact with a DATE/PLAC sub-record" lookahead
//    never checks the *last* line of the record (`i < numMatches - 1`
//    excludes the final index). If a "Y" fact's only DATE/PLAC sub-line is
//    also the record's last line, the Y is incorrectly kept.
// 2. That same lookahead compares against the RAW captured tag, not the
//    canonicalized one — even though the outer loop canonicalizes every
//    tag it processes. GedcomService.canonicalTag('PLACE') === 'PLAC', so
//    a "Y" fact followed by a non-canonical "PLACE" sub-line (which DOES
//    become canonical "PLAC" in the output) is nonetheless NOT suppressed.
//
// Also verified (not a bug, a real ordering quirk): TMG's "EITHER X OR Y"
// only converts to "BET X AND Y" when there's no calendar escape prefix —
// the conversion regex is anchored to the start of the (space-padded)
// date string, and calendar-escape repositioning happens in a later step,
// so "@#DJULIAN@ EITHER X OR Y" is left completely unconverted.

import { canonicalTag } from './gedcom-service.js';

const LINE_RE = /^[ \t]*(\d+)[ \t]*(@[^@]*@)?[ \t]*(\w+)[ \t]?(.*)$/gm;

/**
 * PHP's trim($str, ' '): strips only literal space characters (not tabs,
 * newlines, etc.) from both ends. Used by the "default" reassembly bucket.
 */
function trimSpaces(text) {
  return text.replace(/^ +/, '').replace(/ +$/, '');
}

/**
 * PHP's trim($str) with no second argument: strips its default charlist
 * (space, tab, newline, CR, NUL, vertical tab) from both ends. Used only
 * by the NAME case, which is a distinct step from (and runs before) the
 * "default" reassembly bucket's own trimSpaces() pass — NAME data is
 * trimmed/collapsed twice in the real PHP, once by each switch.
 */
function phpTrimDefault(text) {
  const charClass = '[ \\t\\n\\r\\0\\x0B]';
  return text.replace(new RegExp(`^${charClass}+`), '').replace(new RegExp(`${charClass}+$`), '');
}

/**
 * PHP's string truthiness: '' and '0' are falsy, everything else
 * (including '0.0', ' ', or any other non-empty text) is truthy.
 */
function phpTruthy(value) {
  return value !== '' && value !== '0';
}

/**
 * PHP's round($value, 4): round-half-away-from-zero. Only ever called
 * here with non-negative values (degrees/minutes/seconds), where that's
 * identical to round-half-up.
 */
function round4(value) {
  return Math.round(value * 10000) / 10000;
}

function appendLine(newrec, level, xref, tag, data) {
  const prefix = newrec ? '\n' : '';
  const xrefPart = level === '0' && xref ? xref + ' ' : '';
  const dataPart = data === '' && tag !== 'NOTE' ? '' : ' ' + data;

  return newrec + prefix + level + ' ' + xrefPart + tag + dataPart;
}

/**
 * @param {string} rec
 * @param {{gedcomMediaPath?: string, wordWrappedNotes?: string}} [preferences]
 * @returns {string}
 */
export function reformatRecord(rec, preferences = {}) {
  const gedcomMediaPath = preferences.gedcomMediaPath ?? '';
  const wordWrappedNotes = preferences.wordWrappedNotes ?? '';

  // Strip out mac/msdos line endings
  rec = rec.replace(/[\r\n]+/g, '\n');

  // Extract lines from the record; lines consist of: level + optional xref + tag + optional data
  const matches = [...rec.matchAll(LINE_RE)];
  const numMatches = matches.length;

  // Process the record line-by-line
  let newrec = '';
  for (let n = 0; n < numMatches; n++) {
    const match = matches[n];
    const level = match[1];
    let xref = match[2] ?? '';
    let tag = canonicalTag(match[3]);
    let data = match[4] ?? '';

    switch (tag) {
      case 'DATE': {
        // Preserve text from INT dates
        let date, text;
        const parenIndex = data.indexOf('(');
        if (parenIndex !== -1) {
          date = data.slice(0, parenIndex);
          text = ' (' + data.slice(parenIndex + 1);
        } else {
          date = data;
          text = '';
        }
        // Capitals
        date = date.toUpperCase();
        // Temporarily add leading/trailing spaces, to allow efficient matching below
        date = ' ' + date + ' ';
        // Ensure space digits and letters
        date = date.replace(/([A-Z])(\d)/g, '$1 $2');
        date = date.replace(/(\d)([A-Z])/g, '$1 $2');
        // Ensure space before/after calendar escapes
        date = date.replace(/@#[^@]+@/g, ' $& ');
        // "BET." => "BET"
        date = date.replace(/(\w\w)\./g, '$1');
        // "CIR" => "ABT"
        date = date.replaceAll(' CIR ', ' ABT ');
        date = date.replaceAll(' APX ', ' ABT ');
        // B.C. => BC (temporarily, to allow easier handling of ".")
        date = date.replaceAll(' B.C. ', ' BC ');
        // TMG uses "EITHER X OR Y"
        date = date.replace(/^ EITHER (.+) OR (.+)/g, ' BET $1 AND $2');
        // "BET X - Y " => "BET X AND Y"
        date = date.replace(/^(.* BET .+) - (.+)/g, '$1 AND $2');
        date = date.replace(/^(.* FROM .+) - (.+)/g, '$1 TO $2');
        // "@#ESC@ FROM X TO Y" => "FROM @#ESC@ X TO @#ESC@ Y"
        date = date.replace(/^ +(@#[^@]+@) +FROM +(.+) +TO +(.+)/g, ' FROM $1 $2 TO $1 $3');
        date = date.replace(/^ +(@#[^@]+@) +BET +(.+) +AND +(.+)/g, ' BET $1 $2 AND $1 $3');
        // "@#ESC@ AFT X" => "AFT @#ESC@ X"
        date = date.replace(/^ +(@#[^@]+@) +(FROM|BET|TO|AND|BEF|AFT|CAL|EST|INT|ABT) +(.+)/g, ' $2 $1 $3');
        // Ignore any remaining punctuation, e.g. "14-MAY, 1900" => "14 MAY 1900"
        // (don't change "/" - it is used in NS/OS dates)
        date = date.replace(/[.,:;-]/g, ' ');
        // BC => B.C.
        date = date.replaceAll(' BC ', ' B.C. ');
        // Append the "INT" text
        data = date + text;
        break;
      }
      case 'HEAD':
      case 'TRLR':
        // HEAD and TRLR records do not have an XREF or DATA
        if (level === '0') {
          xref = '';
          data = '';
        }
        break;
      case 'NAME':
        // Tidy up non-printing characters
        data = phpTrimDefault(data).replace(/ {2,}/g, ' ');
        break;
      case 'PLAC': {
        // Consistent commas
        data = data.replace(/ *[,，،] */g, ', ');
        // The Master Genealogist stores LAT/LONG data in the PLAC field, e.g. Pennsylvania, USA, 395945N0751013W
        const placeMatch = data.match(/^(.*), (\d\d)(\d\d)(\d\d)([NS])(\d\d\d)(\d\d)(\d\d)([EW])$/);
        if (placeMatch !== null) {
          const degns = parseInt(placeMatch[2], 10);
          const minns = parseInt(placeMatch[3], 10);
          const secns = parseInt(placeMatch[4], 10);
          const degew = parseInt(placeMatch[6], 10);
          const minew = parseInt(placeMatch[7], 10);
          const secew = parseInt(placeMatch[8], 10);
          const levelNum = parseInt(level, 10);
          data =
            placeMatch[1] +
            '\n' +
            (1 + levelNum) +
            ' MAP\n' +
            (2 + levelNum) +
            ' LATI ' +
            (placeMatch[5] + round4(degns + minns / 60 + secns / 3600)) +
            '\n' +
            (2 + levelNum) +
            ' LONG ' +
            (placeMatch[9] + round4(degew + minew / 60 + secew / 3600));
        }
        break;
      }
      case 'SEX':
        data = data.toUpperCase();
        break;
    }

    // Suppress "Y", for facts/events with a DATE or PLAC
    if (data === 'y') {
      data = 'Y';
    }
    if (level === '1' && data === 'Y') {
      for (let i = n + 1; i < numMatches - 1 && matches[i][1] !== '1'; ++i) {
        if (matches[i][3] === 'DATE' || matches[i][3] === 'PLAC') {
          data = '';
          break;
        }
      }
    }

    // Reassemble components back into a single line
    switch (tag) {
      case 'NOTE':
      case 'TEXT':
      case 'DATA':
      case 'CONT':
        newrec = appendLine(newrec, level, xref, tag, data);
        break;
      case 'FILE':
        // Strip off the user-defined path prefix
        if (gedcomMediaPath !== '' && data.startsWith(gedcomMediaPath)) {
          data = data.slice(gedcomMediaPath.length);
        }
        // convert backslashes in filenames to forward slashes
        data = data.replace(/\\/g, '/');

        newrec = appendLine(newrec, level, xref, tag, data);
        break;
      case 'CONC':
        // Merge CONC lines, to simplify access later on.
        newrec += (phpTruthy(wordWrappedNotes) ? ' ' : '') + data;
        break;
      default: {
        // Remove tabs and multiple/leading/trailing spaces
        data = data.replaceAll('\t', ' ');
        data = trimSpaces(data);
        while (data.includes('  ')) {
          data = data.replaceAll('  ', ' ');
        }
        newrec = appendLine(newrec, level, xref, tag, data);
        break;
      }
    }
  }

  return newrec;
}
