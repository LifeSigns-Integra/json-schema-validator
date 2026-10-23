import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { detectDialect } from '../src/lib/ajv';
import type { LibraryManifest, SchemaEntry, SchemaStatus, VersionEntry } from '../src/lib/types';

export const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const VERSION_FILE_RE = /^([1-9][0-9]*)\.json$/;

export interface LoadedVersion extends VersionEntry {
  file: string;
  bytes: Buffer;
  schema: unknown;
}

export interface LoadedSchema extends Omit<SchemaEntry, 'versions'> {
  versions: LoadedVersion[];
}

export interface LoadResult {
  schemas: LoadedSchema[];
  problems: string[];
}

/**
 * Reads schemas/<name>/meta.json and schemas/<name>/<n>.json.
 * Collects every structural problem instead of stopping at the first one,
 * so a pull request shows all of them in one CI run.
 */
export function loadLibrary(root: string): LoadResult {
  const problems: string[] = [];
  const schemas: LoadedSchema[] = [];
  if (!existsSync(root)) return { schemas, problems: [`${root} does not exist`] };

  for (const name of readdirSync(root).sort()) {
    const dir = join(root, name);
    if (!statSync(dir).isDirectory()) {
      problems.push(`${name}: only folders are allowed directly under schemas/`);
      continue;
    }
    if (!NAME_RE.test(name)) {
      problems.push(`${name}: folder name must be lowercase kebab-case`);
      continue;
    }

    const metaFile = join(dir, 'meta.json');
    let description = '';
    let status: SchemaStatus = 'ACTIVE';
    if (!existsSync(metaFile)) {
      problems.push(`${name}: missing meta.json`);
    } else {
      try {
        const meta = JSON.parse(readFileSync(metaFile, 'utf8')) as Record<string, unknown>;
        if (typeof meta.description !== 'string' || meta.description.trim() === '') {
          problems.push(`${name}/meta.json: "description" must be a non-empty string`);
        } else {
          description = meta.description;
        }
        if (meta.status !== 'ACTIVE' && meta.status !== 'RETIRED') {
          problems.push(`${name}/meta.json: "status" must be "ACTIVE" or "RETIRED"`);
        } else {
          status = meta.status;
        }
      } catch (e) {
        problems.push(`${name}/meta.json: invalid JSON (${(e as Error).message})`);
      }
    }

    const versions: LoadedVersion[] = [];
    for (const file of readdirSync(dir)) {
      if (file === 'meta.json') continue;
      const m = VERSION_FILE_RE.exec(file);
      if (!m) {
        problems.push(`${name}/${file}: unexpected file; versions must be named 1.json, 2.json, ...`);
        continue;
      }
      const bytes = readFileSync(join(dir, file));
      let schema: unknown;
      try {
        schema = JSON.parse(bytes.toString('utf8'));
      } catch (e) {
        problems.push(`${name}/${file}: invalid JSON (${(e as Error).message})`);
        continue;
      }
      const dialect = detectDialect(schema);
      if (!dialect) {
        problems.push(
          `${name}/${file}: "$schema" must be draft 2020-12 or draft-07 ` +
            '(e.g. "https://json-schema.org/draft/2020-12/schema")',
        );
        continue;
      }
      versions.push({
        version: Number(m[1]),
        dialect,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        path: `${name}/${file}`,
        file: join(dir, file),
        bytes,
        schema,
      });
    }

    versions.sort((a, b) => a.version - b.version);
    if (versions.length === 0) {
      problems.push(`${name}: no version files`);
      continue;
    }
    versions.forEach((v, i) => {
      if (v.version !== i + 1) problems.push(`${name}: versions must be 1..n with no gaps (found ${v.version} at position ${i + 1})`);
    });

    schemas.push({ name, description, status, latest: versions[versions.length - 1].version, versions });
  }

  if (schemas.length === 0 && problems.length === 0) problems.push('schemas/ contains no schemas');
  return { schemas, problems };
}

export function toManifest(schemas: LoadedSchema[], generatedAt = new Date().toISOString()): LibraryManifest {
  return {
    generatedAt,
    schemas: schemas.map((s) => ({
      name: s.name,
      description: s.description,
      status: s.status,
      latest: s.latest,
      versions: s.versions.map(({ version, dialect, sha256, path }) => ({ version, dialect, sha256, path })),
    })),
  };
}
