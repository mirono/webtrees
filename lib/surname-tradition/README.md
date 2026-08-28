# lib/surname-tradition/

Ports of `app/SurnameTradition/*.php`. All 9 registered traditions are
ported (task 4: `DefaultSurnameTradition`; task 5: the 8 subclasses below).
Read this before touching any file here.

## File map (mirrors the real PHP inheritance chain)

```
default.js       DefaultSurnameTradition
patrilineal.js    ├─ PatrilinealSurnameTradition
paternal.js       │   └─ PaternalSurnameTradition
lithuanian.js      │       ├─ LithuanianSurnameTradition
polish.js          │       └─ PolishSurnameTradition
matrilineal.js    ├─ MatrilinealSurnameTradition
icelandic.js      ├─ IcelandicSurnameTradition
portuguese.js     ├─ PortugueseSurnameTradition
spanish.js        └─ SpanishSurnameTradition
name-type.js      NameType::VALUE_* constants this tree needs
```

Real JS `extends`/`super` throughout — a subclass's fallback branch calls
`super.newChildNames(...)` etc. exactly where the PHP source calls
`parent::newChildNames(...)`, walking up the same chain. Lithuanian/Polish
are the one exception: their PHP source doesn't delegate to `parent::` at
all on a no-match fallback (each hardcodes its own `'//'` fallback), so
neither does the JS port — don't "fix" that into a `super` call.

## Patterns every file here follows (established in task 4, reused since)

### 1. `extractName()` takes a plain fact array, not an `Individual`

PHP's `extractName(Individual|null $individual)` only ever reads one
already-parsed `NAME` fact's `TYPE` and value off the individual. The JS
port takes that narrower shape directly:

```js
/** @param {Array<{tag: string, type: string, value: string}>|null|undefined} nameFacts */
extractName(nameFacts) { ... }
```

`Individual`/`Fact` are not ported. Whatever calls into these classes from
PHP is responsible for converting a real `Individual` into this shape
before crossing the bridge — not yet done, see
[phase4-cutover-tracking.md](../../docs/php-to-js-migration/phase4-cutover-tracking.md)
(now that all 9 traditions are ported, revisit whether this is worth doing).

### 2. `name()`/`description()` take an injected i18n object

Not a module-level import. The constructor takes
`{ translate, translateContext }`:

```js
new DefaultSurnameTradition({ translate: (k) => ..., translateContext: (c, k) => ... })
```

This keeps every class in this directory runnable in JS without the i18n
system existing. Characterize only the literal key/context strings passed
to `translate`/`translateContext` (verified against the PHP source) — not
translated output, which is locale-dependent and out of scope.

### 3. `REGEX_*` constants live in `default.js`

`REGEX_GIVN`/`REGEX_SPFX_SURN`/`REGEX_SURN`/`REGEX_SURNS` are declared in
`default.js` (unused by `DefaultSurnameTradition` itself, same as PHP) —
import them from there rather than redeclaring per-subclass.

### 4. PHP's `\b` under `/u` is Unicode-aware; JS's `\b` never is

Found in task 5 (see `docs/php-to-js-migration/task-05-surname-tradition-subclasses.md`
for the full writeup): every `INFLECT_*` suffix table (Lithuanian/Polish)
uses `\b` as a trailing boundary after possibly-accented letters (e.g.
`'ytė\b'`, `'żki\b'`). PHP matches these correctly; a literal JS `\b`
silently fails to match after a non-ASCII letter, even with the `u` flag.
`patrilineal.js`'s shared `inflect()` rewrites a trailing `\b` to
`(?![\p{L}\p{N}_])` before building the `RegExp` — reuse `inflect()`
rather than re-deriving this fix if a future tradition needs its own
suffix table.
