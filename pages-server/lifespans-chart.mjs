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

// Data/logic layer for /tree/{tree}/lifespans (LifespansChartModule,
// phase 5 step 34) - the SEVENTH chart route, and a different shape
// from every chart ported so far: not rooted at one individual with
// generations, but a free-form, user-ACCUMULATED set of individuals
// (seeded however the caller likes - one individual's xref, their
// immediate family, every individual matching a place/date range),
// laid out as overlapping horizontal bars (a Gantt-style timeline).
// See docs/php-to-js-migration/phase5-lifespans-chart.md for the full
// scope writeup, including the deliberate UI simplification (plain
// text inputs instead of real PHP's own TomSelect-backed place/
// individual autocompletes - the same simplification already used by
// every xref field on every other chart's own options form).

import { GedcomDate } from '../lib/gedcom-date.js';
import { GregorianCalendar } from '../lib/ext-calendar/gregorian.js';
import { loadFamily, loadRelatedFamilyXrefs, childrenXrefs, getMarriageDate } from './family.mjs';
import { parseFacts } from './individual.mjs';

const GREGORIAN_CALENDAR = new GregorianCalendar();

// Mirrors Gedcom::PLACE_SEPARATOR_REGEX (app/Gedcom.php:261) - splits
// "Westminster, London, England" into ["Westminster", "London", "England"].
const PLACE_SEPARATOR_REGEX = / *,[, ]*/;

// Mirrors LifespansChartModule::SEPARATOR - the modern (2.1+) URL
// encoding for the accumulated xref list: dot-joined, e.g.
// "I1.I2.I3". Real PHP also accepts the legacy (2.0 and earlier)
// `xrefs[]=I1&xrefs[]=I2` array form - see parseLifespansXrefs() below.
const SEPARATOR = '.';

/**
 * Mirrors LifespansChartModule::handle()'s own `$xrefs` resolution
 * (app/Module/LifespansChartModule.php:128-139): a dot-joined
 * `xrefs` string (current URLs), falling back to the legacy
 * `xrefs[]=...` array form (old bookmarked/shared URLs).
 *
 * @param {URLSearchParams} searchParams
 * @returns {string[]}
 */
export function parseLifespansXrefs(searchParams) {
  const joined = searchParams.get('xrefs');

  if (joined !== null && joined !== '') {
    return joined.split(SEPARATOR);
  }

  return searchParams.getAll('xrefs[]');
}

export function joinLifespansXrefs(xrefs) {
  return xrefs.join(SEPARATOR);
}

/**
 * Mirrors LifespansChartModule::closeFamily() (app/Module/LifespansChartModule.php:291-313)
 * EXACTLY: every child and every spouse of every one of this
 * individual's own spouse families AND parent families - NOT
 * privacy-filtered here (same as real PHP - the final
 * dedupe-and-filter-private pass happens once, over the whole
 * accumulated xref list, in the caller).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref
 * @returns {Promise<string[]>}
 */
export async function closeFamilyXrefs(pool, gedcomId, xref) {
  const related = await loadRelatedFamilyXrefs(pool, gedcomId, xref);
  const xrefs = [];

  for (const famXref of [...related.spouseFamilies, ...related.parentFamilies]) {
    const family = await loadFamily(pool, gedcomId, famXref);

    if (family === null) {
      continue;
    }

    const facts = parseFacts(family.gedcom);

    xrefs.push(...childrenXrefs(facts));

    if (family.husb !== null) {
      xrefs.push(family.husb);
    }

    if (family.wife !== null) {
      xrefs.push(family.wife);
    }
  }

  return xrefs;
}

/**
 * Mirrors Place::id()'s own recursive wt_places walk (app/Place.php:100-124),
 * but starting from a plain place-name STRING (this port's own
 * simplified "place" text field) rather than real PHP's TomSelect-
 * picked `place_id` integer - same simplification already used for
 * every individual-xref field on every other chart's options form, so
 * this filter stays genuinely functional without a new autocomplete
 * dependency. Resolves from the TOP-level part down to the most
 * specific, exactly matching real PHP's own recursive parent-first
 * resolution. Returns 0 (matches nothing - same as real PHP's own
 * "place not found" result) when any level of the chain doesn't
 * exist.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} placeName
 * @returns {Promise<number>}
 */
export async function resolvePlaceId(pool, gedcomId, placeName) {
  const parts = placeName
    .trim()
    .split(PLACE_SEPARATOR_REGEX)
    .filter((part) => part !== '');

  let parentId = 0;

  for (let i = parts.length - 1; i >= 0; i--) {
    // Mirrors Place::id()'s own mb_substr($part, 0, 120) - wt_places.p_place is varchar(120) in real PHP's schema.
    const part = parts[i].slice(0, 120);
    const result = await pool.query('SELECT p_id FROM wt_places WHERE p_file = $1 AND p_place = $2 AND p_parent_id = $3', [
      gedcomId,
      part,
      parentId,
    ]);

    if (result.rows.length === 0) {
      return 0;
    }

    parentId = result.rows[0].p_id;
  }

  return parentId;
}

/**
 * Mirrors LifespansChartModule::findIndividualsByDate() (app/Module/LifespansChartModule.php:259-271):
 * every individual with a dated fact (excluding the same LDS-ordinance/
 * bookkeeping tags real PHP excludes) overlapping [start, end].
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {GedcomDate} startDate
 * @param {GedcomDate} endDate
 * @returns {Promise<string[]>}
 */
