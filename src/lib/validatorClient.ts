import type { Dialect, ValidationError } from './types';

export interface WorkerRequest {
  id: number;
  /** "<name>@<version>"; the worker compiles each key once. */
  key: string;
  dialect: Dialect;
  schema: object;
  data: unknown;
}

export type WorkerResponse =
  | { id: number; ok: true; valid: boolean; durationMs: number; errors: ValidationError[]; errorCount: number; truncated: boolean }
  | { id: number; ok: false; message: string };

export type ValidationOutcome = Extract<WorkerResponse, { ok: true }>;

export class ValidationTimeoutError extends Error {
  constructor(seconds: number) {
    super(
      `Validation did not finish within ${seconds} s and was stopped. ` +
        'The document may be very large, or the schema may contain a slow pattern.',
    );
  }
}

const TIMEOUT_MS = 5000;

/** Owns the validation worker; replaces it if a run has to be killed. */
export class ValidatorClient {
  private worker: Worker | null = null;
  private nextId = 1;

  private getWorker(): Worker {
    this.worker ??= new Worker(new URL('../validator.worker.ts', import.meta.url), { type: 'module' });
    return this.worker;
  }

  private kill() {
    this.worker?.terminate();
    this.worker = null;
  }

  validate(req: Omit<WorkerRequest, 'id'>): Promise<ValidationOutcome> {
    const id = this.nextId++;
    const worker = this.getWorker();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
      };
      const timer = setTimeout(() => {
        cleanup();
        this.kill(); // the worker may be stuck in a loop; start fresh next time
        reject(new ValidationTimeoutError(TIMEOUT_MS / 1000));
      }, TIMEOUT_MS);
      const onMessage = (e: MessageEvent<WorkerResponse>) => {
        if (e.data.id !== id) return;
        cleanup();
        if (e.data.ok) resolve(e.data);
        else reject(new Error(e.data.message));
      };
      const onError = (e: ErrorEvent) => {
        cleanup();
        this.kill();
        reject(new Error(e.message || 'The validation worker crashed'));
      };
      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage({ id, ...req } satisfies WorkerRequest);
    });
  }

  dispose() {
    this.kill();
  }
}
