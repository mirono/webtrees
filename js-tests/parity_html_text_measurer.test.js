import { HtmlTextMeasurer } from '../lib/report/html-text-measurer.js';
import { Style } from '../lib/report/style.js';
import widthGolden from '../golden/html_text_measurer_width.json';
import truncateGolden from '../golden/text_measurer_truncate.json';

describe('HtmlTextMeasurer.getStringWidth() parity with PHP', () => {
  const measurer = new HtmlTextMeasurer();

  widthGolden.forEach((testCase) => {
    test(`case ${testCase.index}: ${JSON.stringify(testCase.text)}`, () => {
      const style = new Style('s', testCase.style.style, testCase.style.size);
      expect(measurer.getStringWidth(testCase.text, style)).toBeCloseTo(testCase.result, 10);
    });
  });
});

describe('AbstractTextMeasurer.truncate() parity with PHP (via HtmlTextMeasurer)', () => {
  const measurer = new HtmlTextMeasurer();

  truncateGolden.forEach((testCase) => {
    test(`case ${testCase.index}: ${JSON.stringify(testCase.text)} width=${testCase.width}`, () => {
      const style = new Style('s', '', testCase.size);
      expect(measurer.truncate(testCase.text, testCase.width, style)).toEqual(testCase.result);
    });
  });
});
