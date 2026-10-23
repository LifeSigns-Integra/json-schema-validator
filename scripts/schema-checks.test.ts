import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLibrary, toManifest } from './library';
import { compileProblems, findRemoteRefs, findUnsafePatterns } from './schema-checks';

const S2020 = 'https://json-schema.org/draft/2020-12/schema';

function library(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'schemas-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

const META = JSON.stringify({ description: 'Test', status: 'ACTIVE' });

describe('schema checks', () => {
  it('rejects remote references', () => {
    expect(findRemoteRefs({ properties: { a: { $ref: 'https://example.com/a.json' }, b: { $ref: '#/$defs/b' } } })).toHaveLength(1);
  });

  it('rejects regexes prone to catastrophic backtracking', () => {
    expect(findUnsafePatterns({ pattern: '^(a+)+$' })).toHaveLength(1);
    expect(findUnsafePatterns({ patternProperties: { '^x-': {} }, pattern: '^P-[0-9]{3}$' })).toHaveLength(0);
  });

  it('reports schemas that do not compile', () => {
    expect(compileProblems({ $schema: S2020, type: 'nonsense' }, '2020-12')).toHaveLength(1);
    expect(compileProblems({ $schema: S2020, type: 'string' }, '2020-12')).toHaveLength(0);
  });
});

describe('loadLibrary', () => {
  it('builds a manifest with checksums and the latest version', () => {
    const root = library({
      'orders/meta.json': META,
      'orders/1.json': JSON.stringify({ $schema: S2020, type: 'object' }),
      'orders/2.json': JSON.stringify({ $schema: S2020, type: 'object', required: ['id'] }),
    });
    const { schemas, problems } = loadLibrary(root);
    expect(problems).toEqual([]);
    const m = toManifest(schemas, '2026-01-01T00:00:00Z');
    expect(m.schemas[0].latest).toBe(2);
    expect(m.schemas[0].versions[1].sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('flags gaps, missing $schema and bad file names', () => {
    const root = library({
      'orders/meta.json': META,
      'orders/1.json': JSON.stringify({ $schema: S2020 }),
      'orders/3.json': JSON.stringify({ type: 'object' }),
      'orders/notes.txt': 'hi',
      'Bad_Name/meta.json': META,
    });
    const { problems } = loadLibrary(root);
    expect(problems.join('\n')).toMatch(/kebab-case/);
    expect(problems.join('\n')).toMatch(/notes\.txt/);
    expect(problems.join('\n')).toMatch(/"\$schema" must be/);
  });

  it('flags version gaps', () => {
    const root = library({
      'orders/meta.json': META,
      'orders/1.json': JSON.stringify({ $schema: S2020 }),
      'orders/3.json': JSON.stringify({ $schema: S2020 }),
    });
    expect(loadLibrary(root).problems.join('\n')).toMatch(/no gaps/);
  });
});
