import { TextWrapper } from '../lib/report/text-wrapper.js';
import { HtmlTextMeasurer } from '../lib/report/html-text-measurer.js';
import { Style } from '../lib/report/style.js';
import golden from '../golden/text_wrapper.json';

describe('TextWrapper parity with PHP', () => {
  const wrapper = new TextWrapper(new HtmlTextMeasurer());

  golden.forEach((testCase) => {
    test(`case ${testCase.index}: ${testCase.label}`, () => {
      const style = testCase.size !== undefined ? new Style('s', '', testCase.size) : new Style('s', '', 1.0);

      if (testCase.throws) {
        expect(() => wrapper.wrapText(testCase.text ?? 'text', style, testCase.first_width ?? 0.0)).toThrow();
        return;
      }

      const lines = wrapper.wrapText(testCase.text, style, testCase.first_width, testCase.subsequent_width);
      expect(lines).toEqual(testCase.lines);

      expect(wrapper.countLines(testCase.text, testCase.first_width, style)).toEqual(testCase.countLines);
      expect(wrapper.textHeight(testCase.text, testCase.first_width, style)).toBeCloseTo(testCase.textHeight, 10);
      expect(wrapper.lastLineWidth(testCase.text, testCase.first_width, style)).toBeCloseTo(testCase.lastLineWidth, 10);
    });
  });
});
