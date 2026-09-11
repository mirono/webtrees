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

// Port of app/Note.php's getNote() and firstLineOfTextFromHtml() (task
// 22). extractNames() and canShowByType() are NOT ported — the former
// calls Registry::markdownFactory()/I18N::translate(), the latter queries
// the DB — both real traps, excluded.
//
// getNote() is a plain function of the record's raw GEDCOM text here
// (getNoteText(gedcom)) rather than an instance method reading
// `$this->gedcom . $this->pending` — the caller concatenates those two
// strings itself, same "take the Tree/record-shaped dependency out,
// accept plain data" pattern used throughout this migration (e.g. Age,
// reformatRecord).

import { phpStrtr } from './php-compat/strtr.js';

const XREF_PATTERN = '[A-Za-z0-9:_.-]{1,20}';
const GET_NOTE_RE = new RegExp('^0 @' + XREF_PATTERN + '@ NOTE ?(.*(?:\\n1 CONT ?.*)*)');

/**
 * Get the text contents of a NOTE record.
 *
 * @param {string} gedcom The note's raw GEDCOM text (gedcom + pending, concatenated)
 * @returns {string}
 */
export function getNoteText(gedcom) {
  const match = gedcom.match(GET_NOTE_RE);

  if (match === null) {
    return '';
  }

  return match[1].replace(/\n1 CONT ?/g, '\n');
}

// Markdown-generated block-closing tags become a canonical "<br />" line
// break marker; table cells become a plain space instead (so table rows
// read as space-separated text rather than running together or breaking
// mid-row). <hr> has no closing tag, so it's keyed by its opening form.
const BREAK = '<br />';

const BLOCK_BREAK_MAP = {
  '</blockquote>': BREAK,
  '</h1>': BREAK,
  '</h2>': BREAK,
  '</h3>': BREAK,
  '</h4>': BREAK,
  '</h5>': BREAK,
  '</h6>': BREAK,
  '</li>': BREAK,
  '</p>': BREAK,
  '</pre>': BREAK,
  '</td>': ' ',
  '</th>': ' ',
  '<hr>': BREAK,
};

// PHP's strip_tags($html, ['br']): strips every tag except (case-
// insensitively) 'br', preserving 'br' tags exactly as written —
// including any attributes, and whichever of <br>, <br/>, <br />, <BR>,
// etc. the source actually used. HTML comments are removed entirely.
// Verified: only the canonical "<br />" form (produced by the block-break
// substitution above) ever acts as a split point below — a naked <br> or
// <br/> already present in the source HTML survives this step unchanged
// but does NOT become a break point, since the later split() looks for
// the exact literal string "<br />".
function stripTagsKeepingBr(html) {
  return html.replace(/<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (match, tagName) => {
    return tagName !== undefined && tagName.toLowerCase() === 'br' ? match : '';
  });
}

// PHP's htmlspecialchars_decode($text, ENT_QUOTES): reverses exactly the
// 5 characters htmlspecialchars() encodes (&, <, >, ", ') — named entities
// matched case-sensitively (only the lowercase forms PHP itself produces;
// "&QUOT;"/"&Amp;" are left untouched), plus decimal and hex numeric
// entities for those same 5 characters specifically (any number of
// leading zeros, hex case-insensitive) — verified against real PHP
// execution, including that "&apos;" (the named form) is NOT decoded and
// that a numeric entity for an unrelated character (e.g. "&#40;") is left
// untouched, not generally decoded.
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"' };
const NUMERIC_ENTITY_CHARS = { 38: '&', 60: '<', 62: '>', 34: '"', 39: "'" };
const ENTITY_RE = /&(amp|lt|gt|quot);|&#(\d+);|&#[xX]([0-9a-fA-F]+);/g;

function htmlspecialcharsDecodeQuotes(text) {
  return text.replace(ENTITY_RE, (match, named, dec, hex) => {
    if (named !== undefined) {
      return NAMED_ENTITIES[named];
    }

    const codePoint = dec !== undefined ? parseInt(dec, 10) : parseInt(hex, 16);

    return NUMERIC_ENTITY_CHARS[codePoint] ?? match;
  });
}

/**
 * Notes are converted to HTML for display. We want the first line.
 *
 * @param {string} html
 * @returns {string}
 */
export function firstLineOfTextFromHtml(html) {
  html = phpStrtr(html, BLOCK_BREAK_MAP);
  html = stripTagsKeepingBr(html);

  const [first] = html.split(BREAK);

  return htmlspecialcharsDecodeQuotes(first);
}
