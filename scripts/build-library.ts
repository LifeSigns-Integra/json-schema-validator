/**
 * Copies schemas/ into public/schemas/ byte for byte and writes manifest.json
 * with a SHA-256 per version. Vite then ships public/ as-is.
 *
 *   npm run library
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { loadLibrary, toManifest } from './library';

const src = resolve('schemas');
const out = resolve('public/schemas');

const { schemas, problems } = loadLibrary(src);
if (problems.length > 0) {
  console.error('Cannot build the schema library; run `npm run validate-schemas` for details:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
for (const s of schemas) {
  for (const v of s.versions) {
    const target = join(out, v.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, v.bytes);
  }
}

const manifest = toManifest(schemas);
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote public/schemas/manifest.json (${schemas.length} schemas, generatedAt ${manifest.generatedAt}).`);
