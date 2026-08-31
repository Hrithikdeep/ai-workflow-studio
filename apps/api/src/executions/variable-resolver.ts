/**
 * Runtime template / variable resolution for workflow node configuration.
 *
 * Extracted from ExecutionsService so it is independently testable and
 * reusable. Behaviour for the pre-existing syntax (`{{ input.x }}`,
 * `{{ vars.NAME }}`, `{{ previous.output }}`, `{{ workflow.x }}`,
 * `{{ execution.x }}`) is unchanged.
 *
 * Step 5 additions:
 *  - bare `{{ NAME }}` resolves from the runtime variable map
 *  - an unknown variable throws {@link VariableResolutionError}
 *    (code `VARIABLE_NOT_FOUND`) instead of resolving to a fake value
 *  - resolution never mutates the input; it returns a new value
 *
 * This module never logs variable values.
 */

export interface ResolverContext {
  input: Record<string, unknown>;
  variables: Record<string, unknown>;
  previous: Record<string, unknown>;
  workflow: Record<string, unknown>;
  execution: Record<string, unknown>;
}

/** Namespaces that a bare `{{ NAME }}` must NOT shadow. */
const RESERVED_ROOTS = new Set([
  'input',
  'variables',
  'vars',
  'previous',
  'workflow',
  'execution',
]);

export class VariableResolutionError extends Error {
  readonly code = 'VARIABLE_NOT_FOUND';
  readonly variableName: string;

  constructor(variableName: string) {
    // The name/expression is safe to surface; no (never-known) value is included.
    const message = variableName.includes('.')
      ? `Could not resolve {{ ${variableName} }} — no value was provided at run time.`
      : `Missing workflow variable "${variableName}".`;
    super(message);
    this.name = 'VariableResolutionError';
    this.variableName = variableName;
  }
}

/**
 * Recursively resolve every `{{ ... }}` expression in a node config value.
 * Traverses strings, arrays and plain objects. Returns a fresh structure —
 * the original is never mutated.
 */
export function resolveNodeConfig(
  value: unknown,
  context: ResolverContext,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => resolveNodeConfig(item, context));
  }

  if (value !== null && typeof value === 'object') {
    if (value instanceof Date) {
      return value;
    }
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      next[key] = resolveNodeConfig(item, context);
    }
    return next;
  }

  if (typeof value === 'string') {
    return resolveString(value, context);
  }

  return value;
}

/** Resolve a single string: whole-expression keeps type, embedded interpolates. */
export function resolveString(value: string, context: ResolverContext): unknown {
  if (!value.includes('{{')) {
    return value;
  }

  const matches = [...value.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)];
  if (matches.length === 0) {
    return value;
  }

  // Whole field is exactly one expression -> preserve the resolved type.
  if (matches.length === 1 && value.trim() === matches[0][0].trim()) {
    const expr = matches[0][1].trim();
    const resolved = resolveExpression(expr, context);
    if (resolved === undefined) {
      // e.g. {{ input.name }} when the request provided no `name`.
      throw new VariableResolutionError(expr);
    }
    return resolved;
  }

  // Otherwise interpolate each expression into the surrounding text.
  return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, expression) => {
    const expr = String(expression).trim();
    const resolved = resolveExpression(expr, context);
    if (resolved === undefined) {
      throw new VariableResolutionError(expr);
    }
    if (typeof resolved === 'string') return resolved;
    if (typeof resolved === 'number' || typeof resolved === 'boolean') {
      return String(resolved);
    }
    return JSON.stringify(resolved);
  });
}

/**
 * Resolve a dotted/bracketed expression against the runtime context.
 * Throws {@link VariableResolutionError} for an unknown variable.
 */
export function resolveExpression(
  expression: string,
  context: ResolverContext,
): unknown {
  const segments = parseExpressionSegments(expression);
  if (segments.length === 0) {
    return undefined;
  }

  const root = segments[0];
  const remainder = segments.slice(1);

  // Bare `{{ NAME }}` / `{{ NAME.path }}` -> runtime variable map.
  if (!RESERVED_ROOTS.has(root)) {
    const vars = context.variables ?? {};
    if (Object.prototype.hasOwnProperty.call(vars, root)) {
      const base = (vars as Record<string, unknown>)[root];
      return remainder.length > 0 ? getNestedValue(base, remainder) : base;
    }
    // Not a namespace and not a known variable: deterministic failure.
    throw new VariableResolutionError(root);
  }

  let target: unknown = undefined;
  switch (root) {
    case 'input':
      target = context.input ?? {};
      break;
    case 'variables':
    case 'vars': {
      const vars = context.variables ?? {};
      if (remainder.length === 0) {
        return vars;
      }
      const key = remainder[0];
      if (!Object.prototype.hasOwnProperty.call(vars, key)) {
        // Fall back to workflow.variables (legacy) before failing.
        const wfVars = asRecord(
          (context.workflow as Record<string, unknown>)?.variables,
        );
        if (Object.prototype.hasOwnProperty.call(wfVars, key)) {
          return remainder.length > 1
            ? getNestedValue(wfVars[key], remainder.slice(1))
            : wfVars[key];
        }
        throw new VariableResolutionError(key);
      }
      const base = (vars as Record<string, unknown>)[key];
      return remainder.length > 1
        ? getNestedValue(base, remainder.slice(1))
        : base;
    }
    case 'previous':
      target = context.previous ?? {};
      break;
    case 'workflow':
      target = context.workflow ?? {};
      break;
    case 'execution':
      target = context.execution ?? {};
      break;
  }

  return remainder.length > 0 ? getNestedValue(target, remainder) : target;
}

function parseExpressionSegments(expression: string): string[] {
  const normalized = expression.replace(/\[(\d+)\]/g, '.$1');
  const tokens: string[] = [];
  let current = '';
  for (const char of normalized) {
    if (char === '.' || char === '[' || char === ']') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens.filter(Boolean);
}

function getNestedValue(target: unknown, path: string[]): unknown {
  let current = target;
  for (const segment of path) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      const record = current as Record<string, unknown>;
      if (segment in record) {
        current = record[segment];
        continue;
      }
      if (Array.isArray(current) && /^\d+$/.test(segment)) {
        const index = Number(segment);
        if (index >= 0 && index < current.length) {
          current = current[index];
          continue;
        }
      }
      return undefined;
    }
    return undefined;
  }
  return current;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
