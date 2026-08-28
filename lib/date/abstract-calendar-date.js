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

// Port of app/Date/AbstractCalendarDate.php.
// See docs/php-to-js-migration/task-08-gregorian-julian-date.md for the
// six bridging decisions this file and its subclasses follow — read that
// before touching this file:
//
// 1. `calendar` is an explicit constructor parameter, not set on `this`
//    before a `super()` call (PHP does the latter; JS's `super()`-before-
//    `this` rule doesn't allow it). Subclasses pass their calendar
//    instance into `super(date, calendar, options)`.
// 2. i18n is injected via constructor `options.i18n`
//    ({ translate, translateContext, digits }), same DI pattern as
//    DefaultSurnameTradition, extended with `digits` (locale-aware digit
//    rendering).
// 3. "Now" is injected via constructor `options.now` (a `() => julianDay`
//    function) — genuinely dynamic data, unlike the static translation
//    keys, so tests MUST inject a fixed value, never rely on the default.
// 4. calendarUrl() is NOT ported — pure PHP-application routing plumbing.
// 5. The JewishCalendar `instanceof` special-case is ported as a string
//    comparison against `calendar.gedcomCalendarEscape() === '@#DHEBREW@'`
//    instead, since JewishCalendar isn't ported yet — always false for
//    this task's Gregorian/Julian scope, structurally ready for when it
//    is ported.
// 6. convertToCalendar() only supports 'gregorian'/'julian' so far; throws
//    a clear error for the other 4 (not yet ported), rather than silently
//    guessing or crashing unhelpfully.

import { DEFAULT_I18N, defaultNow } from './i18n-defaults.js';

const HEBREW_CALENDAR_ESCAPE = '@#DHEBREW@';

/**
 * PHP's (int) cast on a string: parses a leading optional sign + digits,
 * ignoring everything else (including a totally empty string, which casts
 * to 0). Used for GEDCOM day/year string fields, which are always either
 * a clean numeric string or empty in practice.
 */
function phpIntCast(value) {
  if (typeof value === 'number') {
    return Math.trunc(value);
  }

  const match = String(value).match(/^\s*[-+]?\d+/);

  return match ? parseInt(match[0], 10) : 0;
}

export class AbstractCalendarDate {
  static ESCAPE = '@#DUNKNOWN@';

  static MONTH_TO_NUMBER = {};

  static NUMBER_TO_MONTH = {};

  /**
   * @param {number|Array<string>|AbstractCalendarDate} date
   * @param {import('../ext-calendar/julian.js').JulianCalendar} calendar
   * @param {{i18n?: object, now?: () => number}} [options]
   */
  constructor(date, calendar, options = {}) {
    this.calendar = calendar;
    this.i18n = options.i18n ?? DEFAULT_I18N;
    this.now = options.now ?? defaultNow;

    // Construct from an integer (a Julian day number)
    if (typeof date === 'number') {
      this.minJulianDay = date;
      this.maxJulianDay = date;
      [this.year, this.month, this.day] = this.calendar.jdToYmd(date);

      return;
    }

    // Construct from an array (of three gedcom-style strings: "1900", "FEB", "4")
    if (Array.isArray(date)) {
      this.day = phpIntCast(date[2]);
      this.month = this.constructor.MONTH_TO_NUMBER[date[1]] ?? 0;

      if (this.month === 0) {
        this.day = 0;
      }

      this.year = this.extractYear(date[0]);

      // Our simple lookup table above does not take into account Adar and leap-years.
      if (this.month === 6 && this.calendar.gedcomCalendarEscape() === HEBREW_CALENDAR_ESCAPE && !this.calendar.isLeapYear(this.year)) {
        this.month = 7;
      }

      this.setJdFromYmd();

      return;
    }

    // Construct from a CalendarDate
    this.minJulianDay = date.minJulianDay;
    this.maxJulianDay = date.maxJulianDay;

    // Construct from an equivalent xxxxDate object
    if (this.constructor === date.constructor) {
      this.year = date.year;
      this.month = date.month;
      this.day = date.day;

      return;
    }

    // Not all dates can be converted
    if (!this.inValidRange()) {
      this.year = 0;
      this.month = 0;
      this.day = 0;

      return;
    }

    // ...else construct an inequivalent xxxxDate object
    let jd;
    if (date.year === 0) {
      // Incomplete date - convert on basis of anniversary in current year
      const today = date.calendar.jdToYmd(this.now());
      jd = date.calendar.ymdToJd(today[0], date.month, date.day === 0 ? today[2] : date.day);
    } else {
      // Complete date
      jd = Math.trunc((date.maxJulianDay + date.minJulianDay) / 2);
    }
    [this.year, this.month, this.day] = this.calendar.jdToYmd(jd);
    // New date has same precision as original date
    if (date.year === 0) {
      this.year = 0;
    }
    if (date.month === 0) {
      this.month = 0;
    }
    if (date.day === 0) {
      this.day = 0;
    }
    this.setJdFromYmd();
  }

