/** Additive v3 migration: raw records and existing export columns are retained. */
export const ACTIVE_MINUTES_MIGRATION = `
ALTER TABLE daily_aggregates ADD COLUMN active_summary TEXT;
PRAGMA user_version = 3;
`;
