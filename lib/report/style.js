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

// Port of app/Report/Style.php (task 20).

const DEFAULT_FONT_SIZE = 12.0; // app/Report/StyleDefaults.php
const STYLE_FLAGS_RE = /^[biud]*$/;

export class Style {
  /**
   * @param {Record<string,string>} attrs
   */
  static fromXmlAttributes(attrs) {
    if (!('name' in attrs)) {
      throw new Error('The "name" attribute is missing.');
    }

    if (attrs.name === '') {
      throw new Error('The "name" attribute is empty.');
    }

    return new Style(attrs.name, attrs.style ?? '', Number(attrs.size ?? DEFAULT_FONT_SIZE));
  }

  constructor(name, style, size) {
    if (!STYLE_FLAGS_RE.test(style)) {
      throw new Error(`Invalid style flags "${style}". Use only lowercase b, i, u, and d.`);
    }

    this.name = name;
    this.style = style;
    this.size = size;
  }
}