  maximumJulianDay() {
    return this.maxJulianDay;
  }

  minimumJulianDay() {
    return this.minJulianDay;
  }

  yearValue() {
    return this.year;
  }

  monthValue() {
    return this.month;
  }

  dayValue() {
    return this.day;
  }

  /**
   * Is the current year a leap year?
   */
  isLeapYear() {
    return this.calendar.isLeapYear(this.year);
  }

  /**
   * Set the object's Julian day number from a potentially incomplete year/month/day
   */
  setJdFromYmd() {
    if (this.year === 0) {
      this.minJulianDay = 0;
      this.maxJulianDay = 0;
    } else if (this.month === 0) {
      this.minJulianDay = this.calendar.ymdToJd(this.year, 1, 1);
      this.maxJulianDay = this.calendar.ymdToJd(this.nextYear(this.year), 1, 1) - 1;
    } else if (this.day === 0) {
      const [ny, nm] = this.nextMonth();
      this.minJulianDay = this.calendar.ymdToJd(this.year, this.month, 1);
      this.maxJulianDay = this.calendar.ymdToJd(ny, nm, 1) - 1;
    } else {
      this.minJulianDay = this.calendar.ymdToJd(this.year, this.month, this.day);
      this.maxJulianDay = this.minJulianDay;
    }
  }

  /**
   * Full day of the week
   */
  dayNames(dayNumber) {
    const names = [
      this.i18n.translate('Monday'),
      this.i18n.translate('Tuesday'),
      this.i18n.translate('Wednesday'),
      this.i18n.translate('Thursday'),
      this.i18n.translate('Friday'),
      this.i18n.translate('Saturday'),
      this.i18n.translate('Sunday'),
    ];

    return names[dayNumber];
  }

  /**
   * Abbreviated day of the week
   */
  dayNamesAbbreviated(dayNumber) {
    const names = [
      this.i18n.translate('Mon'),
      this.i18n.translate('Tue'),
      this.i18n.translate('Wed'),
      this.i18n.translate('Thu'),
      this.i18n.translate('Fri'),
      this.i18n.translate('Sat'),
      this.i18n.translate('Sun'),
    ];

    return names[dayNumber];
  }

  /**
   * Most years are 1 more than the previous, but not always (e.g. 1BC->1AD)
   */
  nextYear(year) {
    return year + 1;
  }

  /**
   * Calendars that use suffixes, etc. (e.g. "B.C.") or OS/NS notation should redefine this.
   */
  extractYear(year) {
    return phpIntCast(year);
  }

  /**
   * Compare two dates, for sorting
   */
  static compare(d1, d2) {
    if (d1.maxJulianDay < d2.minJulianDay) {
      return -1;
    }

    if (d2.maxJulianDay < d1.minJulianDay) {
      return 1;
    }

    return 0;
  }

  /**
   * Calculate the years/months/days between this date and another date.
   * Results assume you add the days first, then the months.
   * 4 February -> 3 July is 27 days (3 March) and 4 months.
   * It is not 4 months (4 June) and 29 days.
   */
  ageDifference(date) {
    // Incomplete dates
    if (this.year === 0 || date.year === 0) {
      return [-1, -1, -1];
    }

    // Overlapping dates
    if (AbstractCalendarDate.compare(this, date) === 0) {
      return [0, 0, 0];
    }

    // Perform all calculations using the calendar of the first date
    const [year1, month1, day1] = this.calendar.jdToYmd(this.minJulianDay);
    const [year2, month2, day2] = this.calendar.jdToYmd(date.minJulianDay);

    let years = year2 - year1;
    let months = month2 - month1;
    let days = day2 - day1;

    if (days < 0) {
      days += this.calendar.daysInMonth(year1, month1);
      months--;
    }

    if (months < 0) {
      months += this.calendar.monthsInYear(year2);
      years--;
    }

    return [years, months, days];
  }

