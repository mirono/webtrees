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

// Data/logic layer for /tree/{tree}/data-fix... (DataFixChoose/Page/
// Preview/Select/Update/UpdateAll, phase 5 step 46) - the admin "run a
// bulk search-and-fix over every record of a type" wizard. Real PHP:
// app/Module/ModuleDataFixInterface.php, ModuleDataFixTrait.php,
// app/Services/DataFixService.php, app/Http/RequestHandlers/DataFix*.php,
// and the 8 built-in fix modules in app/Module/Fix*.php.
//
// Per the user's explicit choice: FULL FIDELITY, all 8 real fix
// modules, not a subset.
//
// Like record merging (step 45, record-merge.mjs), every fix writes
// through the real per-record pending-changes path
// (`GedcomRecord::updateRecord($gedcom, false)` - note `false`: data
// fixes never touch CHAN, unlike merge) via record-merge.mjs's
// `applyRecordUpdate()`/`getRecordByXref()`, fully honoring
// `auto_accept_edits`.
//
// Deliberate scope cuts/simplifications, each applying identically to
// every module below (not worth repeating per-module):
// - A module whose real PHP calls `$record->updateFact()`/
//   `updateRecord()` MULTIPLE times in a loop (once per fact, e.g.
//   FixCemeteryTag/FixNameTags, or once per linked record, e.g.
//   FixPrimaryTag) is ported as ONE combined write per record instead
//   - real PHP's version creates N separate `wt_change` rows; this
//   port creates one, with the same net effect on the record's final
//   content (and, under auto_accept_edits=false, one pending change
//   to review instead of N near-identical ones). Not reproduced
//   because it's an implementation artifact of PHP's per-fact API, not
//   a feature.
// - `DataFixService::gedcomDiff()`'s real-PHP step of turning
//   `@XREF@` substrings in the diff into clickable links to that
//   record (needing each xref's `fullName()`/`url()`, which differs
//   per record type) is cut - the diff still shows the same `<del>`/
//   `<ins>` text, just not hyperlinked. Cosmetic only.
// - Any record-level access-control filtering (`GedcomRecord::
//   accessFilter()` on FixPrimaryTag's linked-individuals lookup) is
//   not applied - this is an admin-only bulk-data tool, same
//   "admin sees everything" simplification already used throughout
//   this bucket (tree management, merge).
//
// Real correctness details worth flagging (confirmed by reading real
// PHP directly):
// - `recordsToFix()`'s candidate list is DELIBERATELY allowed to
//   include records that don't actually need fixing (the SQL search is
//   a fast, imprecise pre-filter; `doesRecordNeedUpdate()` is the real
//   test, applied when rendering each row and before any actual write).
// - The pending-changes union (`mergePendingRecords()` in
//   ModuleDataFixTrait) adds any xref with an uncommitted pending
//   `wt_change` whose old/new gedcom contains the literal substring
//   "@ TYPE\n" (the tail of that type's "0 @X@ TYPE" header line) -
//   this also catches records newly becoming that type via a pending
//   edit. Only unioned for types a given fix module actually declares
//   (matches which `*ToFix()` method it overrides in real PHP).
// - FixWtObjeSortTag's real PHP SQL candidate search only matches
//   `_WT_OBJE_SORT` (a copy-paste bug duplicates the same `orWhere`
//   instead of also checking `_PGV_OBJE_SORT`, even though
//   `doesRecordNeedUpdate()` DOES check both) - this port's SQL search
//   checks both tags, a deliberate, narrow correction (strictly more
//   complete, can't make anything incorrectly "fixable").
// - FixWtObjeSortTag's real PHP record-rebuild filters out
//   `INDI:OBJE`/`INDI:_WT_OBJE_SORT` facts but ALSO has a dead filter
//   clause (`'_PGV_OBJE_SORT:OBJE'`, a tag string `Fact::tag()` can
//   never actually produce) that was clearly meant to also strip
//   `_PGV_OBJE_SORT` facts but doesn't - so real PHP leaves old
//   `_PGV_OBJE_SORT` lines in place after "fixing" them. Replicated
//   exactly (bug-for-bug), not fixed, per this migration's convention.

import { parseFacts, isDead } from './individual.mjs';
import { getRecordByXref, applyRecordUpdate } from './record-merge.mjs';

