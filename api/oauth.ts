import type { IncomingMessage, ServerResponse } from "node:http";
import { handleOAuthHttpRequest } from "../src/oauth.js";
type VercelRequest = IncomingMessage & { body?: unknown };
export default async function handler(req:VercelRequest,res:ServerResponse){await handleOAuthHttpRequest(req,res);}
