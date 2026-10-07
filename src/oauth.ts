import type { IncomingMessage, ServerResponse } from "node:http";
import {
  consumeAuthorizationCode,
  createAuthorization,
  getAuthorizationCode,
  getClient,
  issueTokens,
  registerClient,
  resolveAccessToken,
  revokeToken,
  rotateRefreshToken,
} from "./oauth-store.js";
import {
  hashOpaqueSecret,
  issuerFromEnv,
  signAuthorizationRequest,
  timingSafeEqualStrings,
  validatePkce,
  validatePublicBaseUrl,
  verifyAuthorizationRequest,
} from "./security.js";

type Req = IncomingMessage & { body?: unknown };
const SCOPES = ["mcp:access", "offline_access"];
const MAX_BODY_BYTES = 64 * 1024;

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("pragma", "no-cache");
  res.end(JSON.stringify(body));
}

function html(res: ServerResponse, status: number, body: string) {
  res.statusCode = status;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("pragma", "no-cache");
  res.end(body);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char]!);
}

async function rawBody(req: Req): Promise<string> {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  let data = "";
  for await (const chunk of req) {
    data += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (Buffer.byteLength(data, "utf8") > MAX_BODY_BYTES) throw new Error("request_too_large");
  }
  return data;
}

async function form(req: Req): Promise<URLSearchParams> {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return new URLSearchParams(
      Object.entries(req.body as Record<string, unknown>).map(([key, value]) => [key, String(value)]),
    );
  }
  return new URLSearchParams(await rawBody(req));
}

async function jsonBody(req: Req): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }
  const raw = await rawBody(req);
  const parsed: unknown = JSON.parse(raw || "{}");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
  return parsed as Record<string, unknown>;
}

function requestUrl(req: IncomingMessage) {
  return new URL(req.url || "/", issuerFromEnv());
}

function resourceUri() {
  return `${issuerFromEnv()}/mcp`;
}

function oauthError(res: ServerResponse, status: number, error: string, description?: string) {
  json(res, status, { error, ...(description ? { error_description: description } : {}) });
}

function redirectError(
  res: ServerResponse,
  redirectUri: string,
  state: string | undefined,
  error: string,
  description?: string,
) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  if (description) url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  url.searchParams.set("iss", issuerFromEnv());
  res.statusCode = 302;
  res.setHeader("location", url.toString());
  res.setHeader("cache-control", "no-store");
  res.end();
}

async function authenticatedClient(req: Req, params: URLSearchParams) {
  let clientId = params.get("client_id") || "";
  let secret = params.get("client_secret") || "";
  const authorization = req.headers.authorization;
  if (authorization?.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      if (separator < 0) return undefined;
      clientId = decodeURIComponent(decoded.slice(0, separator));
      secret = decodeURIComponent(decoded.slice(separator + 1));
    } catch {
      return undefined;
    }
  }

  const client = await getClient(clientId);
  if (!client) return undefined;
  if (client.authMethod === "none") return client;
  if (!client.clientSecretHash || !secret) return undefined;
  if (!timingSafeEqualStrings(client.clientSecretHash, hashOpaqueSecret(secret))) return undefined;
  return client;
}

async function validateFigranium(baseUrl: string, apiKey: string) {
  if (!apiKey.trim()) throw new Error("API key is required.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${baseUrl}/api/tasks`, {
      headers: { accept: "application/json", "x-api-key": apiKey },
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        response.status === 401 || response.status === 403
          ? "The API key was rejected by this Figranium instance."
          : `Figranium returned HTTP ${response.status}.`,
      );
    }
  } catch (error) {
    if (error instanceof Error && !error.name.includes("Abort")) throw error;
    throw new Error("Unable to reach the Figranium instance.");
  } finally {
    clearTimeout(timer);
  }
}

