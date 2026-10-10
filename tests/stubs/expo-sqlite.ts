import { createSqliteAdapter, type SqliteAdapter } from "../sqlite-adapter";

let database: SqliteAdapter | null = null;
let openFailure: string | null = null;
export let openCount = 0;

/** Test hook: the next open rejects, as it does for a file SQLite cannot read. */
export function failNextOpen(message: string): void {
  openFailure = message;
}

/** One in-memory database per test process, shared by everything that opens it. */
export async function openDatabaseAsync(_name: string): Promise<SqliteAdapter> {
  openCount++;
  if (openFailure) {
    const message = openFailure;
    openFailure = null;
    throw new Error(message);
  }
  database ??= createSqliteAdapter();
  return database;
}
