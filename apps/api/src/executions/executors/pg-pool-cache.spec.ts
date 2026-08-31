import {
  PgPoolCache,
  buildPoolConfig,
  connectionKey,
  type ResolvedPgConnection,
} from './pg-pool-cache';

/** Fake `pg.Pool` — records `end()`; never opens a socket. */
class FakePool {
  ended = false;
  on() {
    return this;
  }
  async end() {
    this.ended = true;
  }
}

/** Test subclass: no real connections, counts pool creations. */
class TestPgPoolCache extends PgPoolCache {
  created: FakePool[] = [];
  protected newPool(): never {
    const p = new FakePool();
    this.created.push(p);
    return p as never;
  }
}

const CONN_A: ResolvedPgConnection = {
  host: 'db.internal',
  port: 5432,
  database: 'app',
  user: 'svc',
  password: 'pw-A',
  ssl: 'require',
};

describe('PgPoolCache', () => {
  it('8. reuses one pool for the same connection identity', () => {
    const cache = new TestPgPoolCache();
    const p1 = cache.getPool(CONN_A);
    const p2 = cache.getPool({ ...CONN_A }); // structurally identical
    expect(p1).toBe(p2);
    expect(cache.created).toHaveLength(1);
    expect(cache.size()).toBe(1);
  });

  it('9. different password -> different pool (no cross-credential sharing)', () => {
    const cache = new TestPgPoolCache();
    cache.getPool(CONN_A);
    cache.getPool({ ...CONN_A, password: 'pw-B' });
    expect(cache.created).toHaveLength(2);
    expect(cache.size()).toBe(2);
  });

  it('9b. different host / connection string -> different pool', () => {
    const cache = new TestPgPoolCache();
    cache.getPool(CONN_A);
    cache.getPool({ ...CONN_A, host: 'other.internal' });
    cache.getPool({ connectionString: 'postgresql://u:p@h:5432/d' });
    expect(cache.size()).toBe(3);
  });

  it('connectionKey is a stable hash and never contains the raw secret', () => {
    const k1 = connectionKey(CONN_A);
    const k2 = connectionKey({ ...CONN_A });
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
    expect(k1).not.toContain('pw-A');
    expect(connectionKey({ ...CONN_A, password: 'pw-B' })).not.toBe(k1);
  });

  it('onModuleDestroy ends every pool and clears the cache', async () => {
    const cache = new TestPgPoolCache();
    cache.getPool(CONN_A);
    cache.getPool({ ...CONN_A, password: 'pw-B' });
    const pools = cache.created;

    await cache.onModuleDestroy();

    expect(pools.every((p) => p.ended)).toBe(true);
    expect(cache.size()).toBe(0);
  });

  it('idle eviction ends the pool and removes it', () => {
    jest.useFakeTimers();
    process.env.PG_EXECUTOR_POOL_IDLE_MS = '1000';
    const cache = new TestPgPoolCache();
    cache.getPool(CONN_A);
    const pool = cache.created[0];
    expect(cache.size()).toBe(1);

    jest.advanceTimersByTime(1001);

    expect(cache.size()).toBe(0);
    expect(pool.ended).toBe(true);
    jest.useRealTimers();
    delete process.env.PG_EXECUTOR_POOL_IDLE_MS;
  });

  it('buildPoolConfig keeps TLS verification on for `require` and off only for `no-verify`', () => {
    expect(buildPoolConfig({ ...CONN_A, ssl: 'require' }).ssl).toBe(true);
    expect(buildPoolConfig({ ...CONN_A, ssl: 'prefer' }).ssl).toBe(true);
    expect(buildPoolConfig({ ...CONN_A, ssl: 'disable' }).ssl).toBe(false);
    expect(buildPoolConfig({ ...CONN_A, ssl: 'no-verify' }).ssl).toEqual({
      rejectUnauthorized: false,
    });
    expect(buildPoolConfig({ ...CONN_A, ssl: undefined }).ssl).toBeUndefined();
  });

  it('buildPoolConfig applies the statement timeout from env', () => {
    process.env.PG_EXECUTOR_STATEMENT_TIMEOUT_MS = '2500';
    const c = buildPoolConfig(CONN_A);
    expect(c.statement_timeout).toBe(2500);
    expect(c.query_timeout).toBe(2500);
    delete process.env.PG_EXECUTOR_STATEMENT_TIMEOUT_MS;
  });
});
