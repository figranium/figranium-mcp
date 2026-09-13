CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id text PRIMARY KEY,
  client_name text NOT NULL,
  redirect_uris jsonb NOT NULL,
  token_endpoint_auth_method text NOT NULL CHECK (token_endpoint_auth_method IN ('none','client_secret_basic')),
  client_secret_hash text,
  application_type text NOT NULL DEFAULT 'web' CHECK (application_type IN ('web','native')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oauth_connections (
  id uuid PRIMARY KEY,
  base_url text NOT NULL,
  api_key_ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_hash text PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES oauth_connections(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  scope text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  token_hash text PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES oauth_connections(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  scope text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash text PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES oauth_connections(id) ON DELETE CASCADE,
  client_id text NOT NULL REFERENCES oauth_clients(client_id) ON DELETE CASCADE,
  scope text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS oauth_access_tokens_connection_idx ON oauth_access_tokens(connection_id);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_connection_idx ON oauth_refresh_tokens(connection_id);
