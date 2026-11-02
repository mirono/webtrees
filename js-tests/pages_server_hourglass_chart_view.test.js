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
import {
  renderHourglassAncestorsNode,
  renderHourglassDescendantsNode,
  renderHourglassChart,
  renderHourglassChartPage,
} from '../pages-server/hourglass-chart-view.mjs';

function baseBox(overrides = {}) {
  return {
    xref: 'I1',
    url: '/tree/ophir/individual/I1',
    canShow: true,
    fullNameHtml: '<span>John Smith</span>',
    alternateNameHtml: '',
    sex: 'M',
    lifespanText: '1900–1980',
    birthSummaryHtml: '',
    deathSummaryHtml: '',
    thumbnailUrl: null,
    ...overrides,
  };
}

describe('renderHourglassAncestorsNode', () => {
  test('both sides shown, neither recurses further', () => {
    const node = {
      familyXref: 'F1',
      husband: { box: baseBox({ xref: 'I2', fullNameHtml: '<span>Father</span>' }), further: null },
      wife: { box: baseBox({ xref: 'I3', fullNameHtml: '<span>Mother</span>', sex: 'F' }), further: null },
    };
    const html = renderHourglassAncestorsNode(node, 'ophir');

    expect(html).toContain('Father');
    expect(html).toContain('Mother');
    expect(html).not.toContain('hourglass-arrow');
  });

  test('a side with no box (privacy-gated) renders an empty box, no further', () => {
    const node = {
      familyXref: 'F1',
      husband: { box: null, further: null },
      wife: { box: baseBox({ xref: 'I3' }), further: null },
    };
    const html = renderHourglassAncestorsNode(node, 'ophir');

    expect(html).toContain('<div class="wt-chart-box"></div>');
  });

  test('a lazy-load arrow links to the Ancestors action with the own parent family xref', () => {
    const node = {
      familyXref: 'F1',
      husband: { box: baseBox({ xref: 'I2' }), further: { kind: 'arrow', familyXref: 'F99' } },
      wife: { box: null, further: null },
    };
    const html = renderHourglassAncestorsNode(node, 'ophir');

    expect(html).toContain('class="hourglass-arrow"');
    expect(html).toContain('data-wt-chart-xref="/module/hourglass_chart/Ancestors/ophir?xref=F99"');
  });

  test('a nested node recurses, with no arrow at that level', () => {
    const grandparentNode = {
      familyXref: 'F2',
      husband: { box: baseBox({ xref: 'I4', fullNameHtml: '<span>Grandfather</span>' }), further: null },
      wife: { box: null, further: null },
    };
    const node = {
      familyXref: 'F1',
      husband: { box: baseBox({ xref: 'I2' }), further: { kind: 'nested', node: grandparentNode } },
      wife: { box: null, further: null },
    };
    const html = renderHourglassAncestorsNode(node, 'ophir');

    expect(html).toContain('Grandfather');
    expect(html).not.toContain('hourglass-arrow');
  });
});

describe('renderHourglassDescendantsNode', () => {
  test('a single child gets the plain horizontal-line connector', () => {
    const html = renderHourglassDescendantsNode([{ box: baseBox(), spouseBoxes: [], further: null }], 'ophir', false);

    expect(html).toContain('wt-chart-horizontal-line');
    expect(html).not.toContain('wt-chart-horizontal-first-child');
  });

  test('three children get first/middle/last connector classes in order', () => {
    const items = [
      { box: baseBox({ xref: 'I1' }), spouseBoxes: [], further: null },
      { box: baseBox({ xref: 'I2' }), spouseBoxes: [], further: null },
      { box: baseBox({ xref: 'I3' }), spouseBoxes: [], further: null },
    ];
    const html = renderHourglassDescendantsNode(items, 'ophir', false);
    const firstIndex = html.indexOf('wt-chart-horizontal-first-child');
    const middleIndex = html.indexOf('wt-chart-horizontal-middle-child');
    const lastIndex = html.indexOf('wt-chart-horizontal-last-child');

    expect(firstIndex).toBeGreaterThan(-1);
    expect(middleIndex).toBeGreaterThan(firstIndex);
    expect(lastIndex).toBeGreaterThan(middleIndex);
  });

  test('no children renders no trailing spacer', () => {
    expect(renderHourglassDescendantsNode([], 'ophir', false)).not.toContain('wt-chart-horizontal-line');
  });

  test('spouses=false renders no spouse boxes and no leading/trailing nbsp', () => {
    const html = renderHourglassDescendantsNode([{ box: baseBox(), spouseBoxes: [baseBox({ xref: 'I9' })], further: null }], 'ophir', false);

    expect(html).not.toContain('&nbsp;');
    expect(html).not.toContain('I9');
  });

  test('spouses=true renders each spouse box (possibly an empty placeholder) and &nbsp; spacers', () => {
    const html = renderHourglassDescendantsNode(
      [{ box: baseBox({ xref: 'I1' }), spouseBoxes: [baseBox({ xref: 'I9', fullNameHtml: '<span>Spouse</span>' }), null], further: null }],
      'ophir',
      true,
    );

    expect(html).toContain('Spouse');
    expect(html).toContain('&nbsp;');
    expect(html).toContain('<div class="wt-chart-box"></div>');
  });

  test('a lazy-load arrow links to the Descendants action with the child xref and spouses flag', () => {
    const html = renderHourglassDescendantsNode(
      [{ box: baseBox({ xref: 'I1' }), spouseBoxes: [], further: { kind: 'arrow', xref: 'I1' } }],
      'ophir',
      true,
    );

    expect(html).toContain('class="hourglass-arrow"');
    expect(html).toContain('data-wt-chart-xref="/module/hourglass_chart/Descendants/ophir?xref=I1&spouses=1"');
  });

  test('a nested node recurses, with no arrow at that level', () => {
    const html = renderHourglassDescendantsNode(
      [
        {
          box: baseBox({ xref: 'I1' }),
          spouseBoxes: [],
          further: { kind: 'nested', items: [{ box: baseBox({ xref: 'I2', fullNameHtml: '<span>Grandchild</span>' }), spouseBoxes: [], further: null }] },
        },
      ],
      'ophir',
      false,
    );

    expect(html).toContain('Grandchild');
    expect(html).not.toContain('hourglass-arrow');
  });
});

