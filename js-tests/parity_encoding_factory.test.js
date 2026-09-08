import { EncodingFactory, InvalidGedcomEncodingException } from '../lib/factories/encoding-factory.js';
import { hexToByteString } from './helpers/hex.js';
import detectGolden from '../golden/encoding_factory_detect.json';
import detectExceptionGolden from '../golden/encoding_factory_detect_exception.json';
import makeGolden from '../golden/encoding_factory_make.json';
import listGolden from '../golden/encoding_factory_list.json';

describe('EncodingFactory.detect parity with PHP', () => {
  const factory = new EncodingFactory();

  detectGolden.forEach((testCase, i) => {
    test(`case ${i}: ${testCase.label}`, () => {
      const header = hexToByteString(testCase.header);
      const result = factory.detect(header);

      if (testCase.detected === null) {
        expect(result).toBeNull();
      } else {
        expect(result.constructor.NAME).toEqual(testCase.detected);
      }
    });
  });

  test('unrecognized CHAR value throws InvalidGedcomEncodingException', () => {
    const factory = new EncodingFactory();
    const header = hexToByteString(detectExceptionGolden.header);

    expect(() => factory.detect(header)).toThrow(InvalidGedcomEncodingException);

    try {
      factory.detect(header);
    } catch (error) {
      expect(error.message).toEqual(detectExceptionGolden.unrecognized_char_value);
    }
  });
});

describe('EncodingFactory.make parity with PHP', () => {
  const factory = new EncodingFactory();

  makeGolden.valid_cases.forEach(({ name, result_name: resultName }, i) => {
    test(`case ${i}: make(${JSON.stringify(name)})`, () => {
      expect(factory.make(name).constructor.NAME).toEqual(resultName);
    });
  });

  test('invalid name throws', () => {
    expect(() => factory.make('NOT-A-REAL-ENCODING')).toThrow(makeGolden.invalid_message);
  });
});

describe('EncodingFactory.list parity with PHP', () => {
  test('matches the full list', () => {
    const factory = new EncodingFactory();
    expect(factory.list()).toEqual(listGolden);
  });
});
