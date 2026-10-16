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

// Data layer for /tree/{tree}/individual-list (IndividualListModule),
// the SECOND AbstractIndividualListModule.php-based route (showFamilies()
// === false; see family-list.mjs's own doc comment for the shared
// surname-collation infra both routes use via the `fams` parameter).
// Individual-specific pieces that have no family-list equivalent live
// here: the real family-graph-walking birth/death date ESTIMATION
// algorithm, individual-level numberOfChildren(), and the surname-query
// variant that tracks which NAME fact matched (IndividualListModule's
// own setPrimaryName($n) behavior - family-list never needed this,
// since it always shows every one of a spouse's own names regardless
// of which one matched).

import { GedcomDate } from '../lib/gedcom-date.js';
import { GregorianCalendar } from '../lib/ext-calendar/gregorian.js';

const GREGORIAN_CALENDAR = new GregorianCalendar();
import { loadFamily, loadRelatedFamilyXrefs, childrenXrefs, getMarriageDate } from './family.mjs';
import { parseFacts, loadIndividual, getBirthDate, getAllBirthDates, getAllDeathDates } from './individual.mjs';
import { initialLetter, normalize, strtoupper } from './collation.mjs';

/**
 * Mirrors Individual::numberOfChildren() (app/Individual.php:680-696):
 * an explicit NCHI fact wins outright if present (no `max()` with the
 * real count here, unlike Family::numberOfChildren() - a real,
 * confirmed divergence between the two methods, not a copy-paste
 * carried over by mistake); otherwise every DISTINCT child across all
 * of this individual's own spouse families (deduplicated by xref,
 * matching PHP's own `$children[$child->xref()] = true` dedup).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref
 * @param {string[]} facts this individual's own facts
 * @returns {Promise<number>}
 */
export async function numberOfChildren(pool, gedcomId, xref, facts) {
  for (const fact of facts) {
    const match = /^1 NCHI (\d+)/.exec(fact);

    if (match) {
      return parseInt(match[1], 10);
    }
  }

  const related = await loadRelatedFamilyXrefs(pool, gedcomId, xref);
  const childXrefs = new Set();

  for (const famXref of related.spouseFamilies) {
    const family = await loadFamily(pool, gedcomId, famXref);

    if (family === null) {
      continue;
    }

    for (const childXref of childrenXrefs(parseFacts(family.gedcom))) {
      childXrefs.add(childXref);
    }
  }

  return childXrefs.size;
}

/**
 * One resolved parent/spouse family, for the estimation algorithm below -
 * the specific facts it reads (marriage date, husband/wife birth dates,
 * children's birth dates), not a general-purpose family resolver.
 */
async function loadFamilyContext(pool, gedcomId, familyXref) {
  const family = await loadFamily(pool, gedcomId, familyXref);

  if (family === null) {
    return null;
  }

  const facts = parseFacts(family.gedcom);
  const husbandBirthDate =
    family.husb !== null ? await loadIndividualBirthDate(pool, gedcomId, family.husb) : null;
  const wifeBirthDate = family.wife !== null ? await loadIndividualBirthDate(pool, gedcomId, family.wife) : null;
  const childrenBirthDates = [];

  for (const childXref of childrenXrefs(facts)) {
    const childBirthDate = await loadIndividualBirthDate(pool, gedcomId, childXref);

    if (childBirthDate !== null) {
      childrenBirthDates.push(childBirthDate);
    }
  }

  return {
    husb: family.husb,
    wife: family.wife,
    marriageDate: getMarriageDate(facts),
    husbandBirthDate,
    wifeBirthDate,
    childrenBirthDates,
  };
}

async function loadIndividualBirthDate(pool, gedcomId, xref) {
  const individual = await loadIndividual(pool, gedcomId, xref);

  if (individual === null) {
    return null;
  }

  return getBirthDate(parseFacts(individual.gedcom));
}

