import type { LibrarySource } from './library';
import type { VersionEntry, ValidationReport } from './types';
import type { ValidationOutcome } from './validatorClient';

export function buildReport(
  schemaName: string,
  version: VersionEntry,
  library: { generatedAt: string; source: LibrarySource },
  outcome: ValidationOutcome,
  now = new Date(),
): ValidationReport {
  return {
    schema: { name: schemaName, version: version.version, sha256: version.sha256 },
    library,
    validatedAt: localIso(now),
    valid: outcome.valid,
    errorCount: outcome.errorCount,
    truncated: outcome.truncated,
    errors: outcome.errors,
  };
}

/** ISO 8601 with the user's UTC offset, e.g. 2026-10-23T14:50:12+05:30. */
export function localIso(d: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(off / 60)}:${pad(off % 60)}`
  );
}

export function downloadReport(report: ValidationReport) {
  const blob = new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `validation-${report.schema.name}-v${report.schema.version}-${report.valid ? 'valid' : 'invalid'}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
