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

// Port of app/Services/GedcomService.php.
// See docs/php-to-js-migration/task-13-gedcom-service.md.

// Some applications, such as FTM, use GEDCOM tag names instead of the tags.
// Copied verbatim from the PHP source (app/Services/GedcomService.php:30-152).
const TAG_NAMES = {
  'ABBREVIATION': 'ABBR',
  'ADDRESS': 'ADDR',
  'ADDRESS1': 'ADR1',
  'ADDRESS2': 'ADR2',
  'ADDRESS3': 'ADR3',
  'ADOPTION': 'ADOP',
  'AGENCY': 'AGNC',
  'ALIAS': 'ALIA',
  'ANCESTORS': 'ANCE',
  'ANCES_INTEREST': 'ANCI',
  'ANULMENT': 'ANUL',
  'ASSOCIATES': 'ASSO',
  'AUTHOR': 'AUTH',
  'BAPTISM-LDS': 'BAPL',
  'BAPTISM': 'BAPM',
  'BAR_MITZVAH': 'BARM',
  'BAS_MITZVAH': 'BASM',
  'BIRTH': 'BIRT',
  'BLESSING': 'BLES',
  'BURIAL': 'BURI',
  'CALL_NUMBER': 'CALN',
  'CASTE': 'CAST',
  'CAUSE': 'CAUS',
  'CENSUS': 'CENS',
  'CHANGE': 'CHAN',
  'CHARACTER': 'CHAR',
  'CHILD': 'CHIL',
  'CHRISTENING': 'CHR',
  'ADULT_CHRISTENING': 'CHRA',
  'CONCATENATION': 'CONC',
  'CONFIRMATION': 'CONF',
  'CONFIRMATION-LDS': 'CONL',
  'CONTINUED': 'CONT',
  'COPYRIGHT': 'COPY',
  'CORPORTATE': 'CORP',
  'CREMATION': 'CREM',
  'COUNTRY': 'CTRY',
  'DEATH': 'DEAT',
  'DESCENDANTS': 'DESC',
  'DESCENDANTS_INT': 'DESI',
  'DESTINATION': 'DEST',
  'DIVORCE': 'DIV',
  'DIVORCE_FILED': 'DIVF',
  'PHY_DESCRIPTION': 'DSCR',
  'EDUCATION': 'EDUC',
  'EMIGRATION': 'EMIG',
  'ENDOWMENT': 'ENDL',
  'ENGAGEMENT': 'ENGA',
  'EVENT': 'EVEN',
  'FAMILY': 'FAM',
  'FAMILY_CHILD': 'FAMC',
  'FAMILY_FILE': 'FAMF',
  'FAMILY_SPOUSE': 'FAMS',
  'FACIMILIE': 'FAX',
  'FIRST_COMMUNION': 'FCOM',
  'FORMAT': 'FORM',
  'PHONETIC': 'FONE',
  'GEDCOM': 'GEDC',
  'GIVEN_NAME': 'GIVN',
  'GRADUATION': 'GRAD',
  'HEADER': 'HEAD',
  'HUSBAND': 'HUSB',
  'IDENT_NUMBER': 'IDNO',
  'IMMIGRATION': 'IMMI',
  'INDIVIDUAL': 'INDI',
  'LANGUAGE': 'LANG',
  'LATITUDE': 'LATI',
  'LONGITUDE': 'LONG',
  'MARRIAGE_BANN': 'MARB',
  'MARR_CONTRACT': 'MARC',
  'MARR_LICENSE': 'MARL',
  'MARRIAGE': 'MARR',
  'MEDIA': 'MEDI',
  'NATIONALITY': 'NATI',
  'NATURALIZATION': 'NATU',
  'CHILDREN_COUNT': 'NCHI',
  'NICKNAME': 'NICK',
  'MARRIAGE_COUNT': 'NMR',
  'NAME_PREFIX': 'NPFX',
  'NAME_SUFFIX': 'NSFX',
  'OBJECT': 'OBJE',
  'OCCUPATION': 'OCCU',
  'ORDINANCE': 'ORDI',
  'ORDINATION': 'ORDN',
  'PEDIGREE': 'PEDI',
  'PHONE': 'PHON',
  'PLACE': 'PLAC',
  'POSTAL_CODE': 'POST',
  'PROBATE': 'PROB',
  'PROPERTY': 'PROP',
  'PUBLICATION': 'PUBL',
  'QUALITY_OF_DATA': 'QUAY',
  'REFERENCE': 'REFN',
  'RELATIONSHIP': 'RELA',
  'RELIGION': 'RELI',
  'REPOSITORY': 'REPO',
  'RESIDENCE': 'RESI',
  'RESTRICTION': 'RESN',
  'RETIREMENT': 'RETI',
  'REC_FILE_NUMBER': 'RFN',
  'REC_ID_NUMBER': 'RIN',
  'ROMANIZED': 'ROMN',
  'SEALING_CHILD': 'SLGC',
  'SEALING_SPOUSE': 'SLGS',
  'SOURCE': 'SOUR',
  'SURN_PREFIX': 'SPFX',
  'SOC_SEC_NUMBER': 'SSN',
  'STATE': 'STAE',
  'STATUS': 'STAT',
  'SUBMITTER': 'SUBM',
  'SUBMISSION': 'SUBN',
  'SURNAME': 'SURN',
  'TEMPLE': 'TEMP',
  'TITLE': 'TITL',
  'TRAILER': 'TRLR',
  'VERSION': 'VERS',
  'WEB': 'WWW',
  '_DEATH_OF_SPOUSE': 'DETS',
  '_DEGREE': '_DEG',
  '_MEDICAL': '_MCL',
  '_MILITARY_SERVICE': '_MILT',
};

