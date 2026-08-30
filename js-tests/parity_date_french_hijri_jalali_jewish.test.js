import { FrenchDate } from '../lib/date/french.js';
import { HijriDate } from '../lib/date/hijri.js';
import { JalaliDate } from '../lib/date/jalali.js';
import { JewishDate } from '../lib/date/jewish.js';
import { DEFAULT_I18N } from '../lib/date/i18n-defaults.js';
import golden from '../golden/date_french_hijri_jalali_jewish.json';

const CLASSES = { French: FrenchDate, Hijri: HijriDate, Jalali: JalaliDate, Jewish: JewishDate };

function make(className, date, options = {}) {
  const DateClass = CLASSES[className];

  return new DateClass(date, options);
}

describe('FrenchDate/HijriDate/JalaliDate/JewishDate construction parity with PHP', () => {
  golden.construction.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.class} ${JSON.stringify(input.input)}`, () => {
      const d = make(input.class, input.input);

      expect({
        year: d.yearValue(),
        month: d.monthValue(),
        day: d.dayValue(),
        minimumJulianDay: d.minimumJulianDay(),
        maximumJulianDay: d.maximumJulianDay(),
      }).toEqual(output);
    });
  });
});

describe('Construction from a Julian day number', () => {
  golden.constructionFromJd.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.class} jd=${input.jd}`, () => {
      const d = make(input.class, input.jd);

      expect({ year: d.yearValue(), month: d.monthValue(), day: d.dayValue() }).toEqual(output);
    });
  });
});

describe('isLeapYear / daysInMonth / daysInWeek / monthsInYear / inValidRange', () => {
  golden.dateProperties.forEach(({ input, output }, i) => {
    const monthOne = { French: 'VEND', Hijri: 'MUHAR', Jalali: 'FARVA', Jewish: 'TSH' }[input.class];

    test(`case ${i}: ${input.class} year=${input.year}`, () => {
      const d = make(input.class, [String(input.year), monthOne, '1']);

      expect({
        isLeapYear: d.isLeapYear(),
        daysInMonth: d.daysInMonth(),
        daysInWeek: d.daysInWeek(),
        monthsInYear: d.monthsInYear(),
        inValidRange: d.inValidRange(),
      }).toEqual(output);
    });
  });
});

describe('daysInMonth() across every month of a leap and non-leap year', () => {
  golden.daysInMonth.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.class} year=${input.year} month=${input.monthName}`, () => {
      const d = make(input.class, [String(input.year), input.monthName, '1']);

      expect({ resolvedMonth: d.monthValue(), daysInMonth: d.daysInMonth() }).toEqual(output);
    });
  });
});

describe('format() parity with PHP', () => {
  golden.format.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.class} "${input.format}" qualifier="${input.qualifier}"`, () => {
      const d = make(input.class, input.date);

      expect(d.format(input.format, input.qualifier)).toEqual(output);
    });
  });
});

describe('format() with incomplete dates (day/month/year = 0)', () => {
  golden.formatIncomplete.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.class} ${JSON.stringify(input.date)}`, () => {
      const d = make(input.class, input.date);

      expect(d.format(input.format)).toEqual(output);
    });
  });
});

describe('JewishDate Adar/Adar II month-name resolution across all 4 grammatical cases', () => {
  const QUALIFIERS = { genitive: 'ABT', locative: 'AFT', instrumental: 'BEF' };

  golden.jewishAdarMonthNames.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.label}`, () => {
      const d = make('Jewish', [input.year, input.month, '1']);

      expect({
        resolvedMonth: d.monthValue(),
        nominative: d.format('%F'),
        genitive: d.format('%F', QUALIFIERS.genitive),
        locative: d.format('%F', QUALIFIERS.locative),
        instrumental: d.format('%F', QUALIFIERS.instrumental),
      }).toEqual(output);
    });
  });
});

describe('JewishDate nextMonth() around the Adar I/II boundary', () => {
  golden.jewishNextMonth.forEach(({ input, output }, i) => {
    test(`case ${i}: year=${input.year} month=${input.month}`, () => {
      const d = make('Jewish', [input.year, input.month, '']);

      expect({
        resolvedMonth: d.monthValue(),
        minimumJulianDay: d.minimumJulianDay(),
        maximumJulianDay: d.maximumJulianDay(),
      }).toEqual(output);
    });
  });
});

describe('JewishDate Hebrew-script formatting (numberToHebrewNumerals)', () => {
  const hebrewOptions = { i18n: { ...DEFAULT_I18N, scriptCode: 'Hebr' } };

  golden.jewishHebrewScriptFormatting.forEach(({ input, output }, i) => {
    test(`case ${i}: year=${input.year} day=${input.day}`, () => {
      const d = make('Jewish', [input.year, input.month, input.day], hebrewOptions);

      expect({
        formatDay: d.format('%j'),
        formatShortYear: d.format('%y'),
        formatLongYear: d.format('%Y'),
      }).toEqual(output);
    });
  });
});
