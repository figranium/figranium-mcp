import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { handleOAuthHttpRequest } from "../src/oauth.js";
import { handleMcpHttpRequest } from "../src/http.js";

process.env.FIGRANIUM_OAUTH_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.DATABASE_URL = "postgresql://u:p@db.example.neon.tech/db";
process.env.OAUTH_ISSUER = "https://mcp.figranium.dev";

type Row = Record<string,string|null>;
const clients=new Map<string,Row>();const connections=new Map<string,Row>();const codes=new Map<string,Row>();const access=new Map<string,Row>();const refresh=new Map<string,Row>();
function dbResponse(rows:Row[]=[]){const fields=Object.keys(rows[0]||{}).map(name=>({name}));return new Response(JSON.stringify({fields,rows:rows.map(r=>fields.map(f=>r[f.name]??null)),rowCount:rows.length}),{status:200,headers:{"content-type":"application/json"}});}
const realFetch=globalThis.fetch;
globalThis.fetch=async(input:any,init:any={})=>{
  const url=String(input);
  if(url==="https://fig.example/api/tasks") return new Response("[]",{status:200,headers:{"content-type":"application/json"}});
  if(url!=="https://db.example.neon.tech/sql") return realFetch(input,init);
  const {query,params=[]}=JSON.parse(String(init.body||"{}"));const q=String(query).replace(/\s+/g," ").trim();
  if(q.startsWith("INSERT INTO oauth_clients")){clients.set(params[0],{client_id:params[0],client_name:params[1],redirect_uris:params[2],token_endpoint_auth_method:params[3],client_secret_hash:params[4],application_type:params[5]});return dbResponse();}
  if(q.startsWith("SELECT client_id")){const r=clients.get(params[0]);return dbResponse(r?[r]:[]);}
  if(q.startsWith("INSERT INTO oauth_connections")){connections.set(params[0],{id:params[0],base_url:params[1],api_key_ciphertext:params[2]});return dbResponse();}
  if(q.startsWith("INSERT INTO oauth_authorization_codes")){codes.set(params[0],{code_hash:params[0],connection_id:params[1],client_id:params[2],redirect_uri:params[3],code_challenge:params[4],scope:params[5],resource:params[6],used_at:null});return dbResponse();}
  if(q.startsWith("SELECT connection_id, client_id, redirect_uri, code_challenge, scope, resource FROM oauth_authorization_codes")){const r=codes.get(params[0]);if(!r||r.used_at)return dbResponse();return dbResponse([{connection_id:r.connection_id,client_id:r.client_id,redirect_uri:r.redirect_uri,code_challenge:r.code_challenge,scope:r.scope,resource:r.resource}]);}
  if(q.startsWith("UPDATE oauth_authorization_codes SET used_at=now()")){const r=codes.get(params[0]);if(!r||r.used_at)return dbResponse();r.used_at="now";return dbResponse([{consumed:"true"}]);}
  if(q.startsWith("INSERT INTO oauth_access_tokens")){access.set(params[0],{token_hash:params[0],connection_id:params[1],client_id:params[2],scope:params[3],resource:params[4],revoked_at:null});return dbResponse();}
  if(q.startsWith("INSERT INTO oauth_refresh_tokens")){refresh.set(params[0],{token_hash:params[0],connection_id:params[1],client_id:params[2],scope:params[3],resource:params[4],revoked_at:null});return dbResponse();}
  if(q.startsWith("SELECT c.id")){const t=access.get(params[0]);if(!t||t.resource!==params[1]||t.revoked_at)return dbResponse();const c=connections.get(t.connection_id!);return dbResponse(c?[c]:[]);}
  if(q.startsWith("UPDATE oauth_refresh_tokens SET revoked_at=now() WHERE token_hash=$1 AND client_id=$2")){const r=refresh.get(params[0]);if(!r||r.client_id!==params[1]||r.revoked_at)return dbResponse();r.revoked_at="now";return dbResponse([{connection_id:r.connection_id,scope:r.scope,resource:r.resource}]);}
  if(q.startsWith("UPDATE oauth_access_tokens SET revoked_at")){const r=access.get(params[0]);if(r)r.revoked_at="now";return dbResponse();}
  if(q.startsWith("UPDATE oauth_refresh_tokens SET revoked_at=now() WHERE token_hash=$1")){const r=refresh.get(params[0]);if(r)r.revoked_at="now";return dbResponse();}
  throw new Error(`Unhandled SQL in test: ${q}`);
};

