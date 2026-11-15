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

// Port of app/Services/GedcomEditService.php (phase 5 step 47, editing
// "Phase A" foundation) - the pure-logic utilities that drive every
// add/edit-fact form: reassembling a submitted form into GEDCOM lines
// (editLinesToGedcom), and building the blank-field skeleton for a new
// or existing fact/record (insertMissingFactSubtags/RecordSubtags,
// factsToAdd). Backed by the generated element-metadata table in
// gedcom-elements-data.mjs instead of the real PHP ElementFactory/
// Elements class hierarchy - see that file's own generating script
// (bin/characterize_gedcom_elements.php) for scope and classification
// rules.

import { GEDCOM_ELEMENTS } from './gedcom-elements-data.mjs';

const UNKNOWN_ELEMENT = { label: '', widget: 'text', values: {}, subtags: {}, collapseChildren: false };

// Entries whose tag path contains a '*' wildcard segment (e.g.
// 'INDI:*:SOUR' matches 'INDI:BIRT:SOUR', 'INDI:DEAT:SOUR', ...) -
// real PHP's `webtreesTags()` registers these for source-citation/
// association/text-from-source elements shared across every fact
// type, see ElementFactory::findElementByWildcard(). Precomputed once
// so elementFor() doesn't rescan the whole table on every lookup.
const WILDCARD_ELEMENTS = Object.entries(GEDCOM_ELEMENTS)
  .filter(([tag]) => tag.includes('*'))
  .map(([tag, element]) => [new RegExp(`^${tag.replaceAll('*', '[^:]+')}$`), element]);

/**
 * Mirrors Registry::elementFactory()->make($tag) for the gedcom551+
 * webtrees tag set this migration covers: an exact lookup, then a
 * wildcard-pattern lookup (e.g. 'INDI:BIRT:SOUR' matches the
 * registered 'INDI:*:SOUR'), falling back to an "unknown element"
 * (plain text, no subtags) for anything not in the table, same as
 * real PHP's UnknownElement fallback. Unlike real PHP, ties between
 * multiple matching wildcard patterns are broken by the generated
 * table's alphabetical order rather than registration order - in
 * practice a given concrete tag only ever matches one registered
 * wildcard pattern, so this hasn't been observed to matter.
 *
 * @param {string} tag Colon-delimited hierarchy, e.g. 'INDI:BIRT:PLAC'
 */
export function elementFor(tag) {
  if (GEDCOM_ELEMENTS[tag]) return GEDCOM_ELEMENTS[tag];

  for (const [regex, element] of WILDCARD_ELEMENTS) {
    if (regex.test(tag)) return element;
  }

  return UNKNOWN_ELEMENT;
}

/** Mirrors Gedcom::HIDDEN_TAGS (app/Gedcom.php:281-336). */
export const HIDDEN_TAG_SUBSTRINGS = {
  NAME_NPFX: ['INDI:NAME:NPFX', 'INDI:NAME:FONE:NPFX', 'INDI:NAME:ROMN:NPFX'],
  NAME_SPFX: ['INDI:NAME:SPFX', 'INDI:NAME:FONE:SPFX', 'INDI:NAME:ROMN:SPFX'],
  NAME_NSFX: ['INDI:NAME:NSFX', 'INDI:NAME:FONE:NSFX', 'INDI:NAME:ROMN:NSFX'],
  NAME_NICK: ['INDI:NAME:NICK', 'INDI:NAME:FONE:NICK', 'INDI:NAME:ROMN:NICK'],
  NAME_FONE: ['INDI:NAME:FONE'],
  NAME_ROMN: ['INDI:NAME:ROMN'],
  NAME_NOTE: ['INDI:NAME:NOTE', 'INDI:NAME:FONE:NOTE', 'INDI:NAME:ROMN:NOTE'],
  NAME_SOUR: ['INDI:NAME:SOUR', 'INDI:NAME:FONE:SOUR', 'INDI:NAME:ROMN:SOUR'],
  PLAC_MAP: [':PLAC:MAP'],
  PLAC_FONE: [':PLAC:FONE'],
  PLAC_ROMN: [':PLAC:ROMN'],
  PLAC_FORM: [':PLAC:FORM', 'HEAD:PLAC'],
  PLAC_NOTE: [':PLAC:NOTE'],
  ADDR_EMAIL: [':EMAIL'],
  ADDR_PHON: [':PHON'],
  ADDR_WWW: [':WWW'],
  SOUR_EVEN: [':SOUR:EVEN'],
  SOUR_DATE: [':SOUR:DATA:DATE'],
  SOUR_NOTE: [':SOUR:NOTE'],
  SOUR_QUAY: [':SOUR:QUAY'],
  SOUR_DATA: ['SOUR:DATA:EVEN', 'SOUR:DATA:AGNC', 'SOUR:DATA:NOTE'],
  BIRT_FAMC: ['INDI:BIRT:FAMC'],
  RELI: ['INDI:RELI'],
  BAPM: ['INDI:BAPM'],
  CHR: ['INDI:CHR', 'INDI:CHRA'],
  FCOM: ['INDI:FCOM', 'INDI:CONF'],
  ORDN: ['INDI:ORDN'],
  BARM: ['INDI:BARM', 'INDI:BASM'],
  ALIA: ['INDI:ALIA'],
  ASSO: ['INDI:ASSO'],
  ENGA: ['FAM:ENGA'],
  MARB: ['FAM:MARB'],
  MARC: ['FAM:MARC'],
  MARL: ['FAM:MARL'],
  MARS: ['FAM:MARS'],
  ANUL: ['FAM:ANUL'],
  DIVF: ['FAM:DIVF'],
  FAM_RESI: ['FAM:RESI'],
  FAM_CENS: ['FAM:CENS'],
  LDS: ['INDI:BAPL', 'INDI:CONL', 'INDI:ENDL', 'INDI:SLGC', 'FAM:SLGS', 'HEAD:SUBN'],
  AFN: ['INDI:AFN'],
  IDNO: ['INDI:IDNO'],
  SSN: ['INDI:SSN'],
  RFN: [':RFN'],
  REFN: [':REFN'],
  RIN: [':RIN'],
  SUBM: ['INDI:SUBM', 'FAM:SUBM'],
  ANCI: ['INDI:ANCI', 'INDI:DESI'],
};

