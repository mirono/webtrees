import { describe, expect, test } from 'vitest';
import { renderConfigYaml } from '../setup-cli/config-writer.mjs';

// setup-cli/config-writer.mjs is hand-rolled (see its header comment)
// rather than using a YAML library, precisely because it only ever
// needs to emit this one flat, single-level string-map shape correctly.
// These cases are cross-checked against real Symfony\Component\Yaml\Yaml
// parsing on the PHP side (see
// docs/php-to-js-migration/phase5-postgres-setup-cli.md's verification
// section) - this file only proves the JS emitter's own output shape.
describe('renderConfigYaml', () => {
  test('renders a flat string map, one "key: \\"value\\"" line per entry, in insertion order', () => {
    const yaml = renderConfigYaml({ dbtype: 'pgsql', dbport: '5432' });

    expect(yaml).toBe('dbtype: "pgsql"\ndbport: "5432"\n');
  });

  test('escapes embedded double quotes', () => {
    const yaml = renderConfigYaml({ dbuser: 'wt"user' });

    expect(yaml).toBe('dbuser: "wt\\"user"\n');
  });

  test('escapes embedded backslashes before quotes are escaped (no double-escaping)', () => {
    const yaml = renderConfigYaml({ dbpass: 'p@ss\\word' });

    expect(yaml).toBe('dbpass: "p@ss\\\\word"\n');
  });

  test('empty string value renders as an empty quoted string', () => {
    const yaml = renderConfigYaml({ block_asn: '' });

    expect(yaml).toBe('block_asn: ""\n');
  });

  test('empty config renders as an empty string', () => {
    expect(renderConfigYaml({})).toBe('\n');
  });
});
