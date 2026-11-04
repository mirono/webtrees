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

// Renders the `<nav class="col wt-primary-navigation">` block built by
// genealogy-menu.mjs's buildGenealogyMenu() - mirrors
// resources/views/components/menu-item.phtml exactly: a menu with
// submenus renders as a Bootstrap dropdown, one with none renders as
// a plain link.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderMenuItem(menu) {
  if (menu.submenus.length > 0) {
    const items = menu.submenus
      .map(
        (submenu) =>
          `<a class="dropdown-item ${escapeHtml(submenu.class)}" href="${escapeHtml(submenu.link)}" role="menuitem">${escapeHtml(submenu.label)}</a>`,
      )
      .join('');

    return (
      `<li class="nav-item dropdown ${escapeHtml(menu.class)}">` +
      `<a href="#" class="nav-link dropdown-toggle" data-bs-toggle="dropdown" role="button" aria-expanded="false">${escapeHtml(menu.label)} <span class="caret"></span></a>` +
      `<div class="dropdown-menu" role="menu">${items}</div>` +
      '</li>'
    );
  }

  return `<li class="nav-item ${escapeHtml(menu.class)}"><a class="nav-link" href="${escapeHtml(menu.link)}">${escapeHtml(menu.label)}</a></li>`;
}

/**
 * @param {Array<{label: string, link: string, class: string, submenus: Array<object>}>} menus see buildGenealogyMenu() in genealogy-menu.mjs
 * @returns {string} empty string when there's nothing to show (matching real PHP's own `<?php if ($tree !== null) : ?>` guard - every call site already only calls this when a tree is in scope, but an empty menu list still renders no `<nav>` at all)
 */
export function renderGenealogyMenuNav(menus) {
  if (menus.length === 0) {
    return '';
  }

  const items = menus.map((menu) => renderMenuItem(menu)).join('');

  return `<nav class="col wt-primary-navigation"><ul class="nav wt-genealogy-menu">${items}</ul></nav>`;
}