/**
 * Mirrors GedcomEditService::isHiddenTag() (private). `hiddenTagFlags`
 * is the `{HIDE_KEY: boolean}`-shaped object loadSiteTagsPreferences()
 * (site-preferences.mjs) already returns under its `hiddenTags` key.
 *
 * @param {string} tag
 * @param {Record<string, boolean>} hiddenTagFlags
 */
export function isHiddenTag(tag, hiddenTagFlags) {
  for (const [key, substrings] of Object.entries(HIDDEN_TAG_SUBSTRINGS)) {
    if (!hiddenTagFlags[key]) continue;
    if (substrings.some((substring) => tag.includes(substring))) return true;
  }
  return false;
}

/**
 * Mirrors AbstractElement::canonical(), plus the handful of per-widget
 * overrides this migration's scope actually exercises (SexValue
 * uppercases, PlaceName normalizes commas, NamePersonal drops a bare
 * '//', *EventElement normalizes a lowercase 'y' to 'Y').
 *
 * @param {string} tag
 * @param {string} value
 */
export function canonicalValue(tag, value) {
  const element = elementFor(tag);

  // Mirrors AbstractElement::canonicalText() - used by SubmitterText
  // (NOTE:CONC/CONT, among others) and a handful of other free-text
  // elements (AddressLine, DescriptiveTitle, SourceOriginator,
  // SourcePublicationFacts, TextFromSource - see
  // bin/characterize_gedcom_elements.php's `$uses_canonical_text`):
  // unlike the generic canonical() below, this PRESERVES embedded
  // newlines (so editLinesToGedcom() can still split them back into
  // CONT lines) and only trims leading/trailing newlines, not all
  // whitespace.
  if (element.preserveNewlines) {
    let text = value.replaceAll('\t', ' ').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    text = text.replace(/^\n+/, '').replace(/\n+$/, '');
    return text;
  }

  let canonical = value
    .replaceAll('\t', ' ')
    .replaceAll('\r\n', ' ')
    .replaceAll('\r', ' ')
    .replaceAll('\n', ' ');
  while (canonical.includes('  ')) canonical = canonical.replaceAll('  ', ' ');
  canonical = canonical.trim();

  if (element.widget === 'boolean-y' && canonical === 'y') return 'Y';
  if (element.widget === 'sex-radio') return canonical.toUpperCase();

  if (element.widget === 'place') {
    canonical = canonical.replaceAll('،', ',').replaceAll('，', ',').replaceAll('、', ',');
    canonical = canonical.replaceAll(' ,', ',').replaceAll(',', ', ').replaceAll(',  ', ', ');
    return canonical.trim();
  }

  if (canonical === '//' && tag.endsWith(':NAME')) return '';

  return canonical;
}

/**
 * Mirrors AbstractElement::default()/SexValue::default(). Every other
 * element this migration's edit forms actually create defaults to ''
 * - NamePersonal's surname-tradition default is only used by
 * GedcomEditService::newIndividualFacts()'s own name-fact construction
 * (which builds the NAME line directly, not via this function) and
 * Census's assistant-modal default, neither reached here (see
 * gedcom-elements-data.mjs's generating script for the Census scope
 * cut).
 *
 * @param {string} tag
 */
export function defaultValueFor(tag) {
  if (elementFor(tag).widget === 'sex-radio') return 'U';
  return '';
}