export { getRecordByXref };

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const TYPE_TABLE = {
  INDI: { table: 'wt_individuals', idCol: 'i_id', fileCol: 'i_file', gedcomCol: 'i_gedcom' },
  FAM: { table: 'wt_families', idCol: 'f_id', fileCol: 'f_file', gedcomCol: 'f_gedcom' },
  SOUR: { table: 'wt_sources', idCol: 's_id', fileCol: 's_file', gedcomCol: 's_gedcom' },
  OBJE: { table: 'wt_media', idCol: 'm_id', fileCol: 'm_file', gedcomCol: 'm_gedcom' },
  NOTE: { table: 'wt_other', idCol: 'o_id', fileCol: 'o_file', gedcomCol: 'o_gedcom', typeFilter: 'NOTE' },
  REPO: { table: 'wt_other', idCol: 'o_id', fileCol: 'o_file', gedcomCol: 'o_gedcom', typeFilter: 'REPO' },
  SUBM: { table: 'wt_other', idCol: 'o_id', fileCol: 'o_file', gedcomCol: 'o_gedcom', typeFilter: 'SUBM' },
  _LOC: { table: 'wt_other', idCol: 'o_id', fileCol: 'o_file', gedcomCol: 'o_gedcom', typeFilter: '_LOC' },
};

const DEATH_EVENTS = ['DEAT', 'BURI', 'CREM'];

function likeEscape(value) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} type
 * @param {string|null} extraClause SQL fragment referencing $2, $3, ... (in order of `extraParams`)
 * @param {Array} extraParams
 * @returns {Promise<string[]>}
 */
async function selectXrefsWhere(pool, gedcomId, type, extraClause = null, extraParams = []) {
  const t = TYPE_TABLE[type];
  const params = [gedcomId, ...extraParams];
  let sql = `SELECT ${t.idCol} AS xref FROM ${t.table} WHERE ${t.fileCol} = $1`;

  if (t.typeFilter) {
    params.push(t.typeFilter);
    sql += ` AND o_type = $${params.length}`;
  }

  if (extraClause) {
    sql += ` AND (${extraClause})`;
  }

  const result = await pool.query(sql, params);
  return result.rows.map((row) => row.xref);
}

/**
 * Mirrors `ModuleDataFixTrait::mergePendingRecords()`.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {string} type
 * @returns {Promise<string[]>}
 */
async function pendingXrefsForType(pool, gedcomId, type) {
  const result = await pool.query(
    `SELECT DISTINCT xref FROM wt_change WHERE gedcom_id = $1 AND status = 'pending'
     AND (old_gedcom LIKE '%@ ' || $2 || E'\\n%' OR new_gedcom LIKE '%@ ' || $2 || E'\\n%')`,
    [gedcomId, type],
  );
  return result.rows.map((row) => row.xref);
}

/**
 * Runs one fix module's `recordsToFix()` - mirrors
 * `ModuleDataFixTrait::recordsToFix()`: for every record type the
 * module declares, union its SQL candidates with any pending-change
 * xref of that type, then de-duplicate and sort by xref across the
 * whole list.
 *
 * @param {object} module
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @param {Record<string,string>} params
 * @returns {Promise<Array<{xref: string, type: string}>>}
 */
