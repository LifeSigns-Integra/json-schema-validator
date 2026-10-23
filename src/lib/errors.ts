import type { ErrorObject } from 'ajv';
import type { ValidationError } from './types';

export const MAX_ERRORS = 500;

const list = (values: unknown[]) => values.map((v) => JSON.stringify(v)).join(', ');

/** Turns an Ajv error into the report format with a message a person can act on. */
export function toValidationError(e: ErrorObject): ValidationError {
  const p = e.params as Record<string, unknown>;
  let message = e.message ?? 'is invalid';
  switch (e.keyword) {
    case 'required':
      message = `missing required property "${String(p.missingProperty)}"`;
      break;
    case 'additionalProperties':
      message = `property "${String(p.additionalProperty)}" is not allowed`;
      break;
    case 'unevaluatedProperties':
      message = `property "${String(p.unevaluatedProperty)}" is not allowed`;
      break;
    case 'enum':
      message = `must be one of ${list(p.allowedValues as unknown[])}`;
      break;
    case 'const':
      message = `must be ${JSON.stringify(p.allowedValue)}`;
      break;
    case 'type':
      message = `must be ${String(p.type)}`;
      break;
    case 'format':
      message = `must be a valid ${String(p.format)}`;
      break;
  }
  return { instancePath: e.instancePath, schemaPath: e.schemaPath, keyword: e.keyword, message, params: p };
}

export function summarize(errors: ErrorObject[] | null | undefined): {
  errors: ValidationError[];
  errorCount: number;
  truncated: boolean;
} {
  const all = errors ?? [];
  return {
    errors: all.slice(0, MAX_ERRORS).map(toValidationError),
    errorCount: all.length,
    truncated: all.length > MAX_ERRORS,
  };
}

/** "/alarms/0/code" → "alarms[0].code"; "" → "(root)". For display only. */
export function displayPath(instancePath: string): string {
  if (instancePath === '') return '(root)';
  return parsePointer(instancePath)
    .map((seg, i) => (/^\d+$/.test(seg) ? `[${seg}]` : /^[A-Za-z_$][\w$]*$/.test(seg) ? (i === 0 ? seg : `.${seg}`) : `[${JSON.stringify(seg)}]`))
    .join('');
}

export function parsePointer(pointer: string): string[] {
  if (pointer === '') return [];
  return pointer
    .slice(1)
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}
