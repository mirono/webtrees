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

// Port of app/Services/RelationshipService.php's legacyNameAlgorithm()
// and its own two small ordinal-cousin helpers (phase 5 step 36) -
// English only (this migration has no I18N::translate() layer at
// all, and no per-language `relationships()` definitions either, so
// real PHP's own `nameFromPath()` would always fall through to this
// legacy algorithm regardless of locale - porting it directly instead
// of the dead `matchRelationships()`/per-language path is a faithful
// simplification, not a scope cut).
//
// Used for TWO different things, matching real PHP exactly: the
// chart's own per-step grid labels (one 3-letter code like 'fat' at a
// time - resources/views/modules/relationships-chart's own
// chart.phtml), and the whole-path "Relationship: X" title
// (RelationshipsChartModule::chart() calling
// RelationshipService::nameFromPath(), which - with no language
// definitions - just concatenates every step's own code and calls
// this same function once with the WHOLE string).

import { GedcomDate } from '../lib/gedcom-date.js';

const MARITAL_STATUS_TAGS = ['ANUL', 'DIV', 'ENGA', 'MARR'];

function compareOptionalDates(a, b) {
  const aOk = a !== null && a.isOK();
  const bOk = b !== null && b.isOK();

  if (!aOk && !bOk) {
    return 0;
  }

  if (!aOk) {
    return -1;
  }

  if (!bOk) {
    return 1;
  }

  return GedcomDate.compare(a, b);
}

/**
 * Mirrors the real PHP's own inline "find the linking family's latest
 * dated ANUL/DIV/ENGA/MARR fact" lookup, repeated identically in the
 * 'hus'/'wif'/'spo' cases of `legacyNameAlgorithm()` (each one does
 * `$family->facts(['ANUL', 'DIV', 'ENGA', 'MARR'], true, Auth::PRIV_HIDE, true)->last()` -
 * sorted by date ascending, so `->last()` is the LATEST-dated status
 * fact - factored out here once instead of copy-pasted three times.
 * Ties (including all-undated) keep the LAST one in gedcom order,
 * matching PHP's own stable-sort-then-last() behavior.
 *
 * @param {string[]} familyFacts raw fact-gedcom blocks for the linking family
 * @returns {'ANUL'|'DIV'|'ENGA'|'MARR'|null}
 */
export function spouseRelationshipStatus(familyFacts) {
  let best = null;

  for (const fact of familyFacts) {
    const tag = /^1 (\S+)/.exec(fact)?.[1] ?? '';

    if (!MARITAL_STATUS_TAGS.includes(tag)) {
      continue;
    }

    const dateMatch = /\n2 DATE (.+)/.exec(fact);
    const date = dateMatch ? new GedcomDate(dateMatch[1]) : null;

    if (best === null || compareOptionalDates(date, best.date) >= 0) {
      best = { tag, date };
    }
  }

  return best ? best.tag : null;
}

/**
 * Mirrors the 'bro'/'sis'/'sib' cases' own inline twin/elder/younger
 * birth-date comparison (identical logic repeated three times in real
 * PHP) - a difference of less than 2 Julian days, with both dates
 * precise to the day, means twins; otherwise whichever birth date
 * range ends before the other's begins is the elder.
 *
 * @param {{date: GedcomDate}|null} birthDate1 person1's own getBirthDate() result
 * @param {{date: GedcomDate}|null} birthDate2 person2's own getBirthDate() result
 * @returns {'twin'|'younger'|'elder'|null} null when either date is missing/unusable
 */
export function siblingAgeTerm(birthDate1, birthDate2) {
  if (birthDate1 === null || birthDate2 === null) {
    return null;
  }

  const d1 = birthDate1.date;
  const d2 = birthDate2.date;

  if (!d1.isOK() || !d2.isOK()) {
    return null;
  }

  if (Math.abs(d1.julianDay() - d2.julianDay()) < 2 && d1.minimumDate().dayValue() > 0 && d2.minimumDate().dayValue() > 0) {
    return 'twin';
  }

  if (d1.maximumJulianDay() < d2.minimumJulianDay()) {
    return 'younger';
  }

  if (d1.minimumJulianDay() > d2.maximumJulianDay()) {
    return 'elder';
  }

  return null;
}

const ORDINAL_WORDS = [
  '',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'eleventh',
  'twelfth',
  'thirteenth',
  'fourteenth',
  'fifteenth',
];

/**
 * Mirrors `legacyCousinName()` (app/Services/RelationshipService.php:~2205-2325):
 * "first cousin" through "fifteenth cousin", then "N × cousin" beyond
 * that - identical English wording regardless of sex (the PHP
 * version's sex parameter only ever changes the TRANSLATION context,
 * never the English text itself, so this port's single wording list
 * serves all three).
 *
 * @param {number} n
 * @param {'M'|'F'|'U'} sex unused - kept so call sites can pass it exactly as real PHP does; English wording never varies by sex, only the translation context would have
 * @returns {string}
 */
export function legacyCousinName(n, sex) {
  if (n >= 1 && n <= 15) {
    return `${ORDINAL_WORDS[n]} cousin`;
  }

  return `${n} × cousin`;
}

