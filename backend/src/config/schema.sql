CREATE TABLE IF NOT EXISTS workers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    platform VARCHAR(50) NOT NULL,
    architecture VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'offline'
        CHECK (status IN ('online', 'offline')),
    capabilities JSONB DEFAULT '{}'::jsonb,
    agent_version VARCHAR(30),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS worker_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id UUID NOT NULL REFERENCES workers(id)
        ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workers_status
ON workers(status);

CREATE INDEX IF NOT EXISTS idx_workers_last_seen
ON workers(last_seen_at);

CREATE INDEX IF NOT EXISTS idx_credentials_worker
ON worker_credentials(worker_id);
