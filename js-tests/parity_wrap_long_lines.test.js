import { wrapLongLines } from '../lib/services/gedcom-export-service.js';
import golden from '../golden/wrap_long_lines.json';

describe('GedcomExportService.wrapLongLines() parity with PHP', () => {
  golden.forEach((testCase) => {
    test(testCase.label, () => {
      expect(wrapLongLines(testCase.gedcom, testCase.max_line_length)).toEqual(testCase.result);
    });
  });
});

describe('GedcomExportService.wrapLongLines() — pathological input safety', () => {
  // Real PHP hangs forever for a small max_line_length combined with an
  // all-space value (confirmed by hanging and killing the process — see
  // lib/services/gedcom-export-service.js's file-level comment). This
  // input is never reachable through the app's one real call site (always
  // max_line_length = 253), but the JS port must not hang either way.
  test('terminates for a small max_line_length with an all-space value', () => {
    const line = '1 NOTE ' + ' '.repeat(10);

    for (const maxLineLength of [1, 2, 3, 4, 5]) {
      expect(() => wrapLongLines(line, maxLineLength)).not.toThrow();
      const result = wrapLongLines(line, maxLineLength);
      expect(typeof result).toBe('string');
    }
  });
});
