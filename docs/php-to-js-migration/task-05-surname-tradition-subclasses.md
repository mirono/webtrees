# Task 05 — Port the 8 `SurnameTradition` subclasses

**Priority:** 5 (follow-on batch from [task 04](task-04-surname-tradition-default.md))
**Complexity:** Medium-High (small individually, but several PHP-specific
regex behaviors needed empirical verification, not assumption)
**Status:** Done

---

## Scope

All 8 concrete subclasses of `DefaultSurnameTradition`
(`app/SurnameTradition/*.php`), completing `app/SurnameTradition/` —
combined with [task 04](task-04-surname-tradition-default.md), every
class registered by `SurnameTraditionFactory` is now ported.

Real PHP inheritance, mirrored exactly with JS `extends`/`super`:

```
DefaultSurnameTradition                    (task 04)
├── PatrilinealSurnameTradition            lib/surname-tradition/patrilineal.js
│   └── PaternalSurnameTradition           lib/surname-tradition/paternal.js
│       ├── LithuanianSurnameTradition     lib/surname-tradition/lithuanian.js
│       └── PolishSurnameTradition         lib/surname-tradition/polish.js
├── MatrilinealSurnameTradition            lib/surname-tradition/matrilineal.js
├── IcelandicSurnameTradition              lib/surname-tradition/icelandic.js
├── PortugueseSurnameTradition             lib/surname-tradition/portuguese.js
└── SpanishSurnameTradition                lib/surname-tradition/spanish.js
```

`inflect()` (used by Lithuanian/Polish, defined once in
`PatrilinealSurnameTradition`) and the four `REGEX_*` constants (defined
in `DefaultSurnameTradition`, unused there, used by subclasses — see task
04's doc) are inherited the same way in JS as in PHP — not duplicated per
file.

## Characterization approach: no real `Individual`, no real `Tree`/DB

`newParentNames(Individual $child, ...)`/`newSpouseNames(Individual $spouse, ...)`
take a **non-nullable** `Individual`. None of the 8 subclasses override
`extractName()` (already ported+characterized in task 04), so
`bin/characterize_surname_traditions.php` wraps each tradition in an
anonymous subclass that overrides `extractName()` to look up a canned
string by the *identity* (`spl_object_id()`) of whatever object it's
handed — letting `newChildNames()`'s father/mother arguments return two
different extracted names in one call (needed for Portuguese/Spanish,
which read both) without constructing a real `Individual`/`Tree`/DB.
Placeholder `Individual` instances are built via
`ReflectionClass::newInstanceWithoutConstructor()` purely to satisfy the
non-nullable type hints — never actually read.

**After writing this script and its golden fixture, discovered this repo
already has a full, independently-authored PHPUnit suite covering these
exact 9 classes** (`tests/Unit/SurnameTradition/*Test.php`, using
`self::createStub(Individual::class)` — a cleaner technique than the one
above, worth knowing about for future work in this area). Cross-validated
every port against it directly (not just running it — extracting its
input/output pairs and running them through the JS port too), which
caught nothing new but substantially raised confidence, and several of its
richer cases (the full Lithuanian/Polish inflection-suffix matrices, the
Portuguese `' y '`-separator case) were folded into
`golden/surname_traditions.json` for permanent regression coverage rather
than staying one-off manual checks.

## PHP-specific behaviors found and verified (not assumed)

1. **`REGEX_SPFX_SURN`/`REGEX_SURN`/`REGEX_SURNS` have no `/u` (Unicode)
   PCRE modifier**, unlike `inflect()`'s dynamic patterns. Probed directly
   with a name containing U+2019 (`Sean /O’Brien/`): PCRE's byte-mode
   character-class matching happens to work correctly here because the
   character is embedded literally in the pattern source, decomposing
   into its own UTF-8 bytes as class members. Verified this produces no
   observable difference from a natural Unicode-aware JS regex for every
   realistic case tested — ported with the `u` flag (idiomatic JS),
   documented as a verified-harmless simplification in `default.js`.

2. **PHP's `\b` under `/u` is Unicode-aware; JS's `\b` is always
   ASCII-only, even with the `u` flag.** This is a *real*, not
   theoretical, divergence — found by direct execution:
   `preg_replace('~ytė\b~u', 'is', '/Petraitytė/')` correctly produces
   `/Petraitis/` in PHP; the equivalent JS `'/Petraitytė/'.replace(/ytė\b/gu, 'is')`
   silently fails to match at all (JS's `\b` sees no boundary between
   `ė` and `/`). Every `INFLECT_*` table in Lithuanian/Polish uses `\b`
   only as a trailing boundary, so `patrilineal.js`'s `inflect()` rewrites
   a trailing `\b` to `(?![\p{L}\p{N}_])` (Unicode-aware negative
   lookahead) before building the `RegExp` — verified against every rule
   in every table, not just the one case above.

3. **Icelandic's reverse-lookup regexes
   (`~(?<GIVN>[^ /]+)(:?sson)$~`/`~(?<GIVN>[^ /]+)(:?sdottir)$~`) require
   the raw NAME value to literally end in the suffix.** A first draft of
   this task's characterization script used slash-wrapped names (e.g.
   `"Jon /Bjornsson/"`) and got zero matches — caught immediately, since
   the trailing `/` defeats `$`. Icelandic GEDCOM NAME values in this
   tradition are realistically unslashed (consistent with `defaultName()`
   being `''` and `newChildNames()` never wrapping names in `//`); fixed
   the golden data to use realistic unslashed names
   (`"Jon Bjornsson"`), which do match. Also preserved the apparent typo
   `(:?sson)`/`(:?sdottir)` (a capturing group with an optional literal
   `:`, likely meant to be the non-capturing `(?:sson)`) exactly as
   written — confirmed behaviorally identical to the "intended" form for
   every realistic name (none contain a literal `:` before the suffix).

4. **Portuguese/Spanish `newParentNames()` is a PHP `switch` with no
   `default` case** — for any `$sex` other than `'M'`/`'F'`, or no regex
   match, execution falls through to the post-switch fallback return.
   Ported as sequential `if`s ending in the same fallback (not assuming
   `sex` is always `'M'` or `'F'`).

## Definition of done

- [x] `golden/surname_traditions.json` generated from the real PHP
      classes (120 cases across all 8 traditions' `newChildNames`/
      `newParentNames`/`newSpouseNames`, plus `defaultName`).
- [x] All 8 classes ported to `lib/surname-tradition/*.js`, with real JS
      `extends`/`super` mirroring the PHP inheritance chain (not
      flattened/duplicated).
- [x] `js-tests/parity_surname_traditions.test.js` passes 100% (128/128 —
      driven directly off the golden fixture — one test per golden
      case, not hand-duplicated).
- [x] Cross-validated against the pre-existing, independently-authored
      `tests/Unit/SurnameTradition/*Test.php` suite (76 tests, still
      passing, untouched) — including its richer inflection-suffix and
      `' y '`-separator cases, folded into the golden fixture.
- [x] The Unicode `\b` divergence (finding #2 above) is fixed in
      `patrilineal.js`'s shared `inflect()`, not worked around per-table.
- [ ] **Not yet decided: Phase 3 bridging.** Task 04 deferred bridging
      because only 1 of 9 registered traditions was ported — that
      condition no longer holds now that all 9 are. See
      [phase4-cutover-tracking.md](phase4-cutover-tracking.md) for the
      current status; this is a decision to raise with whoever's driving
      the migration, not one to make unilaterally given it touches 5 live
      HTTP request handlers.
