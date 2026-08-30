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

// Port of app/Date.php::Date::compare().
// See docs/php-to-js-migration/task-12-fact-comparator.md.
//
// Takes two plain date objects shaped:
// { qual1: string, minimumJulianDay: number, maximumJulianDay: number }
// (not real Date class instances — shim domain objects as plain data).
// Returns -1 if a < b, 0 if equal or overlap, 1 if a > b.

export function compareDates(a, b) {
  // Get min/max JD for each date, applying BEF/AFT nudges
  let amin, amax;
  switch (a.qual1) {
    case 'BEF':
      amin = a.minimumJulianDay - 1;
      amax = amin;
      break;
    case 'AFT':
      amax = a.maximumJulianDay + 1;
      amin = amax;
      break;
    default:
      amin = a.minimumJulianDay;
      amax = a.maximumJulianDay;
      break;
  }

  let bmin, bmax;
  switch (b.qual1) {
    case 'BEF':
      bmin = b.minimumJulianDay - 1;
      bmax = bmin;
      break;
    case 'AFT':
      bmax = b.maximumJulianDay + 1;
      bmin = bmax;
      break;
    default:
      bmin = b.minimumJulianDay;
      bmax = b.maximumJulianDay;
      break;
  }

  // Compare ranges
  if (amax < bmin) {
    return -1;
  }

  if (amin > bmax && bmax > 0) {
    return 1;
  }

  if (amin < bmin && amax <= bmax) {
    return -1;
  }

  if (amin > bmin && amax >= bmax && bmax > 0) {
    return 1;
  }

  return 0;
}
