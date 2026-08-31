import { ExecutionStepStatus } from '@prisma/client';

import { PostgresNodeExecutor } from './postgres.executor';
import type { PgPoolCache } from './pg-pool-cache';
import type { NodeExecutionContext } from './node-executor';

const CONNECTION_STRING =
  'postgresql://svc:sup3r-secret-pw@db.internal:5432/app?sslmode=require';

function makeExecutor(over?: {
  integration?: unknown;
  secrets?: Record<string, unknown> | null;
  query?: jest.Mock;
}) {
  const integrations = {
    getForExecution: jest.fn().mockResolvedValue(
      over && 'integration' in over
        ? over.integration
        : {
            id: 'int-1',
            provider: 'postgresql',
            name: 'App DB',
            config: { host: 'db.internal', database: 'app', ssl: 'require' },
          },
    ),
  };
  const credentials = {
    getDecryptedForIntegration: jest.fn().mockResolvedValue(
      over && 'secrets' in over
        ? over.secrets
        : { connectionString: CONNECTION_STRING },
    ),
  };
  const query =
    over?.query ??
    jest.fn().mockResolvedValue({ rows: [{ n: 1 }], rowCount: 1 });
  const fakePool = { query };
  const pools = {
    getPool: jest.fn().mockReturnValue(fakePool),
  } as unknown as PgPoolCache;

  const executor = new PostgresNodeExecutor(
    integrations as never,
    credentials as never,
    pools,
  );
  return { executor, integrations, credentials, query, pools };
}

const node = { id: 'n-pg-1', label: 'Postgres: Query', type: 'POSTGRES' };
const ctx = (workspaceId?: string): NodeExecutionContext => ({
  workspaceId,
  workflow: { id: 'wf', versionId: 'v' },
  execution: { id: 'ex', triggerType: 'MANUAL' },
  input: {},
  variables: {},
  previous: {},
});
const cfg = (o: Record<string, unknown>) => ({
  integrationId: 'int-1',
  operation: 'query',
  ...o,
});

