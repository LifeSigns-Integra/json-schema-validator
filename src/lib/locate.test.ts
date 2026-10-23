import { describe, expect, it } from 'vitest';
import { createAjv } from './ajv';
import { displayPath, MAX_ERRORS, summarize } from './errors';
import { buildTree, lineColumn, locate, parseJson } from './locate';

describe('parseJson', () => {
  it('accepts valid JSON', () => {
    expect(parseJson('{"a": [1, 2]}')).toEqual({ ok: true, value: { a: [1, 2] } });
  });

  it('reports trailing commas with line and column', () => {
    const r = parseJson('{\n  "a": 1,\n}');
    expect(r.ok).toBe(false);
    if (!r.ok) expect([r.problem.line, r.problem.column]).toEqual([3, 1]);
  });

  it('rejects comments', () => {
    expect(parseJson('{ // note\n "a": 1 }').ok).toBe(false);
  });

  it('rejects empty input', () => {
    expect(parseJson('   ').ok).toBe(false);
  });
});

describe('locate', () => {
  const text = '{\n  "a": { "b": [10, 20] },\n  "extra": true\n}';
  const tree = buildTree(text);
  const at = (span: { offset: number; length: number } | null) => (span ? text.slice(span.offset, span.offset + span.length) : null);

  it('finds array items by pointer', () => {
    expect(at(locate(tree, { instancePath: '/a/b/1', keyword: 'type', params: {} }))).toBe('20');
  });

  it('points at the property key for additionalProperties', () => {
    expect(at(locate(tree, { instancePath: '', keyword: 'additionalProperties', params: { additionalProperty: 'extra' } }))).toBe(
      '"extra"',
    );
  });

  it('marks only the opening bracket of containers', () => {
    expect(at(locate(tree, { instancePath: '/a', keyword: 'required', params: {} }))).toBe('{');
  });

  it('returns null for paths that do not exist', () => {
    expect(locate(tree, { instancePath: '/missing', keyword: 'type', params: {} })).toBeNull();
  });

  it('computes line and column', () => {
    expect(lineColumn(text, text.indexOf('"extra"'))).toEqual({ line: 3, column: 3 });
  });
});

describe('errors', () => {
  it('formats paths for display', () => {
    expect(displayPath('')).toBe('(root)');
    expect(displayPath('/alarms/0/priority')).toBe('alarms[0].priority');
    expect(displayPath('/a~1b/odd key')).toBe('["a/b"]["odd key"]');
  });

  it('caps the error list', () => {
    const validate = createAjv('2020-12').compile({ type: 'array', items: { type: 'string' } });
    validate(Array.from({ length: MAX_ERRORS + 20 }, (_, i) => i));
    const s = summarize(validate.errors);
    expect(s.errors).toHaveLength(MAX_ERRORS);
    expect(s.errorCount).toBe(MAX_ERRORS + 20);
    expect(s.truncated).toBe(true);
  });

  it('writes readable messages', () => {
    const validate = createAjv('draft-07').compile({
      type: 'object',
      required: ['id'],
      properties: { kind: { enum: ['A', 'B'] } },
      additionalProperties: false,
    });
    validate({ kind: 'C', other: 1 });
    const messages = summarize(validate.errors).errors.map((e) => e.message);
    expect(messages).toEqual(
      expect.arrayContaining(['missing required property "id"', 'property "other" is not allowed', 'must be one of "A", "B"']),
    );
  });
});
