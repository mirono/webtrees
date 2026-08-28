# lib/surname-tradition/

Ports of `app/SurnameTradition/*.php`. Read this before porting any of the
8 remaining subclasses (`PatrilinealSurnameTradition`,
`MatrilinealSurnameTradition`, `PaternalSurnameTradition`,
`IcelandicSurnameTradition`, `LithuanianSurnameTradition`,
`PolishSurnameTradition`, `PortugueseSurnameTradition`,
`SpanishSurnameTradition`) — `default.js` (task 4) established two patterns
they should all reuse rather than re-derive:

## 1. `extractName()` takes a plain fact array, not an `Individual`

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
[phase4-cutover-tracking.md](../../docs/php-to-js-migration/phase4-cutover-tracking.md).

## 2. `name()`/`description()` take an injected i18n object

Not a module-level import. The constructor takes
`{ translate, translateContext }`:

```js
new DefaultSurnameTradition({ translate: (k) => ..., translateContext: (c, k) => ... })
```

This keeps every class in this directory runnable in JS without the i18n
system existing. Characterize only the literal key/context strings passed
to `translate`/`translateContext` (verified against the PHP source) — not
translated output, which is locale-dependent and out of scope.

## Subclasses also use the `REGEX_*` constants

`default.js` exports `REGEX_GIVN`/`REGEX_SPFX_SURN`/`REGEX_SURN`/`REGEX_SURNS`
(ported from `DefaultSurnameTradition`'s PHP constants, unused by
`DefaultSurnameTradition` itself but declared there for subclasses — same
as the PHP source). Import them from `./default.js` rather than
redeclaring per-subclass.
