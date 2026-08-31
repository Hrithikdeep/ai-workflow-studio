import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Pool, type PoolConfig } from 'pg';

/**
 * Non-secret + secret PostgreSQL connection details resolved for one
 * integration. Either `connectionString` OR discrete host/database fields
 * must be present.
 */
export interface ResolvedPgConnection {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  /** `require` | `prefer` | `disable` | `no-verify` (from the integration config). */
  ssl?: string;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : fallback;
}

export const PG_STATEMENT_TIMEOUT_MS = () =>
  intFromEnv('PG_EXECUTOR_STATEMENT_TIMEOUT_MS', 15_000);
export const PG_CONNECT_TIMEOUT_MS = () =>
  intFromEnv('PG_EXECUTOR_CONNECT_TIMEOUT_MS', 10_000);
const PG_POOL_MAX = () => intFromEnv('PG_EXECUTOR_POOL_MAX', 4);
const PG_POOL_IDLE_MS = () => intFromEnv('PG_EXECUTOR_POOL_IDLE_MS', 60_000);

/** Map the integration's `ssl` mode to a `pg` ssl option. */
function toSslOption(mode: string | undefined): PoolConfig['ssl'] {
  switch ((mode ?? '').toLowerCase()) {
    case 'disable':
      return false;
    case 'no-verify':
      // Opt-in only (e.g. self-signed). Never the default.
      return { rejectUnauthorized: false };
    case 'require':
    case 'prefer':
      // TLS with certificate verification enabled.
      return true;
    default:
      return undefined; // let pg / the connection string decide
  }
}

/** Build a `pg` PoolConfig from resolved connection details + env limits. */
export function buildPoolConfig(conn: ResolvedPgConnection): PoolConfig {
  const shared: PoolConfig = {
    max: PG_POOL_MAX(),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: PG_CONNECT_TIMEOUT_MS(),
    statement_timeout: PG_STATEMENT_TIMEOUT_MS(),
    query_timeout: PG_STATEMENT_TIMEOUT_MS(),
    application_name: 'ai-workflow-studio/pg-executor',
  };

  if (conn.connectionString) {
    return {
      ...shared,
      connectionString: conn.connectionString,
      ssl: toSslOption(conn.ssl),
    };
  }
  return {
    ...shared,
    host: conn.host,
    port: conn.port,
    database: conn.database,
    user: conn.user,
    password: conn.password,
    ssl: toSslOption(conn.ssl),
  };
}

/**
 * Stable identity for a connection. Includes the password / connection
 * string so a credential change (or a different workspace's credential)
 * never reuses another's pool. The raw values are hashed — they are never
 * stored in the cache key or logged.
 */
export function connectionKey(conn: ResolvedPgConnection): string {
  const canonical = JSON.stringify({
    cs: conn.connectionString ?? null,
    h: conn.host ?? null,
    p: conn.port ?? null,
    d: conn.database ?? null,
    u: conn.user ?? null,
    pw: conn.password ?? null,
    ssl: conn.ssl ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

interface PoolEntry {
  pool: Pool;
  idleTimer: NodeJS.Timeout;
}

/**
 * Per-connection PostgreSQL pool cache.
 *
 * - one `pg.Pool` per distinct connection identity (see {@link connectionKey})
 * - pools are reused across workflow executions
 * - an idle pool is `end()`ed and evicted after `PG_EXECUTOR_POOL_IDLE_MS`
 * - all pools are closed on module shutdown
 * - never logs a password or connection string
 */
@Injectable()
export class PgPoolCache implements OnModuleDestroy {
  private readonly logger = new Logger(PgPoolCache.name);
  private readonly pools = new Map<string, PoolEntry>();

  /** Test seam — overridden in specs to avoid real connections. */
  protected newPool(config: PoolConfig): Pool {
    return new Pool(config);
  }

  /** Get (or lazily create) the pool for these connection details. */
  getPool(conn: ResolvedPgConnection): Pool {
    const key = connectionKey(conn);
    const existing = this.pools.get(key);
    if (existing) {
      this.armIdleEviction(key, existing);
      return existing.pool;
    }

    const pool = this.newPool(buildPoolConfig(conn));
    // A background pool error must not crash the process; log without detail.
    pool.on('error', () => {
      this.logger.warn('Idle PostgreSQL client error (pool retained)');
    });

    const entry: PoolEntry = {
      pool,
      idleTimer: setTimeout(() => undefined, 0),
    };
    this.pools.set(key, entry);
    this.armIdleEviction(key, entry);
    return pool;
  }

  /** Number of live pools (test aid). */
  size(): number {
    return this.pools.size;
  }

  async onModuleDestroy(): Promise<void> {
    const entries = [...this.pools.values()];
    this.pools.clear();
    await Promise.all(
      entries.map(async (e) => {
        clearTimeout(e.idleTimer);
        await e.pool.end().catch(() => undefined);
      }),
    );
  }

  private armIdleEviction(key: string, entry: PoolEntry): void {
    clearTimeout(entry.idleTimer);
    entry.idleTimer = setTimeout(() => {
      this.pools.delete(key);
      entry.pool.end().catch(() => undefined);
    }, PG_POOL_IDLE_MS());
    entry.idleTimer.unref?.();
  }
}
