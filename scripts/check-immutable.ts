/**
 * Published schema versions are immutable. On a pull request, fail if any
 * existing schemas/<name>/<n>.json was modified, renamed or deleted.
 * New version files and meta.json edits are allowed.
 *
 *   npm run check-immutable -- origin/main
 */
import { execFileSync } from 'node:child_process';

const base = process.argv[2] ?? 'origin/main';
const VERSION_PATH = /^schemas\/[^/]+\/[1-9][0-9]*\.json$/;

const diff = execFileSync('git', ['diff', '--name-status', '--no-renames', `${base}...HEAD`, '--', 'schemas/'], {
  encoding: 'utf8',
});

const violations = diff
  .split('\n')
  .filter(Boolean)
  .map((line) => line.split('\t') as [string, string])
  .filter(([status, path]) => status !== 'A' && VERSION_PATH.test(path))
  .map(([status, path]) => `${path} (${status === 'D' ? 'deleted' : 'modified'})`);

if (violations.length > 0) {
  console.error('Published schema versions cannot be changed. Add a new version file instead:');
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`No published schema versions changed relative to ${base}.`);
