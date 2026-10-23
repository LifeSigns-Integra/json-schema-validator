import { displayPath } from '../lib/errors';
import type { SyntaxProblem } from '../lib/locate';
import type { ValidationReport } from '../lib/types';

export type ResultState =
  | { kind: 'idle' }
  | { kind: 'syntax'; problem: SyntaxProblem }
  | { kind: 'running' }
  | { kind: 'failed'; message: string }
  | { kind: 'done'; report: ValidationReport; outdated: boolean; durationMs: number };

interface Props {
  state: ResultState;
  onSelectError(index: number): void;
  onSelectSyntax(): void;
  onDownload(report: ValidationReport): void;
}

export function ResultPanel({ state, onSelectError, onSelectSyntax, onDownload }: Props) {
  switch (state.kind) {
    case 'idle':
      return (
        <div className="result-empty">
          <p className="result-empty-title">No result yet</p>
          <p>
            Paste a JSON document on the left, then press <strong>Validate</strong> or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>.
          </p>
          <p className="muted">Your JSON stays in this browser. Nothing is uploaded.</p>
        </div>
      );

    case 'syntax':
      return (
        <div className="result">
          <div className="banner banner-bad" role="status">
            <strong>Not valid JSON</strong>
            <span>Fix the syntax before validating against a schema.</span>
          </div>
          <button type="button" className="syntax-row" onClick={onSelectSyntax}>
            <span className="mono">
              Line {state.problem.line}, column {state.problem.column}
            </span>
            <span>{state.problem.message}</span>
          </button>
        </div>
      );

    case 'running':
      return (
        <div className="result-empty" role="status">
          <p className="result-empty-title">Validating…</p>
        </div>
      );

    case 'failed':
      return (
        <div className="result">
          <div className="banner banner-bad" role="alert">
            <strong>Validation could not run</strong>
            <span>{state.message}</span>
          </div>
        </div>
      );

    case 'done': {
      const { report, outdated } = state;
      return (
        <div className={`result${outdated ? ' result-outdated' : ''}`}>
          <div className={`banner ${report.valid ? 'banner-ok' : 'banner-bad'}`} role="status">
            <strong>
              {report.valid
                ? 'Valid'
                : `Invalid · ${report.errorCount} error${report.errorCount === 1 ? '' : 's'}`}
            </strong>
            <span>
              against <span className="mono">{report.schema.name}</span> v{report.schema.version}
              {report.library.source === 'cache' && ' (saved offline library)'} · {state.durationMs} ms
            </span>
          </div>

          {outdated && <p className="note">The document or schema changed since this result. Validate again to refresh it.</p>}

          {report.errors.length > 0 && (
            <table className="errors">
              <thead>
                <tr>
                  <th scope="col">Path</th>
                  <th scope="col">Problem</th>
                  <th scope="col">Rule</th>
                </tr>
              </thead>
              <tbody>
                {report.errors.map((e, i) => (
                  <tr key={i} tabIndex={0} onClick={() => onSelectError(i)} onKeyDown={(ev) => ev.key === 'Enter' && onSelectError(i)}>
                    <td className="mono">{displayPath(e.instancePath)}</td>
                    <td>{e.message}</td>
                    <td className="mono muted rule" title={e.schemaPath}>
                      {e.keyword}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {report.truncated && (
            <p className="note">Showing the first {report.errors.length} of {report.errorCount} errors.</p>
          )}

          <div className="result-actions">
            <button type="button" className="btn" onClick={() => onDownload(report)}>
              Download report
            </button>
          </div>
        </div>
      );
    }
  }
}
