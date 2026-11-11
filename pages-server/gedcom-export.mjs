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

// Data/logic layer for /tree/{tree}/export, /tree/{tree}/export-client,
// /tree/{tree}/export-server (ExportGedcomPage/Client/Server, phase 5
// step 43). Scoped to export only - GEDCOM IMPORT (the chunk-upload +
// record-parsing pipeline) is its own, separately-scoped future step
// (see docs/php-to-js-migration/phase5-gedcom-export.md for the full
// derivation).
//
// Real PHP's GedcomExportService::export() streams every record
// (individuals/families/sources/other/media) through
// GedcomRecord::privatizeGedcom($access_level) - which is a no-op
// (returns the raw gedcom unchanged) whenever $access_level ===
// Auth::PRIV_HIDE (the 'none' privacy radio choice - the default for
// site admins, i.e. the common case). This port mirrors that exact
// fast/slow split: `privacy: 'none'` skips all canShow()/factCanShow()
// work entirely; `gedadmin`/`user`/`visitor` run the real per-record,
// per-fact, and per-link privacy chain already built for every
// individual record page in this migration (individual.mjs/family.mjs/
// source.mjs/media.mjs/note.mjs/header.mjs/location.mjs/submitter.mjs's
// own canShowRecord()-family functions - reused here as-is, not
// reimplemented).
//
// Unlike those per-page routes (which compute privacy for ONE record
// per request, with per-xref DB round-trips), export needs every
// record's canShow() decision in one pass. This loads the WHOLE tree's
// raw GEDCOM text and wt_default_resn/wt_link rows into memory UP
// FRONT (one query per table, not one per record) and computes every
// record's canShow() purely in-memory from there - a deliberate,
// natural-Node restructuring of the same algorithm real PHP runs with
// one-record-at-a-time Eloquent model hydration, consistent with this
// bucket's "natural Node approach, not a mechanical PHP-workaround
// port" scope decision.

import { readFile, writeFile } from 'fs/promises';
import {
  parseFacts,
  isDead,
  canShowRecord,
  canShowViaResnChain,
  factCanShow,
  loadTreePrivacyPrefs,
  viewerRelationshipPrefs,
} from './individual.mjs';
import { familyCanShowRecord } from './family.mjs';
import { sourceCanShowRecord, repositoryCanShowRecord, repoXrefs } from './source.mjs';
import { mediaCanShowRecord } from './media.mjs';
import { noteCanShowRecord } from './note.mjs';
import { headerCanShowRecord, loadHeader } from './header.mjs';
import { locationCanShowRecord } from './location.mjs';
import { submitterCanShowRecord } from './submitter.mjs';
import { wrapLongLines } from '../lib/services/gedcom-export-service.js';
import { UTF8 } from '../lib/encodings/utf8.js';
import { UTF16BE } from '../lib/encodings/utf16be.js';
import { ANSEL } from '../lib/encodings/ansel.js';
import { ASCII } from '../lib/encodings/ascii.js';
import { Windows1252 } from '../lib/encodings/windows1252.js';

// Mirrors GedcomExportService::ACCESS_LEVELS.
export const ACCESS_LEVELS = { gedadmin: 0, user: 1, visitor: 2, none: -1 };

export const ENCODING_OPTIONS = {
  'UTF-8': 'UTF-8',
  'UTF-16BE': 'UNICODE (UTF16-BE)',
  ANSEL: 'ANSEL',
  ASCII: 'ASCII',
  CP1252: 'ANSI (CP1252)',
};

export const FORMAT_OPTIONS = ['gedcom', 'zip', 'zipmedia', 'gedzip'];
export const PRIVACY_OPTIONS = ['none', 'gedadmin', 'user', 'visitor'];
export const LINE_ENDINGS_OPTIONS = ['CRLF', 'LF'];

const ENCODING_INSTANCES = {
  'UTF-8': new UTF8(),
  'UTF-16BE': new UTF16BE(),
  ANSEL: new ANSEL(),
  ASCII: new ASCII(),
  CP1252: new Windows1252(),
};

