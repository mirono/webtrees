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

import { describe, expect, test, vi } from 'vitest';
import {
  parseFacts,
  sex,
  extractPrimaryName,
  getBirthDate,
  getDeathDate,
  isDead,
  lifespan,
  ageString,
  displayDate,
  canShowRecord,
  canShowViaResnChain,
  canShowByType,
  canShowName,
  factCanShow,
  otherFactAttributes,
  loadIndividual,
  loadTreePrivacyPrefs,
  loadDefaultResn,
  viewerRelationshipPrefs,
} from '../pages-server/individual.mjs';
import { GedcomDate } from '../lib/gedcom-date.js';

function mockPool(queryImpl) {
  return { query: vi.fn(queryImpl) };
}

describe('parseFacts', () => {
  test('splits into one block per level-1 tag', () => {
    const facts = parseFacts('1 NAME John /Smith/\n2 GIVN John\n1 SEX M\n1 BIRT\n2 DATE 1 JAN 1900');

    expect(facts).toEqual(['1 NAME John /Smith/\n2 GIVN John', '1 SEX M', '1 BIRT\n2 DATE 1 JAN 1900']);
  });

  test('empty gedcom yields no facts', () => {
    expect(parseFacts('')).toEqual([]);
  });
});

describe('sex', () => {
  // The regex requires a preceding newline (matches PHP's own
  // `\n1 SEX` pattern exactly), so fixtures prepend an unrelated fact -
  // real i_gedcom values never start with "1 SEX" as their literal
  // first byte anyway.
  test.each([
    ['1 NAME John /Smith/\n1 SEX M', 'M'],
    ['1 NAME John /Smith/\n1 SEX F', 'F'],
    ['1 NAME John /Smith/\n1 SEX X', 'X'],
    ['1 NAME John /Smith/', 'U'],
  ])('%s -> %s', (gedcom, expected) => {
    expect(sex(gedcom)).toBe(expected);
  });

  // A faithfully-reproduced PHP quirk, not a bug: SEX as the record's
  // literal first fact (no preceding newline at all) is NOT detected,
  // matching PHP's own \n-anchored regex exactly.
  test('SEX as the literal first fact (no preceding newline) is not detected', () => {
    expect(sex('1 SEX M')).toBe('U');
  });
});

describe('extractPrimaryName', () => {
  test('plain "Given /Surname/"', () => {
    const name = extractPrimaryName('1 NAME John /Smith/');

    expect(name.givn).toBe('John');
    expect(name.surn).toBe('Smith');
    expect(name.surname).toBe('Smith');
    expect(name.sort).toBe('Smith,John');
    expect(name.full).toBe('<span class="NAME" dir="auto" translate="no">John <span class="SURN">Smith</span></span>');
  });

  test('a lone given name with no surname slashes at all', () => {
    const name = extractPrimaryName('1 NAME Cher');

    expect(name.surn).toBe('');
    expect(name.givn).toBe('Cher');
  });

  test('unknown surname placeholder "//" (GEDCOM double-slash) becomes @N.N., rendered as an ellipsis', () => {
    const name = extractPrimaryName('1 NAME Robert //Jones//');

    // "//" inside the value is replaced with "/@N.N./" before surname
    // extraction - this is a deliberately obscure GEDCOM corner; the
    // key behavior under test is that the ellipsis placeholder makes
    // it into the rendered HTML somewhere.
    expect(name.full).toContain('…');
  });

  test('GIVN/SURN sub-tags present are used verbatim, not re-derived from NAME', () => {
    const name = extractPrimaryName('1 NAME Robert /de Gliderow/\n2 GIVN Robert\n2 SPFX de\n2 SURN CLITHEROW\n2 NICK The Bald');

    expect(name.givn).toBe('Robert');
    expect(name.surn).toBe('CLITHEROW');
    expect(name.sort).toBe('CLITHEROW,Robert');
  });

  test('GIVN/SURN absent, multi-surname NAME: surname taken from the first /.../ pair; GIVN derivation is greedy end-to-end (matches PHP\'s own greedy regex, a known quirk for multi-surname names)', () => {
    const name = extractPrimaryName('1 NAME Carlos /Vasquez/ y /Sante/');

    expect(name.surn).toBe('Vasquez');
    expect(name.givn).toBe('Carlos');
    expect(name.full).toContain('<span class="SURN">Vasquez</span>');
    expect(name.full).toContain('<span class="SURN">Sante</span>');
  });

  test('"Mc"/"Mac " surname prefixes both normalize to "Mac"', () => {
    expect(extractPrimaryName('1 NAME Mary /McDonald/').surn).toBe('MacDonald');
    expect(extractPrimaryName('1 NAME Mary /Mac Donald/').surn).toBe('MacDonald');
  });

  test('nickname is quoted with <q class="wt-nickname">', () => {
    const name = extractPrimaryName('1 NAME Robert "Bob" /Smith/');

    expect(name.full).toContain('<q class="wt-nickname">Bob</q>');
  });

  test('a missing GIVN falls back to the @P.N. placeholder, rendered as an ellipsis', () => {
    const name = extractPrimaryName('1 NAME /Smith/');

    expect(name.givn).toBe('@P.N.');
    expect(name.full).toContain('…');
  });

  test('HTML-unsafe characters in the name are escaped', () => {
    const name = extractPrimaryName('1 NAME <script>alert(1)</script> /Smith/');

    expect(name.full).not.toContain('<script>');
    expect(name.full).toContain('&lt;script&gt;');
  });

  test('no NAME fact at all returns null', () => {
    expect(extractPrimaryName('1 SEX M')).toBeNull();
  });
});

