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

// Port of app/Services/GedcomExportService.php::wrapLongLines() (task 19).
//
// Splits GEDCOM lines exceeding a max length into CONT/CONC continuation
// lines per the GEDCOM 5.5.1 spec. Operates on real Unicode text (codepoint
// indexing, matching PHP's mb_strlen()/mb_substr() — not the byte-string
// convention lib/encodings/ uses, since this works on already-decoded
// GEDCOM text, not raw transfer-encoding bytes).
//
// One simplification, verified equivalent rather than assumed: PHP's
// give-up check compares the (character-indexed) split position against
// `strpos($line, ' ', 3)` — a BYTE-indexed search, mixing units with the
// otherwise character-indexed $pos. This only matters if the line contains
// multi-byte characters at or before the tag-value separator space, which
// never happens for well-formed GEDCOM (level number + a fixed ASCII tag
// keyword always precede it) — confirmed with a dedicated multi-byte
// golden case. This port uses a single character-indexed search
// throughout.
//
// A real bug found, NOT reproduced: for a small max_line_length combined
// with a value that is entirely spaces, PHP's walk-back loop
// (`while (mb_substr($line, $pos - 1, 1) === ' ')`) can decrement $pos
// past 0 into negative indices, where mb_substr's negative-start
// wraparound (counting from the end of the string) can keep finding
// spaces forever — verified by hanging and killing the real PHP process
// for max_line_length 1-5 with an all-space value. This never happens at
// the one real call site (GedcomExportService always passes the constant
// Gedcom::LINE_LENGTH = 253), so it's a latent, unreachable-in-practice
// defect, not a live bug like task 16's UTF-16 findings — and unlike
// those, there's no finite output to faithfully match: a test that
// "reproduces" an infinite loop would also hang forever.
//
// This port gives up whenever the walk-back would reach or pass the
// tag-value separator (`pos <= giveUpPos`), not only on an exact match
// (`pos === giveUpPos`). For every input where PHP terminates, the
// walk-back always stops exactly AT that separator (it can only stop
// earlier by hitting a non-space character first, in which case neither
// version gives up) — so `<=` and `===` agree on every real case tested,
// including every give-up case in the golden fixture. `<=` additionally
// catches the pathological case before `pos` would go negative, so this
// converges to PHP's real output everywhere PHP produces one, and never
// hangs where PHP would. See
// docs/php-to-js-migration/task-19-wrap-long-lines.md.

function mbStrlen(text) {
  return Array.from(text).length;
}

/**
 * PHP's explode($separator, $text, $limit) with a positive limit: split on
 * every occurrence, but stop after $limit elements, leaving the remainder
 * (still containing $separator) as the last element.
 */
function phpExplodeLimit(separator, text, limit) {
  const parts = text.split(separator);

  if (parts.length <= limit) {
    return parts;
  }

  return [...parts.slice(0, limit - 1), parts.slice(limit - 1).join(separator)];
}

/**
 * Index (by character, not byte — see the file-level note above) of the
 * first space in `chars` at or after `from`, or -1 if none exists.
 */
function indexOfSpaceFrom(chars, from) {
  for (let i = from; i < chars.length; i++) {
    if (chars[i] === ' ') {
      return i;
    }
  }

  return -1;
}

/**
 * @param {string} gedcom
 * @param {number} maxLineLength
 * @returns {string}
 */
export function wrapLongLines(gedcom, maxLineLength) {
  const lines = [];

  for (let line of gedcom.split('\n')) {
    // Split long lines
    // The total length of a GEDCOM line, including level number, cross-reference number,
    // tag, value, delimiters, and terminator, must not exceed 255 (wide) characters.
    if (mbStrlen(line) > maxLineLength) {
      const [levelPart, tag] = phpExplodeLimit(' ', line, 3);
      let level = levelPart;
      if (tag !== 'CONT') {
        level = String(Number(level) + 1);
      }

      let chars = Array.from(line);
      do {
        // Split after pos chars
        let pos = maxLineLength;
        // Split on a non-space (standard gedcom behavior)
        while (pos > 0 && chars[pos - 1] === ' ') {
          --pos;
        }

        const giveUpPos = indexOfSpaceFrom(chars, 3);
        if (pos <= giveUpPos || pos <= 0) {
          // No non-spaces in the data! Can't split it :-(
          break;
        }

        lines.push(chars.slice(0, pos).join(''));
        line = level + ' CONC ' + chars.slice(pos).join('');
        chars = Array.from(line);
      } while (mbStrlen(line) > maxLineLength);
    }

    lines.push(line);
  }

  return lines.join('\n');
}
