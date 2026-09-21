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

// Hand-rolled HTML for /tree/{tree}/family/{xref} - a deliberately
// scoped-down replica of resources/views/family-page*.phtml, same
// convention as individual-view.mjs (dir="ltr", escapeHtml(), CSRF
// meta tag only when logged in). See
// docs/php-to-js-migration/phase5-family-page.md for the full scope:
// husband/wife/children identity cards (each linking to their own now-
// real /tree/{tree}/individual/{xref} Node route) + marriage/divorce
// vital facts only - no full facts-and-events table, no chart links.

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const UNKNOWN_NAME_HTML = '<span class="NAME" dir="auto" translate="no">…</span>';

// Verified against app/Gedcom.php's real element definitions (the
// I18N::translate() argument each 'FAM:TAG' entry passes), not
// guessed - covers the common FAMILY-level event tags. A tag not
// listed here falls back to the raw tag name, matching
// individual-view.mjs's own convention.
const FACT_LABELS = {
  MARR: 'Marriage',
  DIV: 'Divorce',
  DIVF: 'Divorce filed',
  ANUL: 'Annulment',
  _SEPR: 'Separation',
  ENGA: 'Engagement',
  MARB: 'Marriage banns',
  MARC: 'Marriage contract',
  MARL: 'Marriage license',
  MARS: 'Marriage settlement',
  CENS: 'Family census',
  RESI: 'Family residence',
  EVEN: 'Event',
  NCHI: 'Number of children',
  CHAN: 'Last change',
};

/**
 * Matches resources/views/chart-box.phtml's actual outer structure -
 * an earlier draft of this file invented its own `wt-family-member`/
 * `wt-family-member-role` class names, which don't exist anywhere in
 * this app's real webtrees.min.css, leaving every member "card"
 * completely unstyled. Fixed to use the real classes, but a SECOND,
 * more subtle gap surfaced via a live screenshot comparison the user
 * provided: `wt-chart-box-lifespan` is real, but the real stylesheet
 * has `.wt-family-members .wt-chart-box-lifespan { display: none; }`
 * (confirmed via `grep` on public/css/webtrees.min.css) - PHP's own
 * family-page cards NEVER show the lifespan line at all in this
 * specific context, so rendering it here was always going to be
 * invisible, not a missing feature. What the real page shows instead,
 * confirmed from the same screenshot ("Birth: May 20, 1963 ... — Bat
 * Yam, Israel"), is chart-box.phtml's `wt-chart-box-facts` line - the
 * individual's own birth-event summary - which is NOT
 * `display:none`-d in this context. Ported that instead (birth
 * date+place only, no age-relative-to-parents numbers - those need
 * the parents' own ages, a further scope cut). Also added the real
 * per-sex background class (`wt-chart-box-<sex>`, lowercase - the
 * screenshot's blue/pink card backgrounds) and dropped the always-
 * hidden lifespan div entirely rather than leaving genuinely dead
 * markup in place.
 *
 * @param {{fullNameHtml: string, sex: string, birthSummary: string, url: string}|null} member
 */
function renderMemberCard(member) {
  if (member === null) {
    return `
        <div class="wt-chart-box">${UNKNOWN_NAME_HTML}</div>`;
  }

  const factsHtml = member.birthSummary
    ? `
            <div class="wt-chart-box-facts">
                <div class="wt-chart-box-fact small">${escapeHtml(member.birthSummary)}</div>
            </div>`
    : '';

  return `
        <div class="wt-chart-box wt-chart-box-${escapeHtml(member.sex.toLowerCase())}">
            <div class="wt-chart-box-name"><a href="${escapeHtml(member.url)}">${member.fullNameHtml}</a></div>${factsHtml}
        </div>`;
}

/**
 * Matches resources/views/fact.phtml's ACTUAL row shape - see
 * individual-view.mjs's own renderFact() doc comment for the same
 * "an earlier draft invented non-existent CSS classes" finding, fixed
 * identically here.
 */
/**
 * @param {{tag: string, date: string, time: string, place: string, address: string, author: string}} params
 *   `date`/`time`/`place`/`address`/`author` are raw GEDCOM values, not
 *   locale-formatted (see individual.mjs's own "no Date::display()"
 *   accepted divergence) - `time` only ever accompanies CHAN's own
 *   DATE (a level-3 TIME subline), `author` only ever comes from
 *   CHAN's own `_WT_USER` subtag (app/Elements: 'FAM:CHAN:_WT_USER' =>
 *   'Author of last change') - both harmless no-ops for any other tag.
 */