describe('getBirthDate / getDeathDate', () => {
  test('falls through BIRTH_EVENTS tag order: BIRT missing, CHR present', () => {
    const facts = parseFacts('1 CHR\n2 DATE 3 MAR 1850\n2 PLAC York');
    const birth = getBirthDate(facts);

    expect(birth.rawDate).toBe('3 MAR 1850');
    expect(birth.place).toBe('York');
  });

  test('an unparseable date is skipped in favor of the next candidate tag', () => {
    const facts = parseFacts('1 BIRT\n2 DATE not-a-date\n1 CHR\n2 DATE 3 MAR 1850');
    const birth = getBirthDate(facts);

    expect(birth.rawDate).toBe('3 MAR 1850');
  });

  test('no birth-event facts at all returns null', () => {
    expect(getBirthDate(parseFacts('1 SEX M'))).toBeNull();
  });

  test('DEATH_EVENTS tag order: DEAT missing, BURI present', () => {
    const facts = parseFacts('1 BURI\n2 DATE 1 JAN 1920\n2 PLAC Paris');
    const death = getDeathDate(facts);

    expect(death.rawDate).toBe('1 JAN 1920');
    expect(death.place).toBe('Paris');
  });
});

describe('isDead', () => {
  test('"1 DEAT Y" is conclusive', () => {
    expect(isDead(parseFacts('1 DEAT Y'), { maxAliveAge: 120 })).toBe(true);
  });

  test('DEAT with a date is conclusive', () => {
    expect(isDead(parseFacts('1 DEAT\n2 DATE 1 JAN 1920'), { maxAliveAge: 120 })).toBe(true);
  });

  test('DEAT with only a place is conclusive', () => {
    expect(isDead(parseFacts('1 DEAT\n2 PLAC Paris'), { maxAliveAge: 120 })).toBe(true);
  });

  test('no DEAT, but a birth event older than MAX_ALIVE_AGE', () => {
    expect(isDead(parseFacts('1 BIRT\n2 DATE 1 JAN 1850'), { maxAliveAge: 120 })).toBe(true);
  });

  test('no DEAT, and a recent birth event', () => {
    const year = new Date().getFullYear() - 5;
    expect(isDead(parseFacts(`1 BIRT\n2 DATE 1 JAN ${year}`), { maxAliveAge: 120 })).toBe(false);
  });

  test('no dated events at all -> false (documents the family-graph-fallback cut)', () => {
    expect(isDead(parseFacts('1 SEX M'), { maxAliveAge: 120 })).toBe(false);
  });
});

describe('lifespan', () => {
  test('both years known', () => {
    const birthDate = { date: { isOK: () => true, minimumDate: () => ({ yearValue: () => 1870 }) } };
    const deathDate = { date: { isOK: () => true, maximumDate: () => ({ yearValue: () => 1920 }) } };

    expect(lifespan({ birthDate, deathDate, isDead: true })).toBe('1870–1920');
  });

  test('missing birth year shows the ellipsis placeholder', () => {
    expect(lifespan({ birthDate: null, deathDate: null, isDead: false })).toBe('…–');
  });

  test('missing death year for a dead individual shows the ellipsis placeholder', () => {
    expect(lifespan({ birthDate: null, deathDate: null, isDead: true })).toBe('…–…');
  });
});