export async function recordsToFix(module, pool, gedcomId, params) {
  const results = [];

  for (const type of module.recordTypes) {
    // eslint-disable-next-line no-await-in-loop
    const candidates = await module.candidatesForType(pool, gedcomId, type, params);

    if (candidates === null) {
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const pending = await pendingXrefsForType(pool, gedcomId, type);
    const merged = new Set([...candidates, ...pending]);

    for (const xref of merged) {
      results.push({ xref, type });
    }
  }

  results.sort((a, b) => (a.xref < b.xref ? -1 : a.xref > b.xref ? 1 : 0));
  return results;
}

// --- Diff rendering (DataFixService::gedcomDiff(), minus the @XREF@ link conversion - see top doc comment) ---

function diffLines(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i][j] = oldLines[i] === newLines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const diffs = [];
  let i = 0;
  let j = 0;

  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      diffs.push({ type: 'keep', text: oldLines[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      diffs.push({ type: 'delete', text: oldLines[i] });
      i += 1;
    } else {
      diffs.push({ type: 'insert', text: newLines[j] });
      j += 1;
    }
  }

  while (i < n) {
    diffs.push({ type: 'delete', text: oldLines[i] });
    i += 1;
  }

  while (j < m) {
    diffs.push({ type: 'insert', text: newLines[j] });
    j += 1;
  }

  return diffs;
}

/**
 * Mirrors `DataFixService::gedcomDiff()` (minus @XREF@ linkification).
 *
 * @param {string} oldGedcom
 * @param {string} newGedcom
 * @returns {string}
 */
export function gedcomDiff(oldGedcom, newGedcom) {
  const diffs = diffLines(oldGedcom.split('\n'), newGedcom.split('\n'));
  const html = diffs
    .map(({ type, text }) => {
      const escaped = escapeHtml(text);
      if (type === 'delete') return `<del>${escaped}</del><br>`;
      if (type === 'insert') return `<ins>${escaped}</ins><br>`;
      return `${escaped}<br>`;
    })
    .join('');

  return `<pre class="gedcom-data">${html}</pre>`;
}

// --- Fact-block helpers (shared by several modules) ---

function factBlocks(gedcom) {
  return parseFacts(gedcom);
}

function factTagOf(fact) {
  const match = /^1 (\S+)/.exec(fact);
  return match ? match[1] : '';
}

function factValue(fact) {
  const firstLine = fact.split('\n')[0];
  const match = /^1 \S+ ?(.*)$/.exec(firstLine);
  return match ? match[1] : '';
}

// --- FixMissingDeaths (fix-add-death) ---

const fixAddDeath = {
  name: 'fix-add-death',
  title: 'Add missing death records',
  description:
    'You can speed up the privacy calculations by adding a death record to individuals whose death can be inferred from other dates, but who do not have a record of death, burial, cremation, etc.',
  recordTypes: ['INDI'],
  optionsHtml: null,
  async candidatesForType(pool, gedcomId, type) {
    const patterns = DEATH_EVENTS.map((event) => `%\n1 ${event}%`);
    const clause = patterns.map((_, index) => `${TYPE_TABLE[type].gedcomCol} NOT LIKE $${index + 2}`).join(' AND ');
    return selectXrefsWhere(pool, gedcomId, type, clause, patterns);
  },
  doesRecordNeedUpdate(record, _params, ctx) {
    if (record.type !== 'INDI') return false;
    const facts = factBlocks(record.gedcom);
    const hasDeathFact = facts.some((fact) => DEATH_EVENTS.includes(factTagOf(fact)));
    if (hasDeathFact) return false;
    return isDead(facts, ctx.treePrefs);
  },
  // eslint-disable-next-line no-unused-vars
  async previewUpdate(_pool, _gedcomId, record) {
    return gedcomDiff(record.gedcom, `${record.gedcom}\n1 DEAT Y`);
  },
  async applyFix(client, gedcomId, userId, autoAcceptEdits, author, record) {
    await applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, record, `${record.gedcom}\n1 DEAT Y`, { updateChan: false, author });
  },
};

// --- FixWtObjeSortTag (fix-wt-obje-sort) ---

function reorderObjeBySortTag(xref, gedcom) {
  const facts = factBlocks(gedcom).slice(1);
  const sortValues = facts.filter((fact) => factTagOf(fact) === '_PGV_OBJE_SORT' || factTagOf(fact) === '_WT_OBJE_SORT').map((fact) => factValue(fact));
  const objeFacts = facts.filter((fact) => factTagOf(fact) === 'OBJE');
  const sorted = [...objeFacts].sort((a, b) => {
    const indexA = sortValues.indexOf(factValue(a));
    const indexB = sortValues.indexOf(factValue(b));
    return (indexA === -1 ? Number.MAX_SAFE_INTEGER : indexA) - (indexB === -1 ? Number.MAX_SAFE_INTEGER : indexB);
  });
  // Real PHP strips INDI:OBJE and INDI:_WT_OBJE_SORT facts, but its
  // `_PGV_OBJE_SORT` filter clause is dead code (see top doc comment) -
  // _PGV_OBJE_SORT facts are therefore kept, bug-for-bug.
  const kept = facts.filter((fact) => factTagOf(fact) !== 'OBJE' && factTagOf(fact) !== '_WT_OBJE_SORT');

  return `0 @${xref}@ INDI${[...kept, ...sorted].map((fact) => `\n${fact}`).join('')}`;
}

const fixWtObjeSort = {
  name: 'fix-wt-obje-sort',
  title: 'Convert INDI:_WT_OBJE_SORT tags to GEDCOM 5.5.1',
  description:
    '_WT_OBJE_SORT tags were used by old versions of webtrees to indicate the preferred image for an individual. An alternative is to re-order the images so that the preferred one is listed first.',
  recordTypes: ['INDI'],
  optionsHtml: null,
  async candidatesForType(pool, gedcomId, type) {
    return selectXrefsWhere(pool, gedcomId, type, `${TYPE_TABLE[type].gedcomCol} LIKE $2 OR ${TYPE_TABLE[type].gedcomCol} LIKE $3`, [
      '%\n1 _WT_OBJE_SORT %',
      '%\n1 _PGV_OBJE_SORT %',
    ]);
  },
  doesRecordNeedUpdate(record) {
    return record.gedcom.includes('\n1 _WT_OBJE_SORT ') || record.gedcom.includes('\n1 _PGV_OBJE_SORT ');
  },
  // eslint-disable-next-line no-unused-vars
  async previewUpdate(_pool, _gedcomId, record) {
    return gedcomDiff(record.gedcom, reorderObjeBySortTag(record.xref, record.gedcom));
  },
  async applyFix(client, gedcomId, userId, autoAcceptEdits, author, record) {
    await applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, record, reorderObjeBySortTag(record.xref, record.gedcom), {
      updateChan: false,
      author,
    });
  },
};

