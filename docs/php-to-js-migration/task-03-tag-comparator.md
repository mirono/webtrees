# Task 03 — Port `TagComparator::order()` / `byOrder()`

**Priority:** 3
**Complexity:** Low
**Status:** Not started
**Unblocks (not in this batch):** `FactComparator::byType/byDate/typeOrder`
(`app/Comparators/FactComparator.php`) — deferred until the calendar-date
engine (`app/Date/*`, `app/Date.php`) is ported, since `FactComparator::byDate()`
calls `Date::compare()`. See the Phase 0 inventory for why that's out of
scope for this batch.

---

## Phase 0 — Why this one, third

Trivially pure — a 68-entry constant array plus `array_search` and a
spaceship comparison. No dependencies at all. On its own it's low-value,
but it's the one piece of `app/Comparators/` that has zero coupling to the
not-yet-ported Date engine, and landing it now means `FactComparator` only
needs its own logic ported (not this too) once the Date engine exists.

**File:** `app/Comparators/TagComparator.php`
**Namespace:** `Fisharebest\Webtrees\Comparators`
**Scope of this task:** the whole file — `FACT_ORDER` constant,
`order()`, `byOrder()`.

## Source (current PHP)

```php
final class TagComparator
{
    public const array FACT_ORDER = [
        'SEX', 'NAME', 'BIRT', 'ALIA', 'ADOP', 'CHR', 'BAPM', 'FCOM', 'CONF',
        'BARM', 'BASM', 'EDUC', 'GRAD', 'EMIG', 'IMMI', 'NATU', 'ENGA', 'MARB',
        'MARC', 'MARL', 'MARR', 'DIVF', 'MARS', 'DIV', 'ANUL', 'CENS', 'OCCU',
        'RESI', 'PROP', 'CHRA', 'RETI', 'FACT', 'EVEN', 'NMR', 'NCHI', 'WILL',
        'DEAT', 'CREM', 'BURI', 'PROB', 'TITL', 'COMM', 'NATI', 'CITN', 'CAST',
        'RELI', 'SSN', 'IDNO', 'TEMP', 'SLGC', 'BAPL', 'CONL', 'ENDL', 'SLGS',
        '_FSFTID', 'AFN', 'REFN', 'REF', 'RIN', 'OBJE', 'NOTE', 'SOUR', 'CREA',
        'CHAN', '_TODO', '_UID',
    ];

    public static function order(string $tag): int
    {
        $order = array_search($tag, self::FACT_ORDER, true);

        if ($order === false) {
            // Should always find EVEN!
            $order = (int) array_search('EVEN', self::FACT_ORDER, true);
        }

        return $order;
    }

    public static function byOrder(string $first_tag, string $second_tag): int
    {
        return self::order($first_tag) <=> self::order($second_tag);
    }
}
```

