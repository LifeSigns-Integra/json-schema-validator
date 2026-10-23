import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { JsonEditor, type JsonEditorHandle } from './components/JsonEditor';
import { ResultPanel, type ResultState } from './components/ResultPanel';
import { StatusBadge } from './components/StatusBadge';
import { UpdatePrompt } from './components/UpdatePrompt';
import { recallSchema, rememberSchema, useDebounced, useNow, useOnline, usePrefersDark } from './hooks';
import {
  activeSchemas,
  loadManifest,
  loadSchemaVersion,
  prefetchLibrary,
  requestPersistentStorage,
  type LoadedManifest,
} from './lib/library';
import { buildTree, locate, parseJson, type Span } from './lib/locate';
import { buildReport, downloadReport } from './lib/report';
import type { VersionEntry } from './lib/types';
import { ValidatorClient } from './lib/validatorClient';

/** Above this size the editor stops re-parsing on every keystroke. */
const LIVE_PARSE_LIMIT = 2 * 1024 * 1024;
const LARGE_DOC = 10 * 1024 * 1024;

type SchemaState =
  | { status: 'none' }
  | { status: 'loading'; key: string }
  | { status: 'ready'; key: string; schema: object }
  | { status: 'error'; key: string; message: string };

interface ValidatedFor {
  text: string;
  key: string;
  spans: (Span | null)[];
}

const formatSize = (chars: number) =>
  chars > 1024 * 1024 ? `${(chars / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(chars / 1024)} KB`;

