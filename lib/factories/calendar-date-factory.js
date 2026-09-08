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

// Port of app/Factories/CalendarDateFactory.php::make() (task 17).
// supportedCalendars() is NOT ported — it's a thin I18N::translate() label
// list with no computational value, same exclusion reasoning already used
// for other I18N-only methods throughout this migration.
//
// This closes the gap flagged when lib/date was completed (task 11, see
// phase3-date-bridge-design.md): the calendar-date engine had no ported
// path from a raw GEDCOM date string to a calendar-date object. All the
// numeric/calendar work here is delegated to the already-ported
// AbstractCalendarDate subclasses' array constructor
// (new GregorianDate([year, month, day])) — this module is purely the
// regex-based string parsing PHP does before reaching that point.

import { FrenchDate } from '../date/french.js';
import { GregorianDate } from '../date/gregorian.js';
import { HijriDate } from '../date/hijri.js';
import { JalaliDate } from '../date/jalali.js';
import { JewishDate } from '../date/jewish.js';
import { JulianDate } from '../date/julian.js';
import { RomanDate } from '../date/roman.js';

const MONTH_ALTERNATION =
  'JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC|' +
  'TSH|CSH|KSL|TVT|SHV|ADR|ADS|NSN|IYR|SVN|TMZ|AAV|ELL|' +
  'VEND|BRUM|FRIM|NIVO|PLUV|VENT|GERM|FLOR|PRAI|MESS|THER|FRUC|COMP|' +
  'MUHAR|SAFAR|RABI[AT]|JUMA[AT]|RAJAB|SHAAB|RAMAD|SHAWW|DHUAQ|DHUAH|' +
  'FARVA|ORDIB|KHORD|TIR|MORDA|SHAHR|MEHR|ABAN|AZAR|DEY|BAHMA|ESFAN';

const CALENDAR_ESCAPE_RE = /^(@#D(?:GREGORIAN|JULIAN|HEBREW|HIJRI|JALALI|FRENCH R|ROMAN)+@) ?(.*)/;
const DMY_RE = new RegExp(`^(\\d?\\d?) ?(${MONTH_ALTERNATION}) ?((?:\\d{1,4}(?: B\\.C\\.)?|\\d\\d\\d\\d/\\d\\d)?)$`);
const YEAR_ONLY_RE = /^(\d{1,4}(?: B\.C\.)?|\d\d\d\d\/\d\d)$/;
const FALLBACK_YEAR_RE = /(\d{3,4})/;
const FALLBACK_MONTH_RE = new RegExp(`(${MONTH_ALTERNATION})`);
const FALLBACK_DAY_RE = /\b(\d\d?)\b/;

const JEWISH_MONTHS_RE = /^(TSH|CSH|KSL|TVT|SHV|ADR|ADS|NSN|IYR|SVN|TMZ|AAV|ELL)$/;
const FRENCH_MONTHS_RE = /^(VEND|BRUM|FRIM|NIVO|PLUV|VENT|GERM|FLOR|PRAI|MESS|THER|FRUC|COMP)$/;
const HIJRI_MONTHS_RE = /^(MUHAR|SAFAR|RABI[AT]|JUMA[AT]|RAJAB|SHAAB|RAMAD|SHAWW|DHUAQ|DHUAH)$/;
const JALALI_MONTHS_RE = /^(FARVA|ORDIB|KHORD|TIR|MORDA|SHAHR|MEHR|ABAN|AZAR|DEY|BAHMA|ESFAN)$/;
// Note: PHP's source has only `^` on the first alternative and only `$` on
// the second (`/^\d{1,4}( B\.C\.)|\d\d\d\d\/\d\d$/`), not a fully-anchored
// pair of alternatives. Reproduced exactly, including that asymmetry —
// verified it doesn't actually change behavior at any real call site,
// since $y can only ever contain a " B.C." suffix or a full "nnnn/nn" form
// when it came from the fully-anchored YEAR_ONLY_RE match above, never
// from the fallback branch (which only ever captures bare digits).
const UNAMBIGUOUS_JULIAN_RE = /^\d{1,4}( B\.C\.)|\d\d\d\d\/\d\d$/;
const GREGORIAN_MONTHS_RE = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/;
const JEWISH_YEAR_RANGE_RE = /^[345]\d\d\d$/;

/**
 * Parse a string containing a GEDCOM calendar date.
 *
 * @param {string} date
 * @param {{i18n?: object, now?: () => number}} [options] passed through to
 *   the constructed AbstractCalendarDate subclass.
 * @returns {import('../date/abstract-calendar-date.js').AbstractCalendarDate}
 */
export function makeCalendarDate(date, options = {}) {
  let cal;
  const escapeMatch = date.match(CALENDAR_ESCAPE_RE);
  if (escapeMatch) {
    cal = escapeMatch[1];
    date = escapeMatch[2];
  } else {
    cal = '';
  }

  let d, m, y;
  const dmyMatch = date.match(DMY_RE);
  const yearOnlyMatch = date.match(YEAR_ONLY_RE);

  if (dmyMatch) {
    d = dmyMatch[1];
    m = dmyMatch[2];
    y = dmyMatch[3];
  } else if (yearOnlyMatch) {
    d = '';
    m = '';
    y = yearOnlyMatch[1];
  } else {
    // An invalid date - do the best we can.
    d = '';
    m = '';
    y = '';

    const yearAnywhere = date.match(FALLBACK_YEAR_RE);
    if (yearAnywhere) {
      y = yearAnywhere[1];
    }

    const monthAnywhere = date.match(FALLBACK_MONTH_RE);
    if (monthAnywhere) {
      m = monthAnywhere[1];

      const dayAnywhere = date.match(FALLBACK_DAY_RE);
      if (dayAnywhere) {
        d = dayAnywhere[1];
      }
    }
  }

  // Unambiguous dates - override calendar escape
  if (JEWISH_MONTHS_RE.test(m)) {
    cal = JewishDate.ESCAPE;
  } else if (FRENCH_MONTHS_RE.test(m)) {
    cal = FrenchDate.ESCAPE;
  } else if (HIJRI_MONTHS_RE.test(m)) {
    cal = HijriDate.ESCAPE; // This is a WT extension
  } else if (JALALI_MONTHS_RE.test(m)) {
    cal = JalaliDate.ESCAPE; // This is a WT extension
  } else if (UNAMBIGUOUS_JULIAN_RE.test(y)) {
    cal = JulianDate.ESCAPE;
  }

  // Ambiguous dates - don't override calendar escape
  if (cal === '') {
    if (GREGORIAN_MONTHS_RE.test(m)) {
      cal = GregorianDate.ESCAPE;
    } else if (JEWISH_YEAR_RANGE_RE.test(y)) {
      // Year 3000-5999
      cal = JewishDate.ESCAPE;
    } else {
      cal = GregorianDate.ESCAPE;
    }
  }

  // Now construct an object of the correct type
  switch (cal) {
    case GregorianDate.ESCAPE:
      return new GregorianDate([y, m, d], options);
    case JulianDate.ESCAPE:
      return new JulianDate([y, m, d], options);
    case JewishDate.ESCAPE:
      return new JewishDate([y, m, d], options);
    case HijriDate.ESCAPE:
      return new HijriDate([y, m, d], options);
    case FrenchDate.ESCAPE:
      return new FrenchDate([y, m, d], options);
    case JalaliDate.ESCAPE:
      return new JalaliDate([y, m, d], options);
    case RomanDate.ESCAPE:
      return new RomanDate([y, m, d], options);
    default:
      throw new Error('Invalid calendar');
  }
}
