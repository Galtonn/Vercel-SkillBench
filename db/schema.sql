CREATE TABLE IF NOT EXISTS skillbench_evaluations (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS skillbench_evaluations_owner_created_idx
  ON skillbench_evaluations (owner_id, created_at DESC);