// --- FixCemeteryTag (fix-ceme-tag) ---

function cemeteryFixFact(fact, convert) {
  const match = /\n\d CEME ?(.+)(?:\n\d PLOT ?(.+))?/.exec(fact);

  if (!match) return fact;

  let ceme = match[1];
  const plot = match[2] ?? '';

  if (plot !== '') {
    ceme = `${plot}, ${ceme}`;
  }

  let gedcom = fact.split(match[0]).join('');

  if (!gedcom.includes(`\n2 ${convert} `)) {
    gedcom += `\n2 ${convert} ${ceme}`;
  } else {
    gedcom = gedcom.split(`\n2 ${convert} `).join(`\n2 ${convert} ${ceme}, `);
  }

  return gedcom;
}

function cemeteryNeedsUpdate(record) {
  return factBlocks(record.gedcom)
    .filter((fact) => factTagOf(fact) === 'BURI')
    .some((fact) => /\n[23] CEME/.test(fact));
}

function cemeteryFixGedcom(gedcom, convert) {
  return factBlocks(gedcom)
    .map((fact) => (factTagOf(fact) === 'BURI' ? cemeteryFixFact(fact, convert) : fact))
    .join('\n');
}

const fixCemeteryTag = {
  name: 'fix-ceme-tag',
  title: 'Convert INDI:BURI:CEME tags to GEDCOM 5.5.1',
  description: 'Replace cemetery tags with burial places.',
  recordTypes: ['INDI'],
  optionsHtml() {
    return `<div class="row mb-3">
      <label class="col-sm-3 col-form-label" for="convert">Convert to</label>
      <div class="col-sm-9">
        <select class="form-select" id="convert" name="convert">
          <option value="ADDR" selected>Address</option>
          <option value="PLAC">Place</option>
        </select>
      </div>
    </div>`;
  },
  async candidatesForType(pool, gedcomId, type) {
    return selectXrefsWhere(pool, gedcomId, type, `${TYPE_TABLE[type].gedcomCol} LIKE $2 OR ${TYPE_TABLE[type].gedcomCol} LIKE $3`, [
      '%\n2 CEME%',
      '%\n3 CEME%',
    ]);
  },
  doesRecordNeedUpdate(record) {
    return cemeteryNeedsUpdate(record);
  },
  // eslint-disable-next-line no-unused-vars
  async previewUpdate(_pool, _gedcomId, record, params) {
    const convert = params.convert || 'ADDR';
    const oldFacts = factBlocks(record.gedcom).filter((fact) => factTagOf(fact) === 'BURI');
    const newFacts = oldFacts.map((fact) => cemeteryFixFact(fact, convert));
    return gedcomDiff(oldFacts.join('\n'), newFacts.join('\n'));
  },
  async applyFix(client, gedcomId, userId, autoAcceptEdits, author, record, params) {
    const convert = params.convert || 'ADDR';
    await applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, record, cemeteryFixGedcom(record.gedcom, convert), {
      updateChan: false,
      author,
    });
  },
};

// --- FixDuplicateLinks (fix-duplicate-links) ---

const DUPLICATE_LEVEL_PATTERNS = [
  /(\n1.*@.+@.*(?:\n[2-9].*)*)((?:\n1.*(?:\n[2-9].*)*)*\1)/,
  /(\n2.*@.+@.*(?:\n[3-9].*)*)((?:\n2.*(?:\n[3-9].*)*)*\1)/,
  /(\n3.*@.+@.*(?:\n[4-9].*)*)((?:\n3.*(?:\n[4-9].*)*)*\1)/,
];

function hasDuplicateBlocks(gedcom) {
  return DUPLICATE_LEVEL_PATTERNS.some((pattern) => pattern.test(gedcom));
}

function removeDuplicateBlocks(gedcom) {
  let result = gedcom;

  for (const pattern of DUPLICATE_LEVEL_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, 'g'), '$2');
  }

  return result;
}

