import type { IncomingMessage, ServerResponse } from "node:http";
import { handleMcpHttpRequest } from "../src/http.js";

type VercelRequest = IncomingMessage & { body?: unknown };

export default async function handler(req: VercelRequest, res: ServerResponse) {
  await handleMcpHttpRequest(req, res);
}
