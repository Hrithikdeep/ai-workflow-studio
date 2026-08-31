import { randomBytes } from 'node:crypto';

process.env.APP_ENCRYPTION_KEY =
  process.env.APP_ENCRYPTION_KEY && process.env.APP_ENCRYPTION_KEY.trim() !== ''
    ? process.env.APP_ENCRYPTION_KEY
    : randomBytes(32).toString('base64');

import { ExecutionStepStatus } from '@prisma/client';

import { PostgresNodeExecutor } from '../src/executions/executors/postgres.executor';
import { PgPoolCache } from '../src/executions/executors/pg-pool-cache';
import { IntegrationProbeService } from '../src/integrations/integration-probe.service';
import type { NodeExecutionContext } from '../src/executions/executors/node-executor';

// The repo's docker-compose Postgres.
const CONNECTION_STRING =
  process.env.DATABASE_URL?.replace(/^"|"$/g, '') ??
  'postgresql://workflow:workflow@localhost:5433/ai_workflow_studio';

function makeExecutor(pools: PgPoolCache) {
  const integrations = {
    getForExecution: jest.fn().mockResolvedValue({
      id: 'int-pg',
      provider: 'postgresql',
      name: 'Compose DB',
      config: { ssl: 'disable' },
    }),
  };
  const credentials = {
    getDecryptedForIntegration: jest
      .fn()
      .mockResolvedValue({ connectionString: CONNECTION_STRING }),
  };
  return new PostgresNodeExecutor(
    integrations as never,
    credentials as never,
    pools,
  );
}

const node = { id: 'n-pg-db', label: 'Postgres', type: 'POSTGRES' };
const ctx: NodeExecutionContext = {
  workspaceId: 'ws-1',
  workflow: { id: 'wf', versionId: 'v' },
  execution: { id: 'ex', triggerType: 'MANUAL' },
  input: {},
  variables: {},
  previous: {},
};

describe('PostgresNodeExecutor (DB-backed, real compose Postgres)', () => {
  jest.setTimeout(30000);

  let pools: PgPoolCache;

  beforeAll(() => {
    pools = new PgPoolCache();
  });
  afterAll(async () => {
    await pools.onModuleDestroy();
  });

  it('1/2/3. runs a real parameterized query and returns { rows, rowCount }', async () => {
    const executor = makeExecutor(pools);
    const res = await executor.execute(
      node,
      {
        integrationId: 'int-pg',
        operation: 'query',
        query: 'SELECT $1::int AS n, $2::text AS label',
        params: [42, 'hello'],
      },
      ctx,
    );
    expect(res.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect(res.output.rows).toEqual([{ n: 42, label: 'hello' }]);
    expect(res.output.rowCount).toBe(1);
  });

  it('4. an injection payload passed as a param is treated as data', async () => {
    const executor = makeExecutor(pools);
    const payload = "'); DROP TABLE information_schema.tables; --";
    const res = await executor.execute(
      node,
      {
        integrationId: 'int-pg',
        operation: 'query',
        query: 'SELECT $1::text AS raw',
        params: [payload],
      },
      ctx,
    );
    expect(res.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect(res.output.rows).toEqual([{ raw: payload }]);
    // schema still intact
    const check = await executor.execute(
      node,
      {
        integrationId: 'int-pg',
        operation: 'query',
        query:
          "SELECT count(*)::int AS c FROM information_schema.tables WHERE table_name = 'tables'",
        params: [],
      },
      ctx,
    );
    expect((check.output.rows as Array<{ c: number }>)[0].c).toBeGreaterThan(0);
  });

  it('6. a slow query is cut off by the statement timeout', async () => {
    process.env.PG_EXECUTOR_STATEMENT_TIMEOUT_MS = '400';
    const cache = new PgPoolCache(); // fresh pool so the low timeout applies
    try {
      const executor = makeExecutor(cache);
      const res = await executor.execute(
        node,
        {
          integrationId: 'int-pg',
          operation: 'query',
          query: 'SELECT pg_sleep(3)',
          params: [],
        },
        ctx,
      );
      expect(res.status).toBe(ExecutionStepStatus.FAILED);
      expect(res.output.code).toBe('TIMEOUT');
      expect(res.error).toBe('The query exceeded the statement timeout.');
    } finally {
      await cache.onModuleDestroy();
      delete process.env.PG_EXECUTOR_STATEMENT_TIMEOUT_MS;
    }
  });

  it('7. row limit is enforced against a large real result set', async () => {
    process.env.PG_EXECUTOR_MAX_ROWS = '10';
    try {
      const executor = makeExecutor(pools);
      const res = await executor.execute(
        node,
        {
          integrationId: 'int-pg',
          operation: 'query',
          query: 'SELECT g AS n FROM generate_series(1, 5000) AS g',
          params: [],
        },
        ctx,
      );
      expect(res.status).toBe(ExecutionStepStatus.SUCCEEDED);
      expect((res.output.rows as unknown[]).length).toBe(10);
      expect(res.output.truncated).toBe(true);
    } finally {
      delete process.env.PG_EXECUTOR_MAX_ROWS;
    }
  });

  it('8. the same connection reuses one pool across executions', async () => {
    const cache = new PgPoolCache();
    try {
      const executor = makeExecutor(cache);
      await executor.execute(
        node,
        { integrationId: 'int-pg', operation: 'query', query: 'SELECT 1 AS a', params: [] },
        ctx,
      );
      await executor.execute(
        node,
        { integrationId: 'int-pg', operation: 'query', query: 'SELECT 2 AS a', params: [] },
        ctx,
      );
      expect(cache.size()).toBe(1);
    } finally {
      await cache.onModuleDestroy();
    }
  });

  it('10. PostgreSQL Test Connection executes SELECT 1', async () => {
    const probe = new IntegrationProbeService();
    const result = await probe.probe(
      'postgresql',
      {},
      { connectionString: CONNECTION_STRING },
      { timeoutMs: 5000 },
    );
    expect(result.ok).toBe(true);
    expect(result.code).toBe('OK');
    expect(result.message).toMatch(/SELECT 1/i);
  });
});