/**
 * Mirrors GedcomEditService::editLinesToGedcom().
 *
 * @param {string} recordType
 * @param {Array<string>} levels
 * @param {Array<string>} tags
 * @param {Array<string>} values
 * @param {boolean} append Are we appending to a level 0 record, or replacing a level 1 record?
 */
export function editLinesToGedcom(recordType, levels, tags, values, append = true) {
  const count = levels.length;
  const gedcomLines = [];
  const hierarchy = [recordType];
  const canonicalValues = [...values];

  for (let i = 0; i < count; i += 1) {
    hierarchy[Number(levels[i])] = tags[i];

    const fullTag = hierarchy.slice(0, 1 + Number(levels[i])).join(':');
    const element = elementFor(fullTag);
    canonicalValues[i] = canonicalValue(fullTag, canonicalValues[i]);

    // If "1 FACT Y" has a DATE or PLAC, then delete the value of Y.
    if (levels[i] === '1' && canonicalValues[i] === 'Y') {
      for (let j = i + 1; j < count && levels[j] > levels[i]; j += 1) {
        if (levels[j] === '2' && (tags[j] === 'DATE' || tags[j] === 'PLAC') && canonicalValues[j] !== '') {
          canonicalValues[i] = '';
          break;
        }
      }
    }

    // Find the next tag at the same level. Check if any child tags have values.
    let childrenWithValues = false;
    let j = i + 1;
    for (; j < count && levels[j] > levels[i]; j += 1) {
      if (canonicalValues[j] !== '') childrenWithValues = true;
    }

    const isXref = element.widget.startsWith('xref:');

    if (canonicalValues[i] !== '' || (childrenWithValues && !isXref)) {
      if (canonicalValues[i] === '') {
        gedcomLines.push(`${levels[i]} ${tags[i]}`);
      } else {
        const nextLevel = tags[i] === 'CONC' ? Number(levels[i]) : 1 + Number(levels[i]);
        gedcomLines.push(`${levels[i]} ${tags[i]} ${canonicalValues[i].replaceAll('\n', `\n${nextLevel} CONT `)}`);
      }
    } else {
      i = j - 1;
    }
  }

  let gedcom = gedcomLines.join('\n');

  if (append && gedcom !== '') {
    gedcom = `\n${gedcom}`;
  }

  return gedcom;
}

/**
 * Mirrors GedcomEditService::insertMissingLevels() (protected).
 *
 * @param {string} tag
 * @param {string} gedcom
 * @param {boolean} includeHidden
 * @param {Record<string, boolean>} hiddenTagFlags
 */
function insertMissingLevels(tag, gedcom, includeHidden, hiddenTagFlags) {
  const nextLevel = (tag.match(/:/g) ?? []).length + 1;
  const subtags = elementFor(tag).subtags ?? {};

  const splitParts = gedcom.split(new RegExp(`\\n(?=${nextLevel})`));
  let parts = splitParts.slice(1);
  let returnValue = splitParts[0] ?? '';

  for (const [subtag, occurrences] of Object.entries(subtags)) {
    const hidden = occurrences.endsWith(':?') || isHiddenTag(`${tag}:${subtag}`, hiddenTagFlags);

    if (!includeHidden && hidden) continue;

    const [minRaw, maxRaw] = occurrences.split(':');
    const min = Number(minRaw);
    const max = maxRaw === 'M' ? Number.POSITIVE_INFINITY : Number(maxRaw);

    let count = 0;
    const remainingParts = [];

    for (const part of parts) {
      if (part.startsWith(`${nextLevel} ${subtag}`)) {
        returnValue += `\n${insertMissingLevels(`${tag}:${subtag}`, part, includeHidden, hiddenTagFlags)}`;
        count += 1;
      } else {
        remainingParts.push(part);
      }
    }
    parts = remainingParts;

    if (count < max) {
      let newGedcom = `${nextLevel} ${subtag}`;
      const defaultValue = defaultValueFor(`${tag}:${subtag}`);
      if (defaultValue !== '') newGedcom += ` ${defaultValue}`;

      const numberToAdd = Math.max(1, min - count);
      const gedcomToAdd = `\n${insertMissingLevels(`${tag}:${subtag}`, newGedcom, includeHidden, hiddenTagFlags)}`;

      returnValue += gedcomToAdd.repeat(numberToAdd);
    }
  }

  if (parts.length > 0) {
    returnValue += `\n${parts.join('\n')}`;
  }

  return returnValue;
}

/**
 * Mirrors GedcomEditService::insertMissingFactSubtags(). `factGedcom`
 * is a single fact's GEDCOM block starting at level 1 (e.g.
 * "1 BIRT\n2 DATE ...").
 *
 * @param {string} factTag Full tag path of the fact itself, e.g. 'INDI:BIRT'
 * @param {string} factGedcom
 * @param {boolean} includeHidden
 * @param {Record<string, boolean>} hiddenTagFlags
 */
