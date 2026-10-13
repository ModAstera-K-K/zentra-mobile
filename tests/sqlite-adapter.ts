import { DatabaseSync } from "node:sqlite";

export interface LoggedStatement {
  method: "exec" | "run" | "getAll" | "getFirst";
  sql: string;
  params: unknown[];
  rows: number;
}

type Param = null | number | bigint | string | Uint8Array;

/** Every statement app code has sent to the test database, in order. */
export const statementLog: LoggedStatement[] = [];

function bindable(params: unknown[]): Param[] {
  const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  // expo-sqlite stores booleans as integers; node:sqlite rejects them.
  return flat.map((value) => (typeof value === "boolean" ? Number(value) : value)) as Param[];
}

/**
 * The part of expo-sqlite's SQLiteDatabase the app uses, over an in-memory
 * node:sqlite database, so repository code runs against real SQLite in tests.
 */
export function createSqliteAdapter(db = new DatabaseSync(":memory:")) {
  const log = (entry: LoggedStatement) => {
    statementLog.push(entry);
  };
  return {
    db,
    async execAsync(sql: string): Promise<void> {
      db.exec(sql);
      log({ method: "exec", sql, params: [], rows: 0 });
    },
    async runAsync(sql: string, ...params: unknown[]) {
      const result = db.prepare(sql).run(...bindable(params));
      log({ method: "run", sql, params: bindable(params), rows: 0 });
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    async getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      const rows = db.prepare(sql).all(...bindable(params)) as T[];
      log({ method: "getAll", sql, params: bindable(params), rows: rows.length });
      return rows;
    },
    async getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null> {
      const row = (db.prepare(sql).get(...bindable(params)) as T | undefined) ?? null;
      log({ method: "getFirst", sql, params: bindable(params), rows: row ? 1 : 0 });
      return row;
    },
    async withTransactionAsync(task: () => Promise<void>): Promise<void> {
      db.exec("BEGIN");
      try {
        await task();
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

export type SqliteAdapter = ReturnType<typeof createSqliteAdapter>;

/** `EXPLAIN QUERY PLAN` detail lines for a logged statement. */
export function queryPlan(db: DatabaseSync, statement: LoggedStatement): string[] {
  return db
    .prepare(`EXPLAIN QUERY PLAN ${statement.sql}`)
    .all(...(statement.params as Param[]))
    .map((row) => String(row.detail));
}