describe('renderHourglassChart', () => {
  test('renders the subject, spouses, descendants, and ancestors, plus the arrow-click script', () => {
    const html = renderHourglassChart({
      individualBox: baseBox({ fullNameHtml: '<span>Subject</span>' }),
      spouseBoxes: [baseBox({ xref: 'I2', fullNameHtml: '<span>Spouse</span>' })],
      descendantsItems: [{ box: baseBox({ xref: 'I3', fullNameHtml: '<span>Child</span>' }), spouseBoxes: [], further: null }],
      ancestorsNode: {
        familyXref: 'F1',
        husband: { box: baseBox({ xref: 'I4', fullNameHtml: '<span>Father</span>' }), further: null },
        wife: { box: null, further: null },
      },
      treeName: 'ophir',
      spouses: false,
    });

    expect(html).toContain('Subject');
    expect(html).toContain('Spouse');
    expect(html).toContain('Child');
    expect(html).toContain('Father');
    expect(html).toContain('wt-chart-hourglass');
    expect(html).toContain('.hourglass-arrow[data-wt-chart-xref]');
  });

  test('a null ancestorsNode (no parent family) renders no ancestors markup', () => {
    const html = renderHourglassChart({
      individualBox: baseBox(),
      spouseBoxes: [],
      descendantsItems: [],
      ancestorsNode: null,
      treeName: 'ophir',
      spouses: false,
    });

    expect(html).not.toContain('wt-chart-horizontal-first-parent');
  });
});

describe('renderHourglassChartPage', () => {
  test('includes the options form and the ajax-loaded content div', () => {
    const html = renderHourglassChartPage({
      tree: { name: 'ophir', title: 'The Ophir family tree' },
      user: null,
      csrfToken: null,
      title: 'Hourglass chart of John Smith',
      individual: { xref: 'I1', fullNameHtml: '<span>John Smith</span>' },
      generations: 3,
      minGenerations: 2,
      maxGenerations: 63,
      spouses: false,
      ajaxUrl: '/tree/ophir/hourglass-3-0/I1?ajax=1',
    });

    expect(html).toContain('Hourglass chart of John Smith');
    expect(html).toContain('data-wt-ajax-url="/tree/ophir/hourglass-3-0/I1?ajax=1"');
    expect(html).toContain('name="generations"');
    expect(html).toContain('name="spouses"');
  });

  test('a checked spouses checkbox reflects the current value', () => {
    const html = renderHourglassChartPage({
      tree: { name: 'ophir', title: 'The Ophir family tree' },
      user: null,
      csrfToken: null,
      title: 'Hourglass chart of John Smith',
      individual: { xref: 'I1', fullNameHtml: '<span>John Smith</span>' },
      generations: 3,
      minGenerations: 2,
      maxGenerations: 63,
      spouses: true,
      ajaxUrl: '/tree/ophir/hourglass-3-1/I1?ajax=1',
    });

    expect(html).toContain('id="spouses" value="1" checked="checked"');
  });
});
