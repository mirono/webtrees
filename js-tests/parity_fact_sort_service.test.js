import { FactSortService } from '../lib/services/fact-sort-service.js';
import golden from '../golden/fact_sort_service.json';

function toShim(fact) {
  return {
    id: fact.id,
    tag: fact.tag,
    value: fact.value,
    attributeDate: fact.attributeDate,
    date: fact.date,
    record: fact.record_xref === null ? null : { xref: fact.record_xref },
  };
}

describe('FactSortService.sort() parity with PHP', () => {
  golden.forEach((scenario) => {
    test(scenario.label, () => {
      const input = scenario.input.map(toShim);
      const service = new FactSortService();
      const result = service.sort(input);

      expect(result.map((f) => f.id)).toEqual(scenario.result.map((f) => f.id));
    });
  });
});
