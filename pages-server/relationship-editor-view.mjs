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

// Views for editing Phase C (phase 5 step 50) - mirrors
// resources/views/edit/new-individual.phtml (shared by every
// "add/create a relative" route) and edit/link-child-to-family.phtml /
// edit/link-spouse-to-individual.phtml. Same shell convention as
// fact-editor-view.mjs (ordinary front-end page, not admin-layout).
//
// Scope cut: new-individual.phtml's "go to new individual" second
// submit button (a `name="goto"`-style alternate action real PHP
// distinguishes only by there being NO `url` field value on that
// button) is omitted - both buttons here just submit the one `url`
// hidden field's value, landing on the same page the first submit
// does (close enough for manual testing; the real distinction is
// which page the browser ends up on, not a different mutation).

import { renderEditGedcomFields } from './gedcom-edit-widgets.mjs';
import { insertMissingFactSubtags } from './gedcom-edit-service.mjs';

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function csrfField(csrfToken) {
  return `<input type="hidden" name="_csrf" value="${escapeHtml(csrfToken)}">`;
}

function renderPageShell({ tree, user, csrfToken, genealogyMenuHtml = '', title, bodyHtml }) {
  const csrfMetaTag = user !== null ? `\n    <meta name="csrf" content="${escapeHtml(csrfToken)}">` : '';

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

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
    <meta charset="UTF-8">${csrfMetaTag}
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title.replace(/<[^>]+>/g, '')}</title>
    <link rel="stylesheet" href="/public/css/vendor.min.css">
    <link rel="stylesheet" href="/public/css/webtrees.min.css">
</head>
<body class="wt-global wt-theme-webtrees">
    <header class="wt-header-wrapper d-print-none">
        <div class="container-lg wt-header-container">
            <div class="row wt-header-content">
                <div class="col wt-site-logo"></div>
                <h1 class="col wt-site-title">${escapeHtml(tree.title)}</h1>
                <div class="col wt-secondary-navigation">
                    <ul class="nav wt-user-menu">${userMenuHtml}
                    </ul>
                </div>
                ${genealogyMenuHtml}
            </div>
        </div>
    </header>

    <main id="content" class="wt-main-wrapper">
        <div class="container-lg wt-main-container">
            <div class="row">
                <div class="col-md-12">
                    ${bodyHtml}
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

/**
 * Mirrors edit/new-individual.phtml - shared by every "add/create a
 * relative" route (AddChildToFamily, AddSpouseToFamily,
 * AddChildToIndividual, AddParentToIndividual, AddSpouseToIndividual,
 * AddUnlinkedIndividual). One collapsible card per candidate fact,
 * each its own blank-field skeleton (gedcom-edit-widgets.mjs).
 *
 * @param {object} params
 * @param {{name: string, title: string}} params.tree
 * @param {object|null} params.user
 * @param {string} params.csrfToken
 * @param {string} [params.genealogyMenuHtml]
 * @param {string} params.title
 * @param {string} params.postUrl
 * @param {string} params.url Cancel / "save and return to" target.
 * @param {Record<string, Array<{recordType: string, tag: string, gedcom: string}>>} params.facts
 *   Keyed by form-field prefix ('i' for the new individual's own
 *   facts, 'f' for the new/linked family's facts) - matches real
 *   PHP's `$facts['i']`/`$facts['f']` passed straight to
 *   editLinesToGedcom(Individual::RECORD_TYPE, ...)/
 *   editLinesToGedcom(Family::RECORD_TYPE, ...) on submit.
 * @param {string} params.treeName
 */
export function renderNewIndividualPage({ tree, user, csrfToken, genealogyMenuHtml = '', title, postUrl, url, facts, treeName }) {
  let cardIndex = 0;
  const cardsHtml = Object.entries(facts)
    .flatMap(([prefix, prefixFacts]) =>
      prefixFacts.map((fact) => {
        const id = `fact-${prefix}-${cardIndex++}`;
        const fullTag = `${fact.recordType}:${fact.tag}`;
        const gedcom = insertMissingFactSubtags(fullTag, fact.gedcom, false, {});
        const fieldsHtml = renderEditGedcomFields({ gedcom, hierarchy: [fact.recordType], treeName, prefix, idPrefix: id });

        return `
            <div class="card mb-2">
                <div class="card-header">
                    <button class="btn btn-small btn-link" type="button" data-bs-toggle="collapse" data-bs-target="#${id}" aria-expanded="false" aria-controls="${id}">
                        <span class="wt-icon-expand">▾</span>
                    </button>
                    ${escapeHtml(fact.tag)}
                </div>
                <div class="card-body pb-1 collapse" id="${id}">
                    ${fieldsHtml}
                </div>
            </div>`;
      }),
    )
    .join('');

  const bodyHtml = `
    <h2 class="wt-page-title">${title}</h2>
    <form method="post" action="${escapeHtml(postUrl)}">
        ${cardsHtml}
        <div class="row mb-3">
            <div class="col-sm-9 offset-sm-3">
                <button class="btn btn-primary" type="submit" name="url" value="${escapeHtml(url)}">save</button>
                <button class="btn btn-primary" type="submit">go to new individual</button>
                <a class="btn btn-secondary" href="${escapeHtml(url)}">cancel</a>
            </div>
        </div>
        ${csrfField(csrfToken)}
    </form>
  `;

  return renderPageShell({ tree, user, csrfToken, genealogyMenuHtml, title, bodyHtml });
}