/**
 * Mirrors `legacyCousinName2()` (app/Services/RelationshipService.php:~2327-2409) -
 * "first great-nephew" etc., for a `relation` word that isn't plain
 * "cousin" (used by the generic nephew/niece-of-aunt/uncle and
 * ancestor/descendant-of-sibling patterns below).
 *
 * @param {number} n
 * @param {'M'|'F'|'U'} sex unused - see legacyCousinName()'s own note
 * @param {string} relation
 * @returns {string}
 */
export function legacyCousinName2(n, sex, relation) {
  if (n >= 1 && n <= 5) {
    return `${ORDINAL_WORDS[n]} ${relation}`;
  }

  return `${n} × ${relation}`;
}

/**
 * Mirrors RelationshipService::legacyNameAlgorithm() (app/Services/RelationshipService.php:306-2197)
 * EXACTLY — every case string, every regex pattern, verbatim. English
 * only (see this file's own top-of-file doc comment for why that's a
 * faithful simplification, not a cut).
 *
 * @param {string} path concatenated relationship-segment codes, e.g. "fat", "hus", "fatfatbroson"
 * @param {{sex: 'M'|'F'|'X'|'U', birthDate: {date: GedcomDate}|null}|null} person1
 * @param {{sex: 'M'|'F'|'X'|'U', birthDate: {date: GedcomDate}|null}|null} person2
 * @param {string[]|null} linkingFamilyFacts raw fact-gedcom blocks of the family directly connecting person1 and person2 — only meaningful (and only ever non-null) when `path` is exactly 'hus'/'wif'/'spo'
 * @returns {string}
 */
