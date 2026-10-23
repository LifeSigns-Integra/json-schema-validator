import { parse, parseTree, printParseErrorCode, type Node, type ParseError } from 'jsonc-parser';
import { parsePointer } from './errors';
import type { ValidationError } from './types';

export interface Span {
  offset: number;
  length: number;
}

export interface SyntaxProblem extends Span {
  message: string;
  line: number;
  column: number;
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; problem: SyntaxProblem };

const STRICT = { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false };

const MESSAGES: Record<string, string> = {
  InvalidSymbol: 'Unexpected character',
  InvalidNumberFormat: 'Invalid number',
  PropertyNameExpected: 'Expected a property name in double quotes',
  ValueExpected: 'Expected a value',
  ColonExpected: 'Expected ":"',
  CommaExpected: 'Expected "," between items',
  CloseBraceExpected: 'Expected "}"',
  CloseBracketExpected: 'Expected "]"',
  EndOfFileExpected: 'Unexpected content after the JSON value',
  InvalidCommentToken: 'Comments are not allowed in JSON',
  UnexpectedEndOfComment: 'Comments are not allowed in JSON',
  UnexpectedEndOfString: 'Unterminated string',
  UnexpectedEndOfNumber: 'Unterminated number',
  InvalidUnicode: 'Invalid unicode escape',
  InvalidEscapeCharacter: 'Invalid escape character',
  InvalidCharacter: 'Invalid character in string',
};

export function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/** Strict JSON parse that reports the first syntax error with its position. */
export function parseJson(text: string): ParseResult {
  if (text.trim() === '') {
    return { ok: false, problem: { message: 'Enter or paste a JSON document', offset: 0, length: 0, line: 1, column: 1 } };
  }
  const errors: ParseError[] = [];
  parse(text, errors, STRICT);
  // jsonc-parser gives positions; JSON.parse below is the final word on validity.
  if (errors.length > 0) {
    const e = errors[0];
    const code = printParseErrorCode(e.error);
    return {
      ok: false,
      problem: { message: MESSAGES[code] ?? code, offset: e.offset, length: Math.max(1, e.length), ...lineColumn(text, e.offset) },
    };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    const m = /position (\d+)/.exec((err as Error).message);
    const offset = m ? Number(m[1]) : 0;
    return { ok: false, problem: { message: (err as Error).message, offset, length: 1, ...lineColumn(text, offset) } };
  }
}

function child(node: Node, segment: string): Node | undefined {
  if (node.type === 'object') {
    // Last occurrence wins, matching JSON.parse for duplicate keys.
    const props = (node.children ?? []).filter((p) => p.children?.[0]?.value === segment);
    return props.at(-1)?.children?.[1];
  }
  if (node.type === 'array' && /^\d+$/.test(segment)) return node.children?.[Number(segment)];
  return undefined;
}

function propertyKey(node: Node, key: string): Node | undefined {
  if (node.type !== 'object') return undefined;
  return (node.children ?? []).filter((p) => p.children?.[0]?.value === key).at(-1)?.children?.[0];
}

/** Containers are highlighted by their opening bracket only, so a big object does not light up entirely. */
const spanOf = (n: Node): Span =>
  n.type === 'object' || n.type === 'array' ? { offset: n.offset, length: 1 } : { offset: n.offset, length: n.length };

/** Finds where in the source text a validation error points. */
export function locate(tree: Node | undefined, error: Pick<ValidationError, 'instancePath' | 'keyword' | 'params'>): Span | null {
  if (!tree) return null;
  let node: Node | undefined = tree;
  for (const seg of parsePointer(error.instancePath)) {
    node = child(node, seg);
    if (!node) return null;
  }
  const extra =
    error.keyword === 'additionalProperties'
      ? error.params.additionalProperty
      : error.keyword === 'unevaluatedProperties'
        ? error.params.unevaluatedProperty
        : error.keyword === 'propertyNames'
          ? error.params.propertyName
          : undefined;
  if (typeof extra === 'string') {
    const key = propertyKey(node, extra);
    if (key) return spanOf(key);
  }
  return spanOf(node);
}

export const buildTree = (text: string): Node | undefined => parseTree(text, [], STRICT);
