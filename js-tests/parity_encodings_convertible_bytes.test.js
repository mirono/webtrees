import { ANSEL } from '../lib/encodings/ansel.js';
import { ASCII } from '../lib/encodings/ascii.js';
import { CP437 } from '../lib/encodings/cp437.js';
import { CP850 } from '../lib/encodings/cp850.js';
import { ISO88591 } from '../lib/encodings/iso88591.js';
import { ISO88592 } from '../lib/encodings/iso88592.js';
import { MacRoman } from '../lib/encodings/mac-roman.js';
import { Windows1250 } from '../lib/encodings/windows1250.js';
import { Windows1251 } from '../lib/encodings/windows1251.js';
import { Windows1252 } from '../lib/encodings/windows1252.js';
import { hexToByteString } from './helpers/hex.js';
import golden from '../golden/encodings_convertible_bytes.json';

const ENCODINGS = {
  ASCII: new ASCII(),
  CP437: new CP437(),
  CP850: new CP850(),
  ISO88591: new ISO88591(),
  ISO88592: new ISO88592(),
  MacRoman: new MacRoman(),
  Windows1250: new Windows1250(),
  Windows1251: new Windows1251(),
  Windows1252: new Windows1252(),
  ANSEL: new ANSEL(),
};

describe('lib/encodings/* convertibleBytes parity with PHP', () => {
  golden.forEach((testCase, i) => {
    const encoding = ENCODINGS[testCase.encoding];

    test(`case ${i}: ${testCase.encoding} index ${testCase.index}`, () => {
      const input = hexToByteString(testCase.input);
      expect(encoding.convertibleBytes(input)).toEqual(testCase.result);
    });
  });
});
