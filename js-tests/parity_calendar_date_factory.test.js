import { makeCalendarDate } from '../lib/factories/calendar-date-factory.js';
import golden from '../golden/calendar_date_factory_make.json';

describe('CalendarDateFactory.make() parity with PHP', () => {
  golden.forEach((testCase) => {
    test(`case ${testCase.index}: ${JSON.stringify(testCase.input)}`, () => {
      if (testCase.throws) {
        expect(() => makeCalendarDate(testCase.input)).toThrow();
        return;
      }

      const result = makeCalendarDate(testCase.input);

      expect(result.constructor.name).toEqual(testCase.result.class);
      expect(result.constructor.ESCAPE).toEqual(testCase.result.escape);
      expect(result.year).toEqual(testCase.result.year);
      expect(result.month).toEqual(testCase.result.month);
      expect(result.day).toEqual(testCase.result.day);
      expect(result.minimumJulianDay()).toEqual(testCase.result.minJulianDay);
      expect(result.maximumJulianDay()).toEqual(testCase.result.maxJulianDay);
    });
  });
});
