import Ajv, { type Options } from 'ajv';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { Dialect } from './types';

/**
 * One place that decides how schemas are compiled. The browser worker and the
 * CI schema check both use it, so a schema that passes CI behaves the same in
 * every user's browser.
 */
const OPTIONS: Options = {
  allErrors: true,
  // Unknown keywords and formats are errors (catches typos like "requried"),
  // but valid schema styles such as `required` without `properties` are allowed.
  strict: true,
  strictRequired: false,
  strictTypes: false,
  strictTuples: false,
  // Never fetch referenced schemas over the network.
  loadSchema: undefined,
  // Validation must not change the user's document.
  useDefaults: false,
  coerceTypes: false,
  removeAdditional: false,
};

const DIALECT_URIS: Record<string, Dialect> = {
  'https://json-schema.org/draft/2020-12/schema': '2020-12',
  'http://json-schema.org/draft-07/schema': 'draft-07',
  'http://json-schema.org/draft-07/schema#': 'draft-07',
  'https://json-schema.org/draft-07/schema': 'draft-07',
  'https://json-schema.org/draft-07/schema#': 'draft-07',
};

/** Reads the dialect from a schema's `$schema` keyword; null if missing or unsupported. */
export function detectDialect(schema: unknown): Dialect | null {
  if (typeof schema !== 'object' || schema === null) return null;
  const uri = (schema as Record<string, unknown>).$schema;
  return typeof uri === 'string' ? (DIALECT_URIS[uri] ?? null) : null;
}

export function createAjv(dialect: Dialect): Ajv {
  const ajv = dialect === '2020-12' ? new Ajv2020(OPTIONS) : new Ajv(OPTIONS);
  addFormats(ajv);
  return ajv;
}