/**
 * Mirrors Individual::getEstimatedBirthDate() (app/Individual.php:516-589)
 * EXACTLY, including every hardcoded year-offset heuristic: a real
 * dated BIRT/CHR/BAPM fact always wins outright; otherwise walks this
 * individual's OWN death date, every parent family (marriage date +
 * both parents' own birth dates + every sibling's birth date), and
 * every spouse family (marriage date + spouse's birth date + every
 * child's birth date) to build a [min, max] Julian-day range, then
 * picks the midpoint year. Returns a blank (unparseable) GedcomDate,
 * same as real PHP's `new Date('')`, when no usable range can be built
 * at all.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref
 * @param {string[]} facts this individual's own facts
 * @param {number} maxAliveAge tree's MAX_ALIVE_AGE preference
 * @returns {Promise<GedcomDate>}
 */
export async function getEstimatedBirthDate(pool, gedcomId, xref, facts, maxAliveAge) {
  const realDates = getAllBirthDates(facts);

  for (const d of realDates) {
    if (d.date.isOK()) {
      return d.date;
    }
  }

  const min = [];
  const max = [];

  const deathDate = getAllDeathDates(facts)[0] ?? null;

  if (deathDate !== null && deathDate.date.isOK()) {
    min.push(deathDate.date.minimumJulianDay() - 365 * maxAliveAge);
    max.push(deathDate.date.maximumJulianDay());
  }

  const related = await loadRelatedFamilyXrefs(pool, gedcomId, xref);

  for (const famXref of related.parentFamilies) {
    const ctx = await loadFamilyContext(pool, gedcomId, famXref);

    if (ctx === null) {
      continue;
    }

    if (ctx.marriageDate !== null && ctx.marriageDate.date.isOK()) {
      min.push(ctx.marriageDate.date.maximumJulianDay() - 365);
      max.push(ctx.marriageDate.date.minimumJulianDay() + 365 * 30);
    }

    if (ctx.husbandBirthDate !== null && ctx.husbandBirthDate.date.isOK()) {
      min.push(ctx.husbandBirthDate.date.maximumJulianDay() + 365 * 15);
      max.push(ctx.husbandBirthDate.date.minimumJulianDay() + 365 * 65);
    }

    if (ctx.wifeBirthDate !== null && ctx.wifeBirthDate.date.isOK()) {
      min.push(ctx.wifeBirthDate.date.maximumJulianDay() + 365 * 15);
      max.push(ctx.wifeBirthDate.date.minimumJulianDay() + 365 * 45);
    }

    for (const childBirthDate of ctx.childrenBirthDates) {
      if (childBirthDate.date.isOK()) {
        min.push(childBirthDate.date.maximumJulianDay() - 365 * 30);
        max.push(childBirthDate.date.minimumJulianDay() + 365 * 30);
      }
    }
  }

  const sexFact = facts.find((f) => /^1 SEX ([MFX])/.test(f));
  const ownSex = sexFact ? /^1 SEX ([MFX])/.exec(sexFact)[1] : 'U';

  for (const famXref of related.spouseFamilies) {
    const ctx = await loadFamilyContext(pool, gedcomId, famXref);

    if (ctx === null) {
      continue;
    }

    if (ctx.marriageDate !== null && ctx.marriageDate.date.isOK()) {
      min.push(ctx.marriageDate.date.maximumJulianDay() - 365 * 45);
      max.push(ctx.marriageDate.date.minimumJulianDay() - 365 * 15);
    }

    // The "other" spouse's birth date - husbandBirthDate/wifeBirthDate
    // are keyed by role (husb/wife), not by "self vs. other", so pick
    // whichever side ISN'T this individual - mirrors Family::spouse($this).
    const spouseBirthDate = ctx.husb === xref ? ctx.wifeBirthDate : ctx.husbandBirthDate;

    if (spouseBirthDate !== null && spouseBirthDate.date.isOK()) {
      min.push(spouseBirthDate.date.maximumJulianDay() - 365 * 25);
      max.push(spouseBirthDate.date.minimumJulianDay() + 365 * 25);
    }

    for (const childBirthDate of ctx.childrenBirthDates) {
      if (childBirthDate.date.isOK()) {
        min.push(childBirthDate.date.maximumJulianDay() - 365 * (ownSex === 'F' ? 45 : 65));
        max.push(childBirthDate.date.minimumJulianDay() - 365 * 15);
      }
    }
  }

  if (min.length > 0 && max.length > 0) {
    const midJulianDay = Math.trunc((Math.max(...min) + Math.min(...max)) / 2);
    const [year] = GREGORIAN_CALENDAR.jdToYmd(midJulianDay);

    return new GedcomDate(`EST ${year}`);
  }

  return new GedcomDate('');
}

