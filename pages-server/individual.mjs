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

// Data/logic layer for /tree/{tree}/individual/{xref} (IndividualPage) -
// the first Node route to touch real GEDCOM record data and the first to
// need a genuinely nontrivial privacy/access-control chain. See
// docs/php-to-js-migration/phase5-individual-page.md for the full scope
// decision: this ports the identity header (name/sex/lifespan/age) plus
// a flat list of vital-event facts (BIRT/CHR/BAPM/DEAT/BURI/CREM) only -
// no tabs, no MARR, no slug canonicalization, no Date::display().
//
// GEDCOM storage is a single TEXT blob per record (wt_individuals.i_gedcom)
// re-parsed via regex on every request - confirmed there is no per-fact
// DB table (app/GedcomRecord.php's own parseFacts()/canShowRecord()).
// Pending (unsaved editor) changes are not consulted, matching this
// migration's established "editor features are out of scope" cuts
// elsewhere.

import { GedcomDate } from '../lib/gedcom-date.js';
import { Age } from '../lib/age.js';

const NOMEN_NESCIO = '@N.N.';
const PRAENOMEN_NESCIO = '@P.N.';
const UNKNOWN_NAME_PLACEHOLDER = '…';

const BIRTH_EVENTS = ['BIRT', 'CHR', 'BAPM'];
const DEATH_EVENTS = ['DEAT', 'BURI', 'CREM'];

// Matches app/Elements/RestrictionNotice's RESN_PRIVACY-mapped access
// levels (app/Tree.php's RESN_PRIVACY const): lower is MORE privileged,
// matching Auth::PRIV_NONE=0/PRIV_USER=1/PRIV_PRIVATE=2/PRIV_HIDE=-1.
const RESN_ACCESS_LEVEL = { none: 2, privacy: 1, confidential: 0, hidden: -1 };

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Splits a record's raw GEDCOM text into one block per level-1 tag,
 * mirroring GedcomRecord::parseFacts()'s preg_split('/\n(?=1)/', ...)
 * (app/GedcomRecord.php:911-945), minus the pending-changes merge.
 *
 * @param {string} gedcom
 * @returns {string[]} each element starts with "1 TAG ..."
 */
export function parseFacts(gedcom) {
  if (gedcom === '') {
    return [];
  }

  const blocks = gedcom.split(/\n(?=1)/);

  // wt_individuals.i_gedcom DOES include the leading "0 @X1@ INDI" line
  // (confirmed live against a real row - an earlier version of this
  // comment wrongly assumed otherwise) - PHP's own parseFacts()
  // array_shift()s it off explicitly. This port doesn't need to: every
  // caller here (factTag() and its users) only ever matches an EXACT
  // "1 TAG" prefix, and "0 @X1@ INDI" never satisfies that, so it's
  // silently and harmlessly ignored everywhere it's checked rather than
  // needing an explicit shift.
  return blocks;
}

function factTag(factGedcom) {
  const match = /^1 (\S+)/.exec(factGedcom);
  return match ? match[1] : '';
}

/**
 * Mirrors Individual::sex() (app/Individual.php) - a plain regex over
 * the raw record text, no Fact/element machinery involved.
 *
 * @param {string} gedcom
 * @returns {'M'|'F'|'X'|'U'}
 */
export function sex(gedcom) {
  const match = /\n1 SEX ([MFX])/.exec(gedcom);
  return match ? match[1] : 'U';
}

/**
 * Mirrors Individual::addName() (app/Individual.php:891-1008) for a
 * single NAME-type fact block. Deliberately reproduces its exact
 * operation order (including where fullNN is captured relative to the
 * "…" placeholder substitution) and its known quirks - e.g. GIVN's
 * PHP's own GIVN comma-collapse call is a LITERAL (not regex) string
 * search that can never match real data, so it's a documented no-op,
 * not applied here either, matching PHP's actual (buggy) behavior
 * exactly rather than "fixing" it.
 *
 * @param {string} value the NAME fact's line-1 value, e.g. "John /Smith/"
 * @param {string} gedcom the full NAME fact block (starts with "1 NAME ...")
 * @returns {{full: string, fullNN: string, sort: string, givn: string, surn: string, surname: string}}
 *   `full` is PRE-ESCAPED SAFE HTML (matches PHP's fullName() baking
 *   markup in at this layer) - a view must insert it raw, never re-escape it.
 */
