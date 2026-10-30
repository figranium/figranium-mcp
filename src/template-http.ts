/**
 * Authenticated template catalog requests are intentionally separate from the
 * SDK until its redirect-hardening release is published. Never follow a 3xx:
 * native fetch forwards custom x-api-key headers across origins.
 */
export async function fetchAuthenticatedTemplate(url: string, apiKey: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "x-api-key": apiKey, accept: "application/json" },
    redirect: "manual",
  });
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    throw new Error(`Template request refused HTTP redirect (${response.status})`);
  }
  if (!response.ok) throw new Error(`Template request failed (${response.status})`);
  return response.json();
}
