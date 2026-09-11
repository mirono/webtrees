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

// Port of app/Report/GedcomTextReader.php's getSubRecord() and getCont()
// (task 22). getGedcomValue() (the third method in that file) is NOT
// ported — it calls Registry::noteFactory()->make(), a DB-backed NOTE
// cross-reference lookup, same trap category as other Registry-coupled
// methods excluded throughout this migration.
//
// Two real, verified findings (both stem from the same root assumption:
// this code was written assuming GEDCOM nesting never reaches 10 levels).
// Faithfully reproduced, not fixed:
//
// 1. getSubRecord()'s end-of-record boundary search is a literal
//    substring search for "\n" + level (e.g. "\n1"), not a properly
//    delimited number. A deeply-nested line whose level number merely
//    *starts* with the same digit (level 10, 11, ...) is incorrectly
//    treated as the boundary, silently truncating the sub-record and
//    losing legitimate nested content that follows it. Verified: a level-1
//    sub-record containing a level-10 line (with more nested content
//    after it) gets cut off right before that line, discarding everything
//    from there on.
// 2. getCont()'s level-prefix check is `substr($line, 0, 2) !== level+' '`
//    — always exactly 2 characters — so it can never recognize a level
//    10+ prefix (which needs 3+ characters). CONT lines at level 10+ are
//    never found, full stop, regardless of what level is requested.

// PHP's trim()/ltrim() with no charlist: strip this exact default set
// (space, tab, newline, CR, NUL, vertical tab) — not JS's broader \s.
function phpTrim(text) {
  return text.replace(/^[ \t\n\r\0\x0B]+/, '').replace(/[ \t\n\r\0\x0B]+$/, '');
}

function phpLtrim(text) {
  return text.replace(/^[ \t\n\r\0\x0B]+/, '');
}

/**
 * Extract a sub-record from a GEDCOM record string.
 *
 * @param {number} level  The level of the sub-record to find
 * @param {string} tag    The level+tag prefix to search for (e.g. "1 BIRT")
 * @param {string} gedrec The GEDCOM record to search within
 * @param {number} [num]  Which occurrence to return (1-based)
 * @returns {string}
 */
export function getSubRecord(level, tag, gedrec, num = 1) {
  if (gedrec === '') {
    return '';
  }

  // Adding \n before and after gedrec to simplify boundary matching
  gedrec = '\n' + gedrec + '\n';
  tag = phpTrim(tag);

  const searchTarget = new RegExp('[\\n]' + tag + '[\\s]', 'g');
  const matches = [...gedrec.matchAll(searchTarget)];

  if (matches.length < num) {
    return '';
  }

  const startPosition = matches[num - 1].index;
  let endPosition = gedrec.indexOf('\n' + level, startPosition + 1);

  if (endPosition === -1) {
    endPosition = gedrec.indexOf('\n1', startPosition + 1);
  }

  if (endPosition === -1) {
    return phpLtrim(gedrec.slice(startPosition));
  }

  const subrecord = gedrec.slice(startPosition, endPosition);

  return phpLtrim(subrecord);
}

/**
 * Get CONT lines from a GEDCOM sub-record.
 *
 * Extracts and merges all CONT continuation lines at the given level,
 * returning them as a single string with newlines preserved.
 *
 * @param {number} level  The level of the CONT lines to extract
 * @param {string} record The GEDCOM sub-record to search within
 * @returns {string}
 */
export function getCont(level, record) {
  let text = '';

  for (const line of record.split('\n')) {
    if (line.slice(0, 2) !== level + ' ') {
      continue;
    }

    const subrecordType = line.slice(2, 6);

    if (subrecordType === 'CONT') {
      text += '\n' + line.slice(7);
    }
  }

  return text;
}