export default function App() {
  const online = useOnline();
  const dark = usePrefersDark();
  const now = useNow();
  const editor = useRef<JsonEditorHandle>(null);
  const client = useMemo(() => new ValidatorClient(), []);
  useEffect(() => () => client.dispose(), [client]);

  // ---- Schema library -------------------------------------------------------
  const [lib, setLib] = useState<LoadedManifest | null>(null);
  const [libError, setLibError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadManifest()
      .then((loaded) => {
        if (cancelled) return;
        setLib(loaded);
        setLibError(null);
        if (loaded.source === 'online') void prefetchLibrary(loaded.manifest);
      })
      .catch((e: Error) => !cancelled && setLibError(e.message));
    return () => {
      cancelled = true;
    };
  }, [online, reloadToken]); // refresh whenever the connection comes back

  useEffect(() => void requestPersistentStorage(), []);

  const schemas = useMemo(() => (lib ? activeSchemas(lib.manifest) : []), [lib]);
  const [schemaName, setSchemaName] = useState<string | null>(null);
  const [versionChoice, setVersionChoice] = useState<number | 'latest'>('latest');

  // Pick a default schema (last used, else the first) once the library is known.
  useEffect(() => {
    if (schemas.length === 0) return;
    if (schemaName && schemas.some((s) => s.name === schemaName)) return;
    const remembered = recallSchema();
    setSchemaName(schemas.some((s) => s.name === remembered) ? remembered : schemas[0].name);
    setVersionChoice('latest');
  }, [schemas, schemaName]);

  const entry = schemas.find((s) => s.name === schemaName) ?? null;
  const version: VersionEntry | null = entry
    ? (entry.versions.find((v) => v.version === (versionChoice === 'latest' ? entry.latest : versionChoice)) ?? null)
    : null;
  const schemaKey = entry && version ? `${entry.name}@${version.version}#${version.sha256}` : null;

  const [schemaState, setSchemaState] = useState<SchemaState>({ status: 'none' });
  useEffect(() => {
    if (!version || !schemaKey) {
      setSchemaState({ status: 'none' });
      return;
    }
    let cancelled = false;
    setSchemaState({ status: 'loading', key: schemaKey });
    loadSchemaVersion(version)
      .then((schema) => !cancelled && setSchemaState({ status: 'ready', key: schemaKey, schema }))
      .catch((e: Error) => !cancelled && setSchemaState({ status: 'error', key: schemaKey, message: e.message }));
    return () => {
      cancelled = true;
    };
    // schemaKey covers name, version and checksum, so `version` need not be a dependency.
  }, [schemaKey]);

  const schema = schemaState.status === 'ready' ? schemaState.schema : null;

  // ---- Document -------------------------------------------------------------
  const [text, setText] = useState('');
  const debouncedText = useDebounced(text, 250);
  const liveParse = useMemo(
    () => (debouncedText.trim() === '' || debouncedText.length > LIVE_PARSE_LIMIT ? null : parseJson(debouncedText)),
    [debouncedText],
  );

  useEffect(() => {
    editor.current?.setMarkers('syntax', liveParse && !liveParse.ok ? [liveParse.problem] : []);
  }, [liveParse]);

  // ---- Validation -----------------------------------------------------------
  const [result, setResult] = useState<ResultState>({ kind: 'idle' });
  const [validatedFor, setValidatedFor] = useState<ValidatedFor | null>(null);
  const [tab, setTab] = useState<'result' | 'schema'>('result');

  // Error markers point into the text as it was validated; drop them once it changes.
  useEffect(() => {
    if (validatedFor && validatedFor.text !== text) editor.current?.setMarkers('schema', []);
  }, [text, validatedFor]);

  const canValidate = schemaState.status === 'ready' && text.trim() !== '' && !(liveParse && !liveParse.ok);

  const validate = useCallback(async () => {
    if (schemaState.status !== 'ready' || !entry || !version || !lib) return;
    setTab('result');
    const parsed = parseJson(text);
    if (!parsed.ok) {
      editor.current?.setMarkers('syntax', [parsed.problem]);
      setResult({ kind: 'syntax', problem: parsed.problem });
      return;
    }
    setResult({ kind: 'running' });
    try {
      const outcome = await client.validate({
        key: schemaState.key,
        dialect: version.dialect,
        schema: schemaState.schema,
        data: parsed.value,
      });
      const report = buildReport(entry.name, version, { generatedAt: lib.manifest.generatedAt, source: lib.source }, outcome);
      const tree = buildTree(text);
      const spans = report.errors.map((e) => locate(tree, e));
      editor.current?.setMarkers(
        'schema',
        report.errors.flatMap((e, i) => (spans[i] ? [{ ...spans[i], message: `${e.message} (${e.keyword})` }] : [])),
      );
      setValidatedFor({ text, key: schemaState.key, spans });
      setResult({ kind: 'done', report, outdated: false, durationMs: outcome.durationMs });
    } catch (e) {
      setResult({ kind: 'failed', message: (e as Error).message });
    }
  }, [client, entry, lib, schemaState, text, version]);

  const shown: ResultState =
    result.kind === 'done' && validatedFor
      ? { ...result, outdated: validatedFor.text !== text || validatedFor.key !== schemaKey }
      : result;

  // ---- Render ---------------------------------------------------------------
  if (!lib) {
    return (
      <div className="app">
        <Topbar online={online} lib={null} now={now} />
        <div className="center-message">
          {libError ? (
            <>
              <p className="result-empty-title">Schema library unavailable</p>
              <p>{libError}</p>
              <button type="button" className="btn btn-primary" onClick={() => setReloadToken((n) => n + 1)}>
                Try again
              </button>
            </>
          ) : (
            <p>Loading schema library…</p>
          )}
        </div>
        <UpdatePrompt />
      </div>
    );
  }

  return (
    <div className="app">
      <Topbar online={online} lib={lib} now={now} />

      <div className="toolbar">
        <label className="field">
          <span>Schema</span>
          <select
            value={schemaName ?? ''}
            onChange={(e) => {
              setSchemaName(e.target.value);
              setVersionChoice('latest');
              rememberSchema(e.target.value);
            }}
          >
            {schemas.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Version</span>
          <select
            value={String(versionChoice)}
            onChange={(e) => setVersionChoice(e.target.value === 'latest' ? 'latest' : Number(e.target.value))}
            disabled={!entry}
          >
            {entry && <option value="latest">Latest (v{entry.latest})</option>}
            {entry?.versions
              .slice()
              .reverse()
              .map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version} · {v.dialect}
                </option>
              ))}
          </select>
        </label>

        {entry && <p className="schema-desc">{entry.description}</p>}

        <div className="toolbar-actions">
          {text.length > LARGE_DOC && <span className="muted">Large document ({formatSize(text.length)})</span>}
          <button type="button" className="btn" onClick={() => editor.current?.format()} disabled={!liveParse?.ok}>
            Format
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void validate()}
            disabled={!canValidate || result.kind === 'running'}
            title="Ctrl+Enter"
          >
            Validate
          </button>
        </div>
      </div>

      <main className="workspace">
        <section className="pane editor-pane" aria-label="JSON input">
          <JsonEditor
            ref={editor}
            value={text}
            onChange={setText}
            onValidateShortcut={() => void validate()}
            dark={dark}
            schema={schema}
          />
        </section>

        <section className="pane result-pane" aria-label="Result">
          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'result'} onClick={() => setTab('result')}>
              Result
            </button>
            <button type="button" role="tab" aria-selected={tab === 'schema'} onClick={() => setTab('schema')}>
              Schema
            </button>
          </div>
          <div className="pane-body">
            {tab === 'result' ? (
              schemaState.status === 'error' ? (
                <div className="result">
                  <div className="banner banner-bad" role="alert">
                    <strong>Schema unavailable</strong>
                    <span>{schemaState.message}</span>
                  </div>
                </div>
              ) : (
                <ResultPanel
                  state={shown}
                  onSelectError={(i) => {
                    const span = validatedFor?.spans[i];
                    if (span && validatedFor?.text === text) editor.current?.reveal(span);
                  }}
                  onSelectSyntax={() => result.kind === 'syntax' && editor.current?.reveal(result.problem)}
                  onDownload={downloadReport}
                />
              )
            ) : schemaState.status === 'ready' ? (
              <pre className="schema-view">{JSON.stringify(schemaState.schema, null, 2)}</pre>
            ) : (
              <p className="result-empty">{schemaState.status === 'error' ? schemaState.message : 'Loading schema…'}</p>
            )}
          </div>
        </section>
      </main>

      <UpdatePrompt />
    </div>
  );
}

function Topbar({ online, lib, now }: { online: boolean; lib: LoadedManifest | null; now: number }) {
  return (
    <header className="topbar">
      <div className="brand">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" width="22" height="22" />
        <h1>JSON Schema Validator</h1>
      </div>
      <StatusBadge online={online} source={lib?.source ?? null} generatedAt={lib?.manifest.generatedAt ?? null} now={now} />
    </header>
  );
}
