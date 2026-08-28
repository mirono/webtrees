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

// Shared i18n/now injection defaults for lib/date/*.js.
// See docs/php-to-js-migration/task-08-gregorian-julian-date.md's
// bridging decisions #2 and #3.

/**
 * I18N::translate()'s PHP implementation translates the message, then
 * sprintf()-substitutes args into it. Our default (untranslated) i18n
 * object needs to support the same %s substitution to produce meaningful
 * output — this codebase's date-formatting calls only ever use %s
 * (confirmed by grep), so that's all this supports.
 */
function substitute(template, args) {
  let i = 0;

  return template.replace(/%s/g, () => (i < args.length ? String(args[i++]) : '%s'));
}

export const DEFAULT_I18N = {
  translate: (message, ...args) => substitute(message, args),
  translateContext: (_context, message, ...args) => substitute(message, args),
  digits: (n) => String(n),
};

/**
 * PHP's GregorianToJD(date('n'), date('j'), date('Y')) equivalent — "today"
 * as a Julian day number. Only used when a caller doesn't inject a fixed
 * `now`; tests MUST inject a fixed value for reproducible results (see
 * the task doc — this default is intentionally excluded from golden
 * fixtures since "today" isn't a fixed characterizable value).
 */
export function defaultNow() {
  const today = new Date();

  return gregorianYmdToJd(today.getFullYear(), today.getMonth() + 1, today.getDate());
}

// Minimal, local copy of the Gregorian ymdToJd algorithm (not importing
// lib/ext-calendar/gregorian.js here to avoid a circular/heavy dependency
// for what's just a default fallback) — same algorithm as
// GregorianCalendar.ymdToJd(), verified to match by inspection since it's
// copied verbatim from the same characterized source.
function gregorianYmdToJd(year, month, day) {
  if (year < 0) {
    ++year;
  }

  const a = Math.trunc((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;

  return (
    day +
    Math.trunc((153 * m + 2) / 5) +
    365 * y +
    Math.trunc(y / 4) -
    Math.trunc(y / 100) +
    Math.trunc(y / 400) -
    32045
  );
}