describe('PostgresNodeExecutor', () => {
  const realEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...realEnv };
    jest.restoreAllMocks();
  });

  it('1/2/3. runs a parameterized query and returns { rows, rowCount }', async () => {
    const { executor, query } = makeExecutor({
      query: jest
        .fn()
        .mockResolvedValue({ rows: [{ id: 7, email: 'a@b.co' }], rowCount: 1 }),
    });

    const res = await executor.execute(
      node,
      cfg({
        query: 'SELECT id, email FROM users WHERE email = $1',
        params: ['a@b.co'],
      }),
      ctx('ws-1'),
    );

    expect(res.status).toBe(ExecutionStepStatus.SUCCEEDED);
    expect(res.output.rows).toEqual([{ id: 7, email: 'a@b.co' }]);
    expect(res.output.rowCount).toBe(1);

    // text + values passed SEPARATELY — no interpolation
    expect(query).toHaveBeenCalledTimes(1);
    const arg = query.mock.calls[0][0];
    expect(typeof arg.text).toBe('string');
    expect(arg.text).toContain('$1'); // placeholder preserved
    expect(arg.values).toEqual(['a@b.co', 1001]); // + the LIMIT cap param
    expect(arg.text).not.toContain('a@b.co'); // value never in the SQL string
  });

  it('4. an injection payload in a param cannot change the query structure', async () => {
    const { executor, query } = makeExecutor();
    const payload = "x'; DROP TABLE users; --";

    await executor.execute(
      node,
      cfg({ query: 'SELECT * FROM users WHERE name = $1', params: [payload] }),
      ctx('ws-1'),
    );

    const arg = query.mock.calls[0][0];
    expect(arg.values[0]).toBe(payload); // passed verbatim as a bound value
    expect(arg.text).not.toContain('DROP TABLE');
    expect(arg.text).not.toContain(payload);
    // still exactly one placeholder for the user param
    expect((arg.text.match(/\$1\b/g) ?? []).length).toBe(1);
  });

  it('5. missing credential -> controlled failure, no query', async () => {
    const { executor, query } = makeExecutor({ secrets: {} });
    const res = await executor.execute(
      node,
      cfg({ query: 'SELECT 1', params: [] }),
      ctx('ws-1'),
    );
    expect(res.status).toBe(ExecutionStepStatus.FAILED);
    expect(res.output.code).toBe('MISSING_CREDENTIAL');
    expect(query).not.toHaveBeenCalled();
  });

  it('missing integrationId / query / workspace -> controlled failures', async () => {
    const { executor } = makeExecutor();
    expect(
      (await executor.execute(node, { operation: 'query', query: 'SELECT 1' }, ctx('ws-1')))
        .output.code,
    ).toBe('MISSING_INTEGRATION');
    expect(
      (await executor.execute(node, cfg({ query: '' }), ctx('ws-1'))).output.code,
    ).toBe('MISSING_CONFIG');
    expect(
      (await executor.execute(node, cfg({ query: 'SELECT 1' }), ctx(undefined)))
        .output.code,
    ).toBe('NO_WORKSPACE');
  });

  it('foreign / wrong-provider integration -> INTEGRATION_NOT_FOUND, no query', async () => {
    const { executor, query } = makeExecutor({ integration: null });
    const r1 = await executor.execute(
      node,
      cfg({ query: 'SELECT 1' }),
      ctx('ws-A'),
    );
    expect(r1.output.code).toBe('INTEGRATION_NOT_FOUND');

    const { executor: e2, query: q2 } = makeExecutor({
      integration: { id: 'int-1', provider: 'slack', name: 'x', config: {} },
    });
    const r2 = await e2.execute(node, cfg({ query: 'SELECT 1' }), ctx('ws-1'));
    expect(r2.output.code).toBe('INTEGRATION_NOT_FOUND');
    expect(query).not.toHaveBeenCalled();
    expect(q2).not.toHaveBeenCalled();
  });

  it('5b. operation guard: blocked verbs / multi-statement / mismatch', async () => {
    const { executor, query } = makeExecutor();
    const codes = await Promise.all(
      [
        cfg({ query: 'DROP TABLE users', operation: 'query' }),
        cfg({ query: 'SELECT 1; SELECT 2', operation: 'query' }),
        cfg({ query: 'DELETE FROM users', operation: 'query' }), // operation says query
        cfg({ query: 'TRUNCATE users', operation: 'delete' }),
      ].map((c) => executor.execute(node, c, ctx('ws-1')).then((r) => r.output.code)),
    );
    expect(codes).toEqual([
      'OPERATION_NOT_ALLOWED',
      'MULTIPLE_STATEMENTS',
      'OPERATION_MISMATCH',
      'OPERATION_NOT_ALLOWED',
    ]);
    expect(query).not.toHaveBeenCalled();
  });

  it('operation not in PG_EXECUTOR_ALLOWED_OPERATIONS is rejected', async () => {
    process.env.PG_EXECUTOR_ALLOWED_OPERATIONS = 'query';
    const { executor, query } = makeExecutor();
    const res = await executor.execute(
      node,
      cfg({ query: 'UPDATE users SET x = 1', operation: 'update' }),
      ctx('ws-1'),
    );
    expect(res.output.code).toBe('OPERATION_NOT_ALLOWED');
    expect(query).not.toHaveBeenCalled();
  });

  it('6. statement timeout (pg 57014) -> controlled TIMEOUT failure', async () => {
    const { executor } = makeExecutor({
      query: jest.fn().mockRejectedValue(
        Object.assign(new Error('canceling statement due to statement timeout'), {
          code: '57014',
        }),
      ),
    });
    const res = await executor.execute(
      node,
      cfg({ query: 'SELECT pg_sleep(10)', params: [] }),
      ctx('ws-1'),
    );
    expect(res.status).toBe(ExecutionStepStatus.FAILED);
    expect(res.output.code).toBe('TIMEOUT');
    expect(res.error).toBe('The query exceeded the statement timeout.');
  });

  it('7. row limit is enforced and truncation is reported', async () => {
    process.env.PG_EXECUTOR_MAX_ROWS = '3';
    const rows = [1, 2, 3, 4].map((i) => ({ i })); // pool returns cap+1
    const { executor, query } = makeExecutor({
      query: jest.fn().mockResolvedValue({ rows, rowCount: 4 }),
    });

    const res = await executor.execute(
      node,
      cfg({ query: 'SELECT i FROM generate_series(1,100) i', params: [] }),
      ctx('ws-1'),
    );

    expect((res.output.rows as unknown[]).length).toBe(3);
    expect(res.output.truncated).toBe(true);
    // LIMIT cap param = maxRows + 1
    expect(query.mock.calls[0][0].values).toEqual([4]);
    expect(query.mock.calls[0][0].text).toContain('LIMIT $1');
  });

  it('9/24. connection string / password never appear in output or error', async () => {
    const { executor } = makeExecutor({
      query: jest.fn().mockRejectedValue(
        Object.assign(new Error(`connection to ${CONNECTION_STRING} failed`), {
          code: 'ECONNREFUSED',
        }),
      ),
    });
    const res = await executor.execute(
      node,
      cfg({ query: 'SELECT 1', params: [] }),
      ctx('ws-1'),
    );
    const blob = JSON.stringify(res);
    expect(blob).not.toContain('sup3r-secret-pw');
    expect(blob).not.toContain(CONNECTION_STRING);
    expect(blob).not.toContain('postgresql://');
    expect(res.output.config).toEqual({
      integrationId: 'int-1',
      operation: 'query',
      query: 'SELECT 1',
      params: [],
    });
  });

  it('non-query operations are not LIMIT-wrapped', async () => {
    process.env.PG_EXECUTOR_ALLOWED_OPERATIONS = 'query,insert,update,delete';
    const { executor, query } = makeExecutor({
      query: jest.fn().mockResolvedValue({ rows: [], rowCount: 2 }),
    });
    await executor.execute(
      node,
      cfg({
        operation: 'update',
        query: 'UPDATE users SET active = $1 WHERE id = $2',
        params: [true, 5],
      }),
      ctx('ws-1'),
    );
    const arg = query.mock.calls[0][0];
    expect(arg.text).toBe('UPDATE users SET active = $1 WHERE id = $2');
    expect(arg.values).toEqual([true, 5]);
  });
});
