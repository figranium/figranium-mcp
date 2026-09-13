import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createFigraniumServer } from "./mcp-server.js";
import { resolveOAuthCredentials } from "./oauth.js";
import { issuerFromEnv, validatePublicBaseUrl } from "./security.js";

type HttpRequest = IncomingMessage & { body?: unknown };
const BASE_URL_HEADER = "x-figranium-base-url";
const API_KEY_HEADER = "x-figranium-api-key";

function configureCors(res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Authorization, X-Figranium-Base-URL, X-Figranium-API-Key, Mcp-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name");
  res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id, WWW-Authenticate");
}
function headerValue(req: IncomingMessage, name: string): string | undefined { const value=req.headers[name]; return Array.isArray(value)?value[0]:value; }
function bearer(req:IncomingMessage){const auth=headerValue(req,"authorization")?.trim();const m=auth&&/^Bearer\s+(.+)$/i.exec(auth);return m?.[1]?.trim();}
function legacyApiKey(req:IncomingMessage){return headerValue(req,API_KEY_HEADER)?.trim() || bearer(req);}
function respondJson(res:ServerResponse,statusCode:number,body:unknown){res.statusCode=statusCode;res.setHeader("Content-Type","application/json");res.end(JSON.stringify(body));}
function oauthChallenge(res:ServerResponse){res.setHeader("WWW-Authenticate",`Bearer realm="Figranium MCP", resource_metadata="${issuerFromEnv()}/.well-known/oauth-protected-resource/mcp", scope="mcp:access"`);}

export async function handleMcpHttpRequest(req: HttpRequest, res: ServerResponse) {
  configureCors(res);
  if(req.method==="OPTIONS"){res.statusCode=204;res.end();return;}

  const rawBaseUrl=headerValue(req,BASE_URL_HEADER)?.trim();
  let baseUrl:string|undefined; let apiKey:string|undefined;

  if(rawBaseUrl){
    apiKey=legacyApiKey(req);
    if(!apiKey){oauthChallenge(res);respondJson(res,401,{error:"Figranium credentials are required.",required:{baseUrl:"X-Figranium-Base-URL",apiKey:"Authorization: Bearer <FIGRANIUM_API_KEY> or X-Figranium-API-Key"}});return;}
    try{baseUrl=validatePublicBaseUrl(rawBaseUrl);}catch(error){respondJson(res,400,{error:error instanceof Error?error.message:"Invalid Figranium base URL."});return;}
  } else if(bearer(req)) {
    try {
      const connection=await resolveOAuthCredentials(req);
      if(connection){baseUrl=connection.baseUrl;apiKey=connection.apiKey;}
      else{oauthChallenge(res);respondJson(res,401,{error:"invalid_token"});return;}
    } catch {
      respondJson(res,500,{jsonrpc:"2.0",error:{code:-32603,message:"OAuth persistence unavailable"},id:null});
      return;
    }
  } else {
    oauthChallenge(res);respondJson(res,401,{error:"Figranium credentials are required.",oauth:`${issuerFromEnv()}/.well-known/oauth-protected-resource/mcp`,legacy:{baseUrl:"X-Figranium-Base-URL",apiKey:"X-Figranium-API-Key"}});return;
  }

  const server=createFigraniumServer({baseUrl:baseUrl!,apiKey:apiKey!});
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  try{await server.connect(transport);await transport.handleRequest(req,res,req.body);}catch(error){
    console.error("Failed to handle Figranium MCP HTTP request", error instanceof Error?error.name:"unknown_error");
    if(!res.headersSent)respondJson(res,500,{jsonrpc:"2.0",error:{code:-32603,message:"Internal server error"},id:null});else if(!res.writableEnded)res.end();
  } finally {await transport.close().catch(()=>undefined);await server.close().catch(()=>undefined);}
}
