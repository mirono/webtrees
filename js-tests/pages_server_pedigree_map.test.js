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
import { getSosaName, sosaStradonitzAncestors, getPedigreeMapFacts, buildPedigreeMapData, placeLocationCoordinates } from '../pages-server/pedigree-map.mjs';

const GEDCOM_ID = 1;

const TREE_PRIVACY_PREFS = {
  hideLivePeople: true,
  showDeadPeople: 2,
  maxAliveAge: 120,
  keepAliveYearsBirth: 0,
  keepAliveYearsDeath: 0,
  showLivingNames: 1,
};

const REL_PREFS = { gedcomid: null, pathLength: 0 };

/**
 * A minimal fake `pg` Pool backing loadIndividual()/loadFamily()/
 * loadRelatedFamilyXrefs()/loadDefaultResn() (all real, already-ported
 * helpers this module calls directly) - dispatches on which table name
 * appears in the SQL text, same "fake in-memory DB" shape every other
 * data-layer test in this migration uses.
 */
function buildFakePool({ individuals = {}, families = {}, links = [] }) {
  return {
    query: vi.fn(async (sql, params) => {
      if (sql.includes('FROM wt_individuals')) {
        const xref = params[0];
        const individual = individuals[xref];
        return { rows: individual ? [{ i_id: xref, i_gedcom: individual }] : [] };
      }

      if (sql.includes('FROM wt_families')) {
        const xref = params[0];
        const family = families[xref];
        return { rows: family ? [{ f_id: xref, f_gedcom: family.gedcom, f_husb: family.husb, f_wife: family.wife }] : [] };
      }

      if (sql.includes('FROM wt_link')) {
        const xref = params[1];
        const rows = links.filter((link) => link.from === xref).map((link) => ({ l_type: link.type, l_to: link.to }));
        return { rows };
      }

      if (sql.includes('FROM wt_default_resn')) {
        return { rows: [] };
      }

      if (sql.includes('FROM wt_place_location')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected query: ${sql}`);
    }),
  };
}

// Builds a minimal individual record with an optional RESN and a BIRT
// fact (with an optional place and date).
function individualGedcom({ resn = null, birthPlace = null, birthDate = null, extraFacts = '' } = {}) {
  let gedcom = '0 INDI';

  if (resn !== null) {
    gedcom += `\n1 RESN ${resn}`;
  }

  gedcom += '\n1 SEX M';

  if (birthPlace !== null || birthDate !== null) {
    gedcom += '\n1 BIRT';

    if (birthDate !== null) {
      gedcom += `\n2 DATE ${birthDate}`;
    }

    if (birthPlace !== null) {
      gedcom += `\n2 PLAC ${birthPlace}`;
    }
  }

  gedcom += extraFacts;

  return gedcom;
}

describe('pedigree-map.mjs', () => {
  describe('getSosaName', () => {
    test('self', () => {
      expect(getSosaName(1)).toBe('Self');
    });

    test('father/mother', () => {
      expect(getSosaName(2)).toBe('Father');
      expect(getSosaName(3)).toBe('Mother');
    });

    test('grandparents', () => {
      expect(getSosaName(4)).toBe('Paternal grandfather');
      expect(getSosaName(5)).toBe('Paternal grandmother');
      expect(getSosaName(6)).toBe('Maternal grandfather');
      expect(getSosaName(7)).toBe('Maternal grandmother');
    });
  });

  describe('sosaStradonitzAncestors', () => {
    test('walks a simple two-generation tree', async () => {
      const pool = buildFakePool({
        individuals: {
          I1: individualGedcom(),
          I2: individualGedcom(),
          I3: individualGedcom(),
        },
        families: { F1: { gedcom: '0 FAM\n1 HUSB @I2@\n1 WIFE @I3@', husb: 'I2', wife: 'I3' } },
        links: [
          { from: 'I1', type: 'FAMC', to: 'F1' },
          { from: 'F1', type: 'HUSB', to: 'I2' },
          { from: 'F1', type: 'WIFE', to: 'I3' },
        ],
      });

      // accessLevel 1 (member) - the realistic traversal level, same as
      // every other already-ported chart's own "logged-in member
      // viewing their own tree" test scenario.
      const ancestors = await sosaStradonitzAncestors(pool, GEDCOM_ID, TREE_PRIVACY_PREFS, 1, REL_PREFS, 'I1', 4);

      expect([...ancestors.keys()]).toEqual([1, 2, 3]);
      expect(ancestors.get(1).xref).toBe('I1');
      expect(ancestors.get(2).xref).toBe('I2');
      expect(ancestors.get(3).xref).toBe('I3');
    });

    test('stops at the generations limit', async () => {
      const pool = buildFakePool({
        individuals: { I1: individualGedcom(), I2: individualGedcom(), I3: individualGedcom() },
        families: { F1: { gedcom: '0 FAM\n1 HUSB @I2@\n1 WIFE @I3@', husb: 'I2', wife: 'I3' } },
        links: [
          { from: 'I1', type: 'FAMC', to: 'F1' },
          { from: 'F1', type: 'HUSB', to: 'I2' },
          { from: 'F1', type: 'WIFE', to: 'I3' },
        ],
      });

      // generations=1 -> max = 2**0 = 1, so the root's own sosa (1)
      // already meets the break condition before it's even dequeued.
      const ancestors = await sosaStradonitzAncestors(pool, GEDCOM_ID, TREE_PRIVACY_PREFS, 2, REL_PREFS, 'I1', 1);

      expect([...ancestors.keys()]).toEqual([1]);
    });

    test("a confidential parent blocks the whole family from being climbed through", async () => {
      const pool = buildFakePool({
        individuals: {
          I1: individualGedcom(),
          I2: individualGedcom(),
          I3: individualGedcom({ resn: 'confidential' }),
        },
        families: { F1: { gedcom: '0 FAM\n1 HUSB @I2@\n1 WIFE @I3@', husb: 'I2', wife: 'I3' } },
        links: [
          { from: 'I1', type: 'FAMC', to: 'F1' },
          { from: 'F1', type: 'HUSB', to: 'I2' },
          { from: 'F1', type: 'WIFE', to: 'I3' },
        ],
      });

      // accessLevel 1 (member): confidential (access level 0) still
      // fails. Family::canShowByType() requires EVERY member (not just
      // the one being fetched) to pass canShow(), so I3's confidential
      // RESN hides the whole family - I2 never gets a chance to enter
      // the ancestor set either, same asymmetry as the "private child"
      // case below.
      const ancestors = await sosaStradonitzAncestors(pool, GEDCOM_ID, TREE_PRIVACY_PREFS, 1, REL_PREFS, 'I1', 4);

      expect([...ancestors.keys()]).toEqual([1]);
    });

    test('a private child blocks the whole family from being climbed through', async () => {
      const pool = buildFakePool({
        individuals: {
          I1: individualGedcom(),
          I2: individualGedcom(),
          I3: individualGedcom(),
          I9: individualGedcom({ resn: 'confidential' }), // the private sibling/child
        },
        families: {
          F1: { gedcom: '0 FAM\n1 HUSB @I2@\n1 WIFE @I3@\n1 CHIL @I1@\n1 CHIL @I9@', husb: 'I2', wife: 'I3' },
        },
        links: [
          { from: 'I1', type: 'FAMC', to: 'F1' },
          { from: 'F1', type: 'HUSB', to: 'I2' },
          { from: 'F1', type: 'WIFE', to: 'I3' },
          { from: 'F1', type: 'CHIL', to: 'I1' },
          { from: 'F1', type: 'CHIL', to: 'I9' },
        ],
      });

      const ancestors = await sosaStradonitzAncestors(pool, GEDCOM_ID, TREE_PRIVACY_PREFS, 1, REL_PREFS, 'I1', 4);

      // Family::canShowByType() hides the family entirely because I9
      // (a CHIL member) can't show - so climbing stops at the root,
      // even though I2/I3 would individually have been showable.
      expect([...ancestors.keys()]).toEqual([1]);
    });
  });

  describe('getPedigreeMapFacts', () => {
    test('selects the first birth-type fact with a non-empty place', async () => {
      const pool = buildFakePool({});
      const ancestors = new Map([[1, { xref: 'I1', gedcom: individualGedcom({ birthPlace: 'London, England', birthDate: '1 JAN 1900' }) }]]);

      const facts = await getPedigreeMapFacts(pool, GEDCOM_ID, TREE_PRIVACY_PREFS, 2, REL_PREFS, ancestors);

      expect(facts.get(1).xref).toBe('I1');
      expect(facts.get(1).fact).toContain('London, England');
    });

    test('skips an ancestor whose own birth fact has no place', async () => {
      const pool = buildFakePool({});
      const ancestors = new Map([[1, { xref: 'I1', gedcom: individualGedcom({ birthDate: '1 JAN 1900' }) }]]);

      const facts = await getPedigreeMapFacts(pool, GEDCOM_ID, TREE_PRIVACY_PREFS, 2, REL_PREFS, ancestors);

      expect(facts.has(1)).toBe(false);
    });

    test("prefers an earlier-dated BIRT over a later-dated CHR when both have a place", async () => {
      const pool = buildFakePool({});
      const gedcom = individualGedcom({ birthPlace: 'Paris, France', birthDate: '1 JAN 1900' }) + '\n1 CHR\n2 DATE 1 JAN 1901\n2 PLAC Lyon, France';
      const ancestors = new Map([[1, { xref: 'I1', gedcom }]]);

      const facts = await getPedigreeMapFacts(pool, GEDCOM_ID, TREE_PRIVACY_PREFS, 2, REL_PREFS, ancestors);

      expect(facts.get(1).fact).toContain('Paris, France');
    });

    test('falls through to CHR when BIRT has no place at all', async () => {
      const pool = buildFakePool({});
      const gedcom = individualGedcom({ birthDate: '1 JAN 1900' }) + '\n1 CHR\n2 DATE 1 JAN 1901\n2 PLAC Lyon, France';
      const ancestors = new Map([[1, { xref: 'I1', gedcom }]]);

      const facts = await getPedigreeMapFacts(pool, GEDCOM_ID, TREE_PRIVACY_PREFS, 2, REL_PREFS, ancestors);

      expect(facts.get(1).fact).toContain('Lyon, France');
    });

    test("excludes an ancestor whose full record can't be shown", async () => {
      const pool = buildFakePool({});
      const ancestors = new Map([[1, { xref: 'I1', gedcom: individualGedcom({ resn: 'confidential', birthPlace: 'London, England' }) }]]);

      const facts = await getPedigreeMapFacts(pool, GEDCOM_ID, TREE_PRIVACY_PREFS, 2, REL_PREFS, ancestors);

      expect(facts.has(1)).toBe(false);
    });
  });

  describe('placeLocationCoordinates', () => {
    test('returns null/null for an empty gazetteer', async () => {
      const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };

      const result = await placeLocationCoordinates(pool, 'Westminster, London, England');

      expect(result).toEqual({ latitude: null, longitude: null });
    });

    test('walks parent-first down to the most specific part and returns its coordinates', async () => {
      // England (top) -> London -> Westminster.
      const pool = {
        query: vi.fn(async (sql, params) => {
          if (sql.includes('SELECT id FROM wt_place_location')) {
            const [place, parentId] = params;

            if (place === 'England' && parentId === undefined) {
              return { rows: [{ id: 1 }] };
            }

            if (place === 'London' && parentId === 1) {
              return { rows: [{ id: 2 }] };
            }

            if (place === 'Westminster' && parentId === 2) {
              return { rows: [{ id: 3 }] };
            }

            return { rows: [] };
          }

          if (sql.includes('SELECT latitude, longitude')) {
            expect(params[0]).toBe(3);
            return { rows: [{ latitude: '51.5', longitude: '-0.13' }] };
          }

          throw new Error(`Unexpected query: ${sql}`);
        }),
      };

      const result = await placeLocationCoordinates(pool, 'Westminster, London, England');

      expect(result).toEqual({ latitude: 51.5, longitude: -0.13 });
    });
  });

  describe('buildPedigreeMapData', () => {
    test('builds a feature for a fact with explicit LATI/LONG coordinates', async () => {
      const pool = buildFakePool({});
      const gedcom = individualGedcom({ birthPlace: 'Paris, France', birthDate: '1 JAN 1900' }).replace('2 PLAC Paris, France', '2 PLAC Paris, France\n3 MAP\n4 LATI N48.8566\n4 LONG E2.3522');
      const ancestors = new Map([[1, { xref: 'I1', gedcom }]]);

      const tree = { gedcomId: GEDCOM_ID, name: 'ophir' };
      const geojson = await buildPedigreeMapData(pool, tree, TREE_PRIVACY_PREFS, false, 2, REL_PREFS, null, null, ancestors);

      expect(geojson.type).toBe('FeatureCollection');
      expect(geojson.features).toHaveLength(1);
      expect(geojson.features[0].id).toBe(1);
      expect(geojson.features[0].geometry.coordinates).toEqual([2.3522, 48.8566]);
      expect(geojson.features[0].properties.polyline).toBeNull();
      expect(geojson.features[0].properties.summary).toContain('Paris, France');
    });

    test('builds a polyline between a child and its already-placed parent', async () => {
      const pool = buildFakePool({});
      const parentGedcom = individualGedcom({ birthPlace: 'London, England', birthDate: '1 JAN 1870' }).replace(
        '2 PLAC London, England',
        '2 PLAC London, England\n3 MAP\n4 LATI N51.5\n4 LONG W0.13',
      );
      const childGedcom = individualGedcom({ birthPlace: 'Paris, France', birthDate: '1 JAN 1900' }).replace(
        '2 PLAC Paris, France',
        '2 PLAC Paris, France\n3 MAP\n4 LATI N48.8566\n4 LONG E2.3522',
      );
      // sosa 1 = child, sosa 2 = child's father - Map insertion order
      // matters here (matches sosaStradonitzAncestors()'s own BFS order).
      const ancestors = new Map([
        [1, { xref: 'I1', gedcom: childGedcom }],
        [2, { xref: 'I2', gedcom: parentGedcom }],
      ]);

      const tree = { gedcomId: GEDCOM_ID, name: 'ophir' };
      const geojson = await buildPedigreeMapData(pool, tree, TREE_PRIVACY_PREFS, false, 2, REL_PREFS, null, null, ancestors);

      expect(geojson.features).toHaveLength(2);
      const childFeature = geojson.features.find((f) => f.id === 2);

      // Mirrors PedigreeMapModule::getMapData()'s own polyline shape
      // EXACTLY: [the already-placed DESCENDANT's point (sosa 1, Paris),
      // this ancestor's OWN point (sosa 2, London)] - not [parent, child].
      expect(childFeature.properties.polyline).not.toBeNull();
      expect(childFeature.properties.polyline.points).toEqual([
        [48.8566, 2.3522],
        [51.5, -0.13],
      ]);
    });

    test('falls back to the place_location gazetteer when a fact has no explicit coordinates', async () => {
      const pool = buildFakePool({});
      pool.query.mockImplementation(async (sql, params) => {
        if (sql.includes('FROM wt_place_location') && sql.startsWith('SELECT id')) {
          return params[0] === 'Narnia' ? { rows: [{ id: 7 }] } : { rows: [] };
        }

        if (sql.includes('SELECT latitude, longitude')) {
          return { rows: [{ latitude: '10', longitude: '20' }] };
        }

        if (sql.includes('FROM wt_default_resn')) {
          return { rows: [] };
        }

        throw new Error(`Unexpected query: ${sql}`);
      });

      const ancestors = new Map([[1, { xref: 'I1', gedcom: individualGedcom({ birthPlace: 'Narnia', birthDate: '1 JAN 1900' }) }]]);
      const tree = { gedcomId: GEDCOM_ID, name: 'ophir' };
      const geojson = await buildPedigreeMapData(pool, tree, TREE_PRIVACY_PREFS, false, 2, REL_PREFS, null, null, ancestors);

      expect(geojson.features).toHaveLength(1);
      expect(geojson.features[0].geometry.coordinates).toEqual([20, 10]);
    });

    test('omits an ancestor with no resolvable coordinates at all', async () => {
      const pool = buildFakePool({});
      const ancestors = new Map([[1, { xref: 'I1', gedcom: individualGedcom({ birthPlace: 'Nowhere', birthDate: '1 JAN 1900' }) }]]);
      const tree = { gedcomId: GEDCOM_ID, name: 'ophir' };
      const geojson = await buildPedigreeMapData(pool, tree, TREE_PRIVACY_PREFS, false, 2, REL_PREFS, null, null, ancestors);

      expect(geojson.features).toHaveLength(0);
    });
  });
});
