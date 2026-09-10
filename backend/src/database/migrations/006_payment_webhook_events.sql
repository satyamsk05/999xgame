-- 006_payment_webhook_events.sql — durable provider webhook replay protection.
-- Event IDs are unique; the payload hash prevents reusing one ID for a different payload.
CREATE TABLE IF NOT EXISTS payment_webhook_events (
    id VARCHAR(64) PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    event_id VARCHAR(150) NOT NULL UNIQUE,
    payload_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PROCESSED',
    deposit_id VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_deposit ON payment_webhook_events(deposit_id);
CREATE INDEX IF NOT EXISTS idx_payment_webhook_events_provider ON payment_webhook_events(provider, created_at DESC);
