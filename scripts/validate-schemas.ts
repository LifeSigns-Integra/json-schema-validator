/**
 * CI gate for the schema library. Fails if any schema is malformed, does not
 * compile, references remote schemas, or contains an unsafe regex.
 *
 *   npm run validate-schemas
 */
import { resolve } from 'node:path';
import { loadLibrary } from './library';
import { compileProblems, findRemoteRefs, findUnsafePatterns } from './schema-checks';

const root = resolve(process.argv[2] ?? 'schemas');
const { schemas, problems } = loadLibrary(root);

for (const s of schemas) {
  for (const v of s.versions) {
    const where = v.path;
    for (const p of compileProblems(v.schema, v.dialect)) problems.push(`${where}: does not compile: ${p}`);
    for (const p of findRemoteRefs(v.schema)) problems.push(`${where}: remote reference not allowed: ${p}`);
    for (const p of findUnsafePatterns(v.schema)) problems.push(`${where}: ${p}`);
  }
}

if (problems.length > 0) {
  console.error(`Schema library check failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const versionCount = schemas.reduce((n, s) => n + s.versions.length, 0);
console.log(`Schema library OK: ${schemas.length} schemas, ${versionCount} versions.`);
