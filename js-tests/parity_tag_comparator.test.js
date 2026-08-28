import { order, byOrder } from '../lib/comparators/tag-comparator.js';
import goldenOrder from '../golden/tag_comparator_order.json';
import goldenByOrder from '../golden/tag_comparator_byorder.json';

describe('TagComparator.order parity with PHP', () => {
  goldenOrder.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input.tag)}`, () => {
      expect(order(input.tag)).toEqual(output);
    });
  });
});

describe('TagComparator.byOrder parity with PHP', () => {
  goldenByOrder.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.first} vs ${input.second}`, () => {
      expect(byOrder(input.first, input.second)).toEqual(output);
    });
  });
});