// Mirrors GedcomExportService::createHeader()'s $gedcom_encodings map -
// the literal "1 CHAR" value written differs from the encoding's own
// selector name for these two.
const HEADER_CHAR_LABELS = { 'UTF-16BE': 'UNICODE', CP1252: 'ANSI' };

const LINE_LENGTH = 253;

/**
 * Mirrors ExportGedcomPage's own filename logic (strip a ".ged" suffix
 * if present, offer a plain name and a date-suffixed one).
 *
 * @param {string} treeName
 * @returns {{filename: string, downloadFilename: string, downloadFilenames: Record<string,string>}}
 */
export function resolveExportFilenames(treeName) {
  const downloadFilename = /\.ged$/i.test(treeName) ? treeName.slice(0, -4) : treeName;
  const dateSuffix = new Date();
  const dateStr = `${dateSuffix.getFullYear()}-${String(dateSuffix.getMonth() + 1).padStart(2, '0')}-${String(dateSuffix.getDate()).padStart(2, '0')}`;
  const withDate = `${downloadFilename}-${dateStr}`;

  return {
    filename: treeName,
    downloadFilename,
    downloadFilenames: { [downloadFilename]: downloadFilename, [withDate]: withDate },
  };
}

/**
 * Batch-loads every raw GEDCOM record for a tree in 5 queries (one per
 * table) instead of per-record round-trips - see this file's top doc
 * comment. Returns typed xref->gedcom maps plus a unified
 * xref->recordType lookup (used for link resolution during privacy
 * filtering).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 */
async function loadAllRecords(pool, gedcomId) {
  const [individualsResult, familiesResult, sourcesResult, otherResult, mediaResult] = await Promise.all([
    pool.query('SELECT i_id AS xref, i_gedcom AS gedcom FROM wt_individuals WHERE i_file = $1 ORDER BY LENGTH(i_id), i_id', [gedcomId]),
    pool.query('SELECT f_id AS xref, f_gedcom AS gedcom FROM wt_families WHERE f_file = $1 ORDER BY LENGTH(f_id), f_id', [gedcomId]),
    pool.query('SELECT s_id AS xref, s_gedcom AS gedcom FROM wt_sources WHERE s_file = $1 ORDER BY LENGTH(s_id), s_id', [gedcomId]),
    pool.query(
      "SELECT o_id AS xref, o_gedcom AS gedcom, o_type AS type FROM wt_other WHERE o_file = $1 AND o_type NOT IN ('HEAD', 'TRLR') ORDER BY o_type, LENGTH(o_id), o_id",
      [gedcomId],
    ),
    pool.query('SELECT m_id AS xref, m_gedcom AS gedcom FROM wt_media WHERE m_file = $1 ORDER BY LENGTH(m_id), m_id', [gedcomId]),
  ]);

  const individuals = new Map(individualsResult.rows.map((row) => [row.xref, row.gedcom]));
  const families = new Map(familiesResult.rows.map((row) => [row.xref, row.gedcom]));
  const sources = new Map(sourcesResult.rows.map((row) => [row.xref, row.gedcom]));
  const media = new Map(mediaResult.rows.map((row) => [row.xref, row.gedcom]));
  const other = new Map(otherResult.rows.map((row) => [row.xref, { gedcom: row.gedcom, type: row.type }]));

  const recordType = new Map();
  for (const xref of individuals.keys()) recordType.set(xref, 'INDI');
  for (const xref of families.keys()) recordType.set(xref, 'FAM');
  for (const xref of sources.keys()) recordType.set(xref, 'SOUR');
  for (const xref of media.keys()) recordType.set(xref, 'OBJE');
  for (const [xref, row] of other) recordType.set(xref, row.type);

  return {
    individuals,
    families,
    sources,
    other,
    media,
    otherOrder: otherResult.rows.map((row) => row.xref),
    recordType,
  };
}

/**
 * Batch-loads EVERY wt_default_resn row for the tree in one query,
 * returning the same shape individual.mjs's loadDefaultResn() returns
 * per-xref - functionally identical, just computed once instead of
 * once per record.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 */
