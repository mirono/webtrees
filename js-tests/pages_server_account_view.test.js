import { describe, expect, test } from 'vitest';
import { renderAccountPage } from '../pages-server/account-view.mjs';

function baseParams(overrides = {}) {
  return {
    user: {
      userId: 1,
      userName: 'mirono',
      realName: 'Miron Ophir',
      email: 'miron@ophir.org.il',
      settings: {},
    },
    contactMethods: [['messaging', 'Internal messaging']],
    languages: [['en-US', 'American English']],
    timezones: [['UTC', 'UTC']],
    csrfToken: 'test-token',
    message: null,
    ...overrides,
  };
}

describe('renderAccountPage', () => {
  // Regression test: <html> was missing a "dir" attribute entirely.
  // Both vendor.min.css (Bootstrap's RTL-aware CSS) and webtrees.min.css
  // scope a large number of rules - including .row's own gutter
  // margins/padding and .wt-page-options-label's background color -
  // behind a "[dir]" ancestor attribute selector. Without it those
  // rules never match, even though the stylesheets load with a plain
  // 200 - this was reported live as a page that "looks awful" (no
  // spacing, invisible white-on-white labels), not a loading failure.
  test('the <html> tag declares dir="ltr", matching PHP\'s own layout', () => {
    const html = renderAccountPage(baseParams());

    expect(html).toMatch(/<html[^>]*\bdir="ltr"/);
  });

  test('renders the user\'s current values into the form fields', () => {
    const html = renderAccountPage(baseParams());

    expect(html).toContain('value="mirono"');
    expect(html).toContain('value="Miron Ophir"');
    expect(html).toContain('value="miron@ophir.org.il"');
  });
});