/**
 * Mirrors edit/link-child-to-family.phtml (LinkChildToFamilyPage).
 *
 * @param {object} params
 * @param {{name: string, title: string}} params.tree
 * @param {object|null} params.user
 * @param {string} params.csrfToken
 * @param {string} [params.genealogyMenuHtml]
 * @param {string} params.title
 * @param {string} params.postUrl
 * @param {string} params.cancelUrl
 * @param {Array<{xref: string, label: string}>} params.families
 * @param {Array<{key: string, label: string}>} params.pedigreeOptions
 */
export function renderLinkChildToFamilyPage({ tree, user, csrfToken, genealogyMenuHtml = '', title, postUrl, cancelUrl, families, pedigreeOptions }) {
  const familyOptions = ['<option value="">&nbsp;</option>']
    .concat(families.map((f) => `<option value="${escapeHtml(f.xref)}">${escapeHtml(f.label)} — ${escapeHtml(f.xref)}</option>`))
    .join('');
  const pediOptions = pedigreeOptions.map((p) => `<option value="${escapeHtml(p.key)}">${escapeHtml(p.label)}</option>`).join('');

  const bodyHtml = `
    <h2 class="wt-page-title">${title}</h2>
    <form method="post" action="${escapeHtml(postUrl)}" class="wt-page-content">
        <div class="row mb-3">
            <label class="col-sm-3 col-form-label" for="famid">Family</label>
            <div class="col-sm-9"><select class="form-select" id="famid" name="famid">${familyOptions}</select></div>
        </div>
        <div class="row mb-3">
            <label class="col-sm-3 col-form-label" for="PEDI">Pedigree</label>
            <div class="col-sm-9">
                <select class="form-select" id="PEDI" name="PEDI">${pediOptions}</select>
                <div class="form-text">A child may have more than one set of parents. The relationship between the child and the parents can be biological, legal, or based on local culture and tradition. If no pedigree is specified, then a biological relationship will be assumed.</div>
            </div>
        </div>
        <div class="row mb-3">
            <div class="col-sm-9 offset-sm-3">
                <button class="btn btn-primary" type="submit">save</button>
                <a class="btn btn-secondary" href="${escapeHtml(cancelUrl)}">cancel</a>
            </div>
        </div>
        ${csrfField(csrfToken)}
    </form>
  `;

  return renderPageShell({ tree, user, csrfToken, genealogyMenuHtml, title, bodyHtml });
}

/**
 * Mirrors edit/link-spouse-to-individual.phtml (LinkSpouseToIndividualPage).
 *
 * @param {object} params
 * @param {{name: string, title: string}} params.tree
 * @param {object|null} params.user
 * @param {string} params.csrfToken
 * @param {string} [params.genealogyMenuHtml]
 * @param {string} params.title
 * @param {string} params.postUrl
 * @param {string} params.cancelUrl
 * @param {string} params.spouseLabel 'Husband' or 'Wife'
 * @param {Array<{xref: string, label: string}>} params.individuals
 * @param {string} params.treeName
 * @param {string} params.marriageGedcom e.g. "1 MARR"
 */
export function renderLinkSpouseToIndividualPage({
  tree,
  user,
  csrfToken,
  genealogyMenuHtml = '',
  title,
  postUrl,
  cancelUrl,
  spouseLabel,
  individuals,
  treeName,
  marriageGedcom,
}) {
  const individualOptions = ['<option value="">&nbsp;</option>']
    .concat(individuals.map((i) => `<option value="${escapeHtml(i.xref)}">${escapeHtml(i.label)} — ${escapeHtml(i.xref)}</option>`))
    .join('');

  const marriageFieldsHtml = renderEditGedcomFields({
    gedcom: insertMissingFactSubtags('FAM:MARR', marriageGedcom, false, {}),
    hierarchy: ['FAM'],
    treeName,
    prefix: 'f',
    idPrefix: 'fact-f-marr',
  });

  const bodyHtml = `
    <h2 class="wt-page-title">${title}</h2>
    <form method="post" action="${escapeHtml(postUrl)}" class="wt-page-content">
        <div class="card mb-2">
            <div class="card-header">${escapeHtml(spouseLabel)}</div>
            <div class="card-body pb-1">
                <select class="form-select" id="spouse" name="spid">${individualOptions}</select>
            </div>
        </div>
        <div class="card mb-2">
            <div class="card-header">Marriage</div>
            <div class="card-body pb-1">${marriageFieldsHtml}</div>
        </div>
        <div class="row mb-3">
            <div class="col-sm-9 offset-sm-3">
                <button class="btn btn-primary" type="submit">save</button>
                <a class="btn btn-secondary" href="${escapeHtml(cancelUrl)}">cancel</a>
            </div>
        </div>
        ${csrfField(csrfToken)}
    </form>
  `;

  return renderPageShell({ tree, user, csrfToken, genealogyMenuHtml, title, bodyHtml });
}