async function loadAllDefaultResn(pool, gedcomId) {
  const result = await pool.query('SELECT xref, tag_type, resn FROM wt_default_resn WHERE gedcom_id = $1', [gedcomId]);

  const individualResnByXref = new Map();
  const factResnByXref = new Map();
  const treeFactResn = new Map();

  for (const row of result.rows) {
    if (row.xref !== null) {
      if (row.tag_type !== null) {
        if (!factResnByXref.has(row.xref)) {
          factResnByXref.set(row.xref, new Map());
        }
        factResnByXref.get(row.xref).set(row.tag_type, row.resn);
      } else {
        individualResnByXref.set(row.xref, row.resn);
      }
    } else if (row.tag_type !== null) {
      treeFactResn.set(row.tag_type, row.resn);
    }
  }

  function forXref(xref) {
    return {
      individualResn: individualResnByXref.get(xref) ?? null,
      factResn: factResnByXref.get(xref) ?? new Map(),
      treeFactResn,
    };
  }

  return { forXref, treeFactResn };
}

/**
 * Batch-loads every wt_link row for the tree, returning a reverse index
 * (l_to -> [l_from, ...]) - needed for Media::canShowByType()/
 * Note::canShowByType()'s "every record linking TO me must itself be
 * showable" check (app/Media.php:41-58, app/Note.php:58-75).
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 */
async function loadLinkReverseIndex(pool, gedcomId) {
  const result = await pool.query('SELECT l_from, l_to FROM wt_link WHERE l_file = $1', [gedcomId]);

  const reverseIndex = new Map();
  for (const row of result.rows) {
    if (!reverseIndex.has(row.l_to)) {
      reverseIndex.set(row.l_to, []);
    }
    reverseIndex.get(row.l_to).push(row.l_from);
  }

  return reverseIndex;
}

/**
 * Extracts HUSB/WIFE/CHIL xrefs from a family's raw record text - a
 * plain regex scan, same convention as source.mjs's repoXrefs().
 *
 * @param {string} gedcom
 * @returns {string[]}
 */
function familyMemberXrefs(gedcom) {
  const xrefs = [];
  const re = /\n1 (?:HUSB|WIFE|CHIL) @([^@]+)@/g;
  let match;
  while ((match = re.exec(gedcom)) !== null) {
    xrefs.push(match[1]);
  }
  return xrefs;
}

/**
 * Computes every record's canShow(accessLevel) decision for the whole
 * tree in one in-memory pass, in dependency order (individuals before
 * families, repositories before sources, before media/notes which
 * reference them via wt_link). Mirrors each record type's own
 * canShowByType() exactly via the already-built per-type
 * canShowRecord() functions - see this file's top doc comment.
 *
 * Note/Media's reverse-link check only looks at the referencing
 * record's OWN already-computed canShow() (INDI/FAM; anything else -
 * including another NOTE or OBJE - is treated as showable without
 * recursing further) - the same bounded, documented simplification
 * `linkedRecordCanShow()` in index.mjs already uses, to avoid unbounded
 * mutual-reference recursion.
 *
 * @param {Awaited<ReturnType<typeof loadAllRecords>>} records
 * @param {Map<string,string[]>} linkReverseIndex
 * @param {{hideLivePeople: boolean, showDeadPeople: number, keepAliveYearsBirth: number, keepAliveYearsDeath: number}} treePrivacyPrefs
 * @param {ReturnType<typeof loadAllDefaultResn>['forXref']} defaultResnForXref
 * @param {number} accessLevel
 * @param {{gedcomid: string|null, pathLength: number}} relPrefs
 * @param {number} realViewerAccessLevel the EXPORTING user's own real
 *   access level (always 0 here - export is manager/admin-gated) - the
 *   self-record bypass only fires when the SIMULATED accessLevel equals
 *   this, mirroring GedcomRecord::canShowRecord()'s own
 *   `$access_level === Auth::accessLevel($this->tree)` condition.
 */