export async function findIndividualsByDate(pool, gedcomId, startDate, endDate) {
  const result = await pool.query(
    `SELECT DISTINCT d_gid FROM wt_dates
     WHERE d_file = $1 AND d_julianday1 <= $2 AND d_julianday2 >= $3
       AND d_fact NOT IN ('BAPL', 'ENDL', 'SLGC', 'SLGS', '_TODO', 'CHAN')
       AND d_gid IN (SELECT i_id FROM wt_individuals WHERE i_file = $1)`,
    [gedcomId, endDate.maximumJulianDay(), startDate.minimumJulianDay()],
  );

  return result.rows.map((row) => row.d_gid);
}

/**
 * Mirrors LifespansChartModule::findIndividualsByPlace() (app/Module/LifespansChartModule.php:273-287).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {number} placeId
 * @returns {Promise<string[]>}
 */
export async function findIndividualsByPlace(pool, gedcomId, placeId) {
  const result = await pool.query(
    `SELECT DISTINCT pl_gid FROM wt_placelinks
     WHERE pl_file = $1 AND pl_p_id = $2
       AND pl_gid IN (SELECT i_id FROM wt_individuals WHERE i_file = $1)`,
    [gedcomId, placeId],
  );

  return result.rows.map((row) => row.pl_gid);
}

/**
 * Port of app/ColorGenerator.php - a small stateful HSL color-cycling
 * generator, one per sex, shared across every individual of that sex
 * in one chart render.
 */
export class ColorGenerator {
  constructor(hue, saturation, lightness, alpha, range) {
    this.hue = hue;
    this.basehue = hue;
    this.saturation = saturation;
    this.lightness = lightness;
    this.baselightness = lightness;
    this.alpha = alpha;
    this.range = range;
  }

  getNextColor(lightnessStep = 10, hueStep = 15) {
    let lightness = this.lightness + lightnessStep;
    let hue = this.hue;

    if (lightness >= 100) {
      lightness = this.baselightness;
      hue += this.range > 0 ? hueStep : -hueStep;

      if ((hue - this.basehue) * (hue - (this.basehue + this.range)) >= 0) {
        hue = this.basehue;
      }

      this.hue = hue;
    }

    this.lightness = lightness;

    return `hsla(${this.hue}, ${this.saturation}%, ${this.lightness}%, ${this.alpha.toFixed(2)})`;
  }
}

function jdToYear(jd) {
  if (jd === 0) {
    return 0;
  }

  const [year] = GREGORIAN_CALENDAR.jdToYmd(jd);

  return year;
}

/**
 * Mirrors LifespansChartModule::maxYear() (app/Module/LifespansChartModule.php:218-236).
 *
 * @param {Array<{deathDate: GedcomDate}>} individuals
 * @returns {number}
 */
export function lifespansMaxYear(individuals) {
  let jd = 0;

  for (const { deathDate } of individuals) {
    if (deathDate.isOK()) {
      jd = Math.max(jd, deathDate.maximumJulianDay());
    }
  }

  const currentYear = new Date().getFullYear();

  if (jd === 0) {
    return currentYear;
  }

  return Math.min(jdToYear(jd), currentYear);
}

/**
 * Mirrors LifespansChartModule::minYear() (app/Module/LifespansChartModule.php:241-256).
 *
 * @param {Array<{birthDate: GedcomDate}>} individuals
 * @returns {number}
 */
export function lifespansMinYear(individuals) {
  let jd = Number.POSITIVE_INFINITY;

  for (const { birthDate } of individuals) {
    if (birthDate.isOK()) {
      jd = Math.min(jd, birthDate.minimumJulianDay());
    }
  }

  if (jd === Number.POSITIVE_INFINITY) {
    return new Date().getFullYear();
  }

  return jdToYear(jd);
}

/**
 * Mirrors LifespansChartModule::layoutIndividuals() (app/Module/LifespansChartModule.php:368-412)
 * EXACTLY: a greedy row-packing algorithm (each individual goes in the
 * first row whose previous occupant's bar has already ended, else a
 * new row), plus one `ColorGenerator` per sex cycling a new
 * lightness/hue on every call. `individuals` must already be sorted
 * by estimated birth date ascending (real PHP's own
 * `usort($individuals, IndividualComparator::byBirthDate(...))`,
 * reproduced in the caller via `GedcomDate.compare()`).
 *
 * @param {Array<{box: object, birthDate: GedcomDate, deathDate: GedcomDate}>} individuals
 * @returns {Array<{background: string, birthYear: number, deathYear: number, id: string, box: object, row: number}>}
 */
export function layoutIndividuals(individuals) {
  const colorGenerators = {
    M: new ColorGenerator(240, 100, 30, 0.25, -120),
    F: new ColorGenerator(0, 100, 30, 0.25, 120),
    U: new ColorGenerator(120, 100, 30, 0.25, 120),
  };

  const currentYear = new Date().getFullYear();
  const rows = [];
  const lifespans = [];

  for (const { box, birthDate, deathDate } of individuals) {
    const birthJd = birthDate.minimumJulianDay();
    const birthYear = jdToYear(birthJd);
    const deathJd = deathDate.maximumJulianDay();
    let deathYear = jdToYear(deathJd);

    if (deathYear < birthYear) {
      deathYear = birthYear;
    }

    deathYear = Math.min(deathYear, currentYear);

    let nextRow = rows.length;

    for (let row = 0; row < rows.length; row++) {
      if (rows[row] < birthYear) {
        nextRow = row;
        break;
      }
    }

    rows[nextRow] = deathYear;

    const colorGenerator = colorGenerators[box.sex] ?? colorGenerators.U;

    lifespans.push({
      background: colorGenerator.getNextColor(),
      birthYear,
      deathYear,
      id: 'individual-' + box.xref,
      box,
      row: nextRow,
    });
  }

  return lifespans;
}
