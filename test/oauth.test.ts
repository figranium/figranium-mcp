import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { decryptSecret, encryptSecret, signAuthorizationRequest, validatePkce, validatePublicBaseUrl, verifyAuthorizationRequest } from "../src/security.js";

process.env.FIGRANIUM_OAUTH_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

test("AES-GCM secret encryption round trips without plaintext storage",()=>{const encrypted=encryptSecret("secret-api-key");assert.ok(!encrypted.includes("secret-api-key"));assert.equal(decryptSecret(encrypted),"secret-api-key");});
test("PKCE S256 verifier validation",()=>{const verifier="abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~abc";const challenge=crypto.createHash("sha256").update(verifier).digest("base64url");assert.equal(validatePkce(verifier,challenge),true);assert.equal(validatePkce(verifier,"x".repeat(43)),false);});
test("authorization requests are signed and expire",()=>{const token=signAuthorizationRequest({clientId:"c",exp:Math.floor(Date.now()/1000)+60});assert.equal(verifyAuthorizationRequest<any>(token).clientId,"c");assert.throws(()=>verifyAuthorizationRequest(token+"x"));});
test("public URL validation blocks SSRF literals and localhost",()=>{assert.throws(()=>validatePublicBaseUrl("http://127.0.0.1:11345"));assert.throws(()=>validatePublicBaseUrl("http://10.0.0.4"));assert.throws(()=>validatePublicBaseUrl("http://localhost:11345"));assert.equal(validatePublicBaseUrl("https://figranium.example.com/"),"https://figranium.example.com");});