function computeCanShowByXref(records, linkReverseIndex, treePrivacyPrefs, defaultResnForXref, accessLevel, relPrefs, realViewerAccessLevel) {
  const canShow = new Map();

  function isSelfRecord(xref) {
    return relPrefs.gedcomid !== null && xref === relPrefs.gedcomid && accessLevel === realViewerAccessLevel;
  }

  // 1. Individuals (no dependencies on other records).
  for (const [xref, gedcom] of records.individuals) {
    const facts = parseFacts(gedcom);
    const defaultResnInfo = defaultResnForXref(xref);
    const tree = {
      hideLivePeople: treePrivacyPrefs.hideLivePeople,
      defaultResn: defaultResnInfo.individualResn,
      keepAliveYearsBirth: treePrivacyPrefs.keepAliveYearsBirth,
      keepAliveYearsDeath: treePrivacyPrefs.keepAliveYearsDeath,
    };
    const viewer = {
      accessLevel,
      isSelfRecord: isSelfRecord(xref),
      showDeadPeople: treePrivacyPrefs.showDeadPeople,
      dead: isDead(facts, treePrivacyPrefs),
      // The relationship-privacy BFS (Individual::canShowByType()'s
      // isRelated() branch) isn't ported anywhere in this migration -
      // see individual.mjs's canShowByType() doc comment. Exports
      // reuse the exact same documented gap, not a new one.
      relationshipGateBlocked: relPrefs.gedcomid !== null && relPrefs.pathLength > 0,
    };
    canShow.set(xref, canShowRecord(tree, gedcom, facts, viewer));
  }

  // 2. Families (depend on individuals).
  for (const [xref, gedcom] of records.families) {
    const defaultResnInfo = defaultResnForXref(xref);
    const tree = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const viewer = { accessLevel, isSelfRecord: false };
    const memberCanShowResults = familyMemberXrefs(gedcom)
      .filter((memberXref) => canShow.has(memberXref))
      .map((memberXref) => canShow.get(memberXref));
    canShow.set(xref, familyCanShowRecord(tree, gedcom, viewer, memberCanShowResults));
  }

  // 3. Repositories (no dependencies).
  for (const [xref, row] of records.other) {
    if (row.type !== 'REPO') continue;
    const defaultResnInfo = defaultResnForXref(xref);
    const tree = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const viewer = { accessLevel, isSelfRecord: false };
    canShow.set(xref, repositoryCanShowRecord(tree, row.gedcom, viewer, defaultResnInfo.treeFactResn));
  }

  // 4. Sources (depend on repositories).
  for (const [xref, gedcom] of records.sources) {
    const defaultResnInfo = defaultResnForXref(xref);
    const tree = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const viewer = { accessLevel, isSelfRecord: false };
    const facts = parseFacts(gedcom);
    const repoCanShowResults = repoXrefs(facts)
      .filter((repoXref) => canShow.has(repoXref))
      .map((repoXref) => canShow.get(repoXref));
    canShow.set(xref, sourceCanShowRecord(tree, gedcom, viewer, defaultResnInfo.treeFactResn, repoCanShowResults));
  }

  // 5. Headers, locations, submitters, and any other "other" type with
  //    no cross-record dependency.
  for (const [xref, row] of records.other) {
    if (row.type === 'REPO' || row.type === 'NOTE') continue;
    const defaultResnInfo = defaultResnForXref(xref);
    const tree = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const viewer = { accessLevel, isSelfRecord: false };

    if (row.type === 'SUBM') {
      canShow.set(xref, submitterCanShowRecord(tree, row.gedcom, viewer, defaultResnInfo.treeFactResn));
    } else if (row.type === '_LOC') {
      canShow.set(xref, locationCanShowRecord(tree, row.gedcom, viewer, defaultResnInfo.treeFactResn));
    } else {
      // Base GedcomRecord::canShowByType() for every other "other" type
      // (SUBN, custom types) - no override, same pattern already
      // confirmed for Repository/Header/Submitter/Location.
      const resn = defaultResnInfo.treeFactResn.get(row.type) ?? null;
      const defaultShow = resn === null ? true : { none: 2, privacy: 1, confidential: 0, hidden: -1 }[resn] >= viewer.accessLevel;
      canShow.set(xref, canShowViaResnChain(tree, row.gedcom, viewer, () => defaultShow));
    }
  }

  // 6. Media (reverse-link dependency on individuals/families).
  for (const [xref, gedcom] of records.media) {
    const defaultResnInfo = defaultResnForXref(xref);
    const tree = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const viewer = { accessLevel, isSelfRecord: false };
    const linkedRecordsShowable = (linkReverseIndex.get(xref) ?? []).every((fromXref) => canShow.get(fromXref) ?? true);
    canShow.set(xref, mediaCanShowRecord(tree, gedcom, viewer, defaultResnInfo.treeFactResn, linkedRecordsShowable));
  }

  // 7. Notes (reverse-link dependency, same shape as media).
  for (const [xref, row] of records.other) {
    if (row.type !== 'NOTE') continue;
    const defaultResnInfo = defaultResnForXref(xref);
    const tree = { hideLivePeople: treePrivacyPrefs.hideLivePeople, defaultResn: defaultResnInfo.individualResn };
    const viewer = { accessLevel, isSelfRecord: false };
    const linkedRecordsShowable = (linkReverseIndex.get(xref) ?? []).every((fromXref) => canShow.get(fromXref) ?? true);
    canShow.set(xref, noteCanShowRecord(tree, row.gedcom, viewer, defaultResnInfo.treeFactResn, linkedRecordsShowable));
  }

  return canShow;
}

