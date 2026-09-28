/** Additive v4: raw events and all existing export columns remain intact. */
export const ACTIVITY_HISTORY_MIGRATION = `
CREATE TABLE IF NOT EXISTS activity_history_state (
  stream_id TEXT PRIMARY KEY NOT NULL,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity_history_records (
  window_key TEXT NOT NULL, event_id TEXT NOT NULL,
  PRIMARY KEY(window_key,event_id)
);
DELETE FROM derived_cache WHERE cache_key LIKE 'active-minutes-v2:%';
UPDATE daily_aggregates SET active_summary = NULL;
PRAGMA user_version = 4;
`;
