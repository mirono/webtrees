import { FrenchCalendar } from '../lib/ext-calendar/french.js';
import { ArabicCalendar } from '../lib/ext-calendar/arabic.js';
import { PersianCalendar } from '../lib/ext-calendar/persian.js';
import goldenFrench from '../golden/calendar_french.json';
import goldenArabic from '../golden/calendar_arabic.json';
import goldenPersian from '../golden/calendar_persian.json';

const CALENDARS = {
  French: { instance: new FrenchCalendar(), golden: goldenFrench },
  Arabic: { instance: new ArabicCalendar(), golden: goldenArabic },
  Persian: { instance: new PersianCalendar(), golden: goldenPersian },
};

Object.entries(CALENDARS).forEach(([name, { instance: calendar, golden }]) => {
  describe(`${name}Calendar parity with PHP`, () => {
    test('constants', () => {
      expect(calendar.daysInWeek()).toEqual(golden.constants.daysInWeek);
      expect(calendar.monthsInYear()).toEqual(golden.constants.monthsInYear);
      expect(calendar.gedcomCalendarEscape()).toEqual(golden.constants.gedcomCalendarEscape);
      expect(calendar.jdStart()).toEqual(golden.constants.jdStart);
      if (golden.constants.jdEnd !== 9223372036854775807) {
        // A "real", finite bound (French) — must match exactly.
        expect(calendar.jdEnd()).toEqual(golden.constants.jdEnd);
      } else {
        // PHP_INT_MAX -> Number.MAX_SAFE_INTEGER adaptation (task 07) —
        // not byte-for-byte equal, just confirm it's still "very large".
        expect(calendar.jdEnd()).toBeGreaterThan(1e15);
      }
    });

    golden.jdToYmd.forEach(({ input, output }, i) => {
      test(`jdToYmd case ${i}: jd=${input.jd}`, () => {
        expect(calendar.jdToYmd(input.jd)).toEqual(output);
      });
    });

    golden.ymdToJd.forEach(({ input, output, error }, i) => {
      test(`ymdToJd case ${i}: ${JSON.stringify(input)}`, () => {
        if (error !== null) {
          expect(() => calendar.ymdToJd(input.year, input.month, input.day)).toThrow(error);
        } else {
          expect(calendar.ymdToJd(input.year, input.month, input.day)).toEqual(output);
        }
      });
    });

    golden.isLeapYear.forEach(({ input, output }, i) => {
      test(`isLeapYear case ${i}: year=${input.year}`, () => {
        expect(calendar.isLeapYear(input.year)).toEqual(output);
      });
    });

    golden.daysInMonth.forEach(({ input, output, error }, i) => {
      test(`daysInMonth case ${i}: ${JSON.stringify(input)}`, () => {
        if (error !== null) {
          expect(() => calendar.daysInMonth(input.year, input.month)).toThrow(error);
        } else {
          expect(calendar.daysInMonth(input.year, input.month)).toEqual(output);
        }
      });
    });
  });
});

describe('PersianCalendar.mod() parity with PHP', () => {
  const persian = CALENDARS.Persian.instance;

  goldenPersian.mod.forEach(({ input, output }, i) => {
    test(`case ${i}: mod(${input.dividend}, ${input.divisor})`, () => {
      expect(persian.mod(input.dividend, input.divisor)).toEqual(output);
    });
  });
});

describe('PersianCalendar negative-year limitation (faithfully reproduced, not fixed)', () => {
  const persian = CALENDARS.Persian.instance;

  goldenPersian.negativeYearLimitation.forEach(({ input, ymdToJdOutput, ymdToJdError, roundTripOutput, roundTripError }, i) => {
    test(`case ${i}: year=${input.year}`, () => {
      if (ymdToJdError !== null) {
        expect(() => persian.ymdToJd(input.year, 1, 1)).toThrow(ymdToJdError);

        return;
      }

      const jd = persian.ymdToJd(input.year, 1, 1);
      expect(jd).toEqual(ymdToJdOutput);

      if (roundTripError !== null) {
        expect(() => persian.jdToYmd(jd)).toThrow(roundTripError);
      } else {
        expect(persian.jdToYmd(jd)).toEqual(roundTripOutput);
      }
    });
  });
});
