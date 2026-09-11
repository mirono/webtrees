import { ColorGenerator } from '../lib/color-generator.js';
import golden from '../golden/color_generator.json';

describe('ColorGenerator.getNextColor() parity with PHP', () => {
  golden.forEach((testCase) => {
    test(testCase.label, () => {
      const generator = new ColorGenerator(...testCase.ctor_args);
      const colors = [];

      for (let i = 0; i < testCase.calls; i++) {
        colors.push(generator.getNextColor(testCase.lightness_step, testCase.hue_step));
      }

      expect(colors).toEqual(testCase.colors);
    });
  });
});
