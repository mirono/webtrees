# PHP → JS Migration Checklist & Templates

A strangler-fig approach: migrate one function/module at a time, inside the same repo, with parity tests proving each port behaves identically before moving on.

---

## Phase 0 — Inventory & Sequencing

Build a spreadsheet or markdown table of every function/module you plan to migrate.

| Function/Module | File | Dependencies | Global state? (`$_SESSION`, `$_POST`, DB, includes) | Pure logic? | Est. complexity | Priority |
|---|---|---|---|---|---|---|
| `calculateShipping()` | `lib/shipping.php` | none | No | Yes | Low | 1 |
| `validateUser()` | `lib/auth.php` | DB, `$_SESSION` | Yes | No | Medium | 3 |
| `renderInvoice()` | `views/invoice.php` | 4 other functions | Yes | No | High | later |

**Sequencing rules of thumb:**
- Migrate pure/self-contained functions first — no globals, no DB, no session state. These are near-zero-risk and build momentum.
- Push anything touching `$_SESSION`, `$_POST`, includes, or global mutable state to later — you'll need a bridging strategy for these (see Phase 3).
- Group by feature/route where possible so you can migrate a vertical slice and actually cut traffic over to it.

---

## Phase 1 — Characterization Tests (write these BEFORE porting)

Goal: capture current behavior as ground truth, independent of whether you understand *why* it behaves that way.

### Template: characterization test script (PHP side)

```php
<?php
// characterize_calculateShipping.php
// Run the current function against a range of inputs and dump results as JSON.
// This JSON becomes your "golden" answer key for the JS port.

require_once 'lib/shipping.php';

$cases = [
    ['weight' => 1.5, 'zone' => 'domestic'],
    ['weight' => 0,   'zone' => 'domestic'],   // edge case: zero weight
    ['weight' => 50,  'zone' => 'international'],
    ['weight' => -1,  'zone' => 'domestic'],   // edge case: invalid input
    ['weight' => null,'zone' => 'domestic'],   // edge case: null
];

$results = [];
foreach ($cases as $case) {
    try {
        $results[] = [
            'input'  => $case,
            'output' => calculateShipping($case['weight'], $case['zone']),
            'error'  => null,
        ];
    } catch (Throwable $e) {
        $results[] = [
            'input'  => $case,
            'output' => null,
            'error'  => $e->getMessage(),
        ];
    }
}

file_put_contents('golden/calculateShipping.json', json_encode($results, JSON_PRETTY_PRINT));
```

### Template: parity test (JS side, run against the golden file)

```js
// parity_calculateShipping.test.js
import { calculateShipping } from '../lib/shipping.js';
import golden from '../golden/calculateShipping.json';

describe('calculateShipping parity with PHP', () => {
  golden.forEach(({ input, output, error }, i) => {
    test(`case ${i}: ${JSON.stringify(input)}`, () => {
      if (error) {
        expect(() => calculateShipping(input.weight, input.zone)).toThrow();
      } else {
        expect(calculateShipping(input.weight, input.zone)).toEqual(output);
      }
    });
  });
});
```

**Tips for good characterization coverage:**
- Include realistic inputs pulled from production/logs if you can (anonymized).
- Deliberately include edge cases: null, zero, negative, empty string, huge numbers, wrong types — PHP's loose typing hides a lot of implicit behavior that JS won't replicate for free.
- If the function touches dates, currency, or floats, add cases that stress rounding/formatting — this is where silent drift happens most.

---

## Phase 2 — The Port Itself (LLM task template)

Keep each LLM session scoped to one function or tightly-coupled cluster. Use a prompt like:

```
Port this PHP function to JavaScript. Match its behavior exactly, including
edge cases (null handling, type coercion, error conditions) — do not
"improve" or refactor the logic yet, just translate it faithfully.

PHP source:
<paste function>

Here are characterization test cases it must pass (input → expected output):
<paste golden JSON>

Write the JS function plus a short note on any behavior that could not be
replicated identically (e.g. PHP-specific type coercion) and how you handled it.
```

Then actually run the parity test — don't take the LLM's word for it.

---

## Phase 3 — Bridging Strategy for Stateful Code

For functions touching `$_SESSION`, `$_POST`, DB connections, etc., you need a shim so both languages can coexist:

- **Shared session store**: back PHP sessions with Redis/DB instead of native file sessions, so a Node process can read the same session data.
- **Shared DB layer**: keep the same database; write a thin data-access module in JS mirroring the PHP one, don't migrate schema/ORM at the same time as logic.
- **Routing shim**: a reverse proxy (nginx) or a small router that sends migrated routes to the Node service and everything else to PHP, keyed by path.

Don't migrate a stateful function until its bridging strategy is decided — this is the #1 place migrations quietly stall.

---

## Phase 4 — Cutover Tracking

| Route/Feature | Functions migrated | Parity tests passing | Traffic cut over? | Notes |
|---|---|---|---|---|
| `/api/shipping` | 3/3 | ✅ | ✅ 100% | |
| `/api/checkout` | 2/6 | partial | ❌ | blocked on session bridge |

Track this weekly. If a row hasn't moved in two weeks, that's your signal something's blocked (usually Phase 3 stuff) — surface it rather than letting it sit.

---

## Anti-patterns to avoid

- **Don't refactor and translate at the same time.** Port faithfully first, improve later once parity is proven and tested.
- **Don't trust an LLM's claim that "this should behave the same."** Always run the parity test.
- **Don't let unmigrated PHP code rot untested.** If PHP is still serving traffic for a feature, it still needs to work — don't treat it as already-dead code.
- **Don't migrate in giant batches.** If an LLM session is porting more than ~1 function or 1 small module at a time, it's too big to verify properly.
