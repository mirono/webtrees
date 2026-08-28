# Task 04 — Port `DefaultSurnameTradition`

**Priority:** 4
**Complexity:** Medium (introduces two bridging patterns the rest of the
`SurnameTradition` cluster will reuse: shimming a domain object as plain
input, and stubbing `I18N::translate*`)
**Status:** Done
**Unblocks (follow-on batch, not in this task):** the 8 concrete
subclasses — `PatrilinealSurnameTradition`, `MatrilinealSurnameTradition`,
`PaternalSurnameTradition`, `IcelandicSurnameTradition`,
`LithuanianSurnameTradition`, `PolishSurnameTradition`,
`PortugueseSurnameTradition`, `SpanishSurnameTradition` — all in
`app/SurnameTradition/`. Each extends this class and overrides a handful of
methods with the same shape; port them individually, one per LLM session,
once this task's shim pattern is proven.

---

## Phase 0 — Why this one, fourth

Unlike tasks 01-03, this class isn't 100% dependency-free — it's the first
candidate in this batch that requires a **bridging decision**, in miniature:

- Its methods take `Individual|null` and return arrays of GEDCOM `NAME`
  record strings. `Individual` is a heavyweight webtrees domain object
  (backed by GEDCOM record data, itself with DB-adjacent lazy loading).
  Porting `Individual` itself is out of scope — instead, the *input shape
  this class actually needs* is much narrower: `extractName()` only reads
  one already-parsed `NAME` fact's `TYPE` and value off the individual.
- `name()` and `description()` call `I18N::translate()` /
  `translateContext()`, which depend on the full i18n/locale system.

Per the checklist's Phase 3 guidance ("don't migrate a stateful function
until its bridging strategy is decided"), this task decides both narrowly,
scoped to exactly what this class needs — it does not attempt a general
`Individual` or `I18N` port.

**File:** `app/SurnameTradition/DefaultSurnameTradition.php`
**Namespace:** `Fisharebest\Webtrees\SurnameTradition`
**Scope of this task:** the whole file — `buildName()`, `extractName()`,
`newChildNames()`, `newParentNames()`, `newSpouseNames()`, `defaultName()`,
plus `name()`/`description()` under the i18n bridging decision below.

## Bridging decisions for this task

### 1. `Individual` input shim

The only thing `extractName()` does with an `Individual` is:

```php
$fact = $individual
    ->facts(['NAME'])
    ->first(fn (Fact $fact): bool => in_array($fact->attribute('TYPE'), ['', NameType::VALUE_BIRTH, NameType::VALUE_CHANGE], true));

if ($fact instanceof Fact) {
    return $fact->value();
}
```

i.e.: find the first `NAME` fact whose `TYPE` is empty, `BIRTH`
(`NameType::VALUE_BIRTH`), or `CHANGE` (`NameType::VALUE_CHANGE`), and
return its raw GEDCOM value string (e.g. `"John /Smith/"`).

For the JS port, **don't port `Individual`/`Fact`**. Instead, define the
input as a plain array of `{ tag: string, type: string, value: string }`
objects (one per `NAME` fact) and have the JS `extractName()` search that
array directly. This is the actual data dependency; `Individual` is just
how PHP happens to carry it. Confirm the exact `NameType` constant values
before porting (`app/Elements/NameType.php` — likely `'BIRTH'`/`'CHANGE'`,
verify rather than assume) since they're the match criteria.

### 2. `I18N::translate()` / `translateContext()` for `name()`/`description()`

These two methods return a single hardcoded, translated UI label
(`"none"` / empty string for the default tradition) — they carry no branching
logic worth characterizing beyond "does it call the right translate
function with the right arguments." For this task:

- Port them as thin wrappers that call an injected `translate(key)` /
  `translateContext(context, key)` function, passed into the module rather
  than imported — i.e. dependency-inject the i18n boundary instead of
  bridging it for real. This keeps the class runnable in JS today without
  requiring the i18n system to exist yet.
- Characterize only that the *keys/context passed to translate* match the
  PHP source (`I18N::translateContext('Surname tradition', 'none')`) — not
  translated output, since that depends on locale.

## Source (current PHP)