describe('ageString', () => {
  function shimDate(isOK) {
    return { isOK: () => isOK, minimumDate: () => ({}), maximumDate: () => ({}) };
  }

  test('no birth date -> empty string', () => {
    expect(ageString({ birthDate: null, deathDate: null, isDead: false, sex: 'M' })).toBe('');
  });

  test('dead with no death date -> empty string', () => {
    const birthDate = { date: shimDate(true) };
    expect(ageString({ birthDate, deathDate: null, isDead: true, sex: 'M' })).toBe('');
  });
});

describe('displayDate', () => {
  // Verified against the real en-US locale catalog
  // (resources/lang/en-US/messages.php translates the base '%j %F %Y'
  // date-format string to '%F %j, %Y') - "August 17, 1995", not the
  // British "17 August 1995".
  test('a plain exact date formats as "Month D, YYYY"', () => {
    expect(displayDate(new GedcomDate('17 AUG 1995'))).toBe('August 17, 1995');
  });

  test('a month+year-only date omits the day', () => {
    // Matches a faithfully-ported PHP quirk: stripping "%j," from the
    // '%F %j, %Y' format template for a day-less date leaves a double
    // space (the space before %j, plus the space after the stripped
    // comma) - not cleaned up here or in the real PHP port.
    expect(displayDate(new GedcomDate('MAY 1963'))).toBe('May  1963');
  });

  test('a year-only date shows just the year', () => {
    expect(displayDate(new GedcomDate('1963'))).toBe('1963');
  });

  test.each([
    ['ABT 1900', 'about 1900'],
    ['CAL 1900', 'calculated 1900'],
    ['EST 1900', 'estimated 1900'],
    ['BEF 1 JAN 1920', 'before January 1, 1920'],
    ['AFT 1 JAN 1920', 'after January 1, 1920'],
    ['FROM 1900', 'from 1900'],
    ['TO 1910', 'to 1910'],
  ])('qualifier %s -> %s', (gedcomDateString, expected) => {
    expect(displayDate(new GedcomDate(gedcomDateString))).toBe(expected);
  });

  test('a BET...AND range phrases both dates', () => {
    expect(displayDate(new GedcomDate('BET 1900 AND 1910'))).toBe('between 1900 and 1910');
  });

  test('a FROM...TO range phrases both dates', () => {
    expect(displayDate(new GedcomDate('FROM 1900 TO 1910'))).toBe('from 1900 to 1910');
  });

  test('explanatory text in parentheses is appended for a plain date', () => {
    expect(displayDate(new GedcomDate('1900 (approximate)'))).toBe('1900(approximate)');
  });
});

describe('canShowRecord', () => {
  const baseTree = { hideLivePeople: true, defaultResn: null, keepAliveYearsBirth: 0, keepAliveYearsDeath: 0 };
  const baseViewer = { accessLevel: 2, isSelfRecord: false, showDeadPeople: 2, dead: false, relationshipGateBlocked: false };

  test('HIDE_LIVE_PEOPLE off -> always shown', () => {
    expect(canShowRecord({ ...baseTree, hideLivePeople: false }, '', [], baseViewer)).toBe(true);
  });

  test('self-record exception -> shown regardless of other rules', () => {
    expect(canShowRecord(baseTree, '1 NAME John /Smith/\n1 RESN confidential', [], { ...baseViewer, isSelfRecord: true })).toBe(true);
  });

  // The RESN regex requires a preceding newline (matches PHP's own
  // `\n1 RESN` pattern exactly - RESN is never the record's literal
  // first fact in real data, since wt_individuals.i_gedcom always
  // starts with "1 NAME ..." or similar), so every fixture here
  // prepends an unrelated fact.
  test.each([
    ['confidential', 0, true],
    ['confidential', 1, false],
    ['confidential', 2, false],
    ['privacy', 0, true],
    ['privacy', 1, true],
    ['privacy', 2, false],
    ['none', 0, true],
    ['none', 1, true],
    ['none', 2, true],
  ])('inline RESN %s at access level %i -> %s', (resn, accessLevel, expected) => {
    expect(canShowRecord(baseTree, `1 NAME John /Smith/\n1 RESN ${resn}`, [], { ...baseViewer, accessLevel })).toBe(expected);
  });

  test('a wt_default_resn row for this xref gates visibility', () => {
    expect(canShowRecord({ ...baseTree, defaultResn: 'confidential' }, '', [], { ...baseViewer, accessLevel: 1 })).toBe(false);
    expect(canShowRecord({ ...baseTree, defaultResn: 'confidential' }, '', [], { ...baseViewer, accessLevel: 0 })).toBe(true);
  });

  test('admin bypass applies once no RESN of any kind is found', () => {
    expect(canShowRecord(baseTree, '', [], { ...baseViewer, accessLevel: 0 })).toBe(true);
  });

  test('falls through to canShowByType() when nothing else applies', () => {
    // access level 1 (member), dead, SHOW_DEAD_PEOPLE permits -> shown
    expect(canShowRecord(baseTree, '1 DEAT Y', parseFacts('1 DEAT Y'), { ...baseViewer, accessLevel: 1, dead: true })).toBe(true);
  });
});