(Full 68-entry array: `app/Comparators/TagComparator.php:26-93` — copy
verbatim, same rule as task 02's lookup tables: this is data, transcribe
exactly, don't reorder or "fix" it even though it looks arbitrary.)

## Notes

- `array_search($tag, self::FACT_ORDER, true)` uses strict (`===`) matching
  — a JS port must use `Array.prototype.indexOf` (which is already strict
  for strings) or an equivalent `Map` lookup, not a loose `==`-style scan.
- The fallback-to-`'EVEN'` behavior when a tag isn't found is the one
  non-obvious branch — an unrecognized tag doesn't throw or return `-1`, it
  silently sorts as if it were `'EVEN'`. Characterize this explicitly.
- `byOrder()` returning a PHP spaceship (`<=>`) result maps directly to JS's
  `a - b` pattern for numeric comparators — no special handling needed, but
  include it in the golden cases anyway so the parity test actually proves
  it rather than assuming it.

## Phase 1 — Characterization test

```php
<?php
// characterize_tag_comparator.php
require_once __DIR__ . '/vendor/autoload.php';

use Fisharebest\Webtrees\Comparators\TagComparator;

$order_cases = [
    'SEX', 'NAME', 'BIRT', 'DEAT', 'CHAN', '_UID',   // spread across the list
    'EVEN',                                          // the fallback target itself
    'NOT_A_REAL_TAG',                                 // unknown tag -> falls back to EVEN's order
    '',                                                // empty string -> also falls back
];

$order_results = [];
foreach ($order_cases as $tag) {
    $order_results[] = ['input' => ['tag' => $tag], 'output' => TagComparator::order($tag), 'error' => null];
}

$byOrder_cases = [
    ['first' => 'BIRT', 'second' => 'DEAT'],   // BIRT before DEAT
    ['first' => 'DEAT', 'second' => 'BIRT'],   // reverse -> opposite sign
    ['first' => 'BIRT', 'second' => 'BIRT'],   // equal -> 0
    ['first' => 'UNKNOWN1', 'second' => 'UNKNOWN2'], // both fall back to EVEN -> 0
    ['first' => 'SEX', 'second' => '_UID'],    // first and (near) last entries
];

$byOrder_results = [];
foreach ($byOrder_cases as $case) {
    $byOrder_results[] = [
        'input'  => $case,
        'output' => TagComparator::byOrder($case['first'], $case['second']),
        'error'  => null,
    ];
}

file_put_contents(__DIR__ . '/golden/tag_comparator_order.json', json_encode($order_results, JSON_PRETTY_PRINT));
file_put_contents(__DIR__ . '/golden/tag_comparator_byorder.json', json_encode($byOrder_results, JSON_PRETTY_PRINT));
```

```js
// parity_tag_comparator.test.js
import { order, byOrder } from '../lib/comparators/tag-comparator.js';
import goldenOrder from '../golden/tag_comparator_order.json';
import goldenByOrder from '../golden/tag_comparator_byorder.json';

describe('TagComparator.order parity with PHP', () => {
  goldenOrder.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.tag}`, () => {
      expect(order(input.tag)).toEqual(output);
    });
  });
});

describe('TagComparator.byOrder parity with PHP', () => {
  goldenByOrder.forEach(({ input, output }, i) => {
    test(`case ${i}: ${input.first} vs ${input.second}`, () => {
      // byOrder only needs to match sign, not exact PHP-internal magnitude,
      // but since PHP's <=> already returns -1/0/1 here, assert exact equality.
      expect(byOrder(input.first, input.second)).toEqual(output);
    });
  });
});
```

## Phase 2 — Port prompt (ready to hand to an LLM)

```
Port this PHP class to JavaScript. Match its behavior exactly, including
edge cases — do not "improve" or refactor the logic yet, just translate it
faithfully.

The FACT_ORDER array is data: copy every entry in the exact order given, do
not reorder, dedupe, or alphabetize it even though it may not look sorted —
the order itself is the semantic content (GEDCOM fact display order).

PHP source:
<paste TagComparator class from app/Comparators/TagComparator.php:24-111>

Here are characterization test cases it must pass (input → expected output):
<paste golden/tag_comparator_order.json and golden/tag_comparator_byorder.json>

Write JS functions `order(tag)` and `byOrder(firstTag, secondTag)` as named
exports from `lib/comparators/tag-comparator.js`, plus a short note on any
behavior that could not be replicated identically and how you handled it.
```

Then actually run `parity_tag_comparator.test.js` against the golden file
— don't take the LLM's word for it.

## Definition of done

- [ ] `golden/tag_comparator_order.json` and
      `golden/tag_comparator_byorder.json` generated from the real PHP class.
- [ ] `lib/comparators/tag-comparator.js` exports `order()` and `byOrder()`.
- [ ] `parity_tag_comparator.test.js` passes 100%, including the
      unknown-tag-falls-back-to-EVEN case.
- [ ] `FACT_ORDER` entry count and order verified to match the PHP source
      exactly (68 entries).
- [ ] Recorded in the Phase 4 cutover table under module
      `lib/comparators`, noted as unblocking `FactComparator` once the Date
      engine is ported.