// Custom GEDCOM tags used by other applications, with direct synonyms.
// Copied verbatim from the PHP source (app/Services/GedcomService.php:155-159).
const TAG_SYNONYMS = {
  '_PGVU': '_WT_USER',
  '_PGV_OBJS': '_WT_OBJE_SORT',
};

// PHP's is_numeric() numeric-string grammar: optional sign, digits with an
// optional decimal point (or a leading decimal point), optional exponent —
// with optional surrounding whitespace (PHP 8+ allows both leading and
// trailing). Deliberately NOT `!isNaN(Number(x))`: verified via direct PHP
// execution that `Number()`/`isNaN()` disagrees with `is_numeric()` for
// hex strings ('0x1A' -> Number() parses it as 26, PHP says false) and the
// JS-specific numeric literals 'Infinity'/'-Infinity'/'NaN' (Number()
// parses them, PHP says false for all three) — a real divergence risk for
// arbitrary user-supplied GEDCOM text, not just a theoretical one.
const PHP_NUMERIC_STRING = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Check if a string value is numeric, matching PHP's is_numeric() behavior.
 */
function isNumeric(value) {
  const trimmed = String(value).trim();
  return PHP_NUMERIC_STRING.test(trimmed);
}

/**
 * Convert a GEDCOM tag to a canonical form.
 * Port of GedcomService::canonicalTag().
 */
export function canonicalTag(tag) {
  tag = tag.toUpperCase();
  tag = TAG_NAMES[tag] ?? TAG_SYNONYMS[tag] ?? tag;
  return tag;
}

/**
 * Read latitude from a GEDCOM latitude string.
 * Port of GedcomService::readLatitude().
 */
export function readLatitude(text) {
  return readDegrees(text, 'N', 'S');
}

/**
 * Read longitude from a GEDCOM longitude string.
 * Port of GedcomService::readLongitude().
 */
export function readLongitude(text) {
  return readDegrees(text, 'E', 'W');
}

/**
 * Parse GEDCOM coordinate format: hemisphere marker followed by degrees.
 * Matches PHP's GedcomService::readDegrees().
 *
 * PHP's is_numeric() behavior faithfully reproduced:
 * - Accepts leading/trailing whitespace
 * - Accepts scientific notation (e.g., '1e3')
 * - Accepts +/- signs
 * - Rejects malformed numbers (e.g., '12.5.6')
 * - Rejects empty strings
 *
 * Edge cases preserved from PHP:
 * - Empty input: both hemisphere and degrees become '', both non-numeric -> null
 * - Single character (e.g., '5'): hemisphere='5', degrees='', falls through to
 *   bare-number check on original text '5' -> 5.0
 * - 'N' alone: hemisphere='N', degrees='', both fail numeric check, 'N' itself
 *   non-numeric -> null
 */
function readDegrees(text, positive, negative) {
  text = text.trim();
  const hemisphere = text.slice(0, 1);
  const degrees = text.slice(1);

  // Match a valid GEDCOM format
  if (isNumeric(degrees)) {
    const hemisphereUpper = hemisphere.toUpperCase();
    const degreesFloat = Number(degrees);

    if (hemisphereUpper === positive) {
      return degreesFloat;
    }

    if (hemisphereUpper === negative) {
      return -degreesFloat;
    }
  }

  // Just a number?
  if (isNumeric(text)) {
    return Number(text);
  }

  // Can't match anything.
  return null;
}
