import safeRegex from 'safe-regex2';
import { createAjv } from '../src/lib/ajv';
import type { Dialect } from '../src/lib/types';

/** Calls `visit` for every object node in a JSON value, with its JSON pointer. */
function walk(node: unknown, pointer: string, visit: (obj: Record<string, unknown>, pointer: string) => void) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walk(item, `${pointer}/${i}`, visit));
  } else if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    visit(obj, pointer);
    for (const [k, v] of Object.entries(obj)) {
      walk(v, `${pointer}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`, visit);
    }
  }
}

/** Only local references ("#/...") are allowed: no network fetches, no cross-file refs. */
export function findRemoteRefs(schema: unknown): string[] {
  const found: string[] = [];
  walk(schema, '#', (obj, ptr) => {
    for (const key of ['$ref', '$dynamicRef', '$recursiveRef']) {
      const ref = obj[key];
      if (typeof ref === 'string' && !ref.startsWith('#')) found.push(`${ptr}/${key} = "${ref}"`);
    }
  });
  return found;
}

/** Regexes with nested quantifiers can take exponential time (ReDoS). */
export function findUnsafePatterns(schema: unknown): string[] {
  const found: string[] = [];
  const check = (source: string, where: string) => {
    let ok: boolean;
    try {
      new RegExp(source, 'u');
      ok = safeRegex(source);
    } catch {
      found.push(`${where}: not a valid regular expression: ${source}`);
      return;
    }
    if (!ok) found.push(`${where}: potentially catastrophic backtracking: ${source}`);
  };
  walk(schema, '#', (obj, ptr) => {
    if (typeof obj.pattern === 'string') check(obj.pattern, `${ptr}/pattern`);
    const pp = obj.patternProperties;
    if (pp && typeof pp === 'object' && !Array.isArray(pp)) {
      for (const key of Object.keys(pp)) check(key, `${ptr}/patternProperties`);
    }
  });
  return found;
}

/** Meta-validates and compiles the schema exactly as the browser will. */
export function compileProblems(schema: unknown, dialect: Dialect): string[] {
  try {
    createAjv(dialect).compile(schema as object);
    return [];
  } catch (e) {
    return [(e as Error).message];
  }
}