function connectForm(clientName: string, signedRequest: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Figranium</title><style>
@font-face{font-family:Questrial;font-style:normal;font-weight:400;font-display:swap;src:url("https://figranium.dev/_next/static/media/2f19417f17ff8e58-s.p.4374e180.woff2") format("woff2")}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f5f9fc;color:#171c26;font-family:Questrial,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;place-items:center;padding:32px 20px}main{width:min(100%,540px)}.brand{display:flex;justify-content:center;align-items:center;margin-bottom:24px}.brand img{display:block;width:172px;height:auto;filter:invert(1)}.card{background:#ffffffd9;border:1px solid #dce2ea;border-radius:22px;padding:34px;box-shadow:0 18px 55px #202b3c14;backdrop-filter:blur(16px)}h1{font-size:32px;line-height:1.08;font-weight:400;letter-spacing:-.035em;margin:0 0 10px}.intro{color:#687485;line-height:1.5;margin:0 0 28px}.client{color:#2868e8}label{display:block;margin:18px 0 8px;font-size:14px;color:#354052}input{width:100%;height:48px;padding:0 14px;border:1px solid #d5dce5;border-radius:11px;background:#fff;color:#171c26;font:inherit;outline:none;transition:border-color .15s,box-shadow .15s}input:focus{border-color:#2868e8;box-shadow:0 0 0 3px #2868e81a}input::placeholder{color:#9aa4b2}.note{display:flex;gap:9px;align-items:flex-start;margin:18px 0 0;padding:13px 14px;border-radius:11px;background:#f3f7fb;color:#687485;font-size:13px;line-height:1.45}.lock{color:#2868e8;font-size:14px;line-height:1.4}button{width:100%;height:50px;margin-top:22px;border:0;border-radius:11px;background:#2868e8;color:#fff;font:inherit;font-weight:600;cursor:pointer;transition:background .15s,transform .15s}button:hover{background:#1f5ed7}button:active{transform:translateY(1px)}.privacy{text-align:center;color:#8993a1;font-size:12px;margin:16px 0 0}@media(max-width:560px){body{padding:18px}.card{padding:26px 22px;border-radius:18px}h1{font-size:28px}.brand{margin-bottom:18px}}
</style></head><body><main><div class="brand"><img src="https://figranium.dev/logo.svg" alt="Figranium"></div><section class="card"><h1>Connect to <span class="client">${escapeHtml(clientName)}</span></h1><p class="intro">Authorize this client to use your Figranium tasks through the MCP server.</p><form method="post" action="/authorize"><input type="hidden" name="request" value="${escapeHtml(signedRequest)}"><label for="base_url">Figranium instance URL</label><input id="base_url" type="url" name="base_url" required inputmode="url" autocomplete="url" placeholder="https://figranium.example.com"><label for="api_key">API key</label><input id="api_key" type="password" name="api_key" required autocomplete="off" placeholder="Enter your API key"><div class="note"><span class="lock">●</span><span>Your API key is encrypted before storage. Your instance must be publicly reachable; localhost and private addresses are blocked.</span></div><button type="submit">Connect Figranium</button></form><p class="privacy">You can revoke access at any time from your Figranium API keys.</p></section></main></body></html>`;
}

function connectError(message: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Could not connect</title><style>body{font:16px system-ui;margin:8vh auto;max-width:520px;padding:24px;color:#171717}p{color:#555}</style></head><body><h1>Could not connect</h1><p>${escapeHtml(message)}</p></body></html>`;
}

