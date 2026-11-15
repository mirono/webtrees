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

import { describe, expect, test, vi } from 'vitest';
import { createRecordWithEmbeddedLink, appendFactToRecord, removeLinks, deleteRecordCascade } from '../pages-server/relationship-editor.mjs';

function fakeClient(handlers = {}) {
  return {
    query: vi.fn(async (sql, params) => {
      if (sql.includes('FOR UPDATE')) return { rows: [{ setting_value: '100' }] };
      if (sql.includes('SELECT 1 WHERE EXISTS')) return { rows: [] };
      if (sql.startsWith('INSERT INTO wt_site_setting')) return { rows: [] };
      if (sql.includes('INSERT INTO wt_change') && sql.includes('RETURNING change_id')) return { rows: [{ change_id: 42 }] };
      if (sql.includes('UPDATE wt_change SET status')) return { rows: [] };
      if (handlers.default) return handlers.default(sql, params);
      return { rows: [] };
    }),
  };
}

describe('createRecordWithEmbeddedLink', () => {
  test('allocates an X-prefixed xref and builds a CHAN-stamped record', async () => {
    const client = fakeClient();
    const result = await createRecordWithEmbeddedLink(client, 1, 10, false, 'admin', 'INDI', '\n1 SEX M\n1 FAMC @F1@');

    expect(result.xref).toMatch(/^X\d+$/);
    expect(result.fullGedcom).toContain(`0 @${result.xref}@ INDI`);
    expect(result.fullGedcom).toContain('1 SEX M');
    expect(result.fullGedcom).toContain('1 FAMC @F1@');
    expect(result.fullGedcom).toContain('1 CHAN');
    expect(result.fullGedcom).toContain('2 _WT_USER admin');
  });

  test('when auto_accept_edits is off, the committed gedcom is empty (matches real PHP\'s $record->gedcom())', async () => {
    const client = fakeClient();
    const result = await createRecordWithEmbeddedLink(client, 1, 10, false, 'admin', 'INDI', '\n1 SEX M');

    expect(result.gedcom).toBe('');
    expect(result.fullGedcom).not.toBe('');
  });

  test('when auto_accept_edits is on, the committed gedcom equals the full built content', async () => {
    const client = fakeClient();
    const result = await createRecordWithEmbeddedLink(client, 1, 10, true, 'admin', 'INDI', '\n1 SEX M');

    expect(result.gedcom).toBe(result.fullGedcom);
  });

  test('marks the pending change accepted when auto_accept_edits is on', async () => {
    const client = fakeClient();
    await createRecordWithEmbeddedLink(client, 1, 10, true, 'admin', 'INDI', '\n1 SEX M');

    const acceptCall = client.query.mock.calls.find(([sql]) => sql.includes('UPDATE wt_change SET status'));
    expect(acceptCall).toBeDefined();
  });

  test('the pending wt_change row has old_gedcom = empty string (a brand new record)', async () => {
    const client = fakeClient();
    await createRecordWithEmbeddedLink(client, 1, 10, false, 'admin', 'FAM', '\n1 HUSB @I1@');

    const insertCall = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO wt_change'));
    expect(insertCall[0]).toContain("'', $3, 'pending'");
  });
});

