import { Style } from '../lib/report/style.js';
import golden from '../golden/report_style.json';

describe('Style parity with PHP', () => {
  golden.forEach((testCase) => {
    test(`case ${testCase.index}: ${testCase.method} ${JSON.stringify(testCase.input)}`, () => {
      const call = () => {
        if (testCase.method === 'constructor') {
          return new Style(testCase.input.name, testCase.input.style, testCase.input.size);
        }

        return Style.fromXmlAttributes(testCase.input);
      };

      if (testCase.throws) {
        expect(call).toThrow();
        return;
      }

      const style = call();
      expect(style.name).toEqual(testCase.result.name);
      expect(style.style).toEqual(testCase.result.style);
      expect(style.size).toEqual(testCase.result.size);
    });
  });
});
