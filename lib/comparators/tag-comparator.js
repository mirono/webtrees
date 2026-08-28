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

// Port of app/Comparators/TagComparator.php.
// See docs/php-to-js-migration/task-03-tag-comparator.md.
//
// FACT_ORDER is data, not logic: copied verbatim (order is the semantic
// content — GEDCOM fact display order, not alphabetical) from a live
// `(new ReflectionClass(TagComparator::class))->getReflectionConstant('FACT_ORDER')->getValue()`
// dump, not retyped from the class source, to avoid transcription error.
// 66 entries — corrected from this task's doc, which had said 68.
const FACT_ORDER = [
  'SEX', 'NAME', 'BIRT', 'ALIA', 'ADOP', 'CHR', 'BAPM', 'FCOM', 'CONF',
  'BARM', 'BASM', 'EDUC', 'GRAD', 'EMIG', 'IMMI', 'NATU', 'ENGA', 'MARB',
  'MARC', 'MARL', 'MARR', 'DIVF', 'MARS', 'DIV', 'ANUL', 'CENS', 'OCCU',
  'RESI', 'PROP', 'CHRA', 'RETI', 'FACT', 'EVEN', 'NMR', 'NCHI', 'WILL',
  'DEAT', 'CREM', 'BURI', 'PROB', 'TITL', 'COMM', 'NATI', 'CITN', 'CAST',
  'RELI', 'SSN', 'IDNO', 'TEMP', 'SLGC', 'BAPL', 'CONL', 'ENDL', 'SLGS',
  '_FSFTID', 'AFN', 'REFN', 'REF', 'RIN', 'OBJE', 'NOTE', 'SOUR', 'CREA',
  'CHAN', '_TODO', '_UID',
];

const EVEN_ORDER = FACT_ORDER.indexOf('EVEN');

/**
 * Port of TagComparator::order(). An unrecognised tag doesn't throw or
 * return -1 — it silently sorts as if it were 'EVEN' (index 32), matching
 * PHP's fallback behavior exactly (verified: golden/tag_comparator_order.json
 * cases for '', 'NOT_A_REAL_TAG', and 'EVEN' itself all resolve to 32).
 */
export function order(tag) {
  const index = FACT_ORDER.indexOf(tag);

  return index === -1 ? EVEN_ORDER : index;
}

/**
 * Port of TagComparator::byOrder(). PHP's <=> (spaceship) operator
 * normalizes its result to exactly -1/0/1, unlike a plain numeric
 * subtraction — this task's own doc claimed `a - b` "maps directly" with
 * no special handling needed, but the parity test (golden/tag_comparator_byorder.json,
 * e.g. 'BIRT' vs 'DEAT') caught that this is wrong: a - b returns the raw
 * index difference (e.g. -34), not -1. Math.sign() normalizes correctly.
 */
export function byOrder(firstTag, secondTag) {
  return Math.sign(order(firstTag) - order(secondTag));
}
