import { russell, compare } from '../lib/soundex.js';
import golden from '../golden/soundex_russell.json';
import goldenCompare from '../golden/soundex_compare.json';

describe('Soundex.russell parity with PHP', () => {
  golden.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input)}`, () => {
      expect(russell(input.text)).toEqual(output);
    });
  });
});

describe('Soundex.compare parity with PHP', () => {
  goldenCompare.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input)}`, () => {
      expect(compare(input.a, input.b)).toEqual(output);
    });
  });
});