/**
 * Mirrors Individual::getEstimatedDeathDate() (app/Individual.php:600-621):
 * a real dated DEAT/BURI/CREM fact always wins outright; otherwise, IF
 * an estimated birth date was found, MAX_ALIVE_AGE years after it
 * (`addYears($max_alive_age, 'BEF')`); otherwise a blank date.
 *
 * @param {string[]} facts this individual's own facts
 * @param {GedcomDate} estimatedBirthDate from getEstimatedBirthDate() above
 * @param {number} maxAliveAge
 * @returns {GedcomDate}
 */
export function getEstimatedDeathDate(facts, estimatedBirthDate, maxAliveAge) {
  const realDates = getAllDeathDates(facts);

  for (const d of realDates) {
    if (d.date.isOK()) {
      return d.date;
    }
  }

  if (estimatedBirthDate.minimumJulianDay() !== 0) {
    return estimatedBirthDate.addYears(maxAliveAge, 'BEF');
  }

  return new GedcomDate('');
}

/**
 * Mirrors AbstractIndividualListModule::individuals() (app/Module/AbstractIndividualListModule.php:692-734)
 * for the `fams=false` case, WITH its own setPrimaryName($n) behavior
 * (lines 718-729) - unlike family-list's familyXrefsForSurnames(),
 * which never needs to know which NAME fact matched. Returns one row
 * PER MATCHING NAME FACT, not deduplicated by individual - a real (if
 * rare) PHP behavior: an individual with two NAME facts sharing the
 * same matched surname appears twice, same as real PHP's own
 * Collection->push() with no ->unique() call (unlike families(), which
 * does dedupe).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string[]} surnsToShow if empty, every real surname (excluding
 *   '' and '@N.N.')
 * @param {string} galpha if set, only match a given name starting with
 *   this initial letter
 * @param {boolean} marnm include married (_MARNM) names
 * @returns {Promise<{xref: string, matchedGivn: string, matchedSurn: string}[]>}
 */
export async function individualRowsForSurnames(pool, gedcomId, surnsToShow, galpha, marnm) {
  const conditions = ['n.n_file = $1'];
  const params = [gedcomId];

  if (!marnm) {
    conditions.push("n.n_type <> '_MARNM'");
  }

  if (surnsToShow.length === 0) {
    conditions.push("n.n_surn NOT IN ('', '@N.N.')");
  } else {
    params.push(surnsToShow);
    conditions.push(`n.n_surn = ANY($${params.length})`);
  }

  const result = await pool.query(
    `SELECT n.n_id AS xref, n.n_givn, n.n_surn
     FROM wt_name n
     JOIN wt_individuals i ON i.i_id = n.n_id AND i.i_file = n.n_file
     WHERE ${conditions.join(' AND ')}`,
    params,
  );

  const rows = result.rows.map((row) => ({ xref: row.xref, matchedGivn: row.n_givn, matchedSurn: row.n_surn }));

  if (galpha === '') {
    return rows;
  }

  // galpha filtering happens in JS (not SQL) - locale-aware
  // initialLetter(normalize(strtoupper(...))), same reasoning as
  // family-list.mjs's own familyXrefsForSurnames().
  return rows.filter((row) => initialLetter(normalize(strtoupper(row.matchedGivn ?? ''))) === galpha);
}

/**
 * Mirrors the SHOW_EST_LIST_DATES tree preference individuals-table.phtml
 * reads directly (its own default, '0' - app/Tree.php:75) - whether to
 * display an ESTIMATED date at all when no real one exists (the
 * estimation itself, getEstimatedBirthDate()/getEstimatedDeathDate()
 * above, still runs regardless - it also drives those columns' sort
 * keys even when not displayed).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<boolean>}
 */
export async function loadShowEstimatedDatesPref(pool, gedcomId) {
  const result = await pool.query(
    "SELECT setting_value FROM wt_gedcom_setting WHERE gedcom_id = $1 AND setting_name = 'SHOW_EST_LIST_DATES'",
    [gedcomId],
  );
  const value = result.rows[0]?.setting_value ?? '0';

  return value === '1';
}
