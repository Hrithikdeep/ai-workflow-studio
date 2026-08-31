import { Injectable, Logger } from '@nestjs/common';
import { ExecutionStepStatus } from '@prisma/client';

import { IntegrationsService } from '../../integrations/integrations.service';
import { IntegrationCredentialsService } from '../../integrations/integration-credentials.service';
import {
  PgPoolCache,
  type ResolvedPgConnection,
} from './pg-pool-cache';
import type {
  ExecutorNode,
  NodeExecutionContext,
  NodeExecutionResult,
} from './node-executor';

const DEFAULT_ALLOWED_OPERATIONS = ['query', 'insert', 'update', 'delete'];
/** Verbs that are never allowed regardless of the declared operation. */
const BLOCKED_VERBS = new Set([
  'drop',
  'truncate',
  'alter',
  'create',
  'grant',
  'revoke',
  'comment',
  'copy',
  'vacuum',
  'reindex',
  'cluster',
  'call',
  'do',
  'set',
  'reset',
  'begin',
  'commit',
  'rollback',
  'savepoint',
  'listen',
  'notify',
  'prepare',
  'execute',
  'deallocate',
]);

const OPERATION_VERBS: Record<string, string[]> = {
  query: ['select', 'with', 'table', 'values', 'show', 'explain'],
  insert: ['insert', 'with'],
  update: ['update', 'with'],
  delete: ['delete', 'with'],
};

function maxRows(): number {
  const raw = Number(process.env.PG_EXECUTOR_MAX_ROWS);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 1000;
}

function allowedOperations(): Set<string> {
  const raw = process.env.PG_EXECUTOR_ALLOWED_OPERATIONS?.trim();
  const list = raw
    ? raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_ALLOWED_OPERATIONS;
  return new Set(list);
}

/**
 * Executes a `POSTGRES` workflow node: runs a parameterized SQL statement
 * against the database referenced by `config.integrationId`.
 *
 * The decrypted connection secret is used only to obtain a pooled client.
 * It never appears in the node result, the execution record, thrown
 * errors, or logs.
 */
@Injectable()
export class PostgresNodeExecutor {
  private readonly logger = new Logger(PostgresNodeExecutor.name);

  constructor(
    private readonly integrations: IntegrationsService,
    private readonly credentials: IntegrationCredentialsService,
    private readonly pools: PgPoolCache,
  ) {}

  async execute(
    node: ExecutorNode,
    resolvedConfig: Record<string, unknown>,
    context: NodeExecutionContext,
  ): Promise<NodeExecutionResult> {
    const integrationId = str(resolvedConfig.integrationId);
    const operation = (str(resolvedConfig.operation) || 'query').toLowerCase();
    const query = typeof resolvedConfig.query === 'string' ? resolvedConfig.query : '';
    const params = Array.isArray(resolvedConfig.params)
      ? (resolvedConfig.params as unknown[])
      : [];

    // Echoed into the execution log. `params` are resolved workflow values,
    // not credentials (Secret-typed variables are excluded upstream).
    const safeConfig = { integrationId, operation, query, params };
    const fail = (error: string, code: string): NodeExecutionResult => ({
      status: ExecutionStepStatus.FAILED,
      output: {
        nodeId: node.id,
        nodeType: 'POSTGRES',
        label: node.label,
        config: safeConfig,
        code,
        status: 'FAILED',
      },
      error,
      branch: null,
    });
    const succeed = (result: Record<string, unknown>): NodeExecutionResult => ({
      status: ExecutionStepStatus.SUCCEEDED,
      output: {
        nodeId: node.id,
        nodeType: 'POSTGRES',
        label: node.label,
        config: safeConfig,
        ...result,
        status: 'SUCCEEDED',
      },
      error: null,
      branch: null,
    });

    if (!integrationId) {
      return fail('PostgreSQL integration is not configured.', 'MISSING_INTEGRATION');
    }
    if (!query.trim()) {
      return fail('A SQL query is required.', 'MISSING_CONFIG');
    }
    if (!context.workspaceId) {
      return fail(
        'PostgreSQL integration is not available in this workspace.',
        'NO_WORKSPACE',
      );
    }

    // --- operation guard -----------------------------------------------------
    if (!allowedOperations().has(operation)) {
      return fail(
        `Operation "${operation}" is not permitted.`,
        'OPERATION_NOT_ALLOWED',
      );
    }
    const guard = inspectStatement(query, operation);
    if (!guard.ok) {
      return fail(guard.message, guard.code);
    }

    // --- workspace-scoped integration + credential -------------------------
    const integration = await this.integrations.getForExecution(
      context.workspaceId,
      integrationId,
    );
    if (!integration || integration.provider !== 'postgresql') {
      return fail(
        'PostgreSQL integration is not available in this workspace.',
        'INTEGRATION_NOT_FOUND',
      );
    }

    const secrets = await this.credentials.getDecryptedForIntegration(
      context.workspaceId,
      integrationId,
    );
    const conn = resolveConnection(
      asRecord(integration.config),
      secrets ?? {},
    );
    if (!conn) {
      return fail(
        'The PostgreSQL integration has no usable connection credential.',
        'MISSING_CREDENTIAL',
      );
    }

    // --- run ---------------------------------------------------------------
    const rowCap = maxRows();
    const { text, values } = capSelect(query, params, operation, rowCap);

    try {
      const pool = this.pools.getPool(conn);
      const result = await pool.query({ text, values });
      const allRows = Array.isArray(result.rows) ? result.rows : [];
      const truncated = allRows.length > rowCap;
      return succeed({
        rows: truncated ? allRows.slice(0, rowCap) : allRows,
        rowCount:
          typeof result.rowCount === 'number' ? result.rowCount : allRows.length,
        truncated,
      });
    } catch (error) {
      const pg = error as { code?: string; message?: string };
      this.logger.warn(
        `Postgres node ${node.id}: query failed (${pg?.code ?? 'unknown'})`,
      );
      return fail(mapPgError(pg), pgErrorCode(pg));
    }
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v;
  }
  return undefined;
}