const fixDuplicateLinks = {
  name: 'fix-duplicate-links',
  title: 'Remove duplicate links',
  description: 'A common error is to have multiple links to the same record, for example listing the same child more than once in a family record.',
  recordTypes: ['FAM', 'INDI', 'OBJE', 'NOTE', 'REPO', 'SOUR', 'SUBM'],
  optionsHtml: null,
  async candidatesForType(pool, gedcomId, type) {
    return selectXrefsWhere(pool, gedcomId, type);
  },
  doesRecordNeedUpdate(record) {
    return hasDuplicateBlocks(record.gedcom);
  },
  // eslint-disable-next-line no-unused-vars
  async previewUpdate(_pool, _gedcomId, record) {
    return gedcomDiff(record.gedcom, removeDuplicateBlocks(record.gedcom));
  },
  async applyFix(client, gedcomId, userId, autoAcceptEdits, author, record) {
    await applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, record, removeDuplicateBlocks(record.gedcom), { updateChan: false, author });
  },
};

// --- FixNameSlashesAndSpaces (fix-name-slashes-spaces) ---

const NAME_LINE_TAGS = '(?:1 NAME|2 (?:FONE|ROMN|_MARNM|_AKA|_HEB))';
const SLASH_PATTERN_1 = new RegExp(`^${NAME_LINE_TAGS} [^/\\n]*/[^/\\n]*$`, 'm');
const SLASH_PATTERN_2 = new RegExp(`^${NAME_LINE_TAGS} [^/\\n]*[^/ ]/`, 'm');

function fixSlashesGedcom(gedcom) {
  let result = gedcom.replace(new RegExp(`^(${NAME_LINE_TAGS} [^/\\n]*/[^/\\n]*)$`, 'gm'), '$1/');
  result = result.replace(new RegExp(`^(${NAME_LINE_TAGS} [^/\\n]*[^/ ])(/)`, 'gm'), '$1 $2');
  return result;
}

const fixNameSlashesAndSpaces = {
  name: 'fix-name-slashes-spaces',
  title: 'Fix name slashes and spaces',
  description: 'Correct NAME records of the form "John/DOE/" or "John /DOE", as produced by older genealogy programs.',
  recordTypes: ['INDI'],
  optionsHtml: null,
  async candidatesForType(pool, gedcomId, type) {
    return selectXrefsWhere(pool, gedcomId, type);
  },
  doesRecordNeedUpdate(record) {
    return SLASH_PATTERN_1.test(record.gedcom) || SLASH_PATTERN_2.test(record.gedcom);
  },
  // eslint-disable-next-line no-unused-vars
  async previewUpdate(_pool, _gedcomId, record) {
    return gedcomDiff(record.gedcom, fixSlashesGedcom(record.gedcom));
  },
  async applyFix(client, gedcomId, userId, autoAcceptEdits, author, record) {
    await applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, record, fixSlashesGedcom(record.gedcom), { updateChan: false, author });
  },
};

// --- FixNameTags (fix-name-tags) ---

const NAME_TAG_CONVERT = {
  _ADPN: 'adopted',
  _AKA: 'aka',
  _AKAN: 'aka',
  _BIRN: 'birth',
  _CENN: '',
  _CURN: '',
  _FARN: 'estate',
  _FKAN: 'aka',
  _GERN: '',
  _HEB: '',
  _HEBN: '',
  _INDN: '',
  _MARNM: 'married',
  _OTHN: 'aka',
  _RELN: 'religious',
  _SHON: 'aka',
  _SLDN: 'aka',
};

const NAME_TAG_KEYS = Object.keys(NAME_TAG_CONVERT);
const NAME_TAG_DOES_UPDATE_PATTERN = new RegExp(`\\n1 NAME.*(?:\\n[2-9] .*)*\\n2 (${NAME_TAG_KEYS.join('|')})`);

function convertNameFact(fact) {
  let gedcom = fact;
  let converted = '';
  const pattern = new RegExp(`\\n2 (${NAME_TAG_KEYS.join('|')}) (.+)((?:\\n[3-9].*)*)`);
  let match = pattern.exec(gedcom);

  while (match) {
    const type = NAME_TAG_CONVERT[match[1]];
    const typeLine = type !== '' ? `\n2 TYPE ${type}` : '';
    gedcom = gedcom.split(match[0]).join('');

    const subtags = match[3].replaceAll('\n3', '\n2').replaceAll('\n4', '\n3').replaceAll('\n5', '\n4').replaceAll('\n6', '\n5');

    converted += `\n1 NAME ${match[2]}${typeLine}${subtags}`;
    match = pattern.exec(gedcom);
  }

  return gedcom + converted;
}

