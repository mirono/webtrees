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

import { ANSEL } from '../encodings/ansel.js';
import { ASCII } from '../encodings/ascii.js';
import { CP437 } from '../encodings/cp437.js';
import { CP850 } from '../encodings/cp850.js';
import { ISO88591 } from '../encodings/iso88591.js';
import { ISO88592 } from '../encodings/iso88592.js';
import { MacRoman } from '../encodings/mac-roman.js';
import { UTF16BE } from '../encodings/utf16be.js';
import { UTF16LE } from '../encodings/utf16le.js';
import { UTF8 } from '../encodings/utf8.js';
import { Windows1250 } from '../encodings/windows1250.js';
import { Windows1251 } from '../encodings/windows1251.js';
import { Windows1252 } from '../encodings/windows1252.js';
import { phpStrtr } from '../php-compat/strtr.js';

/**
 * Thrown when a GEDCOM header names a character set detect() doesn't
 * recognize. Mirrors app/Exceptions/InvalidGedcomEncodingException.php.
 */
export class InvalidGedcomEncodingException extends Error {
  constructor(characterSet) {
    super(characterSet);
    this.name = 'InvalidGedcomEncodingException';
  }
}

// PHP's ltrim($str) (no second argument) strips this exact character
// class from the start of the string: space, tab, newline, CR, NUL, and
// vertical tab.
function phpLtrim(text) {
  return text.replace(/^[ \t\n\r\0\x0B]+/, '');
}

/**
 * Create an encoding object.
 * Ported from app/Factories/EncodingFactory.php (task 16).
 */
export class EncodingFactory {
  /**
   * Detect an encoding from a GEDCOM header record (a byte string — see
   * lib/encodings/abstract-encoding.js for the byte-string convention).
   */
  detect(header) {
    const utfBom = [
      [UTF8.BYTE_ORDER_MARK, UTF8.NAME],
      [UTF16BE.BYTE_ORDER_MARK, UTF16BE.NAME],
      [UTF16LE.BYTE_ORDER_MARK, UTF16LE.NAME],
    ];

    for (const [bom, encoding] of utfBom) {
      if (header.startsWith(bom)) {
        return this.make(encoding);
      }
    }

    const utf16 = [
      ['\x000', UTF16BE.NAME],
      ['0\x00', UTF16LE.NAME],
    ];

    for (const [start, encoding] of utf16) {
      if (header.startsWith(start)) {
        return this.make(encoding);
      }
    }

    // Standardize whitespace to simplify matching.
    header = phpStrtr(phpLtrim(header), { '\r\n': '\n', '\n\r': '\n', '\r': '\n' });

    while (header.includes('\n ') || header.includes(' \n') || header.includes('  ')) {
      header = phpStrtr(header, { '\n ': '\n', ' \n': '\n', '  ': ' ' });
    }

    // We need a complete header record.
    const zeroPos = header.indexOf('\n0');

    if (zeroPos === -1) {
      return null;
    }

    header = header.slice(0, zeroPos);

    // Some of these come from Tamura Jones, the rest from webtrees users.
    const characterSets = [
      ['ASCII', ASCII.NAME],
      ['ANSEL', ANSEL.NAME],
      ['UTF-8', UTF8.NAME],
      ['UNICODE', UTF8.NAME], // If the null byte test failed, this can't be UTF16
      ['ASCII/MacOS Roman', MacRoman.NAME], // GEDitCOM
      ['ASCII/MACINTOSH', MacRoman.NAME], // MacFamilyTree < 8.3.5
      ['MACINTOSH', MacRoman.NAME], // MacFamilyTree >= 8.3.5
      ['CP437', CP437.NAME],
      ['IBMPC', CP437.NAME],
      ['IBM', CP437.NAME], // Reunion
      ['IBM-PC', CP437.NAME], // CumberlandFamilyTree
      ['OEM', CP437.NAME], // Généatique
      ['CP850', CP850.NAME],
      ['MSDOS', CP850.NAME],
      ['IBM-DOS', CP850.NAME], // Reunion, EasyTree
      ['MS-DOS', CP850.NAME], // AbrEdit FTM for Windows
      ['ANSI', CP850.NAME],
      ['WINDOWS', CP850.NAME], // Parentele
      ['IBM WINDOWS', CP850.NAME], // EasyTree, Généalogie, Reunion, TribalPages
      ['IBM_WINDOWS', CP850.NAME], // EasyTree
      ['CP1250', Windows1250.NAME],
      ['windows-1250', Windows1250.NAME], // GenoPro, Rodokmen Pro
      ['CP1251', Windows1251.NAME],
      ['WINDOWS-1251', Windows1251.NAME], // Rodovid
      ['CP1252', Windows1252.NAME], // Lifelines
      ['ISO-8859-1', ISO88591.NAME], // Cumberland Family Tree, Lifelines
      ['ISO8859-1', ISO88591.NAME], // Scion Genealogist
      ['ISO8859', ISO88591.NAME], // Genealogica Grafica
      ['LATIN-1', ISO88591.NAME],
      ['LATIN1', ISO88591.NAME], // GenealogyJ
      ['ISO-8859-2', ISO88592.NAME],
      ['ISO8859-2', ISO88592.NAME],
      ['LATIN-2', ISO88592.NAME],
      ['LATIN2', ISO88592.NAME],
    ];

    for (const [pattern, encoding] of characterSets) {
      let regex;
      if (pattern.includes('/')) {
        const [char, vers] = pattern.split('/');
        regex = new RegExp('\\n1 CHAR ' + escapeRegExp(char) + '\\n2 VERS ' + escapeRegExp(vers), 'i');
      } else {
        regex = new RegExp('\\n1 CHAR(?:ACTER)? ' + escapeRegExp(pattern), 'i');
      }

      if (regex.test(header)) {
        return this.make(encoding);
      }
    }

    const match = header.match(/1 CHAR (.+)/);
    if (match !== null) {
      throw new InvalidGedcomEncodingException(match[1]);
    }

    return this.make(UTF8.NAME);
  }

