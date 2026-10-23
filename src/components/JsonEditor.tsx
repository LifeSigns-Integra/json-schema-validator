import Editor, { type OnMount } from '@monaco-editor/react';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Span } from '../lib/locate';
import { monaco, setEditorSchema } from '../lib/monaco';

export interface Marker extends Span {
  message: string;
}

export interface JsonEditorHandle {
  setMarkers(owner: 'syntax' | 'schema', markers: Marker[]): void;
  reveal(span: Span): void;
  format(): void;
  focus(): void;
}

interface Props {
  value: string;
  onChange(value: string): void;
  onValidateShortcut(): void;
  dark: boolean;
  /** Selected schema, used for autocomplete and hover only. */
  schema: object | null;
}

const MODEL_PATH = 'inmemory://document/input.json';

export const JsonEditor = forwardRef<JsonEditorHandle, Props>(function JsonEditor(
  { value, onChange, onValidateShortcut, dark, schema },
  ref,
) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const shortcutRef = useRef(onValidateShortcut);
  shortcutRef.current = onValidateShortcut;

  useEffect(() => setEditorSchema(MODEL_PATH, schema), [schema]);

  useImperativeHandle(ref, () => ({
    setMarkers(owner, markers) {
      const model = editorRef.current?.getModel();
      if (!model) return;
      monaco.editor.setModelMarkers(
        model,
        owner,
        markers.map((m) => {
          const start = model.getPositionAt(m.offset);
          const end = model.getPositionAt(m.offset + Math.max(1, m.length));
          return {
            severity: monaco.MarkerSeverity.Error,
            message: m.message,
            startLineNumber: start.lineNumber,
            startColumn: start.column,
            endLineNumber: end.lineNumber,
            endColumn: end.column,
          };
        }),
      );
    },
    reveal(span) {
      const ed = editorRef.current;
      const model = ed?.getModel();
      if (!ed || !model) return;
      const start = model.getPositionAt(span.offset);
      const end = model.getPositionAt(span.offset + Math.max(1, span.length));
      const range = new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
      ed.setSelection(range);
      ed.revealRangeInCenterIfOutsideViewport(range);
      ed.focus();
    },
    format() {
      void editorRef.current?.getAction('editor.action.formatDocument')?.run();
    },
    focus() {
      editorRef.current?.focus();
    },
  }));

  const onMount: OnMount = (ed) => {
    editorRef.current = ed;
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => shortcutRef.current());
    ed.focus();
  };

  return (
    <Editor
      path={MODEL_PATH}
      language="json"
      value={value}
      onChange={(v) => onChange(v ?? '')}
      onMount={onMount}
      theme={dark ? 'vs-dark' : 'vs'}
      loading={<div className="editor-loading">Loading editor…</div>}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        tabSize: 2,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        wordWrap: 'off',
        renderValidationDecorations: 'on',
        fixedOverflowWidgets: true,
        ariaLabel: 'JSON document',
      }}
    />
  );
});
