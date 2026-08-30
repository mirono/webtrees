import { canonicalTag, readLatitude, readLongitude } from '../lib/services/gedcom-service.js';
import goldenCanonicalTag from '../golden/gedcom_service_canonical_tag.json';
import goldenReadDegrees from '../golden/gedcom_service_read_degrees.json';

describe('GedcomService.canonicalTag parity with PHP', () => {
  goldenCanonicalTag.forEach(({ input, output }, i) => {
    test(`case ${i}: ${JSON.stringify(input.tag)}`, () => {
      expect(canonicalTag(input.tag)).toEqual(output);
    });
  });
});

describe('GedcomService.readLatitude/readLongitude parity with PHP', () => {
  const readLatitudeGolden = goldenReadDegrees.filter(({ input }) => input.method === 'readLatitude');
  const readLongitudeGolden = goldenReadDegrees.filter(({ input }) => input.method === 'readLongitude');

  describe('readLatitude', () => {
    readLatitudeGolden.forEach(({ input, output }, i) => {
      test(`case ${i}: ${JSON.stringify(input.text)}`, () => {
        expect(readLatitude(input.text)).toEqual(output);
      });
    });
  });

  describe('readLongitude', () => {
    readLongitudeGolden.forEach(({ input, output }, i) => {
      test(`case ${i}: ${JSON.stringify(input.text)}`, () => {
        expect(readLongitude(input.text)).toEqual(output);
      });
    });
  });
});
