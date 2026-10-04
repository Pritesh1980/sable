PRAGMA busy_timeout = 1000;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, request_id TEXT NOT NULL,
  request_hash TEXT NOT NULL, source_digest TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN (
    'accepted', 'dispatching', 'running', 'succeeded', 'failed',
    'outcome_unknown', 'expired', 'cancelled'
  )),
  accepted_at INTEGER NOT NULL, accepted_day TEXT NOT NULL,
  dispatched_at INTEGER, completed_at INTEGER, expires_at INTEGER,
  quota_used INTEGER NOT NULL DEFAULT 1 CHECK (quota_used IN (0, 1)),
  request_json TEXT, profile_json TEXT NOT NULL,
  input_ref TEXT, result_json TEXT, error_code TEXT, acknowledged_at INTEGER,
  UNIQUE(owner_id, request_id)
);
CREATE INDEX IF NOT EXISTS jobs_owner_state ON jobs(owner_id, state);
CREATE INDEX IF NOT EXISTS jobs_owner_day ON jobs(owner_id, accepted_day);