describe('appendFactToRecord', () => {
  test('appends the new fact line and updates the cursor for a further append', async () => {
    const client = fakeClient();
    const current = { xref: 'I1', type: 'INDI', gedcom: '', fullGedcom: '0 @I1@ INDI\n1 SEX M' };

    await appendFactToRecord(client, 1, 10, false, 'admin', current, '1 FAMC @F1@');

    expect(current.fullGedcom).toBe('0 @I1@ INDI\n1 SEX M\n1 FAMC @F1@');
    expect(current.gedcom).toBe('');
  });

  test('when auto_accept_edits is on, the cursor\'s committed gedcom tracks the new content too', async () => {
    const client = fakeClient();
    const current = { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI\n1 SEX M', fullGedcom: '0 @I1@ INDI\n1 SEX M' };

    await appendFactToRecord(client, 1, 10, true, 'admin', current, '1 FAMC @F1@');

    expect(current.gedcom).toBe(current.fullGedcom);
    expect(current.gedcom).toContain('1 FAMC @F1@');
  });

  test('passes updateChan through to applyRecordUpdate (CHAN appears only when true)', async () => {
    const client = fakeClient();
    const current = { xref: 'F1', type: 'FAM', gedcom: '0 @F1@ FAM', fullGedcom: '0 @F1@ FAM' };

    await appendFactToRecord(client, 1, 10, false, 'admin', current, '1 CHIL @I1@', { updateChan: false });

    expect(current.fullGedcom).not.toContain('CHAN');
  });
});

describe('removeLinks', () => {
  test('removes a level-1 link and its own children', () => {
    const gedcom = '0 @F1@ FAM\n1 HUSB @I1@\n2 AGE 30\n1 WIFE @I2@';
    expect(removeLinks(gedcom, 'I1')).toBe('0 @F1@ FAM\n1 WIFE @I2@');
  });

  test('removes a level-2 link and its own children', () => {
    const gedcom = '0 @I1@ INDI\n1 ASSO @I2@\n2 RELA friend\n1 SEX M';
    expect(removeLinks(gedcom, 'I2')).toBe('0 @I1@ INDI\n1 SEX M');
  });

  test('does not remove an unrelated xref', () => {
    const gedcom = '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@';
    expect(removeLinks(gedcom, 'I3')).toBe(gedcom);
  });

  test('removes every occurrence of the same link', () => {
    const gedcom = '0 @N1@ NOTE\n1 SOUR @S1@\n1 SOUR @S1@';
    expect(removeLinks(gedcom, 'S1')).toBe('0 @N1@ NOTE');
  });
});

describe('deleteRecordCascade', () => {
  test('deletes the record itself even with no linkers', async () => {
    const client = fakeClient({
      default: (sql) => {
        if (sql.includes('SELECT DISTINCT l_from')) return { rows: [] }; // allLinkedXrefs
        return { rows: [] };
      },
    });

    await deleteRecordCascade(client, 1, 10, false, 'admin', { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' });

    const deleteChangeCall = client.query.mock.calls.find(
      ([sql, params]) => sql.includes("'', 'pending'") && params?.[1] === 'I1',
    );
    expect(deleteChangeCall).toBeDefined();
  });

  test('rewrites a linker that still has other links left after removing this one', async () => {
    const linkerGedcom = '0 @F1@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@\n1 MARR\n2 DATE 1 JAN 1990';

    const client = fakeClient({
      default: (sql, params) => {
        if (sql.includes('SELECT DISTINCT l_from')) return { rows: [{ xref: 'F1' }] };
        if (sql.includes('SELECT i_gedcom') || sql.includes('SELECT f_gedcom')) {
          if (params[0] === 'F1') return { rows: [{ gedcom: linkerGedcom }] };
        }
        return { rows: [] };
      },
    });

    await deleteRecordCascade(client, 1, 10, false, 'admin', { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' });

    const updateCall = client.query.mock.calls.find(
      ([sql, params]) => sql.includes('INSERT INTO wt_change') && params?.[3]?.includes('@I2@') && !params?.[3]?.includes('@I1@'),
    );
    expect(updateCall).toBeDefined();
  });

  test('cascades a whole-family delete when the link removal leaves only one member and no genealogy facts', async () => {
    // Family F1 only has HUSB (@I2@) after removing the CHIL link to I1 - no MARR/RESI/etc.
    const linkerGedcom = '0 @F1@ FAM\n1 HUSB @I2@\n1 CHIL @I1@';

    const client = fakeClient({
      default: (sql, params) => {
        if (sql.includes('SELECT DISTINCT l_from')) return { rows: [{ xref: 'F1' }] };
        if (sql.includes('SELECT f_gedcom') && params[0] === 'F1') return { rows: [{ gedcom: linkerGedcom }] };
        if (sql.includes('SELECT i_gedcom') && params[0] === 'I2') return { rows: [{ gedcom: '0 @I2@ INDI\n1 FAMS @F1@' }] };
        return { rows: [] };
      },
    });

    await deleteRecordCascade(client, 1, 10, false, 'admin', { xref: 'I1', type: 'INDI', gedcom: '0 @I1@ INDI' });

    // The family itself gets a delete (applyRecordDelete's SQL has a literal '' new_gedcom, not a placeholder).
    const familyDeleteCall = client.query.mock.calls.find(
      ([sql, params]) => sql.includes("'', 'pending'") && params?.[1] === 'F1',
    );
    expect(familyDeleteCall).toBeDefined();

    // The relict (I2) gets its FAMS link to F1 removed (applyRecordUpdate's own 5-placeholder INSERT, new_gedcom is params[3]).
    const relictUpdateCall = client.query.mock.calls.find(
      ([sql, params]) => sql.includes('INSERT INTO wt_change') && sql.includes('$5') && params?.[1] === 'I2' && !params?.[3]?.includes('@F1@'),
    );
    expect(relictUpdateCall).toBeDefined();
  });
});