describe('canShowByType', () => {
  const baseTree = { keepAliveYearsBirth: 0, keepAliveYearsDeath: 0 };

  test('SHOW_DEAD_PEOPLE permits + dead -> shown', () => {
    expect(canShowByType(baseTree, [], { accessLevel: 2, showDeadPeople: 2, dead: true, relationshipGateBlocked: false })).toBe(true);
  });

  test('a KEEP_ALIVE_YEARS_BIRTH override on a recent birth date re-applies privacy', () => {
    const year = new Date().getFullYear() - 1;
    const facts = parseFacts(`1 BIRT\n2 DATE 1 JAN ${year}`);
    const tree = { keepAliveYearsBirth: 5, keepAliveYearsDeath: 0 };

    // Would otherwise be shown (dead, SHOW_DEAD_PEOPLE permits) - the
    // keep-alive override should deny it for a visitor instead.
    expect(canShowByType(tree, facts, { accessLevel: 2, showDeadPeople: 2, dead: true, relationshipGateBlocked: false })).toBe(false);
  });

  test('a KEEP_ALIVE_YEARS_BIRTH override on a SECOND (non-primary) birth-event fact still applies', () => {
    // The individual's primary birth date is old, but a secondary CHR
    // fact carries a recent date - PHP's real preg_match_all scan
    // checks every matching fact, not just the primary one.
    const year = new Date().getFullYear() - 1;
    const facts = parseFacts(`1 BIRT\n2 DATE 1 JAN 1850\n1 CHR\n2 DATE 1 JAN ${year}`);
    const tree = { keepAliveYearsBirth: 5, keepAliveYearsDeath: 0 };

    expect(canShowByType(tree, facts, { accessLevel: 2, showDeadPeople: 2, dead: true, relationshipGateBlocked: false })).toBe(false);
  });

  test('the corrected relationship-privacy gate: viewer has a linked gedcomid + nonzero path length -> deny regardless of access level', () => {
    // Would otherwise pass the plain member-only fallback (accessLevel
    // 1 <= PRIV_USER) - the gate must override that.
    expect(canShowByType(baseTree, [], { accessLevel: 1, showDeadPeople: 2, dead: false, relationshipGateBlocked: true })).toBe(false);
    expect(canShowByType(baseTree, [], { accessLevel: 0, showDeadPeople: 2, dead: false, relationshipGateBlocked: true })).toBe(false);
  });

  test('gate not blocked (no linked gedcomid or zero path length) -> plain member-only default applies', () => {
    expect(canShowByType(baseTree, [], { accessLevel: 1, showDeadPeople: 2, dead: false, relationshipGateBlocked: false })).toBe(true);
    expect(canShowByType(baseTree, [], { accessLevel: 2, showDeadPeople: 2, dead: false, relationshipGateBlocked: false })).toBe(false);
  });
});

