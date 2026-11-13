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

import { describe, expect, test } from 'vitest';
import {
  matchDataFixChoosePath,
  matchDataFixPagePath,
  matchDataFixUpdatePath,
  matchDataFixUpdateAllPath,
  matchDataFixDataPath,
  matchDataFixPreviewPath,
} from '../pages-server/routes.mjs';

describe('matchDataFixChoosePath', () => {
  test('matches /tree/{tree}/data-fix', () => {
    expect(matchDataFixChoosePath('/tree/ophir/data-fix')).toBe('ophir');
  });

  test('matches /tree/{tree}/data-fix with trailing slash', () => {
    expect(matchDataFixChoosePath('/tree/ophir/data-fix/')).toBe('ophir');
  });

  test('URL-decodes tree name', () => {
    expect(matchDataFixChoosePath('/tree/my%20tree/data-fix')).toBe('my tree');
    expect(matchDataFixChoosePath('/tree/my%2Ftree/data-fix')).toBe('my/tree');
    expect(matchDataFixChoosePath('/tree/special%3Fchar/data-fix')).toBe('special?char');
  });

  test('returns null for invalid paths', () => {
    expect(matchDataFixChoosePath('/tree/ophir')).toBeNull();
    expect(matchDataFixChoosePath('/tree/ophir/data-fix/something')).toBeNull();
    expect(matchDataFixChoosePath('/tree/ophir/data-fix/fix-add-death')).toBeNull();
  });

  test('returns null if tree name is empty', () => {
    expect(matchDataFixChoosePath('/tree//data-fix')).toBeNull();
  });
});

describe('matchDataFixPagePath', () => {
  test('matches /tree/{tree}/data-fix/{data_fix}', () => {
    const result = matchDataFixPagePath('/tree/ophir/data-fix/fix-add-death');
    expect(result).toEqual({ tree: 'ophir', dataFix: 'fix-add-death' });
  });

  test('matches with trailing slash', () => {
    const result = matchDataFixPagePath('/tree/ophir/data-fix/fix-add-death/');
    expect(result).toEqual({ tree: 'ophir', dataFix: 'fix-add-death' });
  });

  test('URL-decodes tree name', () => {
    const result = matchDataFixPagePath('/tree/my%20tree/data-fix/fix-add-death');
    expect(result.tree).toBe('my tree');
  });

  test('URL-decodes data-fix name', () => {
    const result = matchDataFixPagePath('/tree/ophir/data-fix/fix%20with%20space');
    expect(result.dataFix).toBe('fix with space');
  });

  test('returns null for invalid paths', () => {
    expect(matchDataFixPagePath('/tree/ophir/data-fix')).toBeNull();
    expect(matchDataFixPagePath('/tree/ophir/data-fix/fix-add-death/extra')).toBeNull();
    expect(matchDataFixPagePath('/tree/ophir/individual/I1')).toBeNull();
  });

  test('returns null if data-fix name is empty', () => {
    expect(matchDataFixPagePath('/tree/ophir/data-fix/')).toBeNull();
  });
});

describe('matchDataFixUpdatePath', () => {
  test('matches /tree/{tree}/data-fix/{data_fix}/update', () => {
    const result = matchDataFixUpdatePath('/tree/ophir/data-fix/fix-add-death/update');
    expect(result).toEqual({ tree: 'ophir', dataFix: 'fix-add-death' });
  });

  test('matches with trailing slash', () => {
    const result = matchDataFixUpdatePath('/tree/ophir/data-fix/fix-add-death/update/');
    expect(result).toEqual({ tree: 'ophir', dataFix: 'fix-add-death' });
  });

  test('URL-decodes tree name', () => {
    const result = matchDataFixUpdatePath('/tree/my%20tree/data-fix/fix-add-death/update');
    expect(result.tree).toBe('my tree');
  });

  test('URL-decodes data-fix name', () => {
    const result = matchDataFixUpdatePath('/tree/ophir/data-fix/my%20fix/update');
    expect(result.dataFix).toBe('my fix');
  });

  test('returns null for invalid paths', () => {
    expect(matchDataFixUpdatePath('/tree/ophir/data-fix/fix-add-death')).toBeNull();
    expect(matchDataFixUpdatePath('/tree/ophir/data-fix/fix-add-death/update/extra')).toBeNull();
    expect(matchDataFixUpdatePath('/tree/ophir/data-fix/fix-add-death/update-all')).toBeNull();
  });
});

