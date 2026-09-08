import { ANSEL } from '../lib/encodings/ansel.js';
import { hexToByteString, byteStringToHex, textToUtf8Hex, hexToUtf8Text } from './helpers/hex.js';
import golden from '../golden/encodings_ansel_special.json';

describe('ANSEL diacritic reordering / precomposition / horn-letter parity with PHP', () => {
  const ansel = new ANSEL();

  golden.forEach((testCase, i) => {
    test(`case ${i}: ${testCase.label}`, () => {
      if (testCase.utf8_hex !== undefined) {
        // testCase.utf8_hex is real UTF-8 text -> byte string (ANSEL) -> text.
        const utf8 = hexToUtf8Text(testCase.utf8_hex);
        const from = ansel.fromUtf8(utf8);
        expect(byteStringToHex(from)).toEqual(testCase.from_utf8);

        const back = ansel.toUtf8(from);
        expect(textToUtf8Hex(back)).toEqual(testCase.round_trip);
      } else {
        // testCase.ansel_hex is a raw ANSEL byte string -> text -> byte string.
        const anselBytes = hexToByteString(testCase.ansel_hex);
        const to = ansel.toUtf8(anselBytes);
        expect(textToUtf8Hex(to)).toEqual(testCase.to_utf8);

        const back = ansel.fromUtf8(to);
        expect(byteStringToHex(back)).toEqual(testCase.round_trip);
      }
    });
  });
});