describe('canShowViaResnChain', () => {
  test('is the shared core canShowRecord() delegates to', () => {
    const tree = { hideLivePeople: true, defaultResn: null };
    const viewer = { accessLevel: 0, isSelfRecord: false };

    expect(canShowViaResnChain(tree, '', viewer, () => false)).toBe(true); // admin bypass
    expect(canShowViaResnChain({ ...tree, hideLivePeople: false }, '', { ...viewer, accessLevel: 2 }, () => false)).toBe(true);
    expect(canShowViaResnChain(tree, '', { ...viewer, accessLevel: 2 }, () => true)).toBe(true); // delegate called
    expect(canShowViaResnChain(tree, '', { ...viewer, accessLevel: 2 }, () => false)).toBe(false);
  });
});

describe('canShowName', () => {
  const baseTree = { hideLivePeople: true, defaultResn: null, keepAliveYearsBirth: 0, keepAliveYearsDeath: 0, showLivingNames: 1 };
  const baseViewer = { accessLevel: 2, isSelfRecord: false, showDeadPeople: 2, dead: false, relationshipGateBlocked: false };

  test('SHOW_LIVING_NAMES permits the name even when the full record would be denied', () => {
    // A living, unrelated individual at visitor level: canShowRecord()
    // alone would deny (member-only default), but SHOW_LIVING_NAMES=1
    // >= accessLevel 2 is false here too - use a lower access level to
    // actually exercise the "name shown, record denied" branch.
    const tree = { ...baseTree, showLivingNames: 2 };
    expect(canShowName(tree, '', [], baseViewer)).toBe(true);
    expect(canShowRecord(tree, '', [], baseViewer)).toBe(false);
  });

  test('falls through to canShowRecord() when SHOW_LIVING_NAMES does not cover this access level', () => {
    // showLivingNames=1 does not cover a visitor (accessLevel 2); with
    // nothing else granting access, canShowRecord() also denies.
    expect(canShowName(baseTree, '', [], baseViewer)).toBe(false);
  });

  test('a record that canShowRecord() already permits is shown via that path', () => {
    expect(canShowName(baseTree, '', [], { ...baseViewer, isSelfRecord: true })).toBe(true);
  });
});

describe('factCanShow', () => {
  test('no RESN of any kind -> shown', () => {
    expect(factCanShow('1 BIRT\n2 DATE 1 JAN 1900', 2, null)).toBe(true);
  });

  test('an inline fact RESN gates visibility', () => {
    expect(factCanShow('1 BIRT\n2 RESN confidential\n2 DATE 1 JAN 1900', 2, null)).toBe(false);
    expect(factCanShow('1 BIRT\n2 RESN confidential\n2 DATE 1 JAN 1900', 0, null)).toBe(true);
  });

  test('a default RESN (fact-specific or tree-wide, already resolved by the caller) gates visibility', () => {
    expect(factCanShow('1 BIRT\n2 DATE 1 JAN 1900', 1, 'privacy')).toBe(true);
    expect(factCanShow('1 BIRT\n2 DATE 1 JAN 1900', 2, 'privacy')).toBe(false);
  });
});

describe('otherFactAttributes', () => {
  test('a level-2 subtag not in the real denylist gets its own {subtag, value} entry', () => {
    expect(otherFactAttributes('1 TITL Some title\n2 _HEB מחלקת ההגירה')).toEqual([
      { subtag: '_HEB', value: 'מחלקת ההגירה' },
    ]);
  });

  test('denylisted subtags (DATE, PLAC, NOTE, OBJE, SOUR, ...) are excluded - already rendered by dedicated views', () => {
    const fact =
      '1 BIRT\n2 DATE 1 JAN 1900\n2 PLAC London\n2 NOTE A note\n2 OBJE @M1@\n2 SOUR @S1@\n2 TYPE Something\n2 _CUSTOM real value';

    expect(otherFactAttributes(fact)).toEqual([{ subtag: '_CUSTOM', value: 'real value' }]);
  });

  test('extraSkipTags excludes additional subtags already given dedicated rendering elsewhere', () => {
    const fact = '1 CHAN\n2 DATE 1 JAN 2020\n2 _WT_USER miron';

    expect(otherFactAttributes(fact)).toEqual([{ subtag: '_WT_USER', value: 'miron' }]);
    expect(otherFactAttributes(fact, ['_WT_USER'])).toEqual([]);
  });

  test('joins CONT/CONC continuation lines (level 3) into the subtag value', () => {
    const fact = '1 TITL Some title\n2 _HEB line one\n3 CONT line two\n3 CONC -continued';

    expect(otherFactAttributes(fact)).toEqual([{ subtag: '_HEB', value: 'line one\nline two-continued' }]);
  });

  test('a fact with no other subtags returns an empty array', () => {
    expect(otherFactAttributes('1 AUTH J. Smith')).toEqual([]);
  });
});