function request(port:number,path:string,init:{method?:string;headers?:Record<string,string>;body?:string}={}){return fetch(`http://127.0.0.1:${port}${path}`,{method:init.method||"GET",headers:init.headers,body:init.body,redirect:"manual"});}

test("DCR -> authorization+PKCE -> token -> authenticated /mcp -> refresh -> revoke",async()=>{
  const server=http.createServer(async(req:any,res)=>{try{if(req.url?.startsWith("/mcp")){let raw="";for await(const c of req)raw+=c;if(raw)req.body=JSON.parse(raw);await handleMcpHttpRequest(req,res);}else await handleOAuthHttpRequest(req,res);}catch(e){res.statusCode=500;res.end(String(e));}});
  await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const port=(server.address() as any).port;
  try{
    const reg=await request(port,"/register",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({client_name:"Test MCP Client",redirect_uris:["https://client.example/callback"],token_endpoint_auth_method:"none",application_type:"web"})});assert.equal(reg.status,201);const regBody=await reg.json() as any;
    const verifier="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc";const challenge=crypto.createHash("sha256").update(verifier).digest("base64url");
    const qs=new URLSearchParams({response_type:"code",client_id:regBody.client_id,redirect_uri:"https://client.example/callback",scope:"mcp:access offline_access",state:"s1",resource:"https://mcp.figranium.dev/mcp",code_challenge:challenge,code_challenge_method:"S256"});
    const auth=await request(port,"/authorize?"+qs);assert.equal(auth.status,200);const page=await auth.text();const signed=/name="request" value="([^"]+)"/.exec(page)?.[1];assert.ok(signed);
    const approve=await request(port,"/authorize",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({request:signed!,base_url:"https://fig.example",api_key:"api-key-secret"}).toString()});assert.equal(approve.status,302);assert.equal([...connections.values()].some(row=>row.api_key_ciphertext?.includes("api-key-secret")),false);const callback=new URL(approve.headers.get("location")!);assert.equal(callback.searchParams.get("iss"),"https://mcp.figranium.dev");
    const token=await request(port,"/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"authorization_code",client_id:regBody.client_id,code:callback.searchParams.get("code")!,redirect_uri:"https://client.example/callback",resource:"https://mcp.figranium.dev/mcp",code_verifier:verifier}).toString()});assert.equal(token.status,200);const tb=await token.json() as any;assert.ok(tb.access_token);assert.ok(tb.refresh_token);
    const mcp=await request(port,"/mcp",{method:"POST",headers:{authorization:`Bearer ${tb.access_token}`,"content-type":"application/json",accept:"application/json, text/event-stream","mcp-protocol-version":"2025-06-18"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"initialize",params:{protocolVersion:"2025-06-18",capabilities:{},clientInfo:{name:"test",version:"1"}}})});assert.equal(mcp.status,200);
    const refreshed=await request(port,"/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",client_id:regBody.client_id,refresh_token:tb.refresh_token}).toString()});assert.equal(refreshed.status,200);const rb=await refreshed.json() as any;assert.notEqual(rb.refresh_token,tb.refresh_token);
    const revoke=await request(port,"/revoke",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:regBody.client_id,token:rb.access_token}).toString()});assert.equal(revoke.status,200);
    const denied=await request(port,"/mcp",{method:"POST",headers:{authorization:`Bearer ${rb.access_token}`,"content-type":"application/json"},body:"{}"});assert.equal(denied.status,401);
  } finally {await new Promise<void>(r=>server.close(()=>r()));globalThis.fetch=realFetch;}
});
