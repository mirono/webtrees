import { GedcomDate } from '../lib/gedcom-date.js';
import constructGolden from '../golden/gedcom_date_construct.json';
import addYearsGolden from '../golden/gedcom_date_add_years.json';
import compareGolden from '../golden/gedcom_date_compare.json';

function expectMatchesCalendarDate(actual, expected) {
  expect(actual.constructor.name).toEqual(expected.class);
  expect(actual.constructor.ESCAPE).toEqual(expected.escape);
  expect(actual.year).toEqual(expected.year);
  expect(actual.month).toEqual(expected.month);
  expect(actual.day).toEqual(expected.day);
  expect(actual.minimumJulianDay()).toEqual(expected.minJulianDay);
  expect(actual.maximumJulianDay()).toEqual(expected.maxJulianDay);
}

describe('GedcomDate constructor parity with PHP Date::__construct()', () => {
  constructGolden.forEach((testCase) => {
    test(`case ${testCase.index}: ${JSON.stringify(testCase.input)}`, () => {
      if (testCase.throws) {
        expect(() => new GedcomDate(testCase.input)).toThrow();
        return;
      }

      const date = new GedcomDate(testCase.input);
      const expected = testCase.result;

      expect(date.qual1).toEqual(expected.qual1);
      expect(date.qual2).toEqual(expected.qual2);
      expect(date.text).toEqual(expected.text);
      expectMatchesCalendarDate(date.minimumDate(), expected.date1);

      if (expected.date2 === null) {
        expect(date.date2).toBeNull();
      } else {
        expectMatchesCalendarDate(date.date2, expected.date2);
      }

      expect(date.minimumJulianDay()).toEqual(expected.minJulianDay);
      expect(date.maximumJulianDay()).toEqual(expected.maxJulianDay);
      expect(date.julianDay()).toEqual(expected.julianDay);
      expect(date.isOK()).toEqual(expected.isOK);
      expect(date.gregorianYear()).toEqual(expected.gregorianYear);
    });
  });
});

describe('GedcomDate.addYears() parity with PHP', () => {
  addYearsGolden.forEach((testCase) => {
    test(`case ${testCase.index}: ${JSON.stringify(testCase.input)}`, () => {
      const date = new GedcomDate(testCase.input.date);
      const result = date.addYears(testCase.input.years, testCase.input.qualifier);
      const expected = testCase.result;

      expect(result.qual1).toEqual(expected.qual1);
      expect(result.qual2).toEqual(expected.qual2);
      expect(result.date2).toBeNull();
      expectMatchesCalendarDate(result.minimumDate(), expected.date1);

      // The original must be unaffected (PHP clones before mutating).
      expect(date.date1).not.toBe(result.date1);
    });
  });
});

describe('GedcomDate.compare() parity with PHP Date::compare()', () => {
  compareGolden.forEach((testCase) => {
    test(`case ${testCase.index}: ${JSON.stringify(testCase.input)}`, () => {
      const a = new GedcomDate(testCase.input.a);
      const b = new GedcomDate(testCase.input.b);

      expect(GedcomDate.compare(a, b)).toEqual(testCase.result);
    });
  });
});