  /**
   * Convert a date from one calendar to another. Only 'gregorian' and
   * 'julian' are supported so far (see bridging decision #6) — the other
   * 4 calendars aren't ported yet.
   */
  convertToCalendar(calendar, DateClasses) {
    switch (calendar) {
      case 'gregorian':
        return new DateClasses.GregorianDate(this, { i18n: this.i18n, now: this.now });
      case 'julian':
        return new DateClasses.JulianDate(this, { i18n: this.i18n, now: this.now });
      case 'jewish':
      case 'french':
      case 'hijri':
      case 'jalali':
        throw new Error(`convertToCalendar('${calendar}') is not yet supported — that calendar hasn't been ported yet (see docs/php-to-js-migration/task-06-calendar-engine-phase0.md)`);
      default:
        return this;
    }
  }

  /**
   * Is this date within the valid range of the calendar
   */
  inValidRange() {
    return this.minJulianDay >= this.calendar.jdStart() && this.maxJulianDay <= this.calendar.jdEnd();
  }

  /**
   * How many months in a year
   */
  monthsInYear() {
    return this.calendar.monthsInYear();
  }

  /**
   * How many days in the current month
   */
  daysInMonth() {
    try {
      return this.calendar.daysInMonth(this.year, this.month);
    } catch {
      // calendar.php calls this with "DD MMM" dates, for which we cannot calculate
      // the length of a month. Should we validate this before calling this function?
      return 0;
    }
  }

  /**
   * How many days in the current week
   */
  daysInWeek() {
    return this.calendar.daysInWeek();
  }

  /**
   * Format a date, using similar codes to the PHP date() function.
   *
   * @param {string} format See https://php.net/date
   * @param {string} [qualifier] GEDCOM qualifier, so we can choose the right case for the month name.
   */
  format(format, qualifier = '') {
    // Dates can include additional punctuation and symbols. e.g.
    // %F %j, %Y
    // %Y. %F %d.
    // %Y年 %n月 %j日
    // %j. %F %Y
    // Don't show exact details or unnecessary punctuation for inexact dates.
    if (this.day === 0) {
      format = strtr(format, { '%d': '', 日: '', '%j,': '', '%j': '', '%l': '', '%D': '', '%N': '', '%S': '', '%w': '', '%z': '' });
    }
    if (this.month === 0) {
      format = strtr(format, { '%F': '', '%m': '', '%M': '', 月: '', '%n': '', '%t': '' });
    }
    if (this.year === 0) {
      format = strtr(format, { '%t': '', '%L': '', '%G': '', '%y': '', 年: '', '%Y': '' });
    }
    format = trimChars(format, ',. /-');

    let caseName;
    if (this.day !== 0 && /%[djlDNSwz]/.test(format)) {
      // If we have a day-number *and* we are being asked to display it, then genitive
      caseName = 'GENITIVE';
    } else {
      switch (qualifier) {
        case 'TO':
        case 'ABT':
        case 'FROM':
          caseName = 'GENITIVE';
          break;
        case 'AFT':
          caseName = 'LOCATIVE';
          break;
        case 'BEF':
        case 'BET':
        case 'AND':
          caseName = 'INSTRUMENTAL';
          break;
        case '':
        case 'INT':
        case 'EST':
        case 'CAL':
        default: // There shouldn't be any other options...
          caseName = 'NOMINATIVE';
          break;
      }
    }
    // Build up the formatted date, character at a time
    if (format.includes('%d')) {
      format = format.split('%d').join(this.formatDayZeros());
    }
    if (format.includes('%j')) {
      format = format.split('%j').join(this.formatDay());
    }
    if (format.includes('%l')) {
      format = format.split('%l').join(this.formatLongWeekday());
    }
    if (format.includes('%D')) {
      format = format.split('%D').join(this.formatShortWeekday());
    }
    if (format.includes('%N')) {
      format = format.split('%N').join(this.formatIsoWeekday());
    }
    if (format.includes('%w')) {
      format = format.split('%w').join(this.formatNumericWeekday());
    }
    if (format.includes('%z')) {
      format = format.split('%z').join(this.formatDayOfYear());
    }
    if (format.includes('%F')) {
      format = format.split('%F').join(this.formatLongMonth(caseName));
    }
    if (format.includes('%m')) {
      format = format.split('%m').join(this.formatMonthZeros());
    }
    if (format.includes('%M')) {
      format = format.split('%M').join(this.formatShortMonth());
    }
    if (format.includes('%n')) {
      format = format.split('%n').join(this.formatMonth());
    }
    if (format.includes('%t')) {
      format = format.split('%t').join(String(this.daysInMonth()));
    }
    if (format.includes('%L')) {
      format = format.split('%L').join(this.isLeapYear() ? '1' : '0');
    }
    if (format.includes('%Y')) {
      format = format.split('%Y').join(this.formatLongYear());
    }
    if (format.includes('%y')) {
      format = format.split('%y').join(this.formatShortYear());
    }
    // These 4 extensions are useful for re-formatting gedcom dates.
    if (format.includes('%@')) {
      format = format.split('%@').join(this.formatGedcomCalendarEscape());
    }
    if (format.includes('%A')) {
      format = format.split('%A').join(this.formatGedcomDay());
    }
    if (format.includes('%O')) {
      format = format.split('%O').join(this.formatGedcomMonth());
    }
    if (format.includes('%E')) {
      format = format.split('%E').join(this.formatGedcomYear());
    }

    return format;
  }