```php
class DefaultSurnameTradition implements SurnameTraditionInterface
{
    protected const string REGEX_GIVN = '~^(?<GIVN>[^/ ]+)~';
    protected const string REGEX_SPFX_SURN = '~(?<NAME>/(?<SPFX>[a-z’\']{0,4}(?: [a-z’\']{1,4})*) ?(?<SURN>[^/]*)/)~';
    protected const string REGEX_SURN = '~(?<NAME>/(?<SURN>[^/]+)/)~';
    protected const string REGEX_SURNS = '~/(?<SURN1>[^ /]+)(?: | y |/ /|/ y /)(?<SURN2>[^ /]+)/~';

    public function name(): string
    {
        return I18N::translateContext('Surname tradition', 'none');
    }

    public function description(): string
    {
        return '';
    }

    public function defaultName(): string
    {
        return '//';
    }

    public function newChildNames(Individual|null $father, Individual|null $mother, string $sex): array
    {
        return [
            $this->buildName('//', ['TYPE' => NameType::VALUE_BIRTH]),
        ];
    }

    public function newParentNames(Individual $child, string $sex): array
    {
        return [
            $this->buildName('//', ['TYPE' => NameType::VALUE_BIRTH]),
        ];
    }

    public function newSpouseNames(Individual $spouse, string $sex): array
    {
        return [
            $this->buildName('//', ['TYPE' => NameType::VALUE_BIRTH]),
        ];
    }

    protected function buildName(string $name, array $parts): string
    {
        $parts = array_filter($parts);

        $parts = array_map(
            static fn (string $tag, string $value): string => "\n2 " . $tag . ' ' . $value,
            array_keys($parts),
            $parts
        );

        if ($name === '') {
            return '1 NAME' . implode($parts);
        }

        return '1 NAME ' . $name . implode($parts);
    }

    protected function extractName(Individual|null $individual): string
    {
        if ($individual instanceof Individual) {
            $fact = $individual
                ->facts(['NAME'])
                ->first(fn (Fact $fact): bool => in_array($fact->attribute('TYPE'), ['', NameType::VALUE_BIRTH, NameType::VALUE_CHANGE], true));

            if ($fact instanceof Fact) {
                return $fact->value();
            }
        }

        return '';
    }
}
```

Note: `DefaultSurnameTradition` itself never actually uses the four
`REGEX_*` constants — they're declared here for subclasses (e.g.
`PatrilinealSurnameTradition` uses `REGEX_SPFX_SURN`). Port the constants
in this task since they're part of this file, but don't expect
characterization cases exercising them until the subclass tasks land —
note that gap explicitly rather than silently skipping test coverage.

## Phase 1 — Characterization test

```php
<?php
// characterize_default_surname_tradition.php
require_once __DIR__ . '/vendor/autoload.php';

use Fisharebest\Webtrees\SurnameTradition\DefaultSurnameTradition;

$tradition = new DefaultSurnameTradition();

$results = [
    'defaultName'     => $tradition->defaultName(),
    'newChildNames'   => $tradition->newChildNames(null, null, 'M'),
    'newParentNames'  => null, // requires a real Individual; see note below
    'newSpouseNames'  => null, // requires a real Individual; see note below
];

// buildName() and extractName() are protected — characterize via a test
// subclass that exposes them, or via reflection, to get golden coverage
// without changing visibility in production code.
$reflection = new ReflectionClass($tradition);
$buildName  = $reflection->getMethod('buildName');
$buildName->setAccessible(true);

$buildName_cases = [
    ['name' => '', 'parts' => []],
    ['name' => '', 'parts' => ['TYPE' => 'BIRTH']],
    ['name' => 'John /Smith/', 'parts' => []],
    ['name' => 'John /Smith/', 'parts' => ['TYPE' => 'BIRTH', 'SPFX' => 'van', 'SURN' => 'Berg']],
    ['name' => 'John /Smith/', 'parts' => ['TYPE' => '']], // empty value -> array_filter drops it
];

$buildName_results = [];
foreach ($buildName_cases as $case) {
    $buildName_results[] = [
        'input'  => $case,
        'output' => $buildName->invoke($tradition, $case['name'], $case['parts']),
        'error'  => null,
    ];
}

file_put_contents(__DIR__ . '/golden/default_surname_tradition.json', json_encode($results, JSON_PRETTY_PRINT));
file_put_contents(__DIR__ . '/golden/default_surname_tradition_buildname.json', json_encode($buildName_results, JSON_PRETTY_PRINT));

// extractName() needs golden cases built from the *shimmed* NAME-fact-array
// input shape decided above, not a real Individual — write these by hand
// against the documented matching rule (first NAME fact with TYPE in
// ['', BIRTH, CHANGE]), then verify the rule against extractName()'s source
// directly (reflection-invoking it with real Individual fixtures from
// tests/data is the more rigorous option if this repo's test fixtures
// support constructing one without a full DB).
```

```js
// parity_default_surname_tradition.test.js
import { DefaultSurnameTradition } from '../lib/surname-tradition/default.js';
import golden from '../golden/default_surname_tradition.json';
import goldenBuildName from '../golden/default_surname_tradition_buildname.json';

describe('DefaultSurnameTradition parity with PHP', () => {
  const tradition = new DefaultSurnameTradition({ translate: (k) => k, translateContext: (c, k) => k });

  test('defaultName', () => {
    expect(tradition.defaultName()).toEqual(golden.defaultName);
  });

  test('newChildNames', () => {
    expect(tradition.newChildNames(null, null, 'M')).toEqual(golden.newChildNames);
  });

  goldenBuildName.forEach(({ input, output }, i) => {
    test(`buildName case ${i}`, () => {
      expect(tradition.buildName(input.name, input.parts)).toEqual(output);
    });
  });
});
```

## Phase 2 — Port prompt (ready to hand to an LLM)