function renderFact({ tag, date, time, place, address, author }) {
  const label = FACT_LABELS[tag] ?? tag;
  const dateTimeText = time ? `${date} ${time}` : date;
  const dateHtml = date ? `<span class="wt-fact-date-age"><span class="date">${escapeHtml(dateTimeText)}</span></span>` : '';
  const placeHtml = place ? `<div class="wt-fact-place">${escapeHtml(place)}</div>` : '';
  const addressHtml = address ? `<div class="wt-fact-place">Address: ${escapeHtml(address)}</div>` : '';
  const authorHtml = tag === 'CHAN' && author ? `<div class="wt-fact-place">Author of last change: ${escapeHtml(author)}</div>` : '';

  return `
        <tr>
            <th scope="row">
                <div class="wt-fact-label">${escapeHtml(label)}</div>
                <span class="wt-fact-icon wt-fact-icon-${escapeHtml(tag)}" title="${escapeHtml(label)}"></span>
            </th>
            <td>
                <div class="wt-fact-main-attributes">
                    ${dateHtml}
                    ${placeHtml}
                    ${addressHtml}
                    ${authorHtml}
                </div>
            </td>
        </tr>`;
}

/**
 * @param {object} params
 * @param {{title: string}} params.tree
 * @param {{realName: string}|null} params.user
 * @param {string|null} params.csrfToken
 * @param {{
 *   husband: {fullNameHtml: string, sex: string, birthSummary: string, url: string}|null,
 *   wife: {fullNameHtml: string, sex: string, birthSummary: string, url: string}|null,
 *   children: {fullNameHtml: string, sex: string, birthSummary: string, url: string}[],
 *   facts: {tag: string, date: string, time: string, place: string, address: string, author: string}[],
 * }} params.family `husband`/`wife` are null both when the reference
 *   is absent AND when it's present but not currently shown to this
 *   viewer (matches Family::husband()/wife()'s own canShowName()-gated
 *   null-or-Individual return shape) - the view can't tell the two
 *   cases apart and doesn't need to, same as PHP's own template.
 */
export function renderFamilyPage({ tree, user, csrfToken, family }) {
  const csrfMetaTag =
    user !== null
      ? `
    <meta name="csrf" content="${escapeHtml(csrfToken)}">
    <!-- resources/js/webtrees/http.js's httpPost() unconditionally reads
         this tag and throws (synchronously, before ever sending a
         request) if it's missing - required here because "Sign out"
         uses it, same as individual-view.mjs. -->`
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

  const titleHtml = `${family.husband !== null ? family.husband.fullNameHtml : UNKNOWN_NAME_HTML} + ${
    family.wife !== null ? family.wife.fullNameHtml : UNKNOWN_NAME_HTML
  }`;

  // Matches family-page-children.phtml's own "N children"/"No
  // children" badge, always shown regardless of count.
  const childCountLabel =
    family.children.length === 0 ? 'No children' : family.children.length === 1 ? '1 child' : `${family.children.length} children`;
  const childrenHtml =
    `
                        <div class="badge bg-secondary m-2">${escapeHtml(childCountLabel)}</div>` +
    family.children.map((child) => renderMemberCard(child)).join('');

  // Matches family-page.phtml's own "Facts and events" heading
  // (app/Http/RequestHandlers/FamilyPage.php's real template always
  // shows this heading, even for zero facts, with a "No facts exist"
  // message in that case; this v1 only shows the section when there's
  // something to show).
  const factsHtml =
    family.facts.length > 0
      ? `
                    <h3 class="mt-4">Facts and events</h3>
    <table class="table wt-facts-table">
        <tbody>${family.facts.map(renderFact).join('')}
        </tbody>
    </table>`
      : '';

  // dir="ltr" is required, not decorative - see account-view.mjs's own
  // doc comment for the [dir]-selector CSS finding this fix addresses.
  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${titleHtml.replace(/<[^>]*>/g, '')}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees wt-route-family-page">
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
                <div class="col-md-12">
                    <h2 class="wt-page-title">${titleHtml}</h2>

                    <div class="wt-family-members d-flex">
                        ${renderMemberCard(family.husband)}
                        ${renderMemberCard(family.wife)}
                        ${childrenHtml}
                    </div>${factsHtml}
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
