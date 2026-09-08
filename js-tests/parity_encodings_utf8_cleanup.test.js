import { UTF8 } from '../lib/encodings/utf8.js';
import { hexToByteString, byteStringToHex } from './helpers/hex.js';
import golden from '../golden/encodings_utf8_cleanup.json';

// UTF8's fromUtf8()/toUtf8() are the one special case in lib/encodings/:
// both take AND return a byte string (not text) — see the file-level
// comment in lib/encodings/utf8.js. No textToUtf8Hex() needed here.
describe('UTF8 validate/repair parity with PHP (mb_convert_encoding cleanup)', () => {
  const utf8 = new UTF8();

  golden.forEach((testCase, i) => {
    test(`case ${i}: ${testCase.label}`, () => {
      const input = hexToByteString(testCase.input_hex);

      expect(byteStringToHex(utf8.fromUtf8(input))).toEqual(testCase.from_utf8);
      expect(byteStringToHex(utf8.toUtf8(input))).toEqual(testCase.to_utf8);
    });
  });
});