function addName(value, gedcom) {
  const sublevel = 1 + Number(gedcom[0]);
  const givnMatch = new RegExp(`\\n${sublevel} GIVN (.+)`).exec(gedcom);
  let GIVN = givnMatch ? givnMatch[1] : '';
  const surnMatch = new RegExp(`\\n${sublevel} SURN (.+)`).exec(gedcom);
  const SURNraw = surnMatch ? surnMatch[1] : '';

  let SURNS = SURNraw !== '' ? SURNraw.split(/ *, */) : [];

  // Fix bad slashes, e.g. "John/Smith" => "John/Smith/".
  let v = value;
  const slashCount = (v.match(/\//g) ?? []).length;
  if (slashCount % 2 === 1) {
    v += '/';
  }

  // GEDCOM uses "//" to indicate an unknown surname.
  let full = v.replaceAll('//', `/${NOMEN_NESCIO}/`);

  // Extract the surname - there may be multiple, e.g. Jean /Vasquez/ y /Cortes/.
  let surname = '';
  const surnameMatch = /\/.*\//.exec(full);
  if (surnameMatch) {
    surname = surnameMatch[0].replaceAll('/', '');
  }

  if (SURNS.length === 0) {
    const matches = [...full.matchAll(/\/([^/]*)\//g)];
    if (matches.length > 0) {
      SURNS = matches.map((m) => m[1].replace(/^(?:[a-z]+ |[a-z]+' ?|'[a-z]+ )+/, ''));
    } else {
      SURNS = [''];
    }
  }

  if (!GIVN) {
    GIVN = full.replace(/ ?\/.*\/ ?/g, ' ');
    GIVN = GIVN.replace(/ ?".+"/g, ' ');
    GIVN = GIVN.replace(/ {2,}/g, ' ');
    // PHP replaces ALL matches of `^ | $` in one pass - both a leading
    // AND a trailing single space, not repeated trimming - preserved here.
    GIVN = GIVN.replace(/^ | $/g, '');
  }

  if (!GIVN) {
    GIVN = PRAENOMEN_NESCIO;
    const pos = full.indexOf('/');
    full = `${full.slice(0, pos)}@P.N. ${full.slice(pos)}`;
  }

  // fullNN is captured HERE - before the "…" placeholder substitution
  // and escaping below - matching PHP exactly (it keeps the raw
  // @N.N./@P.N. placeholders, intended for internal/DB use).
  const fullNN = full.replaceAll('/', '');

  full = full.split(NOMEN_NESCIO).join(UNKNOWN_NAME_PLACEHOLDER);
  full = full.split(PRAENOMEN_NESCIO).join(UNKNOWN_NAME_PLACEHOLDER);

  full =
    '<span class="NAME" dir="auto" translate="no">' +
    escapeHtml(full).replace(/\/([^/]*)\//g, '<span class="SURN">$1</span>') +
    '</span>';

  full = full.replace(/&quot;([^&]*)&quot;/g, (_match, nickname) => `<q class="wt-nickname">${nickname}</q>`);

  full = full.replace(/([^ >‌]*)\*/gu, '<span class="starredname">$1</span>');

  GIVN = GIVN.replaceAll('*', '');
  const fullNNClean = fullNN.replaceAll('*', '');

  let SURNPrimary = SURNS[0] ?? '';
  // Scottish 'Mc'/'Mac ' prefixes both sort under 'Mac'.
  if (SURNPrimary.slice(0, 2).toLowerCase() === 'mc') {
    SURNPrimary = `Mac${SURNPrimary.slice(2)}`;
  } else if (SURNPrimary.slice(0, 4).toLowerCase() === 'mac ') {
    SURNPrimary = `Mac${SURNPrimary.slice(4)}`;
  }

  return { full, fullNN: fullNNClean, sort: `${SURNPrimary},${GIVN}`, givn: GIVN, surn: SURNPrimary, surname };
}

/**
 * Mirrors getAllNames()[0] for the FIRST `1 NAME` fact only - no
 * ROMN/FONE/_HEB/_MARNM sub-tag variants (those are only reachable via
 * GedcomRecord::extractNamesFromFacts()'s nested regex over a NAME
 * fact's own sub-lines) - a faithful, not approximate, v1 slice for
 * the common single-name case.
 *
 * @param {string} gedcom the individual's raw record text
 * @returns {{full: string, fullNN: string, sort: string, givn: string, surn: string, surname: string}|null}
 */
export function extractPrimaryName(gedcom) {
  const facts = parseFacts(gedcom);
  const nameFact = facts.find((f) => factTag(f) === 'NAME');

  if (!nameFact) {
    return null;
  }

  const lineMatch = /^1 NAME (.+)/.exec(nameFact);

  if (!lineMatch) {
    // Matches PHP: extractNamesFromFacts()'s own regex requires a
    // non-empty value after "1 NAME " - an empty NAME line is simply
    // never turned into a name entry.
    return null;
  }

  return addName(lineMatch[1], nameFact);
}

function dateForTagList(facts, tagList) {
  for (const tag of tagList) {
    for (const fact of facts) {
      if (factTag(fact) !== tag) {
        continue;
      }

      // v1 simplification: date and place are read from the SAME fact
      // block (the common case: one BIRT fact carries both). PHP's
      // getAllBirthDates()/getAllBirthPlaces() select independently per
      // tag, which can in rare cases pull a date from one fact and a
      // place from a different fact of the same tag - not replicated here.
      const dateMatch = /\n2 DATE (.+)/.exec(fact);

      if (dateMatch) {
        const gedcomDate = new GedcomDate(dateMatch[1]);

        if (gedcomDate.isOK()) {
          const placeMatch = /\n2 PLAC (.+)/.exec(fact);
          return { date: gedcomDate, rawDate: dateMatch[1], place: placeMatch ? placeMatch[1] : '' };
        }
      }
    }
  }

  return null;
}

/**
 * Mirrors Individual::getBirthDate()/getBirthPlace() (via
 * getAllBirthDates()/getAllBirthPlaces(), app/Individual.php:443-477):
 * iterate BIRTH_EVENTS in order, first tag with a usable date wins.
 *
 * @param {string[]} facts
 * @returns {{date: GedcomDate, rawDate: string, place: string}|null}
 */
export function getBirthDate(facts) {
  return dateForTagList(facts, BIRTH_EVENTS);
}

/**
 * Mirrors Individual::getDeathDate()/getDeathPlace() - see getBirthDate().
 *
 * @param {string[]} facts
 * @returns {{date: GedcomDate, rawDate: string, place: string}|null}
 */
export function getDeathDate(facts) {
  return dateForTagList(facts, DEATH_EVENTS);
}

/**
 * Mirrors Individual::isDead() (app/Individual.php:219-309) for its
 * first two branches ONLY - direct DEAT/BURI/CREM tag presence, then
 * any BIRTH_EVENTS/DEATH_EVENTS dated fact older than MAX_ALIVE_AGE.
 * Two deliberate, verified-safe divergences from the real PHP method:
 *
 * 1. PHP's branch-2 date scan is NOT restricted to birth/death tags -
 *    it checks `\n2 DATE` ANYWHERE in the record (e.g. an old CENS or
 *    OCCU event), and has a "a dated BIRT means definitely alive"
 *    short-circuit this port doesn't replicate. Both are safe to
 *    narrow: since this scan is a strict SUBSET of PHP's, any date
 *    this code finds "too old" PHP would also find via its broader
 *    scan (same conclusion); anything this code MISSES (a stale
 *    CENS/OCCU with no old BIRT/DEAT) only means Node under-detects
 *    death relative to PHP - which, per point 3 below, is the safe
 *    direction, never the reverse.
 * 2. PHP's direct-tag check (`/\n1 (?:DEAT|BURI|CREM).../`) requires a
 *    preceding newline in the WHOLE gedcom text; this port checks each
 *    already-split fact block independently instead. Confirmed live
 *    against a real wt_individuals.i_gedcom row that this can't
 *    actually diverge in practice: the stored value always begins with
 *    a "0 @Xn@ INDI" line (PHP's own parseFacts() explicitly
 *    array_shift()s it off), so EVERY level-1 fact - including a
 *    hypothetical DEAT as the record's first real fact - always has a
 *    preceding newline in the raw text. Both approaches are therefore
 *    equivalent for any real record.
 *
 * The family-graph fallback (checking parents'/spouses'/children's own
 * dated events when this individual has none) is NOT ported at all.
 * This is safe for the same reason as point 1: isDead() returning
 * false when PHP would say true only means canShowByType() below skips
 * PAST the dead-people-show branch into the stricter member-only
 * default - it can only make Node MORE restrictive than PHP, never
 * leak a record PHP would hide. Cosmetic effect only: a small number
 * of individuals with no dated events of their own display as living
 * ("(age N)") where PHP would infer death ("(aged N)").
 *
 * @param {string[]} facts
 * @param {{maxAliveAge: number}} treePrefs
 * @returns {boolean}
 */
export function isDead(facts, treePrefs) {
  for (const tag of DEATH_EVENTS) {
    for (const fact of facts) {
      if (factTag(fact) !== tag) {
        continue;
      }

      // "1 DEAT Y", a DATE subline, or a PLAC subline are each
      // sufficient (mirrors app/Individual.php:222-235's real checks).
      if (/^1 \S+ Y(?:\n|$)/.test(fact) || /\n2 DATE /.test(fact) || /\n2 PLAC /.test(fact)) {
        return true;
      }
    }
  }

  const maxAliveAge = treePrefs.maxAliveAge;
  const currentYear = new Date().getFullYear();

  for (const fact of facts) {
    const dateMatch = /\n2 DATE (.+)/.exec(fact);

    if (!dateMatch) {
      continue;
    }

    const gedcomDate = new GedcomDate(dateMatch[1]);

    if (gedcomDate.isOK()) {
      const year = gedcomDate.gregorianYear();

      if (year !== 0 && year + maxAliveAge < currentYear) {
        return true;
      }
    }
  }

  return false;
}

// The base (English) date-format string is '%j %F %Y' (day month year,
// e.g. "17 August 1995" - confirmed via app/I18N.php's dateFormat()).
// The en-US locale catalog translates this to '%F %j, %Y' (month day,
// year - "August 17, 1995"), confirmed against
// resources/lang/en-US/messages.php's real translation entry -
// verbatim what this migration's real reference tree renders and what
// every hand-rolled view here has always assumed for English-only
// display, so hardcoded here rather than left as a raw GEDCOM string.
const DATE_FORMAT = '%F %j, %Y';

/**
 * Mirrors Date::display() (app/Date.php:102-243), scoped to this
 * migration's actual needs: no calendar-conversion links
 * (`$convert_calendars`/`$CALENDAR_FORMAT` - dead code for the
 * default tree preference, `CALENDAR_FORMAT: 'none'`, confirmed
 * against app/Tree.php's DEFAULT_PREFERENCES), no calendar-page link
 * wrapping (this migration doesn't have a calendar page). The
 * qualifier-phrase switch (ABT/CAL/EST/BEF/AFT/FROM/TO/BET..AND/
 * FROM..TO/INT) is ported in full, English-only text matching this
 * migration's established no-I18N convention. Does NOT wrap the
 * result in `<span class="date">` (PHP's own `display()` does) -
 * callers apply that themselves, since some (family-view.mjs's CHAN
 * handling) need date and time in separate `<span class="date">`
 * elements.
 *
 * @param {GedcomDate} gedcomDate
 * @returns {string}
 */
export function displayDate(gedcomDate) {
  const q1 = gedcomDate.qual1;
  const q2 = gedcomDate.qual2;
  const d1 = gedcomDate.date1.format(DATE_FORMAT, q1);

  switch (q1 + q2) {
    case '':
      return gedcomDate.text !== '' ? `${d1}(${gedcomDate.text})` : d1;
    case 'ABT':
      return `about ${d1}`;
    case 'CAL':
      return `calculated ${d1}`;
    case 'EST':
      return `estimated ${d1}`;
    case 'INT':
      return `interpreted ${d1} (${gedcomDate.text})`;
    case 'BEF':
      return `before ${d1}`;
    case 'AFT':
      return `after ${d1}`;
    case 'FROM':
      return `from ${d1}`;
    case 'TO':
      return `to ${d1}`;
    case 'BETAND': {
      const d2 = gedcomDate.date2.format(DATE_FORMAT, q2);
      return `between ${d1} and ${d2}`;
    }
    case 'FROMTO': {
      const d2 = gedcomDate.date2.format(DATE_FORMAT, q2);
      return `from ${d1} to ${d2}`;
    }
    default:
      return 'Invalid date';
  }
}

/**
 * Mirrors Individual::lifespan() (app/Individual.php:412-441), minus
 * the tooltip markup (place/full-date display in a `title` attribute)
 * - a cosmetic-only omission, not tied to displayDate() not existing
 * anymore. Uses year-only via GedcomDate's own yearValue(), matching
 * PHP's own "use minimum/maximum dates, to agree with the age
 * calculations" note.
 *
 * @param {{birthDate: {date: GedcomDate}|null, deathDate: {date: GedcomDate}|null, isDead: boolean}} params
 * @returns {string}
 */
export function lifespan({ birthDate, deathDate, isDead: dead }) {
  const birthYear = birthDate && birthDate.date.isOK() ? birthDate.date.minimumDate().yearValue() : 0;
  const deathYear = deathDate && deathDate.date.isOK() ? deathDate.date.maximumDate().yearValue() : 0;

  const birthYearStr = birthYear !== 0 ? String(birthYear) : UNKNOWN_NAME_PLACEHOLDER;
  const deathYearStr = deathYear !== 0 ? String(deathYear) : dead ? UNKNOWN_NAME_PLACEHOLDER : '';

  return `${birthYearStr}–${deathYearStr}`;
}

/**
 * Mirrors IndividualPage::ageString() (app/Http/RequestHandlers/IndividualPage.php:129-162):
 * age at death if dead, else age today. English-only phrasing, matching
 * this migration's established no-I18N convention for hand-rolled views.
 *
 * @param {{birthDate: {date: GedcomDate}|null, deathDate: {date: GedcomDate}|null, isDead: boolean, sex: string}} params
 * @returns {string}
 */
export function ageString({ birthDate, deathDate, isDead: dead, sex: individualSex }) {
  if (!birthDate) {
    return '';
  }

  const birthShim = { minimumDate: birthDate.date.minimumDate(), maximumDate: birthDate.date.maximumDate(), isOK: birthDate.date.isOK() };

  let endShim;

  if (dead) {
    if (!deathDate) {
      return '';
    }

    endShim = { minimumDate: deathDate.date.minimumDate(), maximumDate: deathDate.date.maximumDate(), isOK: deathDate.date.isOK() };
  } else {
    // Matches PHP's `new Date(strtoupper(date('d M Y')))` - built from
    // a fixed English month-abbreviation table rather than
    // Intl.DateTimeFormat, since locale data isn't guaranteed to
    // produce GEDCOM's exact 3-letter forms (e.g. some ICU builds
    // render September as "Sept" in en-GB, which GedcomDate wouldn't
    // recognize).
    const now = new Date();
    const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][now.getMonth()];
    const today = new GedcomDate(`${String(now.getDate()).padStart(2, '0')} ${month} ${now.getFullYear()}`);
    endShim = { minimumDate: today.minimumDate(), maximumDate: today.maximumDate(), isOK: today.isOK() };
  }

  const age = new Age(birthShim, endShim).toString();

  if (age === '') {
    return '';
  }

  // PHP branches on sex via I18N::translateContext('Male'|'Female', '(aged
  // %s)', ...) vs. the sexless I18N::translate('(aged %s)', ...) default -
  // the context argument only affects OTHER locales' translations (e.g.
  // gendered adjectives in German); the untranslated English text is
  // identical in all three branches, so `individualSex` (kept in the
  // signature for parity with IndividualPage::ageString()) doesn't
  // change the result here.
  return dead ? `(aged ${age})` : `(age ${age})`;
}

/**
 * Mirrors GedcomRecord::canShowRecord() (app/GedcomRecord.php:950-992)
 * MINUS its final `canShowByType()` delegation - in real PHP this is
 * literally the SAME shared method for every record type (`Individual`
 * and `Family` both extend `GedcomRecord` and only override
 * `canShowByType()`), so this port splits out that shared RESN/
 * self-record/admin-bypass chain as its own function rather than
 * duplicating it per record type - `canShowRecord()` below (individual)
 * and `pages-server/family.mjs`'s `familyCanShowRecord()` both call
 * this, each supplying their own type-specific `canShowByType`
 * delegate for the final fallback.
 *
 * @param {{hideLivePeople: boolean, defaultResn: string|null}} tree
 * @param {string} gedcom the record's raw text (individual OR family)
 * @param {{accessLevel: 0|1|2, isSelfRecord: boolean}} viewer
 * @param {() => boolean} canShowByTypeFn called only when nothing else
 *   in the chain already decided the answer
 * @returns {boolean}
 */
export function canShowViaResnChain(tree, gedcom, viewer, canShowByTypeFn) {
  if (!tree.hideLivePeople) {
    return true;
  }

  if (viewer.isSelfRecord) {
    return true;
  }

  const resnMatch = /\n1 RESN (.+)/.exec(gedcom);

  if (resnMatch) {
    const restriction = resnMatch[1].trim().replace(/\s+/g, ' ').toUpperCase();

    if (restriction.startsWith('CONFIDENTIAL')) {
      return 0 >= viewer.accessLevel;
    }
    if (restriction.startsWith('PRIVACY')) {
      return 1 >= viewer.accessLevel;
    }
    if (restriction.startsWith('NONE')) {
      return true;
    }
  }

  if (tree.defaultResn !== null) {
    return RESN_ACCESS_LEVEL[tree.defaultResn] >= viewer.accessLevel;
  }

  if (0 >= viewer.accessLevel) {
    return true;
  }

  return canShowByTypeFn();
}

/**
 * `canShowViaResnChain()` specialized for an individual - see that
 * function's doc comment for why the RESN chain itself is factored
 * out. `viewer` carries everything canShowByType() needs to avoid
 * re-querying: { accessLevel, isSelfRecord, showDeadPeople, dead,
 * relationshipGateBlocked }. `relationshipGateBlocked` implements the
 * corrected relationship-privacy substitution - see canShowByType()
 * below for why.
 *
 * @param {{hideLivePeople: boolean, defaultResn: string|null, keepAliveYearsBirth: number, keepAliveYearsDeath: number}} tree
 * @param {string} gedcom the individual's raw record text
 * @param {string[]} facts
 * @param {{accessLevel: 0|1|2, isSelfRecord: boolean, showDeadPeople: number, dead: boolean, relationshipGateBlocked: boolean}} viewer
 * @returns {boolean}
 */
export function canShowRecord(tree, gedcom, facts, viewer) {
  return canShowViaResnChain(tree, gedcom, viewer, () => canShowByType(tree, facts, viewer));
}

/**
 * Mirrors Individual::canShowName() (app/Individual.php:91-96): a
 * living individual's NAME can be shown even when their full record
 * can't, whenever the tree's SHOW_LIVING_NAMES preference permits it
 * at this viewer's access level. Not reachable from IndividualPage's
 * OWN page (that route's access gate is canShowRecord() itself - if
 * it fails, the whole page 403s, so this fallback path never
 * matters there) - but very much reachable from `pages-server/family.mjs`,
 * which mirrors `Family::husband()`/`wife()`/`children()`'s use of
 * this exact method to decide whether to show a family member's name
 * on the FAMILY's own page even when that member's full record is
 * private.
 *
 * @param {{hideLivePeople: boolean, defaultResn: string|null, keepAliveYearsBirth: number, keepAliveYearsDeath: number, showLivingNames: number}} tree
 * @param {string} gedcom
 * @param {string[]} facts
 * @param {{accessLevel: 0|1|2, isSelfRecord: boolean, showDeadPeople: number, dead: boolean, relationshipGateBlocked: boolean}} viewer
 * @returns {boolean}
 */
export function canShowName(tree, gedcom, facts, viewer) {
  if (tree.showLivingNames >= viewer.accessLevel) {
    return true;
  }

  return canShowRecord(tree, gedcom, facts, viewer);
}

/**
 * Mirrors app/Individual.php:129-142's `preg_match_all` scan over ALL
 * facts of the given tag list (not just the single "primary" fact
 * getBirthDate()/getDeathDate() pick for display) for any date within
 * the keep-alive window. Scanning every matching fact - not just the
 * primary one - matters for correctness here specifically: if a
 * SECOND birth/death-event fact (e.g. both BIRT and CHR) carries a
 * recent date that the primary one doesn't, missing it would
 * incorrectly let a record through that PHP would still keep private.
 *
 * @param {string[]} facts
 * @param {string[]} tagList
 * @param {number} keepAliveYears
 * @param {number} currentYear
 * @returns {boolean}
 */
function hasRecentDate(facts, tagList, keepAliveYears, currentYear) {
  for (const fact of facts) {
    if (!tagList.includes(factTag(fact))) {
      continue;
    }

    const dateMatch = /\n2 DATE (.+)/.exec(fact);

    if (!dateMatch) {
      continue;
    }

    const gedcomDate = new GedcomDate(dateMatch[1]);

    if (gedcomDate.isOK() && gedcomDate.gregorianYear() + keepAliveYears > currentYear) {
      return true;
    }
  }

  return false;
}

/**
 * Mirrors Individual::canShowByType() (app/Individual.php:101-142).
 *
 * The relationship-privacy branch (`isRelated()`, a family-graph BFS)
 * is NOT implemented - see docs/php-to-js-migration/phase5-individual-page.md
 * for the full derivation, verified directly against source. PHP only
 * reaches the plain member-only default (`PRIV_USER >= access_level`)
 * when the VIEWER has no linked gedcomid OR a zero RELATIONSHIP_PATH_LENGTH;
 * otherwise it REPLACES that default with isRelated()'s result via an
 * early return, which can be MORE restrictive than the member-only
 * default (an unrelated member-level viewer is denied). The caller is
 * responsible for computing `relationshipGateBlocked` (true iff the
 * viewer has both a linked gedcomid AND a nonzero path length) and
 * passing it in - when true, this function denies outright rather than
 * guessing at isRelated()'s result, a proven-safe upper bound
 * (isRelated() ∈ {true, false}; denying is always <= showing).
 *
 * @param {{keepAliveYearsBirth: number, keepAliveYearsDeath: number}} tree
 * @param {string[]} facts
 * @param {{accessLevel: 0|1|2, showDeadPeople: number, dead: boolean, relationshipGateBlocked: boolean}} viewer
 * @returns {boolean}
 */
export function canShowByType(tree, facts, viewer) {
  if (viewer.showDeadPeople >= viewer.accessLevel && viewer.dead) {
    const currentYear = new Date().getFullYear();
    const keptAlive =
      (tree.keepAliveYearsBirth !== 0 && hasRecentDate(facts, BIRTH_EVENTS, tree.keepAliveYearsBirth, currentYear)) ||
      (tree.keepAliveYearsDeath !== 0 && hasRecentDate(facts, DEATH_EVENTS, tree.keepAliveYearsDeath, currentYear));

    if (!keptAlive) {
      return true;
    }
  }

  if (viewer.relationshipGateBlocked) {
    return false;
  }

  return 1 >= viewer.accessLevel;
}

/**
 * Mirrors Fact::canShow() (app/Fact.php:198-238) for one fact.
 * `defaultResn` is the resolved resn string (already the more specific
 * of the two wt_default_resn rows, fact-specific overriding tree-wide -
 * see loadDefaultResn() in index.mjs's caller) or null.
 *
 * @param {string} factGedcom
 * @param {number} accessLevel
 * @param {string|null} defaultResn
 * @returns {boolean}
 */
export function factCanShow(factGedcom, accessLevel, defaultResn) {
  const resnMatch = /\n2 RESN (.+)/.exec(factGedcom);

  if (resnMatch) {
    const restriction = resnMatch[1].trim().replace(/\s+/g, ' ').toUpperCase();

    if (restriction.startsWith('CONFIDENTIAL')) {
      return 0 >= accessLevel;
    }
    if (restriction.startsWith('PRIVACY')) {
      return 1 >= accessLevel;
    }
    if (restriction.startsWith('NONE')) {
      return true;
    }
  }

  if (defaultResn !== null) {
    return RESN_ACCESS_LEVEL[defaultResn] >= accessLevel;
  }

  return true;
}

/**
 * Mirrors Tree::DEFAULT_PREFERENCES (app/Tree.php:48-93) for the
 * handful of settings this route's privacy chain needs, falling back
 * to the same defaults PHP ships when a tree has never had the
 * setting explicitly written (wt_gedcom_setting has no row).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<{hideLivePeople: boolean, showDeadPeople: number, maxAliveAge: number, keepAliveYearsBirth: number, keepAliveYearsDeath: number}>}
 */
export async function loadTreePrivacyPrefs(pool, gedcomId) {
  const result = await pool.query(
    "SELECT setting_name, setting_value FROM wt_gedcom_setting WHERE gedcom_id = $1 AND setting_name IN ('HIDE_LIVE_PEOPLE', 'SHOW_DEAD_PEOPLE', 'MAX_ALIVE_AGE', 'KEEP_ALIVE_YEARS_BIRTH', 'KEEP_ALIVE_YEARS_DEATH', 'SHOW_LIVING_NAMES')",
    [gedcomId],
  );
  const byName = Object.fromEntries(result.rows.map((row) => [row.setting_name, row.setting_value]));

  // Matches PHP's string-falsy semantics for `!$tree->getPreference(...)`
  // (app/GedcomRecord.php:953) - ONLY '' and '0' are falsy in PHP;
  // every other value (including the default '1') is truthy.
  const hideLivePeopleRaw = byName.HIDE_LIVE_PEOPLE ?? '1';

  return {
    hideLivePeople: hideLivePeopleRaw !== '0' && hideLivePeopleRaw !== '',
    showDeadPeople: Number(byName.SHOW_DEAD_PEOPLE ?? '2'),
    maxAliveAge: Number(byName.MAX_ALIVE_AGE ?? '120'),
    keepAliveYearsBirth: Number(byName.KEEP_ALIVE_YEARS_BIRTH ?? '0'),
    keepAliveYearsDeath: Number(byName.KEEP_ALIVE_YEARS_DEATH ?? '0'),
    showLivingNames: Number(byName.SHOW_LIVING_NAMES ?? '1'),
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref
 * @returns {Promise<{xref: string, gedcom: string}|null>}
 */
export async function loadIndividual(pool, gedcomId, xref) {
  const result = await pool.query('SELECT i_id, i_gedcom FROM wt_individuals WHERE i_id = $1 AND i_file = $2', [xref, gedcomId]);

  if (result.rows.length === 0) {
    return null;
  }

  return { xref: result.rows[0].i_id, gedcom: result.rows[0].i_gedcom };
}

/**
 * Mirrors Tree::loadDefaultResn()'s query (app/Tree.php:331-353),
 * scoped to one xref instead of the whole tree.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref
 * @returns {Promise<{individualResn: string|null, factResn: Map<string,string>, treeFactResn: Map<string,string>}>}
 */
export async function loadDefaultResn(pool, gedcomId, xref) {
  const result = await pool.query('SELECT xref, tag_type, resn FROM wt_default_resn WHERE gedcom_id = $1 AND (xref IS NULL OR xref = $2)', [
    gedcomId,
    xref,
  ]);

  let individualResn = null;
  const factResn = new Map();
  const treeFactResn = new Map();

  for (const row of result.rows) {
    if (row.xref !== null) {
      if (row.tag_type !== null) {
        factResn.set(row.tag_type, row.resn);
      } else {
        individualResn = row.resn;
      }
    } else if (row.tag_type !== null) {
      treeFactResn.set(row.tag_type, row.resn);
    }
  }

  return { individualResn, factResn, treeFactResn };
}

/**
 * The viewer's gedcomid + RELATIONSHIP_PATH_LENGTH preferences for this
 * tree - needed for both the self-record exception and the corrected
 * relationship-privacy gate above.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {number|null} userId
 * @returns {Promise<{gedcomid: string|null, pathLength: number}>}
 */
export async function viewerRelationshipPrefs(pool, gedcomId, userId) {
  if (userId === null) {
    return { gedcomid: null, pathLength: 0 };
  }

  const result = await pool.query(
    "SELECT setting_name, setting_value FROM wt_user_gedcom_setting WHERE gedcom_id = $1 AND user_id = $2 AND setting_name IN ('gedcomid', 'RELATIONSHIP_PATH_LENGTH')",
    [gedcomId, userId],
  );
  const byName = Object.fromEntries(result.rows.map((row) => [row.setting_name, row.setting_value]));

  return { gedcomid: byName.gedcomid ?? null, pathLength: Number(byName.RELATIONSHIP_PATH_LENGTH ?? 0) };
}