function toPort(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : undefined;
}

/** Build connection details from non-secret config + decrypted secrets. */
function resolveConnection(
  config: Record<string, unknown>,
  secrets: Record<string, unknown>,
): ResolvedPgConnection | null {
  const connectionString = firstString(secrets.connectionString);
  const password = firstString(secrets.password, secrets.credential);
  const host = firstString(config.host);
  const database = firstString(config.database);
  const ssl = firstString(config.ssl);

  if (connectionString) {
    return { connectionString, ssl };
  }
  if (!host || !database || !password) {
    return null;
  }
  return {
    host,
    database,
    password,
    port: toPort(config.port),
    user: firstString(config.username),
    ssl,
  };
}

/** Strip SQL comments so guards see only executable text. */
function stripComments(sql: string): string {
  return sql
    .replace(/--[^\n\r]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();
}

type GuardResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

/** Reject multi-statement / DDL / operation-mismatched SQL. */
function inspectStatement(query: string, operation: string): GuardResult {
  const cleaned = stripComments(query);
  if (!cleaned) {
    return { ok: false, code: 'MISSING_CONFIG', message: 'A SQL query is required.' };
  }

  // Disallow a second statement (a `;` followed by more executable text).
  const withoutTrailing = cleaned.replace(/;\s*$/, '');
  if (withoutTrailing.includes(';')) {
    return {
      ok: false,
      code: 'MULTIPLE_STATEMENTS',
      message: 'Only a single SQL statement may be executed.',
    };
  }

  const verb = (withoutTrailing.match(/^\s*([a-zA-Z]+)/)?.[1] ?? '').toLowerCase();
  if (!verb) {
    return { ok: false, code: 'INVALID_SQL', message: 'The SQL statement is not valid.' };
  }
  if (BLOCKED_VERBS.has(verb)) {
    return {
      ok: false,
      code: 'OPERATION_NOT_ALLOWED',
      message: `SQL statements starting with "${verb.toUpperCase()}" are not permitted.`,
    };
  }
  const expected = OPERATION_VERBS[operation];
  if (expected && !expected.includes(verb)) {
    return {
      ok: false,
      code: 'OPERATION_MISMATCH',
      message: `The query does not match the "${operation}" operation.`,
    };
  }
  return { ok: true };
}

/**
 * For read queries, wrap in a CTE with a hard `LIMIT` so the database never
 * streams an unbounded result set back. One extra row is requested so the
 * executor can report truncation.
 */
function capSelect(
  query: string,
  params: unknown[],
  operation: string,
  rowCap: number,
): { text: string; values: unknown[] } {
  const base = query.trim().replace(/;\s*$/, '');
  if (operation !== 'query') {
    return { text: base, values: params };
  }
  const limitParam = params.length + 1;
  return {
    text: `WITH __awf_capped AS (\n${base}\n) SELECT * FROM __awf_capped LIMIT $${limitParam}`,
    values: [...params, rowCap + 1],
  };
}

/** True for a server statement_timeout (57014) or pg's client query_timeout. */
function isTimeout(pg: { code?: string; message?: string }): boolean {
  return (
    pg?.code === '57014' ||
    (!pg?.code && /timeout/i.test(pg?.message ?? ''))
  );
}

function pgErrorCode(pg: { code?: string; message?: string }): string {
  if (isTimeout(pg)) return 'TIMEOUT';
  switch (pg?.code) {
    case '57014':
      return 'TIMEOUT';
    case '28P01':
    case '28000':
      return 'AUTH_FAILED';
    case '3D000':
      return 'DATABASE_NOT_FOUND';
    case '42601':
      return 'SQL_SYNTAX_ERROR';
    case '42501':
      return 'PERMISSION_DENIED';
    case '42P01':
      return 'UNDEFINED_TABLE';
    case 'ECONNREFUSED':
    case 'ENOTFOUND':
    case 'ETIMEDOUT':
      return 'UNREACHABLE';
    default:
      return pg?.code ? `PG_${pg.code}` : 'QUERY_FAILED';
  }
}

/** Safe, user-facing message — never contains the connection string. */
function mapPgError(pg: { code?: string; message?: string }): string {
  if (isTimeout(pg)) return 'The query exceeded the statement timeout.';
  switch (pg?.code) {
    case '57014':
      return 'The query exceeded the statement timeout.';
    case '28P01':
    case '28000':
      return 'PostgreSQL rejected the credentials.';
    case '3D000':
      return 'The configured database does not exist.';
    case '42601':
      return 'The SQL statement has a syntax error.';
    case '42501':
      return 'The database role is not permitted to run this statement.';
    case '42P01':
      return 'A referenced table does not exist.';
    case 'ECONNREFUSED':
      return 'Could not connect to the PostgreSQL server.';
    case 'ENOTFOUND':
      return 'The PostgreSQL host could not be resolved.';
    case 'ETIMEDOUT':
      return 'Connecting to the PostgreSQL server timed out.';
    default:
      return 'The PostgreSQL query failed.';
  }
}