  /**
   * Generate the %d format for a date.
   */
  formatDayZeros() {
    if (this.day > 9) {
      return this.i18n.digits(this.day);
    }

    return this.i18n.digits('0' + this.day);
  }

  /**
   * Generate the %j format for a date.
   */
  formatDay() {
    return this.i18n.digits(this.day);
  }

  /**
   * Generate the %l format for a date.
   */
  formatLongWeekday() {
    return this.dayNames(this.minJulianDay % this.calendar.daysInWeek());
  }

  /**
   * Generate the %D format for a date.
   */
  formatShortWeekday() {
    return this.dayNamesAbbreviated(this.minJulianDay % this.calendar.daysInWeek());
  }

  /**
   * Generate the %N format for a date.
   */
  formatIsoWeekday() {
    return this.i18n.digits((this.minJulianDay % 7) + 1);
  }

  /**
   * Generate the %w format for a date.
   */
  formatNumericWeekday() {
    return this.i18n.digits((this.minJulianDay + 1) % this.calendar.daysInWeek());
  }

  /**
   * Generate the %z format for a date.
   */
  formatDayOfYear() {
    return this.i18n.digits(this.minJulianDay - this.calendar.ymdToJd(this.year, 1, 1));
  }

  /**
   * Generate the %n format for a date.
   */
  formatMonth() {
    return this.i18n.digits(this.month);
  }

  /**
   * Generate the %m format for a date.
   */
  formatMonthZeros() {
    if (this.month > 9) {
      return this.i18n.digits(this.month);
    }

    return this.i18n.digits('0' + this.month);
  }

  /**
   * Generate the %F format for a date.
   *
   * @param {string} [caseName] Which grammatical case shall we use
   */
  formatLongMonth(caseName = 'NOMINATIVE') {
    switch (caseName) {
      case 'GENITIVE':
        return this.monthNameGenitiveCase(this.month, this.isLeapYear());
      case 'NOMINATIVE':
        return this.monthNameNominativeCase(this.month, this.isLeapYear());
      case 'LOCATIVE':
        return this.monthNameLocativeCase(this.month, this.isLeapYear());
      case 'INSTRUMENTAL':
        return this.monthNameInstrumentalCase(this.month, this.isLeapYear());
      default:
        throw new Error(caseName);
    }
  }

  /**
   * Full month name in genitive case. Subclasses must implement.
   */
  // eslint-disable-next-line no-unused-vars
  monthNameGenitiveCase(month, leapYear) {
    throw new Error('monthNameGenitiveCase() must be implemented by a subclass');
  }

