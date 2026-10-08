import { readFile } from "node:fs/promises";

export async function runtimeConnection(): Promise<{ url: string; token: string }> {
  const token =
    process.env.WORKSPACE_RUNTIME_TOKEN ||
    (process.env.WORKSPACE_RUNTIME_TOKEN_FILE
      ? (await readFile(process.env.WORKSPACE_RUNTIME_TOKEN_FILE, "utf8")).trim()
      : "");
  if (!token)
    throw new Error("WORKSPACE_RUNTIME_TOKEN or WORKSPACE_RUNTIME_TOKEN_FILE is required.");
  return {
    url: (process.env.WORKSPACE_RUNTIME_URL || "http://127.0.0.1:4318").replace(/\/$/, ""),
    token,
  };
}
