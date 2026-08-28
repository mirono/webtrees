# Task 03 — Port `TagComparator::order()` / `byOrder()`

**Priority:** 3
**Complexity:** Low
**Status:** Done
**Unblocks (not in this batch):** `FactComparator::byType/byDate/typeOrder`
(`app/Comparators/FactComparator.php`) — deferred until the calendar-date
engine (`app/Date/*`, `app/Date.php`) is ported, since `FactComparator::byDate()`
calls `Date::compare()`. See the Phase 0 inventory for why that's out of
scope for this batch.

---

## Phase 0 — Why this one, third

Trivially pure — a constant array (66 entries — corrected during
implementation; earlier drafts of this doc said 68, verified wrong by
`(new ReflectionClass(TagComparator::class))->getReflectionConstant('FACT_ORDER')->getValue()`)
plus `array_search` and a spaceship comparison. No dependencies at all. On
its own it's low-value,
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
- **Correction, found by the parity test itself (this doc's original claim
  was wrong):** `byOrder()`'s PHP spaceship (`<=>`) result does *not* map
  directly to JS's `a - b`. PHP's `<=>` always normalizes to exactly
  `-1`/`0`/`1`; a plain `a - b` on two array indices returns the raw
  difference (e.g. `-34` for `'BIRT'` vs `'DEAT'`). The parity test caught
  this immediately (`expected -34 to deeply equal -1`) the first time it
  ran against the golden file — exactly the scenario this doc's own advice
  ("include it in the golden cases anyway so the parity test actually
  proves it rather than assuming it") was written to catch, and it worked.
  Fix: `Math.sign(order(firstTag) - order(secondTag))`.

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

- [x] `golden/tag_comparator_order.json` (9 cases) and
      `golden/tag_comparator_byorder.json` (5 cases) generated from the
      real PHP class.
- [x] `lib/comparators/tag-comparator.js` exports `order()` and `byOrder()`.
- [x] `js-tests/parity_tag_comparator.test.js` passes 100% (14/14),
      including the unknown-tag-falls-back-to-EVEN case and (after the
      `Math.sign()` fix above) the `byOrder()` sign-normalization cases.
- [x] `FACT_ORDER` entry count and order verified to match the PHP source
      exactly — 66 entries (not 68), confirmed both by reflection dump
      (`bin/characterize_tag_comparator.php`'s companion check) and by a
      direct JS-vs-PHP array-equality comparison at implementation time.
- [x] Recorded in the Phase 4 cutover table under module
      `lib/comparators`, noted as unblocking `FactComparator` once the Date
      engine is ported. **Not bridged to a live PHP call site in this
      task** — see the note below.

### Phase 3 bridging: deliberately not done here

Unlike Soundex (tasks [01](task-01-soundex-russell.md)/[02](task-02-soundex-daitch-mokotoff.md)),
this task does not wire `TagComparator` into a live Node-service bridge.
Reasoning, not an oversight:

- Its only current caller is `Fact::sortFactTags()`
  (`app/Fact.php:498-502`), which is itself marked `@deprecated` ("will be
  removed in version 2.3. Use TagComparator::byOrder(...) instead") —
  wiring a live HTTP bridge into code slated for removal is not a good use
  of the added latency/complexity.
- This task's stated purpose (see "Phase 0 — Why this one, third" above)
  is to unblock `FactComparator`, which is where `TagComparator` will
  actually matter in practice — and `FactComparator` isn't ported yet
  (blocked on the Date engine). Bridging now would mean maintaining a live
  cutover path with no real caller benefiting from it.

If this reasoning is wrong — e.g. if `TagComparator::byOrder()` should be
bridged now regardless — extending `server/soundex-service.mjs` (or
splitting it into a more general migration service) with a
`/comparators/tag/order` route and repeating the `app/Soundex.php`-style
short-circuit-with-fallback pattern in `TagComparator::order()`/`byOrder()`
would follow the exact same shape as
[phase3-soundex-bridge.md](phase3-soundex-bridge.md).