describe('loadIndividual', () => {
  test('returns the raw gedcom blob for an existing xref', async () => {
    const pool = mockPool(async (sql, params) => {
      expect(sql).toContain('FROM wt_individuals');
      expect(params).toEqual(['I1', 1]);
      return { rows: [{ i_id: 'I1', i_gedcom: '1 SEX M' }] };
    });

    expect(await loadIndividual(pool, 1, 'I1')).toEqual({ xref: 'I1', gedcom: '1 SEX M' });
  });

  test('returns null for a nonexistent xref', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadIndividual(pool, 1, 'I999')).toBeNull();
  });
});

describe('loadTreePrivacyPrefs', () => {
  test('falls back to PHP DEFAULT_PREFERENCES when no rows exist', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await loadTreePrivacyPrefs(pool, 1)).toEqual({
      hideLivePeople: true,
      showDeadPeople: 2,
      maxAliveAge: 120,
      keepAliveYearsBirth: 0,
      keepAliveYearsDeath: 0,
      showLivingNames: 1,
    });
  });

  test("HIDE_LIVE_PEOPLE = '0' is falsy (matches PHP string-falsy semantics)", async () => {
    const pool = mockPool(async () => ({ rows: [{ setting_name: 'HIDE_LIVE_PEOPLE', setting_value: '0' }] }));

    expect((await loadTreePrivacyPrefs(pool, 1)).hideLivePeople).toBe(false);
  });

  test('explicit DB rows override the defaults', async () => {
    const pool = mockPool(async () => ({
      rows: [
        { setting_name: 'SHOW_DEAD_PEOPLE', setting_value: '0' },
        { setting_name: 'MAX_ALIVE_AGE', setting_value: '80' },
      ],
    }));

    const prefs = await loadTreePrivacyPrefs(pool, 1);
    expect(prefs.showDeadPeople).toBe(0);
    expect(prefs.maxAliveAge).toBe(80);
  });
});

describe('loadDefaultResn', () => {
  test('separates individual-level, fact-specific, and tree-wide fact rows', async () => {
    const pool = mockPool(async () => ({
      rows: [
        { xref: 'I1', tag_type: null, resn: 'privacy' },
        { xref: 'I1', tag_type: 'BIRT', resn: 'confidential' },
        { xref: null, tag_type: 'DEAT', resn: 'privacy' },
      ],
    }));

    const result = await loadDefaultResn(pool, 1, 'I1');

    expect(result.individualResn).toBe('privacy');
    expect(result.factResn.get('BIRT')).toBe('confidential');
    expect(result.treeFactResn.get('DEAT')).toBe('privacy');
  });

  test('no rows -> all null/empty', async () => {
    const pool = mockPool(async () => ({ rows: [] }));
    const result = await loadDefaultResn(pool, 1, 'I1');

    expect(result.individualResn).toBeNull();
    expect(result.factResn.size).toBe(0);
    expect(result.treeFactResn.size).toBe(0);
  });
});

describe('viewerRelationshipPrefs', () => {
  test('anonymous visitor -> no query, defaults', async () => {
    const pool = mockPool(() => {
      throw new Error('should not query for an anonymous visitor');
    });

    expect(await viewerRelationshipPrefs(pool, 1, null)).toEqual({ gedcomid: null, pathLength: 0 });
  });

  test('logged-in user with both prefs set', async () => {
    const pool = mockPool(async () => ({
      rows: [
        { setting_name: 'gedcomid', setting_value: 'I1' },
        { setting_name: 'RELATIONSHIP_PATH_LENGTH', setting_value: '2' },
      ],
    }));

    expect(await viewerRelationshipPrefs(pool, 1, 5)).toEqual({ gedcomid: 'I1', pathLength: 2 });
  });

  test('logged-in user with neither pref set', async () => {
    const pool = mockPool(async () => ({ rows: [] }));

    expect(await viewerRelationshipPrefs(pool, 1, 5)).toEqual({ gedcomid: null, pathLength: 0 });
  });
});
