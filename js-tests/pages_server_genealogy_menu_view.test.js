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

import { describe, expect, test } from 'vitest';
import { renderGenealogyMenuNav } from '../pages-server/genealogy-menu-view.mjs';

describe('renderGenealogyMenuNav', () => {
  test('an empty menu list renders no <nav> at all', () => {
    expect(renderGenealogyMenuNav([])).toBe('');
  });

  test('a menu with no submenus renders as a plain link', () => {
    const html = renderGenealogyMenuNav([{ label: 'Family tree', link: '/tree/ophir', class: 'menu-tree', submenus: [] }]);

    expect(html).toContain('<nav class="col wt-primary-navigation">');
    expect(html).toContain('<a class="nav-link" href="/tree/ophir">Family tree</a>');
    expect(html).not.toContain('dropdown');
  });

  test('a menu with submenus renders as a dropdown', () => {
    const html = renderGenealogyMenuNav([
      {
        label: 'Charts',
        link: '#',
        class: 'menu-chart',
        submenus: [{ label: 'Ancestors', link: '/tree/ophir/ancestors-tree-4/I1', class: '' }],
      },
    ]);

    expect(html).toContain('dropdown-toggle');
    expect(html).toContain('>Charts <span class="caret"></span></a>');
    expect(html).toContain('<a class="dropdown-item " href="/tree/ophir/ancestors-tree-4/I1" role="menuitem">Ancestors</a>');
  });

  test('escapes labels and links', () => {
    const html = renderGenealogyMenuNav([
      { label: '<script>', link: '/tree/a&b', class: 'x', submenus: [] },
    ]);

    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('/tree/a&amp;b');
  });
});
