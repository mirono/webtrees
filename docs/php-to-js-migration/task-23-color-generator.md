# Task 23 — Port `app/ColorGenerator.php`

**Priority:** 23
**Complexity:** Low
**Status:** Done
**Unblocks:** None — this closes out the pure-algorithm-porting phase of the migration (see "What this port proves" below).

---

## What this port proves

Two consecutive, genuinely thorough survey passes (before and after task 22) concluded that the remaining `app/` territory is exhausted of clean, self-contained, pure-algorithm candidates — everything left sorts into DB Query Builder services, filesystem/network-fused services, I18N-string-returning helpers, thin 1-2 line wrappers, or GEDCOM-record classes whose interesting methods return objects that escape into dozens of call sites. `ColorGenerator` was the one remaining candidate that survived both passes: small, but a real algorithm (HSL color cycling for the lifespans chart), fully self-contained, with a single clean call site. Porting it here is a deliberate closeout, not a continuation — see the recorded decision in `phase4-cutover-tracking.md` for what comes next (bridge-activation decisions, not further pure-function hunting).

---

## Scope

**File:** `app/ColorGenerator.php` (62 lines, ported in full)
**Target:** `lib/color-generator.js` (`class ColorGenerator`)
**Golden fixture:** `golden/color_generator.json` (17 scenarios, most running many sequential `getNextColor()` calls each)
**Characterization script:** `bin/characterize_color_generator.php`
**Parity test:** `js-tests/parity_color_generator.test.js`

---

## The algorithm, verified rather than assumed

`getNextColor()` cycles `lightness` from its starting value up to just under 100% in `lightnessStep` increments; each time it would reach or exceed 100%, `lightness` resets to its starting value and `hue` steps by `hueStep` (in the direction `range`'s sign indicates), wrapping back to the starting hue once it reaches or passes `basehue + range`.

**Verified, not assumed**: the wraparound check (`(hue - basehue) * (hue - (basehue + range)) >= 0`) uses `>=`, not `>`. When a hue step lands *exactly* on the far boundary (`basehue + range`), this expression evaluates to exactly `0`, which satisfies `>= 0` — so the boundary value is reset away immediately and **never actually appears in the output**. Confirmed with a dedicated golden case where `range` is an exact multiple of `hueStep` (`range = 30, hueStep = 15`): the hue sequence is `15, 0, 15, 0, ...` — `30` (the boundary) never appears, even though the increment logic passes through it on every other cycle. The mirror case with a negative `range` behaves symmetrically. A degenerate `range = 0` was also checked: the wraparound expression becomes a non-negative perfect square on every step, so `hue` can never actually change at all — confirmed empirically rather than reasoned about abstractly, since a squared term being "always non-negative" is the kind of thing worth actually running rather than trusting algebra alone.

`sprintf('%0.2f', $alpha)` and JS's `alpha.toFixed(2)` were checked against each other directly for rounding-boundary values (`0.005`, `0.995`, `0.333333`) — identical output in every case tried, so `toFixed(2)` was used directly rather than a hand-rolled formatter.

---

## Test cases (17 scenarios, most multi-call sequences)

The three real production configurations from `LifespansChartModule.php` (hue 240/anticlockwise, hue 0/clockwise, hue 120/clockwise, all with the app's real saturation/lightness/alpha/range constants), default vs. custom `lightnessStep`/`hueStep` arguments (including a fine-grained 1-degree/1-percent run), the exact-boundary-hit case in both directions, the degenerate zero-range case, a negative starting hue, alpha-formatting edge cases, a lightness value that's already ≥100 at construction (triggering an immediate reset on the very first call), and a single-call case.

All 17 pass; full suite (`npm test`) is 4,013/4,013.

---

## Why no bridge was built

Single real call site (`LifespansChartModule.php`, 3 instantiations), used purely to precompute CSS color strings for a client-rendered chart — no meaningful latency to save via a network round-trip for what's already a handful of cheap string-formatting calls per chart render.

---

## Definition of done

- [x] `lib/color-generator.js` exports `class ColorGenerator` with the full constructor and `getNextColor()`.
- [x] `golden/color_generator.json` generated from the real PHP class via `bin/characterize_color_generator.php`.
- [x] `js-tests/parity_color_generator.test.js` — 17/17 scenarios pass.
- [x] Full suite passes: `npm test` → 4,013/4,013 ✓.
- [x] The exact-boundary-skip behavior and the zero-range degenerate case were verified against real PHP execution, not assumed from reading the arithmetic.
- [x] Recorded in `phase4-cutover-tracking.md`, along with the decision to conclude the pure-algorithm-porting phase here.
- [x] Task doc written (this file).