/**
 * Mirrors GedcomRecord::privatizeGedcom($access_level) (app/GedcomRecord.php:265-302)
 * for ONE record: returns '' if the record itself can't be shown,
 * otherwise the first line plus every fact that individually passes
 * factCanShow(), with any `\d TAG @xref@` line (and its sub-lines)
 * stripped when that xref doesn't resolve to a showable record
 * (including a dangling link to a record that doesn't exist at all -
 * same as real PHP, which strips both cases identically).
 *
 * @param {string} gedcom
 * @param {boolean} recordCanShow
 * @param {number} accessLevel
 * @param {{individualResn: string|null, factResn: Map<string,string>}} defaultResnInfo
 * @param {Map<string,boolean>} canShowByXref
 * @returns {string}
 */
function privatizeRecord(gedcom, recordCanShow, accessLevel, defaultResnInfo, canShowByXref) {
  if (!recordCanShow) {
    return '';
  }

  const [firstLine] = gedcom.split('\n', 1);
  const facts = parseFacts(gedcom);

  let result = firstLine;
  for (const fact of facts) {
    const tagMatch = /^1 (\S+)/.exec(fact);

    // parseFacts()'s first block is the record's own level-0 line (e.g.
    // "0 @X@ INDI"), already captured as firstLine above - PHP's own
    // parseFacts() array_shift()s it off explicitly (see
    // individual.mjs's own parseFacts() doc comment); skip it here too,
    // or it gets appended a second time.
    if (tagMatch === null) {
      continue;
    }

    const tag = tagMatch[1];
    const defaultResn = defaultResnInfo.factResn.get(tag) ?? null;

    if (factCanShow(fact, accessLevel, defaultResn)) {
      result += '\n' + fact;
    }
  }

  // Strip links to missing or unshowable records.
  const linkPattern = /\n(\d+) [_A-Z][_A-Z0-9]* @([A-Za-z0-9:_.-]{1,20})@/g;
  const matches = [...result.matchAll(linkPattern)];

  for (const match of matches) {
    const xref = match[2];
    if (canShowByXref.get(xref) ?? false) {
      continue;
    }

    const level = match[1];
    const next = Number(level) + 1;
    const stripPattern = new RegExp(`\\n${level} [_A-Z][_A-Z0-9]* @${xref}@(\\n[${next}-9].*)*`);
    result = result.replace(stripPattern, '');
  }

  return result;
}

