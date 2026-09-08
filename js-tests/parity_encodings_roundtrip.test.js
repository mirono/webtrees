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
import { hexToByteString, byteStringToHex, textToUtf8Hex } from './helpers/hex.js';
import golden from '../golden/encodings_roundtrip.json';

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

describe('lib/encodings/* toUtf8/fromUtf8 round-trip parity with PHP', () => {
  golden.forEach((testCase, i) => {
    const encoding = ENCODINGS[testCase.encoding];
    const label = testCase.label ?? `byte 0x${testCase.source_byte}`;

    test(`case ${i}: ${testCase.encoding} ${label}`, () => {
      const source = hexToByteString(testCase.source_byte);
      const utf8 = encoding.toUtf8(source);

      if (testCase.round_trip_throws) {
        // MacRoman byte 0xF0 has no TO_UTF8 entry, so toUtf8() passes it
        // through unconverted — the result is a raw, un-decoded byte
        // masquerading as "text" (an invariant break, which is the bug),
        // not real Unicode text, so it must be compared as a raw code
        // unit (byteStringToHex), not UTF-8-re-encoded (textToUtf8Hex).
        // Real PHP fatals with an uncaught TypeError if fromUtf8() is then
        // called on it (preg_split('//u', ...) returns false on invalid
        // input). See docs/php-to-js-migration/task-16-encodings.md. We
        // don't reproduce a crash here — just the passthrough artifact.
        expect(byteStringToHex(utf8)).toEqual(testCase.to_utf8);
        return;
      }

      expect(textToUtf8Hex(utf8)).toEqual(testCase.to_utf8);

      const back = encoding.fromUtf8(utf8);
      expect(byteStringToHex(back)).toEqual(testCase.round_trip);
    });
  });
});
