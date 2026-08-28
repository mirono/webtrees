import { AbstractCalendarDate } from '../lib/date/abstract-calendar-date.js';
import { GregorianDate } from '../lib/date/gregorian.js';
import { JulianDate } from '../lib/date/julian.js';
import { RomanDate } from '../lib/date/roman.js';
import golden from '../golden/gregorian_julian_date.json';

// The golden fixture was generated with this exact fixed Julian day
// standing in for "today" (see bin/characterize_gregorian_julian_date.php)
// — tests MUST inject this, never the real current date, for reproducible
// comparisons against PHP output captured at a specific point in time.
const fixedNow = () => golden.fixedNowJd;
const options = { now: fixedNow };

const CLASSES = { Gregorian: GregorianDate, Julian: JulianDate, Roman: RomanDate };

function make(className, date) {
  const DateClass = CLASSES[className];

  return new DateClass(date, options);
}

describe('GregorianDate/JulianDate/RomanDate construction parity with PHP', () => {
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

describe('Cross-calendar construction (convert between Gregorian and Julian)', () => {
  golden.crossConstruction.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.from} -> ${input.to}`, () => {
      const source = make(input.from, input.input);
      const TargetClass = CLASSES[input.to];
      const target = new TargetClass(source, options);

      expect({ year: target.yearValue(), month: target.monthValue(), day: target.dayValue() }).toEqual(output);
    });
  });
});

describe('compare() / ageDifference() parity with PHP', () => {
  golden.compareAndAgeDifference.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.class} ${JSON.stringify(input.a)} vs ${JSON.stringify(input.b)}`, () => {
      const da = make(input.class, input.a);
      const db = make(input.class, input.b);

      expect(AbstractCalendarDate.compare(da, db)).toEqual(output.compare);
      expect(da.ageDifference(db)).toEqual(output.ageDifference);
    });
  });
});

describe('isLeapYear / daysInMonth / daysInWeek / monthsInYear / inValidRange', () => {
  golden.dateProperties.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.class} year=${input.year}`, () => {
      const d = make(input.class, [String(input.year), 'JAN', '1']);

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

describe('daysInMonth() falls back to 0 for month-less dates (caught exception)', () => {
  golden.daysInMonthFallback.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.class}`, () => {
      const d = make(input.class, input.value);

      expect(d.daysInMonth()).toEqual(output);
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

describe('JulianDate BCE / old-style year formatting', () => {
  golden.julianYearFormats.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input)}`, () => {
      const d = new JulianDate(input, options);

      expect({ longYear: d.format('%Y'), gedcomYear: d.format('%E') }).toEqual(output);
    });
  });
});

describe('RomanDate AUC year formatting', () => {
  test('longYear / gedcomYear', () => {
    const d = new RomanDate(['100', 'JAN', '1'], options);

    expect({ longYear: d.format('%Y'), gedcomYear: d.format('%E') }).toEqual(golden.romanYearFormats);
  });
});

describe('todayYmd() / today() use the injected `now`', () => {
  test('todayYmd', () => {
    const d = new GregorianDate(['2024', 'FEB', '15'], options);

    expect(d.todayYmd()).toEqual(golden.todayYmd);
  });

  test('today', () => {
    const d = new GregorianDate(['2024', 'FEB', '15'], options);
    const t = d.today();

    expect({ year: t.yearValue(), month: t.monthValue(), day: t.dayValue() }).toEqual(golden.today);
  });
});

describe('convertToCalendar() partial support (bridging decision #6)', () => {
  test('supports gregorian/julian targets', () => {
    const d = new GregorianDate(['2024', 'FEB', '15'], options);
    const asJulian = d.convertToCalendar('julian', { GregorianDate, JulianDate });

    expect(asJulian).toBeInstanceOf(JulianDate);
    expect(asJulian.yearValue()).toEqual(2024);
  });

  test('unsupported targets throw a clear error, not a silent guess', () => {
    const d = new GregorianDate(['2024', 'FEB', '15'], options);

    expect(() => d.convertToCalendar('jewish', { GregorianDate, JulianDate })).toThrow(/not yet supported/);
  });

  test('an unrecognised calendar name returns the date unchanged (matches PHP default: branch)', () => {
    const d = new GregorianDate(['2024', 'FEB', '15'], options);

    expect(d.convertToCalendar('nonsense', { GregorianDate, JulianDate })).toBe(d);
  });
});
