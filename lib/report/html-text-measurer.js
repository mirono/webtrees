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

// Port of app/Report/HtmlTextMeasurer.php (task 20).

import { AbstractTextMeasurer } from './abstract-text-measurer.js';

const FIRST_STRONG_ISOLATE = '⁨';
const POP_DIRECTIONAL_ISOLATE = '⁩';

// Typical character widths for sans-serif fonts.
const CHARACTER_WIDTHS = {
  '0': 0.55,
  '1': 0.55,
  '2': 0.55,
  '3': 0.55,
  '4': 0.55,
  '5': 0.55,
  '6': 0.55,
  '7': 0.55,
  '8': 0.55,
  '9': 0.55,
  a: 0.5,
  b: 0.52,
  c: 0.48,
  d: 0.52,
  e: 0.5,
  f: 0.3,
  g: 0.5,
  h: 0.52,
  i: 0.22,
  j: 0.25,
  k: 0.48,
  l: 0.22,
  m: 0.78,
  n: 0.52,
  o: 0.5,
  p: 0.52,
  q: 0.52,
  r: 0.34,
  s: 0.46,
  t: 0.3,
  u: 0.52,
  v: 0.48,
  w: 0.72,
  x: 0.48,
  y: 0.48,
  z: 0.46,
  A: 0.62,
  B: 0.6,
  C: 0.62,
  D: 0.64,
  E: 0.58,
  F: 0.56,
  G: 0.66,
  H: 0.64,
  I: 0.26,
  J: 0.48,
  K: 0.6,
  L: 0.52,
  M: 0.8,
  N: 0.68,
  O: 0.66,
  P: 0.58,
  Q: 0.66,
  R: 0.6,
  S: 0.6,
  T: 0.56,
  U: 0.66,
  V: 0.62,
  W: 0.92,
  X: 0.62,
  Y: 0.62,
  Z: 0.58,
  ' ': 0.3,
  '.': 0.25,
  ',': 0.25,
  ':': 0.25,
  ';': 0.25,
  '!': 0.28,
  '|': 0.28,
  '(': 0.33,
  ')': 0.33,
  '[': 0.33,
  ']': 0.33,
  '-': 0.3,
  '–': 0.5,
  '—': 1.0,
  "'": 0.25,
  '"': 0.3,
  '/': 0.4,
  '\\': 0.4,
  '@': 0.9,
  '#': 0.75,
  '%': 0.75,
  '&': 0.75,
  [FIRST_STRONG_ISOLATE]: 0.0,
  [POP_DIRECTIONAL_ISOLATE]: 0.0,
};

/**
 * Approximate text measurement for the HTML backend.
 *
 * Since the HTML output relies on the browser for final layout, we only
 * need a rough estimate for pre-computing element dimensions during the
 * layout pass.
 */
export class HtmlTextMeasurer extends AbstractTextMeasurer {
  getStringWidth(text, style) {
    const chars = Array.from(text);
    const widths = chars.map((char) => CHARACTER_WIDTHS[char] ?? 0.55);
    const fontStyleMultiplier = style.style === 'b' ? 1.05 : 1.0;

    return widths.reduce((sum, w) => sum + w, 0) * style.size * fontStyleMultiplier;
  }
}
