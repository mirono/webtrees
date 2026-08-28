import { PatrilinealSurnameTradition } from '../lib/surname-tradition/patrilineal.js';
import { PaternalSurnameTradition } from '../lib/surname-tradition/paternal.js';
import { MatrilinealSurnameTradition } from '../lib/surname-tradition/matrilineal.js';
import { IcelandicSurnameTradition } from '../lib/surname-tradition/icelandic.js';
import { LithuanianSurnameTradition } from '../lib/surname-tradition/lithuanian.js';
import { PolishSurnameTradition } from '../lib/surname-tradition/polish.js';
import { PortugueseSurnameTradition } from '../lib/surname-tradition/portuguese.js';
import { SpanishSurnameTradition } from '../lib/surname-tradition/spanish.js';
import golden from '../golden/surname_traditions.json';

const i18n = { translate: (key) => key, translateContext: (context, key) => key };

const CLASSES = {
  Patrilineal: PatrilinealSurnameTradition,
  Paternal: PaternalSurnameTradition,
  Matrilineal: MatrilinealSurnameTradition,
  Icelandic: IcelandicSurnameTradition,
  Lithuanian: LithuanianSurnameTradition,
  Polish: PolishSurnameTradition,
  Portuguese: PortugueseSurnameTradition,
  Spanish: SpanishSurnameTradition,
};

/** Plain array of NAME-fact objects for the shimmed extractName() input. */
function nameFacts(rawName) {
  if (rawName === '') {
    return [];
  }

  return [{ tag: 'NAME', type: '', value: rawName }];
}

Object.entries(CLASSES).forEach(([key, TraditionClass]) => {
  describe(`${key}SurnameTradition parity with PHP`, () => {
    const tradition = new TraditionClass(i18n);
    const cases = golden[key];

    test('defaultName', () => {
      expect(tradition.defaultName()).toEqual(cases.defaultName);
    });

    cases.newChildNames.forEach(({ input, output }, i) => {
      test(`newChildNames case ${i}: ${JSON.stringify(input)}`, () => {
        const father = 'father_name' in input ? nameFacts(input.father_name) : null;
        const mother = 'mother_name' in input ? nameFacts(input.mother_name) : null;

        expect(tradition.newChildNames(father, mother, input.sex)).toEqual(output);
      });
    });

    cases.newParentNames.forEach(({ input, output }, i) => {
      test(`newParentNames case ${i}: ${JSON.stringify(input)}`, () => {
        expect(tradition.newParentNames(nameFacts(input.child_name), input.sex)).toEqual(output);
      });
    });

    cases.newSpouseNames.forEach(({ input, output }, i) => {
      test(`newSpouseNames case ${i}: ${JSON.stringify(input)}`, () => {
        expect(tradition.newSpouseNames(nameFacts(input.spouse_name), input.sex)).toEqual(output);
      });
    });
  });
});
