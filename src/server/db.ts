import 'dotenv/config';
import { Pool, PoolClient, types } from 'pg';

// numeric → number, date → 'YYYY-MM-DD' (без сдвигов часовых поясов)
types.setTypeParser(1700, (v) => parseFloat(v));
types.setTypeParser(20, (v) => parseInt(v, 10));
types.setTypeParser(1082, (v) => v);

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export type Db = Pick<PoolClient, 'query'>;

export async function q<T = any>(text: string, params: any[] = [], db: Db = pool): Promise<T[]> {
  const r = await db.query(text, params);
  return r.rows as T[];
}

export async function one<T = any>(text: string, params: any[] = [], db: Db = pool): Promise<T | null> {
  const rows = await q<T>(text, params, db);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const res = await fn(c);
    await c.query('COMMIT');
    return res;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
