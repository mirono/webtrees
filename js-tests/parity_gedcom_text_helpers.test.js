import { getSubRecord, getCont } from '../lib/report/gedcom-text-reader.js';
import { getNoteText, firstLineOfTextFromHtml } from '../lib/note.js';
import golden from '../golden/gedcom_text_helpers.json';

describe('GedcomTextReader.getSubRecord() parity with PHP', () => {
  golden
    .filter((c) => c.group === 'getSubRecord')
    .forEach((testCase) => {
      test(testCase.label, () => {
        const { level, tag, gedrec, num } = testCase.input;
        expect(getSubRecord(level, tag, gedrec, num)).toEqual(testCase.result);
      });
    });
});

describe('GedcomTextReader.getCont() parity with PHP', () => {
  golden
    .filter((c) => c.group === 'getCont')
    .forEach((testCase) => {
      test(testCase.label, () => {
        const { level, record } = testCase.input;
        expect(getCont(level, record)).toEqual(testCase.result);
      });
    });
});

describe('Note.getNote() parity with PHP', () => {
  golden
    .filter((c) => c.group === 'getNote')
    .forEach((testCase) => {
      test(testCase.label, () => {
        expect(getNoteText(testCase.input.gedcom)).toEqual(testCase.result);
      });
    });
});

describe('Note.firstLineOfTextFromHtml() parity with PHP', () => {
  golden
    .filter((c) => c.group === 'firstLineOfTextFromHtml')
    .forEach((testCase) => {
      test(testCase.label, () => {
        expect(firstLineOfTextFromHtml(testCase.input.html)).toEqual(testCase.result);
      });
    });
});
