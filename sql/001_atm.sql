CREATE TABLE IF NOT EXISTS atm_settings (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  node_id TEXT,
  node_name TEXT,
  api_key_ciphertext TEXT,
  cash_cents BIGINT NOT NULL DEFAULT 0 CHECK (cash_cents >= 0),
  active_operation_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO atm_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS atm_operations (
  id UUID PRIMARY KEY,
  idempotency_key UUID NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  node_id TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('retiro', 'deposito')),
  numero_cuenta TEXT NOT NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'rejected')),
  receipt JSONB,
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS atm_one_pending_operation ON atm_operations ((TRUE)) WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS atm_central_transaction_unique ON atm_operations ((receipt->>'transaction_id')) WHERE status = 'succeeded';
CREATE INDEX IF NOT EXISTS atm_operations_created ON atm_operations (created_at DESC);

CREATE TABLE IF NOT EXISTS atm_sessions (
  sid VARCHAR NOT NULL PRIMARY KEY,
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS atm_sessions_expire ON atm_sessions (expire);