```
Port this PHP class to JavaScript. Match its behavior exactly, including
edge cases — do not "improve" or refactor the logic yet, just translate it
faithfully.

Two bridging decisions have already been made for this port — follow them
exactly rather than re-deciding:

1. extractName() must NOT take a full `Individual` domain object. Instead,
   take a plain array of NAME-fact objects shaped like
   `{ tag: string, type: string, value: string }`, and search that array
   directly for the first entry whose `type` is '', 'BIRTH', or 'CHANGE'
   (verify these exact string values against app/Elements/NameType.php
   before hardcoding them). Return its `value`, or '' if no match/array is
   empty/null.

2. name() and description() must take an injected `{ translate, translateContext }`
   object in the constructor (dependency injection) rather than importing
   an i18n module directly. name() calls
   `translateContext('Surname tradition', 'none')`; description() returns ''
   unconditionally (no translate call at all — do not add one).

PHP source:
<paste DefaultSurnameTradition class from
app/SurnameTradition/DefaultSurnameTradition.php>

Here are characterization test cases it must pass (input → expected output):
<paste golden/default_surname_tradition.json and
golden/default_surname_tradition_buildname.json>

Write a JS class `DefaultSurnameTradition` as the default export from
`lib/surname-tradition/default.js`, with public methods matching the PHP
method names (buildName/extractName can be public in JS even though they're
`protected` in PHP — subclasses will need to call them). Include a short
note on any behavior that could not be replicated identically and how you
handled it, and explicitly flag that the four REGEX_* constants are ported
but unused by this class itself (they exist for subclasses).
```

Then actually run `parity_default_surname_tradition.test.js` against the
golden file — don't take the LLM's word for it. Pay particular attention to
`buildName()`'s handling of empty-string values in `$parts` (PHP's
`array_filter()` with no callback drops falsy values, including `''` —
confirm the JS port reproduces exactly that, not just "some" filtering).

## Definition of done

- [x] `golden/default_surname_tradition.json` and
      `golden/default_surname_tradition_buildname.json` generated from the
      real PHP class (via reflection for the protected `buildName()`).
      6 `buildName` cases, including an added one beyond the original
      plan: `['TYPE' => '0']` — confirmed PHP's `array_filter()` drops the
      string `'0'` too, not just `''` (PHP's classic falsy-string rule),
      which the JS port replicates explicitly via `isPhpFalsy()` rather
      than relying on JS truthiness (which would only drop `''`).
- [x] `extractName()`'s golden cases validated against the actual
      `NameType::VALUE_BIRTH`/`VALUE_CHANGE` constant values (confirmed:
      `'BIRTH'`/`'CHANGE'`, exactly as assumed) — not PHP-generated golden
      JSON, since there's no PHP call to generate it from once
      `Individual` is out of scope; hand-derived cases live directly in
      `js-tests/parity_default_surname_tradition.test.js`, cross-checked
      against `Fact::attribute()`/`value()` (`app/Fact.php:91-165`), which
      confirmed `attribute('TYPE')` returns `''` when a NAME fact has no
      `TYPE` subtag at all — i.e. `type: ''` is the common case, not an
      edge case.
- [x] `lib/surname-tradition/default.js` exports a `DefaultSurnameTradition`
      class taking an injected i18n object.
- [x] `js-tests/parity_default_surname_tradition.test.js` passes 100%
      (18/18).
- [x] The i18n dependency-injection pattern and the NAME-fact-array input
      shape are written down in `lib/surname-tradition/README.md` for the
      8 subclass tasks to reuse.
- [x] Recorded in the Phase 4 cutover table under module
      `lib/surname-tradition`, noting the 8 remaining subclasses as
      follow-on work. **Not bridged to a live PHP call site** — see below.

### Phase 3 bridging: deliberately not done here

Same reasoning as task 3. Real callers exist and are live, not deprecated
— `SurnameTraditionFactory::make()` (`app/Factories/SurnameTraditionFactory.php`)
feeds `newChildNames()`/`newParentNames()`/`newSpouseNames()` to 5 HTTP
request handlers (`AddChildToIndividualPage`, `AddSpouseToIndividualPage`,
`AddParentToIndividualPage`, `AddChildToFamilyPage`, `AddSpouseToFamilyPage`
— the "add family member" form pre-fill). But:

- Only 1 of the 9 registered traditions (`DefaultSurnameTradition`) is
  ported. Most real tree configurations use a different tradition
  (Patrilineal, Paternal, etc.) — none of those are ported yet, so a
  bridge today would only ever fire for a minority of trees.
- Bridging would require the call sites to convert a real `Individual`
  into this port's plain NAME-fact-array shape first — new PHP code at 5
  call sites, not just a `Soundex`-style short-circuit inside one class.

Revisit once enough of the 8 remaining subclasses land that routing
`SurnameTraditionFactory`'s output through Node covers most real trees —
at that point a shared `Individual` → NAME-fact-array conversion helper
(used by all 5 call sites) is the natural place to start, following
[phase3-soundex-bridge.md](phase3-soundex-bridge.md)'s shape.