describe('matchDataFixUpdateAllPath', () => {
  test('matches /tree/{tree}/data-fix/{data_fix}/update-all', () => {
    const result = matchDataFixUpdateAllPath('/tree/ophir/data-fix/fix-add-death/update-all');
    expect(result).toEqual({ tree: 'ophir', dataFix: 'fix-add-death' });
  });

  test('matches with trailing slash', () => {
    const result = matchDataFixUpdateAllPath('/tree/ophir/data-fix/fix-add-death/update-all/');
    expect(result).toEqual({ tree: 'ophir', dataFix: 'fix-add-death' });
  });

  test('URL-decodes tree name', () => {
    const result = matchDataFixUpdateAllPath('/tree/my%20tree/data-fix/fix-add-death/update-all');
    expect(result.tree).toBe('my tree');
  });

  test('URL-decodes data-fix name', () => {
    const result = matchDataFixUpdateAllPath('/tree/ophir/data-fix/my%20fix/update-all');
    expect(result.dataFix).toBe('my fix');
  });

  test('returns null for invalid paths', () => {
    expect(matchDataFixUpdateAllPath('/tree/ophir/data-fix/fix-add-death')).toBeNull();
    expect(matchDataFixUpdateAllPath('/tree/ophir/data-fix/fix-add-death/update')).toBeNull();
    expect(matchDataFixUpdateAllPath('/tree/ophir/data-fix/fix-add-death/update-all/extra')).toBeNull();
  });
});

describe('matchDataFixDataPath', () => {
  test('matches /tree/{tree}/data-fix/{data_fix}/data', () => {
    const result = matchDataFixDataPath('/tree/ophir/data-fix/fix-add-death/data');
    expect(result).toEqual({ tree: 'ophir', dataFix: 'fix-add-death' });
  });

  test('matches with trailing slash', () => {
    const result = matchDataFixDataPath('/tree/ophir/data-fix/fix-add-death/data/');
    expect(result).toEqual({ tree: 'ophir', dataFix: 'fix-add-death' });
  });

  test('URL-decodes tree name', () => {
    const result = matchDataFixDataPath('/tree/my%20tree/data-fix/fix-add-death/data');
    expect(result.tree).toBe('my tree');
  });

  test('URL-decodes data-fix name', () => {
    const result = matchDataFixDataPath('/tree/ophir/data-fix/my%20fix/data');
    expect(result.dataFix).toBe('my fix');
  });

  test('returns null for invalid paths', () => {
    expect(matchDataFixDataPath('/tree/ophir/data-fix/fix-add-death')).toBeNull();
    expect(matchDataFixDataPath('/tree/ophir/data-fix/fix-add-death/data/extra')).toBeNull();
    expect(matchDataFixDataPath('/tree/ophir/data-fix/fix-add-death/preview')).toBeNull();
  });
});

describe('matchDataFixPreviewPath', () => {
  test('matches /tree/{tree}/data-fix/{data_fix}/preview', () => {
    const result = matchDataFixPreviewPath('/tree/ophir/data-fix/fix-add-death/preview');
    expect(result).toEqual({ tree: 'ophir', dataFix: 'fix-add-death' });
  });

  test('matches with trailing slash', () => {
    const result = matchDataFixPreviewPath('/tree/ophir/data-fix/fix-add-death/preview/');
    expect(result).toEqual({ tree: 'ophir', dataFix: 'fix-add-death' });
  });

  test('URL-decodes tree name', () => {
    const result = matchDataFixPreviewPath('/tree/my%20tree/data-fix/fix-add-death/preview');
    expect(result.tree).toBe('my tree');
  });

  test('URL-decodes data-fix name', () => {
    const result = matchDataFixPreviewPath('/tree/ophir/data-fix/my%20fix/preview');
    expect(result.dataFix).toBe('my fix');
  });

  test('returns null for invalid paths', () => {
    expect(matchDataFixPreviewPath('/tree/ophir/data-fix/fix-add-death')).toBeNull();
    expect(matchDataFixPreviewPath('/tree/ophir/data-fix/fix-add-death/preview/extra')).toBeNull();
    expect(matchDataFixPreviewPath('/tree/ophir/data-fix/fix-add-death/data')).toBeNull();
  });
});
