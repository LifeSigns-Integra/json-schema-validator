/// <reference lib="webworker" />
import type { ValidateFunction } from 'ajv';
import { createAjv } from './lib/ajv';
import { summarize } from './lib/errors';
import type { Dialect } from './lib/types';
import type { WorkerRequest, WorkerResponse } from './lib/validatorClient';

/**
 * Validation runs here, off the main thread, so a huge document or a slow
 * regex cannot freeze the page. The main thread terminates this worker if it
 * does not answer in time.
 */
const compiled = new Map<string, ValidateFunction>();

function getValidator(key: string, dialect: Dialect, schema: object): ValidateFunction {
  let fn = compiled.get(key);
  if (!fn) {
    fn = createAjv(dialect).compile(schema);
    compiled.set(key, fn);
  }
  return fn;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, key, dialect, schema, data } = event.data;
  let response: WorkerResponse;
  try {
    const started = performance.now();
    const validate = getValidator(key, dialect, schema);
    const valid = validate(data) as boolean;
    response = { id, ok: true, valid, durationMs: Math.round(performance.now() - started), ...summarize(validate.errors) };
  } catch (e) {
    response = { id, ok: false, message: `Could not compile the schema: ${(e as Error).message}` };
  }
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
};