export async function handleOAuthHttpRequest(req: Req, res: ServerResponse) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline' https://figranium.dev; font-src https://figranium.dev; img-src https://figranium.dev; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  );

  const url = requestUrl(req);
  const routed = url.searchParams.get("route");
  const path = routed === "protected-resource" ? "/.well-known/oauth-protected-resource"
    : routed === "protected-resource-mcp" ? "/.well-known/oauth-protected-resource/mcp"
    : routed === "authorization-server" ? "/.well-known/oauth-authorization-server"
    : routed === "authorize" ? "/authorize"
    : routed === "token" ? "/token"
    : routed === "register" ? "/register"
    : routed === "revoke" ? "/revoke"
    : url.pathname;

  if (
    req.method === "GET" &&
    (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/mcp")
  ) {
    return json(res, 200, {
      resource: resourceUri(),
      authorization_servers: [issuerFromEnv()],
      scopes_supported: SCOPES,
      bearer_methods_supported: ["header"],
    });
  }

  if (req.method === "GET" && path === "/.well-known/oauth-authorization-server") {
    return json(res, 200, {
      issuer: issuerFromEnv(),
      authorization_endpoint: `${issuerFromEnv()}/authorize`,
      token_endpoint: `${issuerFromEnv()}/token`,
      registration_endpoint: `${issuerFromEnv()}/register`,
      revocation_endpoint: `${issuerFromEnv()}/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_basic"],
      revocation_endpoint_auth_methods_supported: ["none", "client_secret_basic"],
      scopes_supported: SCOPES,
      authorization_response_iss_parameter_supported: true,
      client_id_metadata_document_supported: false,
    });
  }

  if (req.method === "POST" && path === "/register") {
    let body: Record<string, unknown>;
    try {
      body = await jsonBody(req);
    } catch {
      return oauthError(res, 400, "invalid_client_metadata");
    }

    const applicationType = body.application_type === "native" ? "native" : body.application_type === undefined || body.application_type === "web" ? "web" : undefined;
    if (!applicationType) return oauthError(res, 400, "invalid_client_metadata", "Unsupported application_type.");
    const redirects = Array.isArray(body.redirect_uris)
      ? body.redirect_uris.filter((value): value is string => typeof value === "string")
      : [];
    if (
      !redirects.length ||
      redirects.some((redirect) => {
        try {
          const candidate = new URL(redirect);
          if (candidate.hash) return true;
          const loopback = candidate.hostname === "127.0.0.1" || candidate.hostname === "[::1]" || candidate.hostname === "::1" || candidate.hostname === "localhost";
          if (applicationType === "native") return !(candidate.protocol === "https:" || (loopback && candidate.protocol === "http:"));
          return candidate.protocol !== "https:";
        } catch {
          return true;
        }
      })
    ) {
      return oauthError(res, 400, "invalid_redirect_uri");
    }

    const requestedMethod = body.token_endpoint_auth_method ?? "none";
    if (requestedMethod !== "none" && requestedMethod !== "client_secret_basic") {
      return oauthError(res, 400, "invalid_client_metadata", "Unsupported token endpoint authentication method.");
    }
    const method = requestedMethod as "none" | "client_secret_basic";
    const created = await registerClient({
      clientName: String(body.client_name || "MCP client").slice(0, 200),
      redirectUris: redirects,
      authMethod: method,
      applicationType,
    });
    return json(res, 201, {
      client_id: created.clientId,
      ...(created.clientSecret ? { client_secret: created.clientSecret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1_000),
      redirect_uris: redirects,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: method,
      application_type: applicationType,
    });
  }

  if (req.method === "GET" && path === "/authorize") {
    const query = url.searchParams;
    const clientId = query.get("client_id") || "";
    const redirectUri = query.get("redirect_uri") || "";
    const state = query.get("state") || undefined;
    const client = await getClient(clientId);
    if (!client || !client.redirectUris.includes(redirectUri)) {
      return oauthError(res, 400, "invalid_request", "Unknown client or redirect URI.");
    }
    if (query.get("response_type") !== "code") {
      return redirectError(res, redirectUri, state, "unsupported_response_type");
    }
    const scope = query.get("scope") || "mcp:access";
    const requestedScopes = scope.split(/\s+/).filter(Boolean);
    if (!requestedScopes.includes("mcp:access") || requestedScopes.some((item) => !SCOPES.includes(item))) {
      return redirectError(res, redirectUri, state, "invalid_scope");
    }
    const resource = query.get("resource") || "";
    if (resource !== resourceUri()) {
      return redirectError(res, redirectUri, state, "invalid_target", "The MCP resource parameter is required.");
    }
    const challenge = query.get("code_challenge") || "";
    if (query.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
      return redirectError(res, redirectUri, state, "invalid_request", "PKCE S256 is required.");
    }

    const signed = signAuthorizationRequest({
      clientId,
      redirectUri,
      state,
      scope,
      resource,
      challenge,
      exp: Math.floor(Date.now() / 1_000) + 600,
    });
    return html(res, 200, connectForm(client.clientName, signed));
  }

  if (req.method === "POST" && path === "/authorize") {
    const params = await form(req);
    let authorization: {
      clientId: string;
      redirectUri: string;
      state?: string;
      scope: string;
      resource: string;
      challenge: string;
    };
    try {
      authorization = verifyAuthorizationRequest<typeof authorization>(params.get("request") || "");
    } catch {
      return oauthError(res, 400, "invalid_request", "Authorization request expired or invalid.");
    }

    let baseUrl: string;
    try {
      baseUrl = validatePublicBaseUrl(params.get("base_url") || "");
      await validateFigranium(baseUrl, params.get("api_key") || "");
    } catch (error) {
      return html(
        res,
        400,
        connectError(error instanceof Error ? error.message : "Validation failed"),
      );
    }

    const code = await createAuthorization({
      clientId: authorization.clientId,
      redirectUri: authorization.redirectUri,
      codeChallenge: authorization.challenge,
      scope: authorization.scope,
      resource: authorization.resource,
      baseUrl,
      apiKey: params.get("api_key") || "",
    });
    const target = new URL(authorization.redirectUri);
    target.searchParams.set("code", code);
    if (authorization.state) target.searchParams.set("state", authorization.state);
    target.searchParams.set("iss", issuerFromEnv());
    res.statusCode = 302;
    res.setHeader("location", target.toString());
    res.setHeader("cache-control", "no-store");
    return res.end();
  }

  if (req.method === "POST" && path === "/token") {
    const params = await form(req);
    const client = await authenticatedClient(req, params);
    if (!client) {
      res.setHeader("WWW-Authenticate", 'Basic realm="Figranium OAuth"');
      return oauthError(res, 401, "invalid_client");
    }

    const grant = params.get("grant_type");
    if (grant === "authorization_code") {
      const rawCode = params.get("code") || "";
      const code = await getAuthorizationCode(rawCode);
      if (
        !code ||
        code.client_id !== client.clientId ||
        code.redirect_uri !== (params.get("redirect_uri") || "") ||
        code.resource !== (params.get("resource") || "")
      ) {
        return oauthError(res, 400, "invalid_grant");
      }
      if (!validatePkce(params.get("code_verifier") || "", code.code_challenge)) {
        return oauthError(res, 400, "invalid_grant", "PKCE verification failed.");
      }
      if (!(await consumeAuthorizationCode(rawCode))) return oauthError(res, 400, "invalid_grant");
      const tokens = await issueTokens({
        connectionId: code.connection_id,
        clientId: client.clientId,
        scope: code.scope,
        resource: code.resource,
      });
      return json(res, 200, {
        access_token: tokens.accessToken,
        token_type: "Bearer",
        expires_in: tokens.expiresIn,
        refresh_token: tokens.refreshToken,
        scope: tokens.scope,
      });
    }

    if (grant === "refresh_token") {
      const requestedResource = params.get("resource");
      if (requestedResource && requestedResource !== resourceUri()) {
        return oauthError(res, 400, "invalid_target");
      }
      const rotated = await rotateRefreshToken(params.get("refresh_token") || "", client.clientId);
      if (!rotated) return oauthError(res, 400, "invalid_grant");
      return json(res, 200, {
        access_token: rotated.accessToken,
        token_type: "Bearer",
        expires_in: rotated.expiresIn,
        refresh_token: rotated.refreshToken,
        scope: rotated.scope,
      });
    }
    return oauthError(res, 400, "unsupported_grant_type");
  }

  if (req.method === "POST" && path === "/revoke") {
    const params = await form(req);
    const client = await authenticatedClient(req, params);
    if (!client) return oauthError(res, 401, "invalid_client");
    await revokeToken(params.get("token") || "");
    res.statusCode = 200;
    res.setHeader("cache-control", "no-store");
    return res.end();
  }

  return json(res, 404, { error: "not_found" });
}

export async function resolveOAuthCredentials(req: IncomingMessage) {
  const authorization = req.headers.authorization?.trim();
  if (!authorization) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (!match) return undefined;
  return resolveAccessToken(match[1], resourceUri());
}