function fixNameTagsGedcom(gedcom) {
  return factBlocks(gedcom)
    .map((fact) => (factTagOf(fact) === 'NAME' ? convertNameFact(fact) : fact))
    .join('\n');
}

const fixNameTags = {
  name: 'fix-name-tags',
  title: 'Convert INDI:NAME:_XXX tags to GEDCOM 5.5.1',
  description:
    'Some genealogy software stores all names in a single name record, using custom tags such as _MARNM and _AKA. An alternative is to create a new name record for each name.',
  recordTypes: ['INDI'],
  optionsHtml: null,
  async candidatesForType(pool, gedcomId, type) {
    const patterns = NAME_TAG_KEYS.map((tag) => `%\n2 ${tag} %`);
    const clause = patterns.map((_, index) => `${TYPE_TABLE[type].gedcomCol} LIKE $${index + 2}`).join(' OR ');
    return selectXrefsWhere(pool, gedcomId, type, clause, patterns);
  },
  doesRecordNeedUpdate(record) {
    return NAME_TAG_DOES_UPDATE_PATTERN.test(record.gedcom);
  },
  // eslint-disable-next-line no-unused-vars
  async previewUpdate(_pool, _gedcomId, record) {
    const diffs = factBlocks(record.gedcom)
      .filter((fact) => factTagOf(fact) === 'NAME')
      .map((fact) => [fact, convertNameFact(fact)])
      .filter(([oldFact, newFact]) => oldFact !== newFact)
      .map(([oldFact, newFact]) => gedcomDiff(oldFact, newFact));
    return diffs.join('<hr>');
  },
  async applyFix(client, gedcomId, userId, autoAcceptEdits, author, record) {
    await applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, record, fixNameTagsGedcom(record.gedcom), { updateChan: false, author });
  },
};

// --- FixPlaceNames (fix-place-names) ---

function placeNamesNeedsUpdate(gedcom, searchFor) {
  return new RegExp(`\\n2 PLAC (?:.*, )?${escapeRegex(searchFor)}(\\n|$)`).test(gedcom);
}

function placeNamesFixGedcom(gedcom, searchFor, replaceWith) {
  const regex = new RegExp(`(\\n2 PLAC (?:.*, )?)${escapeRegex(searchFor)}(\\n|$)`, 'g');
  return gedcom.replace(regex, (_match, prefix, trailing) => prefix + replaceWith + trailing);
}

const fixPlaceNames = {
  name: 'fix-place-names',
  title: 'Update place names',
  description: 'Update the higher-level parts of place names, while keeping the lower-level parts.',
  recordTypes: ['FAM', 'INDI'],
  optionsHtml() {
    return `<div class="row mb-3">
      <label class="col-sm-3 col-form-label" for="search-for">Search</label>
      <div class="col-sm-9"><input class="form-control" id="search-for" name="search-for"></div>
    </div>
    <div class="row mb-3">
      <label class="col-sm-3 col-form-label" for="replace-with">Replace</label>
      <div class="col-sm-9"><input class="form-control" id="replace-with" name="replace-with"></div>
    </div>`;
  },
  async candidatesForType(pool, gedcomId, type, params) {
    const searchFor = params['search-for'] ?? '';
    const replaceWith = params['replace-with'] ?? '';

    if (searchFor === '' || replaceWith === '') {
      return null;
    }

    return selectXrefsWhere(pool, gedcomId, type, `${TYPE_TABLE[type].gedcomCol} LIKE $2`, [`%${likeEscape(searchFor)}%`]);
  },
  doesRecordNeedUpdate(record, params) {
    return placeNamesNeedsUpdate(record.gedcom, params['search-for'] ?? '');
  },
  // eslint-disable-next-line no-unused-vars
  async previewUpdate(_pool, _gedcomId, record, params) {
    return gedcomDiff(record.gedcom, placeNamesFixGedcom(record.gedcom, params['search-for'] ?? '', params['replace-with'] ?? ''));
  },
  async applyFix(client, gedcomId, userId, autoAcceptEdits, author, record, params) {
    const newGedcom = placeNamesFixGedcom(record.gedcom, params['search-for'] ?? '', params['replace-with'] ?? '');
    await applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, record, newGedcom, { updateChan: false, author });
  },
};

// --- FixSearchAndReplace (fix-search-and-replace) ---

const SEARCH_AND_REPLACE_TYPES = ['FAM', 'INDI', '_LOC', 'OBJE', 'NOTE', 'REPO', 'SOUR', 'SUBM'];

