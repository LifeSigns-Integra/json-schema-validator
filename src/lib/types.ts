export type Dialect = '2020-12' | 'draft-07';
export type SchemaStatus = 'ACTIVE' | 'RETIRED';

export interface VersionEntry {
  version: number;
  dialect: Dialect;
  /** SHA-256 (hex) of the exact bytes served at `path`. */
  sha256: string;
  /** Path relative to the schemas/ folder, e.g. "patient-vitals/2.json". */
  path: string;
}

export interface SchemaEntry {
  name: string;
  description: string;
  status: SchemaStatus;
  latest: number;
  versions: VersionEntry[];
}

export interface LibraryManifest {
  generatedAt: string;
  schemas: SchemaEntry[];
}

export interface ValidationError {
  instancePath: string;
  schemaPath: string;
  keyword: string;
  message: string;
  /** Ajv's error parameters, e.g. { missingProperty: "timestamp" }. */
  params: Record<string, unknown>;
}

export interface ValidationReport {
  schema: { name: string; version: number; sha256: string };
  library: { generatedAt: string; source: 'online' | 'cache' };
  validatedAt: string;
  valid: boolean;
  errorCount: number;
  /** True when more errors were found than are listed. */
  truncated: boolean;
  errors: ValidationError[];
}
