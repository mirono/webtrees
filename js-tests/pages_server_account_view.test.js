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

  test('includes the CSRF meta tag httpPost() requires (resources/js/webtrees/http.js)', () => {
    const html = renderAccountPage(baseParams());

    expect(html).toContain('<meta name="csrf" content="test-token">');
  });

  // Matches AccountEdit.php's show_delete_option computation exactly:
  // getPreference(PREF_IS_ADMINISTRATOR) !== '1' ('canadmin' is that
  // setting's real name).
  describe('the "Delete your account" link', () => {
    test('is rendered for a non-administrator', () => {
      const html = renderAccountPage(baseParams({ user: { ...baseParams().user, settings: { canadmin: '0' } } }));

      expect(html).toContain('data-wt-post-url="/my-account-delete"');
    });

    test('is rendered when canadmin is entirely absent (default: not an admin)', () => {
      const html = renderAccountPage(baseParams());

      expect(html).toContain('data-wt-post-url="/my-account-delete"');
    });

    test('is NOT rendered for an administrator', () => {
      const html = renderAccountPage(baseParams({ user: { ...baseParams().user, settings: { canadmin: '1' } } }));

      expect(html).not.toContain('data-wt-post-url="/my-account-delete"');
    });
  });
});
