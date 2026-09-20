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

// Hand-rolled HTML for /tree/{tree} - a deliberately scoped-down
// replica of resources/views/tree-page.phtml plus just enough of
// layouts/default.phtml's chrome (header, tree title, "Sign out")
// to look and behave consistently, same convention as
// account-view.mjs/login-view.mjs/home-view.mjs. See
// docs/php-to-js-migration/phase5-tree-page.md for the full scope:
// this is the FIRST tree-scoped route, and TreePage.php is really an
// 8-module block/widget system - only ONE block (WelcomeBlockModule,
// module_name 'gedcom_block') is ported here; every other configured
// block is simply omitted from the layout, not stubbed.
//
// Since Node only ever populates the side-column block and never any
// main-column block, resources/views/tree-page.phtml's own
// `if ($main_blocks->isEmpty() || $side_blocks->isEmpty())` branch
// ALWAYS takes the single full-width col-md-12 path here - the
// two-column 8/4 split is dead code for this port's scope and isn't
// implemented.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Matches resources/views/modules/block-template.phtml's wrapper
 * exactly, minus the $config_url preferences link (WelcomeBlockModule
 * always passes an empty config_url - app/Module/WelcomeBlockModule.php:101).
 * $block is the module_name verbatim, NOT kebab-cased - confirmed live
 * that Laravel's Str::kebab('gedcom_block') leaves it unchanged
 * (kebab() only affects camelCase word boundaries, not existing
 * underscores), so the real wrapper class is wt-block-gedcom_block.
 *
 * Each link's icon is left empty (just the CSS class, e.g. "icon-indis",
 * for styling hooks) rather than rendering real content - PHP's own
 * markup embeds an actual SVG partial (view('icons/user') etc,
 * resources/views/modules/gedcom_block/welcome.phtml) inside the same
 * span; porting those icon partials is a separate, deliberately
 * out-of-scope concern for this step (cosmetic only, not missing
 * functionality).
 */
function renderWelcomeBlock({ blockId, title, links }) {
  const linksHtml = links
    .map(
      (link) => `
        <div class="text-center m-1">
            <a href="${escapeHtml(link.url)}">
                <span class="${escapeHtml(link.iconClass)}"></span>
                <br>
                ${escapeHtml(link.title)}
            </a>
        </div>`,
    )
    .join('');

  return `<div class="card mb-4 wt-block wt-block-gedcom_block" id="block-${escapeHtml(blockId)}">
    <div class="card-header wt-block-header wt-block-header-gedcom_block">${escapeHtml(title)}</div>
    <div class="card-body wt-block-content wt-block-content-gedcom_block">
        <div class="d-flex flex-wrap justify-content-around">${linksHtml}
        </div>
    </div>
</div>`;
}

/**
 * @param {object} params
 * @param {{name: string, title: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken required (non-null) iff params.user !== null
 * @param {{blockId: number, links: {url: string, title: string, iconClass: string}[]}|null} params.welcomeBlock
 *   null if the block should not render at all (disabled, not visible
 *   at the viewer's access level, or no significant individual found)
 */
export function renderTreePage({ tree, user, csrfToken, welcomeBlock }) {
  const csrfMetaTag =
    user !== null
      ? `
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <!-- resources/js/webtrees/http.js's httpPost() unconditionally reads
         this tag and throws (synchronously, before ever sending a
         request) if it's missing - required here because "Sign out"
         uses it, same as account-view.mjs. -->`
      : '';

  const userMenuHtml =
    user !== null
      ? `
                    <li class="nav-item">
                        <span class="nav-link">${escapeHtml(user.realName)}</span>
                    </li>
                    <li class="nav-item menu-logout">
                        <a class="nav-link" href="#" data-wt-post-url="/logout" data-wt-reload-url="/">Sign out</a>
                    </li>`
      : `
                    <li class="nav-item">
                        <a class="nav-link" href="/login">Sign in</a>
                    </li>`;

  const blockHtml =
    welcomeBlock !== null && welcomeBlock.links.length > 0
      ? renderWelcomeBlock({ blockId: welcomeBlock.blockId, title: escapeHtml(tree.title), links: welcomeBlock.links })
      : '';

  // dir="ltr" is required, not decorative - see account-view.mjs's own
  // doc comment for the [dir]-selector CSS finding this fix addresses.
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(tree.title)}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-tree-page">
    <header class="wt-header-wrapper d-print-none">
        <div class="container-lg wt-header-container">
            <div class="row wt-header-content">
                <div class="col wt-site-logo"></div>
                <h1 class="col wt-site-title">${escapeHtml(tree.title)}</h1>
                <div class="col wt-secondary-navigation">
                    <ul class="nav wt-user-menu">${userMenuHtml}
                    </ul>
                </div>
            </div>
        </div>
    </header>

    <main id="content" class="wt-main-wrapper">
        <div class="container-lg wt-main-container">
            <div class="row">
                <div class="col-md-12 wt-main-blocks">
                    ${blockHtml}
                </div>
            </div>
        </div>
    </main>

    <footer class="container-lg wt-footers d-print-none"></footer>

    <script src="/public/js/vendor.min.js"></script>
    <script src="/public/js/webtrees.min.js"></script>
</body>
</html>
`;
}
