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

// Data/logic layer for /tree/{tree}/family/{xref} (FamilyPage) - the
// second real-GEDCOM-record route, reusing almost everything built for
// /tree/{tree}/individual/{xref} (pages-server/individual.mjs): name
// parsing, date/lifespan/age math, and - critically - the shared RESN
// privacy chain (`canShowViaResnChain()`), since in real PHP
// `Family` and `Individual` both extend `GedcomRecord` and share that
// EXACT method, only overriding `canShowByType()`. See
// docs/php-to-js-migration/phase5-family-page.md for the full scope:
// husband/wife/children identity cards + marriage/divorce vital facts
// only - no full facts-and-events table beyond those, no
// SHOW_PRIVATE_RELATIONSHIPS override (a safe, display-only cut - see
// below), no slug canonicalization.

import { canShowViaResnChain } from './individual.mjs';

// Membership-link tags excluded from the "Facts and events" table -
// these render as the parents/children cards instead, matching
// FamilyPage.php:69-70's own filter EXACTLY:
// `$family->facts([], true)->filter(fn ($fact) => !in_array($fact->tag(), ['FAM:HUSB', 'FAM:WIFE', 'FAM:CHIL']))`.
// An earlier draft narrowed this further to just MARR/DIV/ANUL/_SEPR -
// reported live as "I see only marriage and not other facts" (the
// user's real family record has RESI and CHAN facts too) - PHP's own
// filter has no such narrowing, so this port doesn't either.
const EXCLUDED_MEMBERSHIP_TAGS = ['HUSB', 'WIFE', 'CHIL'];

function factTag(factGedcom) {
  const match = /^1 (\S+)/.exec(factGedcom);
  return match ? match[1] : '';
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} xref
 * @returns {Promise<{xref: string, gedcom: string, husb: string|null, wife: string|null}|null>}
 */
export async function loadFamily(pool, gedcomId, xref) {
  const result = await pool.query('SELECT f_id, f_gedcom, f_husb, f_wife FROM wt_families WHERE f_id = $1 AND f_file = $2', [
    xref,
    gedcomId,
  ]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return { xref: row.f_id, gedcom: row.f_gedcom, husb: row.f_husb, wife: row.f_wife };
}

/**
 * Mirrors Family::children()'s CHIL-fact extraction
 * (app/Family.php:177-192) - the xrefs only; each caller resolves and
 * privacy-checks the individual itself via `pages-server/individual.mjs`.
 *
 * @param {string[]} facts
 * @returns {string[]}
 */
export function childrenXrefs(facts) {
  const xrefs = [];

  for (const fact of facts) {
    if (factTag(fact) !== 'CHIL') {
      continue;
    }

    const match = /^1 CHIL @([^@]+)@/.exec(fact);

    if (match) {
      xrefs.push(match[1]);
    }
  }

  return xrefs;
}

/**
 * Mirrors resources/views/family-page.phtml's "Facts and events" table
 * filter (app/Http/RequestHandlers/FamilyPage.php:69-70) exactly: every
 * fact EXCEPT the HUSB/WIFE/CHIL membership links themselves (those
 * render as the parents/children cards, not fact rows). Unlike
 * IndividualPage's own vital-facts list (deliberately narrowed to a
 * fixed BIRT/CHR/BAPM/DEAT/BURI/CREM tag set - individual facts route
 * through several different tabs in real PHP, e.g. RelativesTabModule
 * claims FAMC/FAMS, so "everything" isn't a safe substitute there),
 * FamilyPage has no such tab-routing complexity to replicate - PHP's
 * own filter really is this simple, so this port isn't narrowed either.
 *
 * @param {string[]} facts
 * @returns {string[]} the fact blocks themselves (tag/date/place/etc.
 *   extraction + privacy filtering is the caller's job, matching
 *   individual.mjs's own visibleFacts composition convention)
 */
export function displayableFamilyFacts(facts) {
  // parseFacts()'s own doc comment (pages-server/individual.mjs) notes
  // the record's leading "0 @Fn@ FAM" line is never stripped, relying
  // on every caller matching an EXACT "1 TAG" prefix to filter it out
  // harmlessly - true for every ALLOWLIST-style check elsewhere in
  // this codebase, but NOT for this function's DENYLIST shape:
  // factTag("0 @Fn@ FAM") is '' (no match), and '' is not in
  // EXCLUDED_MEMBERSHIP_TAGS, so it slipped through as a fake
  // undefined-tag fact row - caught live (rendered as a literal
  // "undefined" label). Filtered explicitly here instead.
  return facts.filter((fact) => {
    const tag = factTag(fact);
    return tag !== '' && !EXCLUDED_MEMBERSHIP_TAGS.includes(tag);
  });
}

/**
 * Mirrors Family::canShowByType() (app/Family.php:118-131) EXACTLY -
 * unlike Individual's version, this one has no bespoke logic of its
 * own: hide the family if ANY referenced HUSB/WIFE/CHIL individual
 * can't be shown. `memberCanShowResults` is pre-computed by the caller
 * (one canShowRecord() call per referenced individual that actually
 * exists - individual.mjs's own function, reused as-is) since this
 * function stays synchronous/DB-free like every other privacy
 * predicate in this migration.
 *
 * @param {{hideLivePeople: boolean, defaultResn: string|null}} tree
 * @param {string} gedcom the family's raw record text
 * @param {{accessLevel: 0|1|2, isSelfRecord: boolean}} viewer isSelfRecord
 *   is always false for a family (the self-record exception compares
 *   against an INDIVIDUAL xref pref, which can never equal a family's
 *   FAM-type xref) - included for structural symmetry with PHP's own
 *   shared GedcomRecord::canShowRecord(), not because it ever fires.
 * @param {boolean[]} memberCanShowResults
 * @returns {boolean}
 */
export function familyCanShowRecord(tree, gedcom, viewer, memberCanShowResults) {
  return canShowViaResnChain(tree, gedcom, viewer, () => memberCanShowResults.every(Boolean));
}
