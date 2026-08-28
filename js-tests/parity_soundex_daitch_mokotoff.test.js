import { daitchMokotoff, strtoupper, textScript } from '../lib/soundex.js';
import golden from '../golden/soundex_daitch_mokotoff.json';
import goldenStrtoupper from '../golden/i18n_strtoupper.json';
import goldenTextscript from '../golden/i18n_textscript.json';

describe('Soundex.daitchMokotoff parity with PHP', () => {
  golden.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input.text).slice(0, 60)}`, () => {
      expect(daitchMokotoff(input.text)).toEqual(output);
    });
  });
});

describe('I18N.strtoupper parity with PHP (en-US locale)', () => {
  goldenStrtoupper.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input)}`, () => {
      expect(strtoupper(input)).toEqual(output);
    });
  });
});

describe('I18N.textScript parity with PHP', () => {
  goldenTextscript.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input)}`, () => {
      expect(textScript(input)).toEqual(output);
    });
  });
});
