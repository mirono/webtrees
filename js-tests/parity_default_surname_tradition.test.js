import { DefaultSurnameTradition } from '../lib/surname-tradition/default.js';
import golden from '../golden/default_surname_tradition.json';
import goldenBuildName from '../golden/default_surname_tradition_buildname.json';

const i18n = { translate: (key) => key, translateContext: (context, key) => key };

describe('DefaultSurnameTradition parity with PHP', () => {
  const tradition = new DefaultSurnameTradition(i18n);

  test('defaultName', () => {
    expect(tradition.defaultName()).toEqual(golden.defaultName);
  });

  test('newChildNames', () => {
    expect(tradition.newChildNames(null, null, 'M')).toEqual(golden.newChildNames);
  });

  goldenBuildName.forEach(({ input, output }, i) => {
    test(`buildName case ${i}: ${JSON.stringify(input)}`, () => {
      expect(tradition.buildName(input.name, input.parts)).toEqual(output);
    });
  });
});

describe('DefaultSurnameTradition i18n boundary (verified against PHP source, not runtime-characterized)', () => {
  // Per this task's bridging decision, only the literal key/context passed
  // to translate matters here — verified by reading
  // app/SurnameTradition/DefaultSurnameTradition.php directly, not by
  // running I18N (translated output depends on locale).
  test('name() passes the exact context/key PHP uses', () => {
    const calls = [];
    const tradition = new DefaultSurnameTradition({
      translate: (key) => key,
      translateContext: (context, key) => {
        calls.push([context, key]);

        return key;
      },
    });

    tradition.name();

    expect(calls).toEqual([['Surname tradition', 'none']]);
  });

  test('description() calls no translate function at all', () => {
    const translate = vi.fn();
    const translateContext = vi.fn();
    const tradition = new DefaultSurnameTradition({ translate, translateContext });

    expect(tradition.description()).toEqual('');
    expect(translate).not.toHaveBeenCalled();
    expect(translateContext).not.toHaveBeenCalled();
  });
});

describe('DefaultSurnameTradition.extractName (no PHP golden source — see task-04 doc)', () => {
  // extractName() takes a plain NAME-fact array, not a real Individual (the
  // bridging decision this task made), so there is no PHP function to
  // generate golden output from. These cases are derived directly from the
  // documented matching rule (first fact whose type is '', 'BIRTH', or
  // 'CHANGE') and from reading Fact::attribute()/value() (app/Fact.php),
  // which confirmed attribute('TYPE') returns '' when a NAME fact has no
  // TYPE subtag at all - i.e. type: '' represents a real, common case, not
  // just an edge case.
  const tradition = new DefaultSurnameTradition(i18n);

  test('empty type matches (no TYPE subtag in the GEDCOM)', () => {
    const facts = [{ tag: 'NAME', type: '', value: 'John /Smith/' }];

    expect(tradition.extractName(facts)).toEqual('John /Smith/');
  });

  test('BIRTH type matches', () => {
    const facts = [{ tag: 'NAME', type: 'BIRTH', value: 'John /Smith/' }];

    expect(tradition.extractName(facts)).toEqual('John /Smith/');
  });

  test('CHANGE type matches', () => {
    const facts = [{ tag: 'NAME', type: 'CHANGE', value: 'John /Smith/' }];

    expect(tradition.extractName(facts)).toEqual('John /Smith/');
  });

  test('other types (e.g. AKA) do not match', () => {
    const facts = [{ tag: 'NAME', type: 'AKA', value: 'Jack /Smith/' }];

    expect(tradition.extractName(facts)).toEqual('');
  });

  test('first matching fact wins when multiple NAME facts exist', () => {
    const facts = [
      { tag: 'NAME', type: 'AKA', value: 'Jack /Smith/' },
      { tag: 'NAME', type: 'BIRTH', value: 'John /Smith/' },
      { tag: 'NAME', type: 'CHANGE', value: 'Jonathan /Smith/' },
    ];

    expect(tradition.extractName(facts)).toEqual('John /Smith/');
  });

  test('empty array returns empty string', () => {
    expect(tradition.extractName([])).toEqual('');
  });

  test('null returns empty string (mirrors PHP\'s Individual|null parameter)', () => {
    expect(tradition.extractName(null)).toEqual('');
  });

  test('undefined returns empty string', () => {
    expect(tradition.extractName(undefined)).toEqual('');
  });
});
