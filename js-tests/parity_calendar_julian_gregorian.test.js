import { JulianCalendar } from '../lib/ext-calendar/julian.js';
import { GregorianCalendar } from '../lib/ext-calendar/gregorian.js';
import goldenJulian from '../golden/calendar_julian.json';
import goldenGregorian from '../golden/calendar_gregorian.json';

const CALENDARS = {
  Julian: { instance: new JulianCalendar(), golden: goldenJulian },
  Gregorian: { instance: new GregorianCalendar(), golden: goldenGregorian },
};

Object.entries(CALENDARS).forEach(([name, { instance: calendar, golden }]) => {
  describe(`${name}Calendar parity with PHP`, () => {
    test('constants', () => {
      expect(calendar.daysInWeek()).toEqual(golden.constants.daysInWeek);
      expect(calendar.monthsInYear()).toEqual(golden.constants.monthsInYear);
      expect(calendar.gedcomCalendarEscape()).toEqual(golden.constants.gedcomCalendarEscape);
      expect(calendar.jdStart()).toEqual(golden.constants.jdStart);
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

    golden.easterDays.forEach(({ input, output }, i) => {
      test(`easterDays case ${i}: year=${input.year}`, () => {
        expect(calendar.easterDays(input.year)).toEqual(output);
      });
    });
  });
});