/**
 * Mirrors GedcomExportService::createHeader() (minus the ".ged" filename
 * suffix logic, which the caller already resolved via
 * resolveExportFilenames()).
 *
 * @param {{filename: string}} filenameInfo
 * @param {string} encoding
 * @param {boolean} includeSub
 * @param {number} accessLevel
 * @param {{xref: string, gedcom: string}|null} headerRecord
 * @param {{individualResn: string|null, factResn: Map<string,string>}} defaultResnInfo
 */
function createHeaderGedcom(filenameInfo, encoding, includeSub, accessLevel, headerRecord, defaultResnInfo) {
  let ged = '0 HEAD';
  ged += '\n1 SOUR webtrees';
  ged += '\n2 NAME webtrees';
  ged += '\n2 VERS 2.2.7-dev';
  ged += '\n1 DEST DISKETTE';
  const now = new Date();
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  ged += `\n1 DATE ${String(now.getDate()).padStart(2, '0')} ${months[now.getMonth()]} ${now.getFullYear()}`;
  ged += `\n2 TIME ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  ged += '\n1 GEDC\n2 VERS 5.5.1\n2 FORM LINEAGE-LINKED';
  ged += `\n1 CHAR ${HEADER_CHAR_LABELS[encoding] ?? encoding}`;
  ged += `\n1 FILE ${filenameInfo.filename}`;

  if (headerRecord !== null) {
    const tags = includeSub ? ['COPR', 'LANG', 'PLAC', 'NOTE', 'SUBM', 'SUBN'] : ['COPR', 'LANG', 'PLAC', 'NOTE'];
    const facts = parseFacts(headerRecord.gedcom);

    for (const fact of facts) {
      const tagMatch = /^1 (\S+)/.exec(fact);
      const tag = tagMatch ? tagMatch[1] : '';

      if (!tags.includes(tag)) {
        continue;
      }

      const defaultResn = defaultResnInfo.factResn.get(tag) ?? null;

      if (factCanShow(fact, accessLevel, defaultResn)) {
        ged += '\n' + fact;
      }
    }
  }

  return ged;
}

/**
 * Builds the full exported GEDCOM text (header + every record + TRLR),
 * each record already line-wrapped and with the requested line endings
 * applied - everything BEFORE the final target-encoding byte
 * conversion (done once, on the whole string, by the caller).
 *
 * @param {import('pg').Pool} pool
 * @param {{gedcomId: number, name: string}} tree
 * @param {{privacy: 'none'|'gedadmin'|'user'|'visitor', encoding: string, lineEndings: 'CRLF'|'LF', includeMediaPath: string|null}} options
 * @param {{userId: number|null}} viewerUser
 * @returns {Promise<{text: string, mediaFiles: string[]}>}
 */
export async function buildExportText(pool, tree, options, viewerUser) {
  const accessLevel = ACCESS_LEVELS[options.privacy];
  const filenameInfo = resolveExportFilenames(tree.name);

  const [records, treePrivacyPrefs, defaultResn, linkReverseIndex, headerRecord, relPrefs] = await Promise.all([
    loadAllRecords(pool, tree.gedcomId),
    loadTreePrivacyPrefs(pool, tree.gedcomId),
    loadAllDefaultResn(pool, tree.gedcomId),
    loadLinkReverseIndex(pool, tree.gedcomId),
    loadHeader(pool, tree.gedcomId, 'HEAD'),
    viewerRelationshipPrefs(pool, tree.gedcomId, viewerUser.userId),
  ]);

  const unfiltered = accessLevel === ACCESS_LEVELS.none;

  const canShowByXref = unfiltered
    ? null
    : computeCanShowByXref(records, linkReverseIndex, treePrivacyPrefs, defaultResn.forXref, accessLevel, relPrefs, 0);

  const headerDefaultResnInfo = defaultResn.forXref('HEAD');
  const headerGedcom = createHeaderGedcom(filenameInfo, options.encoding, unfiltered, accessLevel, headerRecord, headerDefaultResnInfo);

  const lines = [headerGedcom];
  const mediaFiles = [];

  function emit(xref, gedcom, type) {
    let gedcomOut = gedcom;

    if (!unfiltered) {
      const recordCanShow = canShowByXref.get(xref) ?? false;
      gedcomOut = privatizeRecord(gedcom, recordCanShow, accessLevel, defaultResn.forXref(xref), canShowByXref);

      if (gedcomOut === '') {
        return;
      }
    }

    if (options.includeMediaPath !== null && type === 'OBJE') {
      const fileMatches = [...gedcomOut.matchAll(/\n1 FILE (.+)/g)];
      for (const match of fileMatches) {
        mediaFiles.push(match[1]);
      }
    }

    lines.push(gedcomOut);
  }

  for (const [xref, gedcom] of records.individuals) emit(xref, gedcom, 'INDI');
  for (const [xref, gedcom] of records.families) emit(xref, gedcom, 'FAM');
  for (const [xref, gedcom] of records.sources) emit(xref, gedcom, 'SOUR');
  for (const xref of records.otherOrder) {
    const row = records.other.get(xref);
    emit(xref, row.gedcom, row.type);
  }
  for (const [xref, gedcom] of records.media) emit(xref, gedcom, 'OBJE');

  lines.push('0 TRLR');

  let text = lines.map((gedcom) => wrapLongLines(gedcom, LINE_LENGTH) + '\n').join('');

  if (options.lineEndings === 'CRLF') {
    text = text.replaceAll('\n', '\r\n');
  }

  return { text, mediaFiles };
}

/**
 * Converts assembled UTF-8 GEDCOM text to the target encoding's raw
 * bytes - mirrors GedcomEncodingFilter's dst_encoding->fromUtf8() call,
 * applied once to the whole text rather than per stream-filter chunk
 * (equivalent result: every encoding here maps characters
 * independently of chunk boundaries).
 *
 * @param {string} text
 * @param {string} encoding
 * @returns {Buffer}
 */
export function encodeGedcomText(text, encoding) {
  if (encoding === 'UTF-8') {
    return Buffer.from(text, 'utf8');
  }

  const instance = ENCODING_INSTANCES[encoding];
  const byteString = instance.fromUtf8(text);
  return Buffer.from(byteString, 'latin1');
}

/**
 * Resolves the tree's real media folder, for zipmedia/gedzip exports -
 * mirrors Tree::mediaFolder()/mediaFilesystem() (app/Tree.php:259-262,610-613):
 * wt_gedcom.media_folder is a real column, not a setting.
 *
 * @param {import('pg').Pool} pool
 * @param {number} gedcomId
 * @returns {Promise<string>}
 */
export async function loadMediaFolder(pool, gedcomId) {
  const result = await pool.query('SELECT media_folder FROM wt_gedcom WHERE gedcom_id = $1', [gedcomId]);
  return result.rows[0]?.media_folder ?? 'media/';
}

/**
 * Reads one real media file's bytes from the data filesystem, for
 * bundling into a zipmedia/gedzip export - mirrors
 * $media_filesystem->readStream($media_file) via
 * Registry::filesystem()->data()->readStream(). Returns null if the
 * file doesn't exist (mirrors the real
 * `$media_filesystem->fileExists($media_file)` guard - a missing file
 * is silently skipped, not an export failure).
 *
 * @param {string} dataDir absolute path to the webtrees `data/` folder
 * @param {string} mediaFolder tree's media_folder (e.g. "media/")
 * @param {string} relativePath the GEDCOM record's own "1 FILE" value
 * @returns {Promise<Buffer|null>}
 */
export async function readMediaFile(dataDir, mediaFolder, relativePath) {
  try {
    return await readFile(`${dataDir}${mediaFolder}${relativePath}`);
  } catch {
    return null;
  }
}

/**
 * Writes an export's bytes to a file in the data folder - mirrors
 * ExportGedcomServer's `$data_filesystem->writeStream($filename, $resource)`.
 *
 * @param {string} dataDir absolute path to the webtrees `data/` folder
 * @param {string} filename
 * @param {Buffer} buffer
 */
export async function writeExportToServer(dataDir, filename, buffer) {
  await writeFile(`${dataDir}${filename}`, buffer);
}