  /**
   * Create a named encoding.
   */
  make(name) {
    switch (name) {
      case UTF8.NAME:
        return new UTF8();
      case UTF16BE.NAME:
        return new UTF16BE();
      case UTF16LE.NAME:
        return new UTF16LE();
      case ANSEL.NAME:
        return new ANSEL();
      case ASCII.NAME:
        return new ASCII();
      case CP437.NAME:
        return new CP437();
      case CP850.NAME:
        return new CP850();
      case Windows1250.NAME:
        return new Windows1250();
      case Windows1251.NAME:
        return new Windows1251();
      case Windows1252.NAME:
        return new Windows1252();
      case MacRoman.NAME:
        return new MacRoman();
      case ISO88591.NAME:
        return new ISO88591();
      case ISO88592.NAME:
        return new ISO88592();
      default:
        throw new Error('Invalid encoding: ' + name);
    }
  }

  /**
   * A list of supported encodings and their names.
   */
  list() {
    return {
      [UTF8.NAME]: 'UTF-8',
      [UTF16BE.NAME]: 'UTF-16BE',
      [UTF16LE.NAME]: 'UTF-16LE',
      [ANSEL.NAME]: 'ANSEL',
      [ASCII.NAME]: 'ASCII',
      [ISO88591.NAME]: 'ISO-8859-1',
      [ISO88592.NAME]: 'ISO-8859-2',
      [Windows1250.NAME]: 'Windows 1250',
      [Windows1251.NAME]: 'Windows 1251',
      [Windows1252.NAME]: 'Windows 1252',
      [CP437.NAME]: 'CP437',
      [CP850.NAME]: 'CP850',
      [MacRoman.NAME]: 'MacOS Roman',
    };
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
