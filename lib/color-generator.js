/**
 * webtrees: online genealogy
 * Copyright (C) 2026 webtrees development team
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

// Port of app/ColorGenerator.php (task 23) — the final module ported in
// the pure-algorithm-porting phase of this migration (see the survey note
// in docs/php-to-js-migration/phase4-cutover-tracking.md: the remaining
// app/ territory is exhausted of clean pure-algorithm candidates beyond
// this one).
//
// Generates a range of colors for the lifespan chart: lightness cycles
// between the starting lightness and 100% in lightnessStep steps; hue
// steps on each complete lightness cycle, between the starting hue and
// starting hue + range degrees, in hueStep degrees.
//
// Verified (not assumed) via characterization: when a hue step lands
// EXACTLY on the far boundary (`basehue + range`), the boundary value is
// never actually returned — the reset-to-basehue check
// `(hue - basehue) * (hue - (basehue + range)) >= 0` uses `>=`, so hitting
// the boundary exactly resets immediately, and the cycle silently skips
// displaying that hue value. With `range = 0` (degenerate), this
// expression is always a non-negative perfect square, so hue can never
// change at all.

export class ColorGenerator {
  /**
   * @param {number} hue        0deg = red, 120deg = green, 240deg = blue
   * @param {number} saturation percent
   * @param {number} lightness  percent
   * @param {number} alpha
   * @param {number} range      sign determines direction: positive = clockwise, negative = anticlockwise
   */
  constructor(hue, saturation, lightness, alpha, range) {
    this.hue = hue;
    this.basehue = hue;
    this.saturation = saturation;
    this.lightness = lightness;
    this.baselightness = lightness;
    this.alpha = alpha;
    this.range = range;
  }

  /**
   * @param {number} [lightnessStep]
   * @param {number} [hueStep]
   * @returns {string}
   */
  getNextColor(lightnessStep = 10, hueStep = 15) {
    let lightness = this.lightness + lightnessStep;
    let hue = this.hue;

    if (lightness >= 100) {
      lightness = this.baselightness;

      if (this.range > 0) {
        hue += hueStep;
      } else {
        hue -= hueStep;
      }

      if ((hue - this.basehue) * (hue - (this.basehue + this.range)) >= 0) {
        hue = this.basehue;
      }

      this.hue = hue;
    }

    this.lightness = lightness;

    return `hsla(${this.hue}, ${this.saturation}%, ${this.lightness}%, ${this.alpha.toFixed(2)})`;
  }
}
