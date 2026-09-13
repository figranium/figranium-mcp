import crypto from "node:crypto";
import { decryptSecret, encryptSecret, hashOpaqueSecret, randomOpaqueSecret } from "./security.js";
import { sql } from "./neon.js";

export interface OAuthClient {
  clientId: string;
  clientName: string;
  redirectUris: string[];
  authMethod: "none" | "client_secret_basic";
  clientSecretHash?: string;
}
export interface Connection { id: string; baseUrl: string; apiKey: string }

export async function getClient(clientId: string): Promise<OAuthClient | undefined> {
  const rows = await sql<{client_id:string;client_name:string;redirect_uris:string;token_endpoint_auth_method:string;client_secret_hash:string|null}>(
    `SELECT client_id, client_name, redirect_uris::text, token_endpoint_auth_method, client_secret_hash FROM oauth_clients WHERE client_id = $1`, [clientId]);
  const row = rows[0]; if (!row) return undefined;
  return { clientId: row.client_id, clientName: row.client_name, redirectUris: JSON.parse(row.redirect_uris), authMethod: row.token_endpoint_auth_method as OAuthClient["authMethod"], clientSecretHash: row.client_secret_hash ?? undefined };
}

export async function registerClient(input: {clientName:string; redirectUris:string[]; authMethod:"none"|"client_secret_basic"; applicationType:"web"|"native"}) {
  const clientId = randomOpaqueSecret(24);
  const clientSecret = input.authMethod === "client_secret_basic" ? randomOpaqueSecret(32) : undefined;
  await sql(`INSERT INTO oauth_clients (client_id, client_name, redirect_uris, token_endpoint_auth_method, client_secret_hash, application_type) VALUES ($1,$2,$3::jsonb,$4,$5,$6)`,
    [clientId, input.clientName, JSON.stringify(input.redirectUris), input.authMethod, clientSecret ? hashOpaqueSecret(clientSecret) : null, input.applicationType]);
  return { clientId, clientSecret };
}

export async function createAuthorization(input: {clientId:string; redirectUri:string; codeChallenge:string; scope:string; resource:string; baseUrl:string; apiKey:string}) {
  const connectionId = crypto.randomUUID();
  const code = randomOpaqueSecret(32);
  await sql(`INSERT INTO oauth_connections (id, base_url, api_key_ciphertext) VALUES ($1,$2,$3)`, [connectionId, input.baseUrl, encryptSecret(input.apiKey)]);
  await sql(`INSERT INTO oauth_authorization_codes (code_hash, connection_id, client_id, redirect_uri, code_challenge, scope, resource, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now() + interval '5 minutes')`,
    [hashOpaqueSecret(code), connectionId, input.clientId, input.redirectUri, input.codeChallenge, input.scope, input.resource]);
  return code;
}

export interface AuthorizationCodeRecord {
  connection_id: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  resource: string;
}

export async function getAuthorizationCode(code: string): Promise<AuthorizationCodeRecord | undefined> {
  const rows = await sql<AuthorizationCodeRecord>(
    `SELECT connection_id, client_id, redirect_uri, code_challenge, scope, resource FROM oauth_authorization_codes WHERE code_hash=$1 AND used_at IS NULL AND expires_at>now()`,
    [hashOpaqueSecret(code)],
  );
  return rows[0];
}

export async function consumeAuthorizationCode(code: string): Promise<boolean> {
  const rows = await sql<{ consumed: string }>(
    `UPDATE oauth_authorization_codes SET used_at=now() WHERE code_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING 'true' AS consumed`,
    [hashOpaqueSecret(code)],
  );
  return rows.length === 1;
}

export async function issueTokens(input:{connectionId:string;clientId:string;scope:string;resource:string}) {
  const accessToken = randomOpaqueSecret(32); const refreshToken = randomOpaqueSecret(48);
  await sql(`INSERT INTO oauth_access_tokens (token_hash, connection_id, client_id, scope, resource, expires_at) VALUES ($1,$2,$3,$4,$5, now()+interval '1 hour')`,
    [hashOpaqueSecret(accessToken), input.connectionId, input.clientId, input.scope, input.resource]);
  await sql(`INSERT INTO oauth_refresh_tokens (token_hash, connection_id, client_id, scope, resource, expires_at) VALUES ($1,$2,$3,$4,$5, now()+interval '30 days')`,
    [hashOpaqueSecret(refreshToken), input.connectionId, input.clientId, input.scope, input.resource]);
  return { accessToken, refreshToken, expiresIn: 3600, scope: input.scope, resource: input.resource };
}

export async function rotateRefreshToken(refreshToken:string, clientId:string) {
  const rows = await sql<{connection_id:string;scope:string;resource:string}>(
    `UPDATE oauth_refresh_tokens SET revoked_at=now() WHERE token_hash=$1 AND client_id=$2 AND revoked_at IS NULL AND expires_at>now() RETURNING connection_id,scope,resource`,
    [hashOpaqueSecret(refreshToken), clientId]);
  const row=rows[0]; if(!row) return undefined;
  return issueTokens({connectionId:row.connection_id,clientId,scope:row.scope,resource:row.resource});
}

export async function resolveAccessToken(token:string, resource:string):Promise<Connection|undefined> {
  const rows = await sql<{id:string;base_url:string;api_key_ciphertext:string}>(
    `SELECT c.id,c.base_url,c.api_key_ciphertext FROM oauth_access_tokens t JOIN oauth_connections c ON c.id=t.connection_id WHERE t.token_hash=$1 AND t.resource=$2 AND t.revoked_at IS NULL AND t.expires_at>now()`,
    [hashOpaqueSecret(token), resource]);
  const row=rows[0]; if(!row) return undefined;
  return {id:row.id,baseUrl:row.base_url,apiKey:decryptSecret(row.api_key_ciphertext)};
}

export async function revokeToken(token:string) {
  const hash=hashOpaqueSecret(token);
  await sql(`UPDATE oauth_access_tokens SET revoked_at=now() WHERE token_hash=$1`,[hash]);
  await sql(`UPDATE oauth_refresh_tokens SET revoked_at=now() WHERE token_hash=$1`,[hash]);
}
