import { numberToRomanNumerals, romanNumeralsToNumber } from '../lib/services/roman-numerals-service.js';
import golden from '../golden/roman_numerals_service.json';

describe('RomanNumeralsService.numberToRomanNumerals parity with PHP', () => {
  golden.numberToRomanNumerals.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.number}`, () => {
      expect(numberToRomanNumerals(input.number)).toEqual(output);
    });
  });
});

describe('RomanNumeralsService.romanNumeralsToNumber parity with PHP', () => {
  golden.romanNumeralsToNumber.forEach(({ input, output }, i) => {
    test(`case ${i}: "${input.roman}"`, () => {
      expect(romanNumeralsToNumber(input.roman)).toEqual(output);
    });
  });
});

describe('RomanNumeralsService round-trip tests', () => {
  golden.roundtrip.forEach(({ input, toRoman, backToNum, roundtrip }, i) => {
    test(`case ${i}: ${input.number} -> ${toRoman} -> ${backToNum}`, () => {
      expect(roundtrip).toEqual('success');
      expect(numberToRomanNumerals(input.number)).toEqual(toRoman);
      expect(romanNumeralsToNumber(toRoman)).toEqual(backToNum);
    });
  });
});
