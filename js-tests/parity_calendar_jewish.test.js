import { JewishCalendar } from '../lib/ext-calendar/jewish.js';
import golden from '../golden/calendar_jewish.json';

const jc = new JewishCalendar();

describe('JewishCalendar parity with PHP', () => {
  test('constants', () => {
    expect(jc.daysInWeek()).toEqual(golden.constants.daysInWeek);
    expect(jc.gedcomCalendarEscape()).toEqual(golden.constants.gedcomCalendarEscape);
    expect(jc.jdStart()).toEqual(golden.constants.jdStart);
    expect(jc.jdEnd()).toBeGreaterThan(1e15); // PHP_INT_MAX -> Number.MAX_SAFE_INTEGER adaptation
  });

  test('monthsInYear() with no argument', () => {
    expect(jc.monthsInYear()).toEqual(golden.monthsInYearNoArg);
  });

  golden.jdToYmd.forEach(({ input, output }, i) => {
    test(`jdToYmd case ${i}: jd=${input.jd}`, () => {
      expect(jc.jdToYmd(input.jd)).toEqual(output);
    });
  });

  golden.ymdToJd.forEach(({ input, output }, i) => {
    test(`ymdToJd case ${i}: ${JSON.stringify(input)}`, () => {
      expect(jc.ymdToJd(input.year, input.month, input.day)).toEqual(output);
    });
  });

  golden.isLeapYear.forEach(({ input, output }, i) => {
    test(`isLeapYear case ${i}: year=${input.year}`, () => {
      expect(jc.isLeapYear(input.year)).toEqual(output);
    });
  });

  golden.monthsInYear.forEach(({ input, output }, i) => {
    test(`monthsInYear case ${i}: year=${input.year}`, () => {
      expect(jc.monthsInYear(input.year)).toEqual(output);
    });
  });

  golden.daysInMonth.forEach(({ input, output, error }, i) => {
    test(`daysInMonth case ${i}: ${JSON.stringify(input)}`, () => {
      if (error !== null) {
        expect(() => jc.daysInMonth(input.year, input.month)).toThrow(error);
      } else {
        expect(jc.daysInMonth(input.year, input.month)).toEqual(output);
      }
    });
  });
});

describe('EMULATE_BUG_54254 option genuinely changes jdToYmd() output', () => {
  const jcBug = new JewishCalendar({ EMULATE_BUG_54254: true });

  golden.emulateBug54254.forEach(({ input, output }, i) => {
    test(`case ${i}: year=${input.year}`, () => {
      expect(jc.jdToYmd(input.jd)).toEqual(output.normal);
      expect(jcBug.jdToYmd(input.jd)).toEqual(output.withBugEmulation);
    });
  });
});

describe('numberToHebrewNumerals() parity with PHP (byte-vs-character trap)', () => {
  golden.numberToHebrewNumerals.forEach(({ input, output }, i) => {
    test(`case ${i}: n=${input.n} showThousands=${input.showThousands}`, () => {
      expect(jc.numberToHebrewNumerals(input.n, input.showThousands)).toEqual(output);
    });
  });
});
