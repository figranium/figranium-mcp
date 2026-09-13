interface NeonField { name: string }
interface NeonResult { fields: NeonField[]; rows: (string | null)[][]; rowCount?: number }

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error("DATABASE_URL is required");
  return value;
}

export async function sql<T = Record<string, string | null>>(query: string, params: unknown[] = []): Promise<T[]> {
  const connectionString = databaseUrl();
  const parsed = new URL(connectionString);
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") throw new Error("DATABASE_URL must be a Postgres connection string");
  const endpoint = `https://${parsed.hostname}/sql`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Neon-Connection-String": connectionString,
      "Neon-Raw-Text-Output": "true",
      "Neon-Array-Mode": "true",
    },
    body: JSON.stringify({ query, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Database query failed with HTTP ${response.status}`);
  const result = await response.json() as NeonResult;
  const names = result.fields.map((field) => field.name);
  return result.rows.map((row) => Object.fromEntries(row.map((value, i) => [names[i], value])) as T);
}
