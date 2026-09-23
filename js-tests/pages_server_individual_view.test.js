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
import { renderIndividualPage } from '../pages-server/individual-view.mjs';

function baseParams(overrides = {}) {
  return {
    tree: { title: 'The Ophir Family Tree' },
    user: null,
    csrfToken: null,
    individual: {
      xref: 'X1',
      fullNameHtml: '<span class="NAME" dir="auto" translate="no">John <span class="SURN">DOE</span></span>',
      lifespan: '1870–1920',
      age: '(aged 50 years)',
      sex: 'M',
      sexValueLabel: 'Male',
      photoImages: [],
      useSilhouette: false,
      names: [],
      facts: [],
      parentFamilies: [],
      spouseFamilies: [],
    },
    ...overrides,
  };
}

describe('renderIndividualPage', () => {
  test('the <html> tag declares dir="ltr"', () => {
    const html = renderIndividualPage(baseParams());

    expect(html).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  // Regression test: the header used tree.name (the short slug, e.g.
  // "ophir") instead of tree.title (the real display title, e.g. "The
  // Ophir Family Tree") - caught via a live screenshot comparison
  // against the real PHP page.
  test('the header shows the tree title, not its slug', () => {
    const html = renderIndividualPage(baseParams());

    expect(html).toContain('<h1 class="col wt-site-title">The Ophir Family Tree</h1>');
  });

  test('the pre-escaped fullNameHtml is inserted raw, not re-escaped', () => {
    const html = renderIndividualPage(baseParams());

    expect(html).toContain('<span class="NAME" dir="auto" translate="no">John <span class="SURN">DOE</span></span>');
  });

  test('lifespan and age are escaped and rendered', () => {
    const html = renderIndividualPage(baseParams());

    expect(html).toContain('1870–1920');
    expect(html).toContain('(aged 50 years)');
  });

  test('the <title> is the plain-text name, not the raw xref', () => {
    const html = renderIndividualPage(baseParams());

    expect(html).toContain('<title>John DOE</title>');
  });

  describe('the photo box', () => {
    test('is omitted entirely when there are no images and silhouettes are disabled', () => {
      const html = renderIndividualPage(baseParams({ individual: { ...baseParams().individual, photoImages: [], useSilhouette: false } }));

      expect(html).not.toContain('col-sm-3');
      expect(html).not.toContain('wt-individual-silhouette');
    });

    test('shows a sex-specific silhouette when there are no images but silhouettes are enabled', () => {
      const html = renderIndividualPage(
        baseParams({ individual: { ...baseParams().individual, sex: 'F', photoImages: [], useSilhouette: true } }),
      );

      expect(html).toContain('wt-individual-silhouette wt-individual-silhouette-f wt-icon-flip-rtl');
    });

    test('renders a single real image directly, with the real img-thumbnail classes', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            photoImages: [{ thumbnailUrl: '/index.php?route=%2Fmedia-thumbnail&xref=M1', srcset: 'a 2x,b 3x,c 4x', alt: 'John DOE' }],
          },
        }),
      );

      expect(html).toContain('src="/index.php?route=%2Fmedia-thumbnail&amp;xref=M1"');
      expect(html).toContain('srcset="a 2x,b 3x,c 4x"');
      expect(html).toContain('class="img-thumbnail img-fluid w-100"');
      expect(html).not.toContain('wt-individual-silhouette');
    });

    test('renders a Bootstrap carousel for multiple images', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            photoImages: [
              { thumbnailUrl: '/img1.jpg', srcset: '', alt: 'John DOE' },
              { thumbnailUrl: '/img2.jpg', srcset: '', alt: 'John DOE' },
            ],
          },
        }),
      );

      expect(html).toContain('id="individual-images" class="carousel slide"');
      expect(html).toContain('carousel-item active');
      expect(html).toContain('src="/img1.jpg"');
      expect(html).toContain('src="/img2.jpg"');
      expect(html).toContain('carousel-control-prev');
      expect(html).toContain('carousel-control-next');
    });
  });

  describe('the Name/Gender accordion', () => {
    test('renders one accordion item per NAME fact, showing the styled full name in the header', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            names: [
              {
                full: '<span class="NAME" dir="auto" translate="no">John <span class="SURN">DOE</span></span>',
                rawValue: 'John /DOE/',
                gedcom: '1 NAME John /DOE/',
                subAttributes: [],
              },
            ],
          },
        }),
      );

      expect(html).toContain('id="individual-names"');
      expect(html).toContain('accordion-item');
      expect(html).toContain('<span class="NAME" dir="auto" translate="no">John <span class="SURN">DOE</span></span>');
    });

    // Regression-guarding test: the accordion BODY shows the raw GEDCOM
    // value (slashes included), not the styled header HTML - a
    // deliberate difference matching real PHP's own
    // individual-page-name.phtml ($fact->value() vs. fullName()).
    test('the accordion body shows the raw NAME value, not the styled header HTML', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            names: [
              {
                full: '<span class="NAME" dir="auto" translate="no">John <span class="SURN">DOE</span></span>',
                rawValue: 'John /DOE/',
                gedcom: '1 NAME John /DOE/',
                subAttributes: [],
              },
            ],
          },
        }),
      );

      expect(html).toContain('<bdi>John /DOE/</bdi>');
    });

    test('renders each name subAttribute as a dt/dd pair', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            names: [
              {
                full: '<span class="NAME">John DOE</span>',
                rawValue: 'John /DOE/',
                gedcom: '1 NAME John /DOE/\n2 GIVN John\n2 SURN DOE',
                subAttributes: [
                  { label: 'Given names', value: 'John' },
                  { label: 'Surname', value: 'DOE' },
                ],
              },
            ],
          },
        }),
      );

      expect(html).toContain('<dt class="col-md-4 col-lg-3">Given names</dt>');
      expect(html).toContain('<dd class="col-md-8 col-lg-9">John</dd>');
      expect(html).toContain('<dt class="col-md-4 col-lg-3">Surname</dt>');
      expect(html).toContain('<dd class="col-md-8 col-lg-9">DOE</dd>');
    });

    test('multiple NAME facts each get their own accordion item', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            names: [
              { full: '<span class="NAME">Primary Name</span>', rawValue: 'Primary /Name/', gedcom: '1 NAME Primary /Name/', subAttributes: [] },
              { full: '<span class="NAME">Nick Name</span>', rawValue: 'Nick /Name/', gedcom: '1 NAME Nick /Name/\n2 TYPE aka', subAttributes: [] },
            ],
          },
        }),
      );

      expect(html).toContain('Primary Name');
      expect(html).toContain('Nick Name');
      expect(html).toContain('— aka');
    });

    test('always renders a Sex accordion item, with the real translated value label', () => {
      const html = renderIndividualPage(baseParams({ individual: { ...baseParams().individual, sexValueLabel: 'Female' } }));

      expect(html).toContain('<span class="label">Sex</span>');
      expect(html).toContain('Female');
    });
  });

  describe('the tabs bar', () => {
    test('all 8 real tabs are present, in their real default order', () => {
      const html = renderIndividualPage(baseParams());

      const order = ['Facts and events', 'Families', 'Sources', 'Notes', 'Media', 'Album', 'Interactive tree', 'Places'];
      let lastIndex = -1;

      for (const title of order) {
        const index = html.indexOf(`href="#tab-${title === 'Facts and events' ? 'facts' : title.toLowerCase().replace(/ /g, '-')}"`);
        expect(index).toBeGreaterThan(lastIndex);
        lastIndex = index;
      }

      expect(html).toContain('Facts and events');
      expect(html).toContain('Families');
      expect(html).toContain('Sources');
      expect(html).toContain('Notes');
      expect(html).toContain('Media');
      expect(html).toContain('Album');
      expect(html).toContain('Interactive tree');
      expect(html).toContain('Places');
    });

    test('the first tab (Facts and events) is active by default', () => {
      const html = renderIndividualPage(baseParams());

      expect(html).toContain('<a class="nav-link active" data-bs-toggle="tab" role="tab" href="#tab-facts">Facts and events</a>');
      expect(html).toContain('<div id="tab-facts" class="tab-pane mt-2 fade show active"');
    });

    test('stub tabs (Sources/Notes/Media/Album/Interactive tree/Places) show the "not yet available" placeholder', () => {
      const html = renderIndividualPage(baseParams());
      const stubCount = html.split('This feature has not been migrated yet.').length - 1;

      // 6 permanently-stubbed tabs + Facts (empty facts list) + Families
      // (no related families) both also falling back to the same
      // placeholder in this default (empty) fixture.
      expect(stubCount).toBe(8);
    });
  });

  describe('the Families tab', () => {
    test('shows the stub placeholder when there are no related families', () => {
      const html = renderIndividualPage(baseParams());

      expect(html).toContain('id="tab-families"');
    });

    test('renders a parent family with a "Parents" label, linking to the family page', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            parentFamilies: [{ titleHtml: '<span class="NAME">Dad</span> + <span class="NAME">Mom</span>', url: '/tree/ophir/family/F1' }],
          },
        }),
      );

      expect(html).toContain('Parents');
      expect(html).toContain('href="/tree/ophir/family/F1"');
      expect(html).toContain('<span class="NAME">Dad</span> + <span class="NAME">Mom</span>');
    });

    test('renders a spouse family with a "Spouse family" label', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            spouseFamilies: [{ titleHtml: '<span class="NAME">John</span> + <span class="NAME">Jane</span>', url: '/tree/ophir/family/F2' }],
          },
        }),
      );

      expect(html).toContain('Spouse family');
      expect(html).toContain('href="/tree/ophir/family/F2"');
    });

    test('renders multiple parent and spouse families, each on their own row', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            parentFamilies: [{ titleHtml: 'Family A', url: '/tree/ophir/family/F1' }],
            spouseFamilies: [
              { titleHtml: 'Family B', url: '/tree/ophir/family/F2' },
              { titleHtml: 'Family C', url: '/tree/ophir/family/F3' },
            ],
          },
        }),
      );

      expect(html).toContain('Family A');
      expect(html).toContain('Family B');
      expect(html).toContain('Family C');
    });
  });

  describe('the Facts and events tab', () => {
    test('shows the stub placeholder when there are no facts', () => {
      const html = renderIndividualPage(baseParams({ individual: { ...baseParams().individual, facts: [] } }));

      expect(html).not.toContain('wt-facts-table');
    });

    test('renders each fact with a known label', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            facts: [
              { tag: 'BIRT', date: '12 AUG 1870', place: 'London' },
              { tag: 'DEAT', date: '1 JAN 1920', place: 'Paris' },
            ],
          },
        }),
      );

      expect(html).toContain('Birth');
      expect(html).toContain('12 AUG 1870');
      expect(html).toContain('London');
      expect(html).toContain('Death');
      expect(html).toContain('1 JAN 1920');
      expect(html).toContain('Paris');
    });

    // Regression test: an earlier draft used invented CSS classes
    // (descriptionbox/rela) that don't exist in this app's real
    // webtrees.min.css at all, leaving the whole table unstyled -
    // assert the REAL class names fact.phtml actually uses.
    test('uses the real fact.phtml class names, not invented ones', () => {
      const html = renderIndividualPage(
        baseParams({ individual: { ...baseParams().individual, facts: [{ tag: 'BIRT', date: '12 AUG 1870', place: 'London' }] } }),
      );

      expect(html).toContain('wt-fact-label');
      expect(html).toContain('wt-fact-icon wt-fact-icon-BIRT');
      expect(html).toContain('wt-fact-date-age');
      expect(html).toContain('wt-fact-place');
      expect(html).not.toContain('descriptionbox');
    });

    test('an unrecognized tag falls back to the raw tag name', () => {
      const html = renderIndividualPage(
        baseParams({ individual: { ...baseParams().individual, facts: [{ tag: 'CREM', date: '', place: '' }] } }),
      );

      expect(html).toContain('Cremation');
    });

    test('escapes date/place content', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: { ...baseParams().individual, facts: [{ tag: 'BIRT', date: '<script>alert(1)</script>', place: '' }] },
        }),
      );

      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;');
    });

    // Regression test: an earlier draft narrowed this list to just
    // BIRT/CHR/BAPM/DEAT/BURI/CREM, invisible for the many other real
    // event/attribute tags (RESI, CENS, IMMI, EVEN, ...) the user's
    // real imported tree turned out to have.
    test('renders non-vital event/attribute facts too, e.g. Residence', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: { ...baseParams().individual, facts: [{ tag: 'RESI', date: '27 APR 1996', place: 'Ramat Gan, Israel' }] },
        }),
      );

      expect(html).toContain('Residence');
      expect(html).toContain('27 APR 1996');
      expect(html).toContain('Ramat Gan, Israel');
    });

    test('renders CHAN with date and time in separate spans, and an author line', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            facts: [{ tag: 'CHAN', date: 'November 9, 2018', time: '19:38:08', place: '', author: 'miron' }],
          },
        }),
      );

      expect(html).toContain('Last change');
      expect(html).toContain('<span class="date">November 9, 2018</span> – <span class="date">19:38:08</span>');
      expect(html).toContain('<span class="label">Author of last change</span>: <span class="value align-top">miron</span>');
    });

    // Regression test: reported live - Miron Ophir's own page was
    // missing his Marriage/Family residence facts, both of which live
    // on his FAMILY record, not his own (index.mjs's
    // familyFactsForIndividual() merges them in, tagged fromFamily).
    // A family fact keeps its ORIGINAL record's label (e.g. "Family
    // residence", not "Residence") - real PHP's Fact::label() looks up
    // the fact's OWN record's tag prefix, not the viewing page's.
    test('a merged-in family fact (fromFamily: true) uses the FAMILY-level label, distinct from the same tag on the individual\'s own record', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: {
            ...baseParams().individual,
            facts: [
              { tag: 'RESI', date: '27 APR 1996', place: 'Ramat Gan, Israel', fromFamily: true },
              { tag: 'MARR', date: '17 AUG 1995', place: 'Kibutz Einat, Israel', fromFamily: true },
            ],
          },
        }),
      );

      expect(html).toContain('Family residence');
      expect(html).toContain('Marriage');
      expect(html).not.toMatch(/wt-fact-label">Residence</);
    });

    test('the same RESI tag on the individual\'s OWN record (fromFamily unset) still uses the individual-level label', () => {
      const html = renderIndividualPage(
        baseParams({
          individual: { ...baseParams().individual, facts: [{ tag: 'RESI', date: '1 JAN 2000', place: 'London' }] },
        }),
      );

      expect(html).toContain('wt-fact-label">Residence');
      expect(html).not.toContain('Family residence');
    });
  });

  describe('the header, logged-in vs. anonymous', () => {
    test('an anonymous visitor sees a "Sign in" link and no CSRF meta tag', () => {
      const html = renderIndividualPage(baseParams({ user: null, csrfToken: null }));

      expect(html).toContain('href="/login"');
      expect(html).toContain('Sign in');
      expect(html).not.toContain('<meta name="csrf"');
    });

    test('a logged-in user sees their name, a "Sign out" control, and the CSRF meta tag', () => {
      const html = renderIndividualPage(baseParams({ user: { realName: 'Miron Ophir' }, csrfToken: 'test-token' }));

      expect(html).toContain('Miron Ophir');
      expect(html).toContain('data-wt-post-url="/logout"');
      expect(html).toContain('<meta name="csrf" content="test-token">');
    });
  });
});