  /**
   * Full month name in nominative case. Subclasses must implement.
   */
  // eslint-disable-next-line no-unused-vars
  monthNameNominativeCase(month, leapYear) {
    throw new Error('monthNameNominativeCase() must be implemented by a subclass');
  }

  /**
   * Full month name in locative case. Subclasses must implement.
   */
  // eslint-disable-next-line no-unused-vars
  monthNameLocativeCase(month, leapYear) {
    throw new Error('monthNameLocativeCase() must be implemented by a subclass');
  }

  /**
   * Full month name in instrumental case. Subclasses must implement.
   */
  // eslint-disable-next-line no-unused-vars
  monthNameInstrumentalCase(month, leapYear) {
    throw new Error('monthNameInstrumentalCase() must be implemented by a subclass');
  }

  /**
   * Abbreviated month name. Subclasses must implement.
   */
  // eslint-disable-next-line no-unused-vars
  monthNameAbbreviated(month, leapYear) {
    throw new Error('monthNameAbbreviated() must be implemented by a subclass');
  }

  /**
   * Generate the %M format for a date.
   */
  formatShortMonth() {
    return this.monthNameAbbreviated(this.month, this.isLeapYear());
  }

  /**
   * Generate the %y format for a date.
   * NOTE Short year is NOT a 2-digit year. It is for calendars such as hebrew
   * which have a 3-digit form of 4-digit years.
   */
  formatShortYear() {
    return this.formatLongYear();
  }

  /**
   * Generate the %A format for a date.
   */
  formatGedcomDay() {
    if (this.day === 0) {
      return '';
    }

    return String(this.day).padStart(2, '0');
  }

  /**
   * Generate the %O format for a date.
   */
  formatGedcomMonth() {
    // Our simple lookup table doesn't work correctly for Adar on leap years
    if (this.month === 7 && this.calendar.gedcomCalendarEscape() === HEBREW_CALENDAR_ESCAPE && !this.calendar.isLeapYear(this.year)) {
      return 'ADR';
    }

    return this.constructor.NUMBER_TO_MONTH[this.month] ?? '';
  }

  /**
   * Generate the %E format for a date.
   */
  formatGedcomYear() {
    if (this.year === 0) {
      return '';
    }

    return String(this.year).padStart(4, '0');
  }

  /**
   * Generate the %@ format for a calendar escape.
   */
  formatGedcomCalendarEscape() {
    return this.constructor.ESCAPE;
  }

  /**
   * Generate the %Y format for a date.
   */
  formatLongYear() {
    return this.i18n.digits(this.year);
  }

  /**
   * Which months follows this one? Calendars with leap-months should provide their own implementation.
   */
  nextMonth() {
    return [this.month === this.calendar.monthsInYear() ? this.nextYear(this.year) : this.year, (this.month % this.calendar.monthsInYear()) + 1];
  }

  /**
   * Get today's date in the current calendar.
   */
  todayYmd() {
    return this.calendar.jdToYmd(this.now());
  }

  /**
   * Convert to today's date.
   */
  today() {
    const tmp = Object.create(Object.getPrototypeOf(this));
    Object.assign(tmp, this);
    const ymd = tmp.todayYmd();
    tmp.year = ymd[0];
    tmp.month = ymd[1];
    tmp.day = ymd[2];
    tmp.setJdFromYmd();

    return tmp;
  }

  // calendarUrl() is deliberately NOT ported — see bridging decision #4
  // at the top of this file. It generates a webtrees application URL via
  // the PHP router and a Tree object; pure PHP-application plumbing, not
  // calendar logic.
}

/** PHP's strtr($str, $pairs): replace each key with its value, longest keys matched first. */
function strtr(str, pairs) {
  const keys = Object.keys(pairs).sort((a, b) => b.length - a.length);

  let result = '';
  let i = 0;
  outer: while (i < str.length) {
    for (const key of keys) {
      if (str.startsWith(key, i)) {
        result += pairs[key];
        i += key.length;
        continue outer;
      }
    }
    result += str[i];
    i++;
  }

  return result;
}

/** PHP's trim($str, $chars): strip any of the given characters from both ends. */
function trimChars(str, chars) {
  const escaped = chars.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const pattern = new RegExp(`^[${escaped}]+|[${escaped}]+$`, 'g');

  return str.replace(pattern, '');
}
