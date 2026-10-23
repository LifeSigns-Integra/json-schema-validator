/**
 * Bundles Monaco with the app instead of loading it from a CDN, so the editor
 * works offline. Only the core editor and the JSON language are included.
 */
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor/editor/editor.api';
// editor.api is the bare editor; each editor action has to be registered separately.
import 'monaco-editor/features/format/register';
import { jsonDefaults } from 'monaco-editor/languages/features/json/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/languages/features/json/json.worker?worker';

self.MonacoEnvironment = {
  getWorker: (_id: string, label: string) => (label === 'json' ? new JsonWorker() : new EditorWorker()),
};

loader.config({ monaco });

// Ajv is the only judge of validity; Monaco's own JSON diagnostics would show
// different messages for the same problem. Schemas are still given to Monaco
// (see setEditorSchema) for autocomplete and hover help.
jsonDefaults.setDiagnosticsOptions({ validate: false, allowComments: false, enableSchemaRequest: false, schemas: [] });

export function setEditorSchema(modelUri: string, schema: object | null) {
  jsonDefaults.setDiagnosticsOptions({
    validate: false,
    allowComments: false,
    enableSchemaRequest: false,
    schemas: schema ? [{ uri: 'inmemory://schema/selected.json', fileMatch: [modelUri], schema }] : [],
  });
}

export { monaco };