function searchAndReplaceRegex(params, withGlobal) {
  const search = params['search-for'] ?? '';
  const method = params.method ?? 'exact';
  const flags = `u${params.case === 'i' ? 'i' : ''}${withGlobal ? 'g' : ''}`;

  try {
    switch (method) {
      case 'exact':
        return new RegExp(escapeRegex(search), flags);
      case 'words':
        return new RegExp(`\\b${escapeRegex(search)}\\b`, flags);
      case 'wildcards': {
        const pattern = escapeRegex(search).replaceAll('\\*', '.*').replaceAll('\\?', '.');
        return new RegExp(`\\b${pattern}\\b`, flags);
      }
      case 'regex': {
        const regex = new RegExp(search.replaceAll('\\n', '\n'), flags);
        regex.test('');
        return regex;
      }
      default:
        return /(?!)/;
    }
  } catch {
    return /(?!)/;
  }
}

function searchAndReplaceLikePattern(params) {
  const search = params['search-for'] ?? '';
  const method = params.method ?? 'exact';
  let like = `%${likeEscape(search)}%`;

  if (method === 'wildcards') {
    like = like.replaceAll('?', '_').replaceAll('*', '%');
  }

  return like;
}

const fixSearchAndReplace = {
  name: 'fix-search-and-replace',
  title: 'Search and replace',
  description: 'Search and replace text, using simple searches or advanced pattern matching.',
  recordTypes: SEARCH_AND_REPLACE_TYPES,
  optionsHtml() {
    return `<div class="row mb-3">
      <label class="col-sm-3 col-form-label" for="search-for">Search text/pattern</label>
      <div class="col-sm-9"><input class="form-control" id="search-for" name="search-for"></div>
    </div>
    <div class="row mb-3">
      <label class="col-sm-3 col-form-label" for="replace-with">Replacement text</label>
      <div class="col-sm-9"><input class="form-control" id="replace-with" name="replace-with"></div>
    </div>
    <div class="row mb-3">
      <label class="col-sm-3 col-form-label">Search method</label>
      <div class="col-sm-9">
        <select class="form-select" name="method">
          <option value="exact" selected>Match the exact text, even if it occurs in the middle of a word.</option>
          <option value="words">Match the exact text, unless it occurs in the middle of a word.</option>
          <option value="wildcards">Use a "?" to match a single character, use "*" to match zero or more characters.</option>
          <option value="regex">Regular expression</option>
        </select>
      </div>
    </div>
    <div class="row mb-3">
      <label class="col-sm-3 col-form-label" for="case">Match both upper and lower case letters.</label>
      <div class="col-sm-9">
        <label><input type="radio" name="case" value="" checked> no</label>
        <label><input type="radio" name="case" value="i"> yes</label>
      </div>
    </div>
    <div class="row mb-3">
      <label class="col-sm-3 col-form-label" for="type">Records</label>
      <div class="col-sm-9">
        <select class="form-select" id="type" name="type">
          <option value="FAM">Families</option>
          <option value="INDI" selected>Individuals</option>
          <option value="_LOC">Locations</option>
          <option value="OBJE">Media objects</option>
          <option value="NOTE">Notes</option>
          <option value="REPO">Repositories</option>
          <option value="SOUR">Sources</option>
          <option value="SUBM">Submitters</option>
        </select>
      </div>
    </div>`;
  },
  async candidatesForType(pool, gedcomId, type, params) {
    if ((params.type ?? '') !== type || (params['search-for'] ?? '') === '') {
      return null;
    }

    const t = TYPE_TABLE[type];

    if ((params.method ?? 'exact') === 'regex') {
      const op = params.case === 'i' ? '~*' : '~';
      return selectXrefsWhere(pool, gedcomId, type, `${t.gedcomCol} ${op} $2`, [(params['search-for'] ?? '').replaceAll('\\n', '\n')]);
    }

    return selectXrefsWhere(pool, gedcomId, type, `${t.gedcomCol} LIKE $2`, [searchAndReplaceLikePattern(params)]);
  },
  doesRecordNeedUpdate(record, params) {
    return searchAndReplaceRegex(params, false).test(record.gedcom);
  },
  // eslint-disable-next-line no-unused-vars
  async previewUpdate(_pool, _gedcomId, record, params) {
    const replaceWith = (params['replace-with'] ?? '').replaceAll('\\n', '\n');
    const newGedcom = record.gedcom.replace(searchAndReplaceRegex(params, true), replaceWith);
    return gedcomDiff(record.gedcom, newGedcom);
  },
  async applyFix(client, gedcomId, userId, autoAcceptEdits, author, record, params) {
    const replaceWith = (params['replace-with'] ?? '').replaceAll('\\n', '\n');
    const newGedcom = record.gedcom.replace(searchAndReplaceRegex(params, true), replaceWith);
    await applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, record, newGedcom, { updateChan: false, author });
  },
};

