import { createSqliteAdapter, type SqliteAdapter } from "../sqlite-adapter";

let database: SqliteAdapter | null = null;

/** One in-memory database per test process, shared by everything that opens it. */
export async function openDatabaseAsync(_name: string): Promise<SqliteAdapter> {
  database ??= createSqliteAdapter();
  return database;
}
