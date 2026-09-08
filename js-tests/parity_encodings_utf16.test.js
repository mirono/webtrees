import { UTF16BE } from '../lib/encodings/utf16be.js';
import { UTF16LE } from '../lib/encodings/utf16le.js';
import { hexToByteString, byteStringToHex, textToUtf8Hex, hexToUtf8Text } from './helpers/hex.js';
import fromUtf8Golden from '../golden/encodings_utf16_from_utf8.json';
import toUtf8Golden from '../golden/encodings_utf16_to_utf8.json';

const ENCODINGS = {
  UTF16BE: new UTF16BE(),
  UTF16LE: new UTF16LE(),
};

describe('UTF16BE/UTF16LE fromUtf8 parity with PHP (including the always-zeroes-non-ASCII bug)', () => {
  fromUtf8Golden.forEach((testCase, i) => {
    test(`case ${i}: ${testCase.encoding} ${testCase.case}`, () => {
      const encoding = ENCODINGS[testCase.encoding];
      // fromUtf8() takes real text (see lib/encodings/abstract-encoding.js).
      const text = hexToUtf8Text(testCase.utf8_hex);
      const result = encoding.fromUtf8(text);

      // fromUtf8() returns a byte string (raw UTF-16 bytes).
      expect(byteStringToHex(result)).toEqual(testCase.result);
    });
  });
});

describe('UTF16BE/UTF16LE toUtf8/convertibleBytes parity with PHP (including the Latin-1-range bug)', () => {
  toUtf8Golden.forEach((testCase, i) => {
    const encoding = ENCODINGS[testCase.encoding];

    if (testCase.case.startsWith('convertible_bytes_len_')) {
      test(`case ${i}: ${testCase.encoding} ${testCase.case}`, () => {
        const len = Number(testCase.case.replace('convertible_bytes_len_', ''));
        const input = 'X'.repeat(len);
        expect(encoding.convertibleBytes(input)).toEqual(testCase.convertibleBytes);
      });
      return;
    }

    test(`case ${i}: ${testCase.encoding} ${testCase.case}`, () => {
      // toUtf8() takes a byte string (raw UTF-16 bytes).
      const input = hexToByteString(testCase.input_hex);
      const result = encoding.toUtf8(input);

      // toUtf8() returns real text — compare via its UTF-8 encoding, the
      // same thing PHP's bin2hex() captured from its manually-built bytes.
      expect(textToUtf8Hex(result)).toEqual(testCase.result);
    });
  });
});