// --- FixPrimaryTag (fix-prim-tag) ---

async function linkedIndividualsForMedia(client, gedcomId, mediaXref) {
  const result = await client.query(
    `SELECT DISTINCT i.i_id AS xref, i.i_gedcom AS gedcom FROM wt_individuals i
     JOIN wt_link l ON l.l_file = i.i_file AND l.l_from = i.i_id
     WHERE i.i_file = $1 AND l.l_to = $2`,
    [gedcomId, mediaXref],
  );
  return result.rows.map((row) => ({ xref: row.xref, type: 'INDI', gedcom: row.gedcom }));
}

function reorderObjeLinksForPrim(xref, gedcom, mediaXref, primary) {
  const facts = factBlocks(gedcom).slice(1);
  const other = [];
  const thisPrimary = [];
  const thisOther = [];
  const thisNotPrimary = [];

  for (const fact of facts) {
    if (factTagOf(fact) !== 'OBJE') {
      other.push(fact);
    } else if (factValue(fact) !== `@${mediaXref}@`) {
      thisOther.push(fact);
    } else if (primary) {
      thisPrimary.push(fact);
    } else {
      thisNotPrimary.push(fact);
    }
  }

  const ordered = [...other, ...thisPrimary, ...thisOther, ...thisNotPrimary];
  return `0 @${xref}@ INDI${ordered.map((fact) => `\n${fact}`).join('')}`;
}

function removePrimFacts(gedcom) {
  return factBlocks(gedcom)
    .filter((fact) => factTagOf(fact) !== '_PRIM')
    .join('\n');
}

const fixPrimaryTag = {
  name: 'fix-prim-tag',
  title: 'Convert OBJE:_PRIM tags to GEDCOM 5.5.1',
  description:
    '"Highlighted image" (_PRIM) tags are used by some genealogy applications to indicate the preferred image for an individual. An alternative is to re-order the images so that the preferred one is listed first.',
  recordTypes: ['OBJE'],
  optionsHtml: null,
  async candidatesForType(pool, gedcomId, type) {
    return selectXrefsWhere(pool, gedcomId, type, `${TYPE_TABLE[type].gedcomCol} LIKE $2`, ['%\n1 _PRIM %']);
  },
  doesRecordNeedUpdate(record) {
    return record.gedcom.includes('\n1 _PRIM ');
  },
  async previewUpdate(pool, gedcomId, record) {
    const primFacts = factBlocks(record.gedcom).filter((fact) => factTagOf(fact) === '_PRIM');
    let html = primFacts.map((fact) => `<p>Delete – <code>${escapeHtml(fact)}</code></p>`).join('');
    const linked = await linkedIndividualsForMedia(pool, gedcomId, record.xref);
    html += `<ul>${linked.map((individual) => `<li>Re-order media – ${escapeHtml(individual.xref)}</li>`).join('')}</ul>`;
    return html;
  },
  async applyFix(client, gedcomId, userId, autoAcceptEdits, author, record) {
    const primFacts = factBlocks(record.gedcom).filter((fact) => factTagOf(fact) === '_PRIM');

    if (primFacts.length === 0) {
      return;
    }

    const linked = await linkedIndividualsForMedia(client, gedcomId, record.xref);

    for (const primFact of primFacts) {
      const primary = factValue(primFact).toUpperCase() !== 'N';

      for (const individual of linked) {
        const newGedcom = reorderObjeLinksForPrim(individual.xref, individual.gedcom, record.xref, primary);
        // eslint-disable-next-line no-await-in-loop
        await applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, individual, newGedcom, { updateChan: false, author });
        individual.gedcom = newGedcom;
      }
    }

    await applyRecordUpdate(client, gedcomId, userId, autoAcceptEdits, record, removePrimFacts(record.gedcom), { updateChan: false, author });
  },
};

export const DATA_FIX_MODULES = [
  fixAddDeath,
  fixCemeteryTag,
  fixDuplicateLinks,
  fixNameSlashesAndSpaces,
  fixNameTags,
  fixPlaceNames,
  fixPrimaryTag,
  fixSearchAndReplace,
  fixWtObjeSort,
].sort((a, b) => a.title.localeCompare(b.title));

/**
 * @param {string} name
 * @returns {object|null}
 */
export function findDataFixModule(name) {
  return DATA_FIX_MODULES.find((module) => module.name === name) ?? null;
}
