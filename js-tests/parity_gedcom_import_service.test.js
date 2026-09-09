import { reformatRecord } from '../lib/services/gedcom-import-service.js';
import golden from '../golden/reformat_record.json';

function toPreferences(label) {
  if (label.includes('WORD_WRAPPED_NOTES off')) {
    return { wordWrappedNotes: '' };
  }
  if (label.includes('WORD_WRAPPED_NOTES on')) {
    return { wordWrappedNotes: '1' };
  }
  if (label === 'FILE backslashes converted, no media path set') {
    return { gedcomMediaPath: '' };
  }
  if (label === 'FILE strips matching media path prefix' || label === 'FILE with non-matching prefix left alone (backslashes still converted)') {
    return { gedcomMediaPath: 'C:\\photos\\' };
  }
  if (label === 'realistic combined record') {
    return { wordWrappedNotes: '1', gedcomMediaPath: '' };
  }
  return {};
}

describe('GedcomImportService.reformatRecord() parity with PHP', () => {
  golden.forEach((testCase) => {
    test(`[${testCase.group}] ${testCase.label}`, () => {
      const preferences = toPreferences(testCase.label);
      expect(reformatRecord(testCase.input, preferences)).toEqual(testCase.result);
    });
  });
});