export function legacyNameAlgorithm(path, person1, person2, linkingFamilyFacts) {
  const sex1 = person1 !== null ? person1.sex : 'U';

  let sex2 = 'U';
  if (/(fat|hus|son|bro)$/.test(path)) {
    sex2 = 'M';
  } else if (/(mot|wif|dau|sis)$/.test(path)) {
    sex2 = 'F';
  }

  switch (path) {
    case '':
      return 'self';
    case 'mot':
      return 'mother';
    case 'fat':
      return 'father';
    case 'par':
      return 'parent';
    case 'hus': {
      const status = linkingFamilyFacts !== null ? spouseRelationshipStatus(linkingFamilyFacts) : null;
      if (status === 'ANUL' || status === 'DIV') return 'ex-husband';
      if (status === 'MARR') return 'husband';
      if (status === 'ENGA') return 'fiancé';
      return 'partner';
    }
    case 'wif': {
      const status = linkingFamilyFacts !== null ? spouseRelationshipStatus(linkingFamilyFacts) : null;
      if (status === 'ANUL' || status === 'DIV') return 'ex-wife';
      if (status === 'MARR') return 'wife';
      if (status === 'ENGA') return 'fiancée';
      return 'partner';
    }
    case 'spo': {
      const status = linkingFamilyFacts !== null ? spouseRelationshipStatus(linkingFamilyFacts) : null;
      if (status === 'ANUL' || status === 'DIV') return 'ex-spouse';
      if (status === 'MARR') return 'spouse';
      if (status === 'ENGA') return 'fiancé(e)';
      return 'partner';
    }
    case 'son':
      return 'son';
    case 'dau':
      return 'daughter';
    case 'chi':
      return 'child';
    case 'bro': {
      const term = siblingAgeTerm(person1?.birthDate ?? null, person2?.birthDate ?? null);
      if (term === 'twin') return 'twin brother';
      if (term === 'younger') return 'younger brother';
      if (term === 'elder') return 'elder brother';
      return 'brother';
    }
    case 'sis': {
      const term = siblingAgeTerm(person1?.birthDate ?? null, person2?.birthDate ?? null);
      if (term === 'twin') return 'twin sister';
      if (term === 'younger') return 'younger sister';
      if (term === 'elder') return 'elder sister';
      return 'sister';
    }
    case 'sib': {
      const term = siblingAgeTerm(person1?.birthDate ?? null, person2?.birthDate ?? null);
      if (term === 'twin') return 'twin sibling';
      if (term === 'younger') return 'younger sibling';
      if (term === 'elder') return 'elder sibling';
      return 'sibling';
    }
    case 'brochi':
      return 'nephew/niece';
    case 'brodau':
      return 'niece';
    case 'broson':
      return 'nephew';
    case 'browif':
      return 'sister-in-law';
    case 'chichi':
      return 'grandchild';
    case 'chidau':
      return 'granddaughter';
    case 'chihus':
      return 'son-in-law';
    case 'chison':
      return 'grandson';
    case 'chispo':
      return 'son/daughter-in-law';
    case 'chiwif':
      return 'daughter-in-law';
    case 'dauchi':
      return 'grandchild';
    case 'daudau':
      return 'granddaughter';
    case 'dauhus':
      return 'son-in-law';
    case 'dauson':
      return 'grandson';
    case 'fatbro':
      return 'uncle';
    case 'fatchi':
      return 'half-sibling';
    case 'fatdau':
      return 'half-sister';
    case 'fatfat':
      return 'paternal grandfather';
    case 'fatmot':
      return 'paternal grandmother';
    case 'fatpar':
      return 'paternal grandparent';
    case 'fatsib':
      return 'aunt/uncle';
    case 'fatsis':
      return 'aunt';
    case 'fatson':
      return 'half-brother';
    case 'fatwif':
      return 'step-mother';
    case 'husbro':
      return 'brother-in-law';
    case 'huschi':
      return 'step-child';
    case 'husdau':
      return 'step-daughter';
    case 'husfat':
      return 'father-in-law';
    case 'husmot':
      return 'mother-in-law';
    case 'hussib':
      return 'brother/sister-in-law';
    case 'hussis':
      return 'sister-in-law';
    case 'husson':
      return 'step-son';
    case 'motbro':
      return 'uncle';
    case 'motchi':
      return 'half-sibling';
    case 'motdau':
      return 'half-sister';
    case 'motfat':
      return 'maternal grandfather';
    case 'mothus':
      return 'step-father';
    case 'motmot':
      return 'maternal grandmother';
    case 'motpar':
      return 'maternal grandparent';
    case 'motsib':
      return 'aunt/uncle';
    case 'motsis':
      return 'aunt';
    case 'motson':
      return 'half-brother';
    case 'parbro':
      return 'uncle';
    case 'parchi':
      return 'half-sibling';
    case 'pardau':
      return 'half-sister';
    case 'parfat':
      return 'grandfather';
    case 'parmot':
      return 'grandmother';
    case 'parpar':
      return 'grandparent';
    case 'parsib':
      return 'aunt/uncle';
    case 'parsis':
      return 'aunt';
    case 'parson':
      return 'half-brother';
    case 'parspo':
      return 'step-parent';
    case 'sibchi':
      return 'nephew/niece';
    case 'sibdau':
      return 'niece';
    case 'sibson':
      return 'nephew';
    case 'sibspo':
      return 'brother/sister-in-law';
    case 'sischi':
      return 'nephew/niece';
    case 'sisdau':
      return 'niece';
    case 'sishus':
      return 'brother-in-law';
    case 'sisson':
      return 'nephew';
    case 'sonchi':
      return 'grandchild';
    case 'sondau':
      return 'granddaughter';
    case 'sonson':
      return 'grandson';
    case 'sonwif':
      return 'daughter-in-law';
    case 'spobro':
      return 'brother-in-law';
    case 'spochi':
      return 'step-child';
    case 'spodau':
      return 'step-daughter';
    case 'spofat':
      return 'father-in-law';
    case 'spomot':
      return 'mother-in-law';
    case 'sposis':
      return 'sister-in-law';
    case 'sposon':
      return 'step-son';
    case 'spopar':
      return 'mother/father-in-law';
    case 'sposib':
      return 'brother/sister-in-law';
    case 'wifbro':
      return 'brother-in-law';
    case 'wifchi':
      return 'step-child';
    case 'wifdau':
      return 'step-daughter';
    case 'wiffat':
      return 'father-in-law';
    case 'wifmot':
      return 'mother-in-law';
    case 'wifsib':
      return 'brother/sister-in-law';
    case 'wifsis':
      return 'sister-in-law';
    case 'wifson':
      return 'step-son';

    case 'brochichi':
      if (sex1 === 'M') {
        return 'great-nephew/niece';
      }
      return 'great-nephew/niece';
    case 'brochidau':
      if (sex1 === 'M') {
        return 'great-niece';
      }
      return 'great-niece';
    case 'brochison':
      if (sex1 === 'M') {
        return 'great-nephew';
      }
      return 'great-nephew';
    case 'brodauchi':
      if (sex1 === 'M') {
        return 'great-nephew/niece';
      }
      return 'great-nephew/niece';
    case 'brodaudau':
      if (sex1 === 'M') {
        return 'great-niece';
      }
      return 'great-niece';
    case 'brodauhus':
      return 'nephew-in-law';
    case 'brodauson':
      if (sex1 === 'M') {
        return 'great-nephew';
      }
      return 'great-nephew';
    case 'brosonchi':
      if (sex1 === 'M') {
        return 'great-nephew/niece';
      }
      return 'great-nephew/niece';
    case 'brosondau':
      if (sex1 === 'M') {
        return 'great-niece';
      }
      return 'great-niece';
    case 'brosonson':
      if (sex1 === 'M') {
        return 'great-nephew';
      }
      return 'great-nephew';
    case 'brosonwif':
      return 'niece-in-law';
    case 'browifbro':
      return 'brother-in-law';
    case 'browifsib':
      return 'brother/sister-in-law';
    case 'browifsis':
      return 'sister-in-law';
    case 'chichichi':
      return 'great-grandchild';
    case 'chichidau':
      return 'great-granddaughter';
    case 'chichison':
      return 'great-grandson';
    case 'chidauchi':
      return 'great-grandchild';
    case 'chidaudau':
      return 'great-granddaughter';
    case 'chidauhus':
      return 'granddaughter\'s husband';
    case 'chidauson':
      return 'great-grandson';
    case 'chisonchi':
      return 'great-grandchild';
    case 'chisondau':
      return 'great-granddaughter';
    case 'chisonson':
      return 'great-grandson';
    case 'chisonwif':
      return 'grandson\'s wife';
    case 'dauchichi':
      return 'great-grandchild';
    case 'dauchidau':
      return 'great-granddaughter';
    case 'dauchison':
      return 'great-grandson';
    case 'daudauchi':
      return 'great-grandchild';
    case 'daudaudau':
      return 'great-granddaughter';
    case 'daudauhus':
      return 'granddaughter\'s husband';
    case 'daudauson':
      return 'great-grandson';
    case 'dauhusfat':
      return 'son-in-law\'s father';
    case 'dauhusmot':
      return 'son-in-law\'s mother';
    case 'dauhuspar':
      return 'son-in-law\'s parent';
    case 'dausonchi':
      return 'great-grandchild';
    case 'dausondau':
      return 'great-granddaughter';
    case 'dausonson':
      return 'great-grandson';
    case 'dausonwif':
      return 'grandson\'s wife';
    case 'fatbrochi':
      return 'first cousin';
    case 'fatbrodau':
      return 'first cousin';
    case 'fatbroson':
      return 'first cousin';
    case 'fatbrowif':
      return 'aunt';
    case 'fatfatbro':
      return 'great-uncle';
    case 'fatfatfat':
      return 'great-grandfather';
    case 'fatfatmot':
      return 'great-grandmother';
    case 'fatfatpar':
      return 'great-grandparent';
    case 'fatfatsib':
      return 'great-aunt/uncle';
    case 'fatfatsis':
      return 'great-aunt';
    case 'fatmotbro':
      return 'great-uncle';
    case 'fatmotfat':
      return 'great-grandfather';
    case 'fatmotmot':
      return 'great-grandmother';
    case 'fatmotpar':
      return 'great-grandparent';
    case 'fatmotsib':
      return 'great-aunt/uncle';
    case 'fatmotsis':
      return 'great-aunt';
    case 'fatparbro':
      return 'great-uncle';
    case 'fatparfat':
      return 'great-grandfather';
    case 'fatparmot':
      return 'great-grandmother';
    case 'fatparpar':
      return 'great-grandparent';
    case 'fatparsib':
      return 'great-aunt/uncle';
    case 'fatparsis':
      return 'great-aunt';
    case 'fatsischi':
      return 'first cousin';
    case 'fatsisdau':
      return 'first cousin';
    case 'fatsishus':
      return 'uncle';
    case 'fatsisson':
      return 'first cousin';
    case 'fatwifchi':
      return 'step-sibling';
    case 'fatwifdau':
      return 'step-sister';
    case 'fatwifson':
      return 'step-brother';
    case 'husbrowif':
      return 'sister-in-law';
    case 'hussishus':
      return 'brother-in-law';
    case 'hussibchi':
      return 'nephew/niece';
    case 'hussischi':
      return 'nephew/niece';
    case 'husbrochi':
      return 'nephew/niece';
    case 'hussibdau':
      return 'niece';
    case 'hussisdau':
      return 'niece';
    case 'husbrodau':
      return 'niece';
    case 'hussibson':
      return 'nephew';
    case 'hussisson':
      return 'nephew';
    case 'husbroson':
      return 'nephew';
    case 'motbrochi':
      return 'first cousin';
    case 'motbrodau':
      return 'first cousin';
    case 'motbroson':
      return 'first cousin';
    case 'motbrowif':
      return 'aunt';
    case 'motfatbro':
      return 'great-uncle';
    case 'motfatfat':
      return 'great-grandfather';
    case 'motfatmot':
      return 'great-grandmother';
    case 'motfatpar':
      return 'great-grandparent';
    case 'motfatsib':
      return 'great-aunt/uncle';
    case 'motfatsis':
      return 'great-aunt';
    case 'mothuschi':
      return 'step-sibling';
    case 'mothusdau':
      return 'step-sister';
    case 'mothusson':
      return 'step-brother';
    case 'motmotbro':
      return 'great-uncle';
    case 'motmotfat':
      return 'great-grandfather';
    case 'motmotmot':
      return 'great-grandmother';
    case 'motmotpar':
      return 'great-grandparent';
    case 'motmotsib':
      return 'great-aunt/uncle';
    case 'motmotsis':
      return 'great-aunt';
    case 'motparbro':
      return 'great-uncle';
    case 'motparfat':
      return 'great-grandfather';
    case 'motparmot':
      return 'great-grandmother';
    case 'motparpar':
      return 'great-grandparent';
    case 'motparsib':
      return 'great-aunt/uncle';
    case 'motparsis':
      return 'great-aunt';
    case 'motsischi':
      return 'first cousin';
    case 'motsisdau':
      return 'first cousin';
    case 'motsishus':
      return 'uncle';
    case 'motsisson':
      return 'first cousin';
    case 'parbrowif':
      return 'aunt';
    case 'parfatbro':
      return 'great-uncle';
    case 'parfatfat':
      return 'great-grandfather';
    case 'parfatmot':
      return 'great-grandmother';
    case 'parfatpar':
      return 'great-grandparent';
    case 'parfatsib':
      return 'great-aunt/uncle';
    case 'parfatsis':
      return 'great-aunt';
    case 'parmotbro':
      return 'great-uncle';
    case 'parmotfat':
      return 'great-grandfather';
    case 'parmotmot':
      return 'great-grandmother';
    case 'parmotpar':
      return 'great-grandparent';
    case 'parmotsib':
      return 'great-aunt/uncle';
    case 'parmotsis':
      return 'great-aunt';
    case 'parparbro':
      return 'great-uncle';
    case 'parparfat':
      return 'great-grandfather';
    case 'parparmot':
      return 'great-grandmother';
    case 'parparpar':
      return 'great-grandparent';
    case 'parparsib':
      return 'great-aunt/uncle';
    case 'parparsis':
      return 'great-aunt';
    case 'parsishus':
      return 'uncle';
    case 'parspochi':
      return 'step-sibling';
    case 'parspodau':
      return 'step-sister';
    case 'parsposon':
      return 'step-brother';
    case 'sibchichi':
      return 'great-nephew/niece';
    case 'sibchidau':
      return 'great-niece';
    case 'sibchison':
      return 'great-nephew';
    case 'sibdauchi':
      return 'great-nephew/niece';
    case 'sibdaudau':
      return 'great-niece';
    case 'sibdauhus':
      return 'nephew-in-law';
    case 'sibdauson':
      return 'great-nephew';
    case 'sibsonchi':
      return 'great-nephew/niece';
    case 'sibsondau':
      return 'great-niece';
    case 'sibsonson':
      return 'great-nephew';
    case 'sibsonwif':
      return 'niece-in-law';
    case 'sischichi':
      if (sex1 === 'M') {
        return 'great-nephew/niece';
      }
      return 'great-nephew/niece';
    case 'sischidau':
      if (sex1 === 'M') {
        return 'great-niece';
      }
      return 'great-niece';
    case 'sischison':
      if (sex1 === 'M') {
        return 'great-nephew';
      }
      return 'great-nephew';
    case 'sisdauchi':
      if (sex1 === 'M') {
        return 'great-nephew/niece';
      }
      return 'great-nephew/niece';
    case 'sisdaudau':
      if (sex1 === 'M') {
        return 'great-niece';
      }
      return 'great-niece';
    case 'sisdauhus':
      return 'nephew-in-law';
    case 'sisdauson':
      if (sex1 === 'M') {
        return 'great-nephew';
      }
      return 'great-nephew';
    case 'sishusbro':
      return 'brother-in-law';
    case 'sishussib':
      return 'brother/sister-in-law';
    case 'sishussis':
      return 'sister-in-law';
    case 'sissonchi':
      if (sex1 === 'M') {
        return 'great-nephew/niece';
      }
      return 'great-nephew/niece';
    case 'sissondau':
      if (sex1 === 'M') {
        return 'great-niece';
      }
      return 'great-niece';
    case 'sissonson':
      if (sex1 === 'M') {
        return 'great-nephew';
      }
      return 'great-nephew';
    case 'sissonwif':
      return 'niece-in-law';
    case 'sonchichi':
      return 'great-grandchild';
    case 'sonchidau':
      return 'great-granddaughter';
    case 'sonchison':
      return 'great-grandson';
    case 'sondauchi':
      return 'great-grandchild';
    case 'sondaudau':
      return 'great-granddaughter';
    case 'sondauhus':
      return 'granddaughter\'s husband';
    case 'sondauson':
      return 'great-grandson';
    case 'sonsonchi':
      return 'great-grandchild';
    case 'sonsondau':
      return 'great-granddaughter';
    case 'sonsonson':
      return 'great-grandson';
    case 'sonsonwif':
      return 'grandson\'s wife';
    case 'sonwiffat':
      return 'daughter-in-law\'s father';
    case 'sonwifmot':
      return 'daughter-in-law\'s mother';
    case 'sonwifpar':
      return 'daughter-in-law\'s parent';
    case 'wifbrowif':
      return 'sister-in-law';
    case 'wifsishus':
      return 'brother-in-law';
    case 'wifsibchi':
      return 'nephew/niece';
    case 'wifsischi':
      return 'nephew/niece';
    case 'wifbrochi':
      return 'nephew/niece';
    case 'wifsibdau':
      return 'niece';
    case 'wifsisdau':
      return 'niece';
    case 'wifbrodau':
      return 'niece';
    case 'wifsibson':
      return 'nephew';
    case 'wifsisson':
      return 'nephew';
    case 'wifbroson':
      return 'nephew';

    case 'fatfatbrowif':
      return 'great-aunt';
    case 'fatfatsibspo':
      return 'great-aunt/uncle';
    case 'fatfatsishus':
      return 'great-uncle';
    case 'fatmotbrowif':
      return 'great-aunt';
    case 'fatmotsibspo':
      return 'great-aunt/uncle';
    case 'fatmotsishus':
      return 'great-uncle';
    case 'fatparbrowif':
      return 'great-aunt';
    case 'fatparsibspo':
      return 'great-aunt/uncle';
    case 'fatparsishus':
      return 'great-uncle';
    case 'motfatbrowif':
      return 'great-aunt';
    case 'motfatsibspo':
      return 'great-aunt/uncle';
    case 'motfatsishus':
      return 'great-uncle';
    case 'motmotbrowif':
      return 'great-aunt';
    case 'motmotsibspo':
      return 'great-aunt/uncle';
    case 'motmotsishus':
      return 'great-uncle';
    case 'motparbrowif':
      return 'great-aunt';
    case 'motparsibspo':
      return 'great-aunt/uncle';
    case 'motparsishus':
      return 'great-uncle';
    case 'parfatbrowif':
      return 'great-aunt';
    case 'parfatsibspo':
      return 'great-aunt/uncle';
    case 'parfatsishus':
      return 'great-uncle';
    case 'parmotbrowif':
      return 'great-aunt';
    case 'parmotsibspo':
      return 'great-aunt/uncle';
    case 'parmotsishus':
      return 'great-uncle';
    case 'parparbrowif':
      return 'great-aunt';
    case 'parparsibspo':
      return 'great-aunt/uncle';
    case 'parparsishus':
      return 'great-uncle';
    case 'fatfatbrodau':
      return 'first cousin once removed ascending';
    case 'fatfatbroson':
      return 'first cousin once removed ascending';
    case 'fatfatbrochi':
      return 'first cousin once removed ascending';
    case 'fatfatsisdau':
      return 'first cousin once removed ascending';
    case 'fatfatsisson':
      return 'first cousin once removed ascending';
    case 'fatfatsischi':
      return 'first cousin once removed ascending';
    case 'fatmotbrodau':
      return 'first cousin once removed ascending';
    case 'fatmotbroson':
      return 'first cousin once removed ascending';
    case 'fatmotbrochi':
      return 'first cousin once removed ascending';
    case 'fatmotsisdau':
      return 'first cousin once removed ascending';
    case 'fatmotsisson':
      return 'first cousin once removed ascending';
    case 'fatmotsischi':
      return 'first cousin once removed ascending';
    case 'motfatbrodau':
      return 'first cousin once removed ascending';
    case 'motfatbroson':
      return 'first cousin once removed ascending';
    case 'motfatbrochi':
      return 'first cousin once removed ascending';
    case 'motfatsisdau':
      return 'first cousin once removed ascending';
    case 'motfatsisson':
      return 'first cousin once removed ascending';
    case 'motfatsischi':
      return 'first cousin once removed ascending';
    case 'motmotbrodau':
      return 'first cousin once removed ascending';
    case 'motmotbroson':
      return 'first cousin once removed ascending';
    case 'motmotbrochi':
      return 'first cousin once removed ascending';
    case 'motmotsisdau':
      return 'first cousin once removed ascending';
    case 'motmotsisson':
      return 'first cousin once removed ascending';
    case 'motmotsischi':
      return 'first cousin once removed ascending';
  }

  let match;

  if ((match = /^(mot|fat|par)fatbro(son|dau|chi)dau$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)fatbro(son|dau|chi)son$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)fatbro(son|dau|chi)chi$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)fatsis(son|dau|chi)dau$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)fatsis(son|dau|chi)son$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)fatsis(son|dau|chi)chi$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)fatsib(son|dau|chi)dau$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)fatsib(son|dau|chi)son$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)fatsib(son|dau|chi)chi$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)motbro(son|dau|chi)dau$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)motbro(son|dau|chi)son$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)motbro(son|dau|chi)chi$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)motsis(son|dau|chi)dau$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)motsis(son|dau|chi)son$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)motsis(son|dau|chi)chi$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)motsib(son|dau|chi)dau$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)motsib(son|dau|chi)son$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)motsib(son|dau|chi)chi$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)parbro(son|dau|chi)dau$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)parbro(son|dau|chi)son$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)parbro(son|dau|chi)chi$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)parsis(son|dau|chi)dau$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)parsis(son|dau|chi)son$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)parsis(son|dau|chi)chi$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)parsib(son|dau|chi)dau$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)parsib(son|dau|chi)son$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^(mot|fat|par)parsib(son|dau|chi)chi$/.exec(path)) !== null) {
    return 'second cousin';
  }

  if ((match = /^((?:mot|fat|par)+)(bro|sis|sib)$/.exec(path)) !== null) {
    const up = Math.floor(match[1].length / 3);
    const befLast = path.substring(path.length - 6, path.length - 3);
    switch (up) {
      case 3:
        if (sex2 === 'M') {
          if (befLast === 'fat') {
            return 'great-great-uncle';
          }
          if (befLast === 'mot') {
            return 'great-great-uncle';
          }
          return 'great-great-uncle';
        }
        if (sex2 === 'F') {
          return 'great-great-aunt';
        }
        return 'great-great-aunt/uncle';

      case 4:
        if (sex2 === 'M') {
          if (befLast === 'fat') {
            return 'great-great-great-uncle';
          }
          if (befLast === 'mot') {
            return 'great-great-great-uncle';
          }
          return 'great-great-great-uncle';
        }
        if (sex2 === 'F') {
          return 'great-great-great-aunt';
        }
        return 'great-great-great-aunt/uncle';

      case 5:
        if (sex2 === 'M') {
          if (befLast === 'fat') {
            return 'great ×4 uncle';
          }
          if (befLast === 'mot') {
            return 'great ×4 uncle';
          }
          return 'great ×4 uncle';
        }
        if (sex2 === 'F') {
          return 'great ×4 aunt';
        }
        return 'great ×4 aunt/uncle';

      case 6:
        if (sex2 === 'M') {
          if (befLast === 'fat') {
            return 'great ×5 uncle';
          }
          if (befLast === 'mot') {
            return 'great ×5 uncle';
          }
          return 'great ×5 uncle';
        }
        if (sex2 === 'F') {
          return 'great ×5 aunt';
        }
        return 'great ×5 aunt/uncle';

      case 7:
        if (sex2 === 'M') {
          if (befLast === 'fat') {
            return 'great ×6 uncle';
          }
          if (befLast === 'mot') {
            return 'great ×6 uncle';
          }
          return 'great ×6 uncle';
        }
        if (sex2 === 'F') {
          return 'great ×6 aunt';
        }
        return 'great ×6 aunt/uncle';

      case 8:
        if (sex2 === 'M') {
          if (befLast === 'fat') {
            return 'great ×7 uncle';
          }
          if (befLast === 'mot') {
            return 'great ×7 uncle';
          }
          return 'great ×7 uncle';
        }
        if (sex2 === 'F') {
          return 'great ×7 aunt';
        }
        return 'great ×7 aunt/uncle';

      default:
        if (sex2 === 'M') {
          return `great ×${up - 1} uncle`;
        }
        if (sex2 === 'F') {
          return `great ×${up - 1} aunt`;
        }
        return `great ×${up - 1} aunt/uncle`;
    }
  }

  if ((match = /^(?:bro|sis|sib)((?:son|dau|chi)+)$/.exec(path)) !== null) {
    const down = Math.floor(match[1].length / 3) + 1;
    const first = path.substring(0, 3);
    switch (down) {
      case 4:
        if (sex2 === 'M') {
          if (first === 'bro' && sex1 === 'M') {
            return 'great-great-nephew';
          }
          if (first === 'sis' && sex1 === 'M') {
            return 'great-great-nephew';
          }
          return 'great-great-nephew';
        }
        if (sex2 === 'F') {
          if (first === 'bro' && sex1 === 'M') {
            return 'great-great-niece';
          }
          if (first === 'sis' && sex1 === 'M') {
            return 'great-great-niece';
          }
          return 'great-great-niece';
        }
        if (first === 'bro' && sex1 === 'M') {
          return 'great-great-nephew/niece';
        }
        if (first === 'sis' && sex1 === 'M') {
          return 'great-great-nephew/niece';
        }
        return 'great-great-nephew/niece';

      case 5:
        if (sex2 === 'M') {
          if (first === 'bro' && sex1 === 'M') {
            return 'great-great-great-nephew';
          }
          if (first === 'sis' && sex1 === 'M') {
            return 'great-great-great-nephew';
          }
          return 'great-great-great-nephew';
        }
        if (sex2 === 'F') {
          if (first === 'bro' && sex1 === 'M') {
            return 'great-great-great-niece';
          }
          if (first === 'sis' && sex1 === 'M') {
            return 'great-great-great-niece';
          }
          return 'great-great-great-niece';
        }
        if (first === 'bro' && sex1 === 'M') {
          return 'great-great-great-nephew/niece';
        }
        if (first === 'sis' && sex1 === 'M') {
          return 'great-great-great-nephew/niece';
        }
        return 'great-great-great-nephew/niece';

      case 6:
        if (sex2 === 'M') {
          if (first === 'bro' && sex1 === 'M') {
            return 'great ×4 nephew';
          }
          if (first === 'sis' && sex1 === 'M') {
            return 'great ×4 nephew';
          }
          return 'great ×4 nephew';
        }
        if (sex2 === 'F') {
          if (first === 'bro' && sex1 === 'M') {
            return 'great ×4 niece';
          }
          if (first === 'sis' && sex1 === 'M') {
            return 'great ×4 niece';
          }
          return 'great ×4 niece';
        }
        if (first === 'bro' && sex1 === 'M') {
          return 'great ×4 nephew/niece';
        }
        if (first === 'sis' && sex1 === 'M') {
          return 'great ×4 nephew/niece';
        }
        return 'great ×4 nephew/niece';

      case 7:
        if (sex2 === 'M') {
          if (first === 'bro' && sex1 === 'M') {
            return 'great ×5 nephew';
          }
          if (first === 'sis' && sex1 === 'M') {
            return 'great ×5 nephew';
          }
          return 'great ×5 nephew';
        }
        if (sex2 === 'F') {
          if (first === 'bro' && sex1 === 'M') {
            return 'great ×5 niece';
          }
          if (first === 'sis' && sex1 === 'M') {
            return 'great ×5 niece';
          }
          return 'great ×5 niece';
        }
        if (first === 'bro' && sex1 === 'M') {
          return 'great ×5 nephew/niece';
        }
        if (first === 'sis' && sex1 === 'M') {
          return 'great ×5 nephew/niece';
        }
        return 'great ×5 nephew/niece';

      default:
        if (sex2 === 'M') {
          return `great ×${down - 2} nephew`;
        }
        if (sex2 === 'F') {
          return `great ×${down - 2} niece`;
        }
        return `great ×${down - 2} nephew/niece`;
    }
  }

  if ((match = /^((?:mot|fat|par)*)$/.exec(path)) !== null) {
    const up = Math.floor(match[1].length / 3);
    switch (up) {
      case 4:
        if (sex2 === 'M') {
          return 'great-great-grandfather';
        }
        if (sex2 === 'F') {
          return 'great-great-grandmother';
        }
        return 'great-great-grandparent';

      case 5:
        if (sex2 === 'M') {
          return 'great-great-great-grandfather';
        }
        if (sex2 === 'F') {
          return 'great-great-great-grandmother';
        }
        return 'great-great-great-grandparent';

      case 6:
        if (sex2 === 'M') {
          return 'great ×4 grandfather';
        }
        if (sex2 === 'F') {
          return 'great ×4 grandmother';
        }
        return 'great ×4 grandparent';

      case 7:
        if (sex2 === 'M') {
          return 'great ×5 grandfather';
        }
        if (sex2 === 'F') {
          return 'great ×5 grandmother';
        }
        return 'great ×5 grandparent';

      case 8:
        if (sex2 === 'M') {
          return 'great ×6 grandfather';
        }
        if (sex2 === 'F') {
          return 'great ×6 grandmother';
        }
        return 'great ×6 grandparent';

      case 9:
        if (sex2 === 'M') {
          return 'great ×7 grandfather';
        }
        if (sex2 === 'F') {
          return 'great ×7 grandmother';
        }
        return 'great ×7 grandparent';

      default:
        if (sex2 === 'M') {
          return `great ×${up - 2} grandfather`;
        }
        if (sex2 === 'F') {
          return `great ×${up - 2} grandmother`;
        }
        return `great ×${up - 2} grandparent`;
    }
  }

  if ((match = /^((?:son|dau|chi)*)$/.exec(path)) !== null) {
    const up = Math.floor(match[1].length / 3);
    switch (up) {
      case 4:
        if (sex2 === 'M') {
          return 'great-great-grandson';
        }
        if (sex2 === 'F') {
          return 'great-great-granddaughter';
        }
        return 'great-great-grandchild';

      case 5:
        if (sex2 === 'M') {
          return 'great-great-great-grandson';
        }
        if (sex2 === 'F') {
          return 'great-great-great-granddaughter';
        }
        return 'great-great-great-grandchild';

      case 6:
        if (sex2 === 'M') {
          return 'great ×4 grandson';
        }
        if (sex2 === 'F') {
          return 'great ×4 granddaughter';
        }
        return 'great ×4 grandchild';

      case 7:
        if (sex2 === 'M') {
          return 'great ×5 grandson';
        }
        if (sex2 === 'F') {
          return 'great ×5 granddaughter';
        }
        return 'great ×5 grandchild';

      case 8:
        if (sex2 === 'M') {
          return 'great ×6 grandson';
        }
        if (sex2 === 'F') {
          return 'great ×6 granddaughter';
        }
        return 'great ×6 grandchild';

      case 9:
        if (sex2 === 'M') {
          return 'great ×7 grandson';
        }
        if (sex2 === 'F') {
          return 'great ×7 granddaughter';
        }
        return 'great ×7 grandchild';

      default:
        if (sex2 === 'M') {
          return `great ×${up - 2} grandson`;
        }
        if (sex2 === 'F') {
          return `great ×${up - 2} granddaughter`;
        }
        return `great ×${up - 2} grandchild`;
    }
  }

  if ((match = /^((?:mot|fat|par)+)(?:bro|sis|sib)((?:son|dau|chi)+)$/.exec(path)) !== null) {
    const ascent = match[1];
    const descent = match[2];
    const up = Math.floor(ascent.length / 3);
    const down = Math.floor(descent.length / 3);
    const cousin = Math.min(up, down);
    const removed = Math.abs(down - up);

    switch (removed) {
      case 0:
        return legacyCousinName(cousin, sex2);
      case 1:
        if (up > down) {
          return `${legacyCousinName(cousin, sex2)} once removed ascending`;
        }
        return `${legacyCousinName(cousin, sex2)} once removed descending`;
      case 2:
        if (up > down) {
          return `${legacyCousinName(cousin, sex2)} twice removed ascending`;
        }
        return `${legacyCousinName(cousin, sex2)} twice removed descending`;
      case 3:
        if (up > down) {
          return `${legacyCousinName(cousin, sex2)} three times removed ascending`;
        }
        return `${legacyCousinName(cousin, sex2)} three times removed descending`;
      default:
        if (up > down) {
          return `${legacyCousinName(cousin, sex2)} ${removed} times removed ascending`;
        }
        return `${legacyCousinName(cousin, sex2)} ${removed} times removed descending`;
    }
  }

  // Mirrors legacyNameAlgorithm()'s own final fallback
  // (app/Services/RelationshipService.php:2166-2192): no specific
  // case/regex matched, so split the path at every 3-character
  // boundary into two sub-paths, name each half recursively, and pick
  // whichever split produces the SHORTEST combined "X's Y" string -
  // not ported as a cache (real PHP's own `static $relationshipsCache`
  // is a per-process memoization detail, not user-visible behavior).
  let relationship = '';
  let path1 = path.substring(0, 3);
  let path2 = path.substring(3);
  while (path2 !== '') {
    const tmp = `${legacyNameAlgorithm(path1, null, null, null)}'s ${legacyNameAlgorithm(path2, null, null, null)}`;
    if (relationship === '' || tmp.length < relationship.length) {
      relationship = tmp;
    }
    path1 += path2.substring(0, 3);
    path2 = path2.substring(3);
  }

  return relationship;
}