export function insertMissingFactSubtags(factTag, factGedcom, includeHidden, hiddenTagFlags) {
  const merged = factGedcom.replace(/\n\d CONT ?/g, '\r');
  return insertMissingLevels(factTag, merged, includeHidden, hiddenTagFlags);
}

/**
 * Mirrors GedcomEditService::insertMissingRecordSubtags(). `recordGedcom`
 * is the record's full GEDCOM starting at level 0.
 *
 * @param {string} recordTag Record type, e.g. 'INDI', 'NOTE'
 * @param {string} recordGedcom
 * @param {boolean} includeHidden
 * @param {Record<string, boolean>} hiddenTagFlags
 */
export function insertMissingRecordSubtags(recordTag, recordGedcom, includeHidden, hiddenTagFlags) {
  const merged = recordGedcom.replace(/\n\d CONT ?/g, '\r');
  const gedcom = insertMissingLevels(recordTag, merged, includeHidden, hiddenTagFlags);

  if (recordTag === 'NOTE') {
    return gedcom.replace(/^0 @[^@]+@ NOTE/, '1 CONC');
  }

  return gedcom.replace(/^0.*\n/, '');
}

/**
 * Mirrors GedcomEditService::factsToAdd(). NOTE: `includeHidden` has
 * NO EFFECT on the result - real PHP's unconditional filter
 * (`$subtags = array_filter($subtags, fn ($subtag) =>
 * !$this->isHiddenTag($record->tag() . ':' . $subtag));`) already
 * excludes every hidden subtag regardless of `$include_hidden`, and
 * the `if (!$include_hidden)` block right after it re-applies the
 * exact same predicate - a real (and confirmed-current, re-checked
 * directly against app/Services/GedcomEditService.php rather than
 * trusted from an earlier session's notes, which had this backwards)
 * redundant-not-dead-code quirk, replicated here rather than
 * "fixed" per this migration's convention.
 *
 * @param {string} recordTag 'INDI' or 'FAM'
 * @param {(tag: string) => boolean} hasExistingFact e.g. `(tag) => facts.some(f => factTagOf(f) === tag)`
 * @param {boolean} includeHidden Accepted for signature parity with real PHP; does not change the result.
 * @param {Record<string, boolean>} hiddenTagFlags
 */
export function factsToAdd(recordTag, hasExistingFact, includeHidden, hiddenTagFlags) {
  const subtags = elementFor(recordTag).subtags ?? {};

  let keys = Object.entries(subtags)
    .filter(([key, occurrences]) => !occurrences.endsWith(':1') || !hasExistingFact(key))
    .map(([key]) => key);

  keys = keys.filter((subtag) => !isHiddenTag(`${recordTag}:${subtag}`, hiddenTagFlags));

  const exclude = new Set(['HUSB', 'WIFE', 'CHIL', 'FAMC', 'FAMS', 'CHAN']);
  return keys.filter((key) => !exclude.has(key));
}

/**
 * Mirrors GedcomEditService::newFamilyFacts(). Returns an array of
 * `{tag, gedcom}` (tag path + "1 TAG default" line) in the order the
 * real PHP sorts by (FactComparator::byType - this migration already
 * has an equivalent fact sort order used by the individual/family
 * pages; callers sort with that, this just builds the raw candidates).
 *
 * @param {{getPreference: (key: string) => string}} tree
 */
export function newFamilyFacts(tree) {
  const tags = (tree.getPreference('QUICK_REQUIRED_FAMFACTS') ?? '').split(',').filter((t) => t !== '');
  return tags.map((tag) => createNewFact('FAM', tag));
}

/**
 * Mirrors GedcomEditService::newIndividualFacts().
 *
 * @param {{getPreference: (key: string) => string}} tree
 * @param {string} sex
 * @param {Array<string>} names Full NAME fact gedcom lines, e.g. ['1 NAME John /Doe/']
 */
export function newIndividualFacts(tree, sex, names) {
  const tags = (tree.getPreference('QUICK_REQUIRED_FACTS') ?? '').split(',').filter((t) => t !== '');
  const facts = tags.map((tag) => createNewFact('INDI', tag));
  const sexFact = { tag: 'SEX', gedcom: `1 SEX ${sex}` };
  const nameFacts = names.map((gedcom) => ({ tag: 'NAME', gedcom }));
  return [sexFact, ...nameFacts, ...facts];
}

function createNewFact(recordTag, tag) {
  const defaultValue = defaultValueFor(`${recordTag}:${tag}`);
  const gedcom = `1 ${tag}${defaultValue !== '' ? ` ${defaultValue}` : ''}`.trim();
  return { tag, gedcom };
}
