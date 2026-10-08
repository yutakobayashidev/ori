import { runtimeConnection } from "./runtime-config.server";

export class ExecutionError extends Error {}

export async function runtimeRequest(path: string, init: RequestInit = {}) {
  const { url, token } = await runtimeConnection();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  return fetch(`${url}${path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });
}

export async function runtimeJson(path: string, body?: unknown) {
  const response = await runtimeRequest(
    path,
    body === undefined ? {} : { method: "POST", body: JSON.stringify(body) },
  );
  if (!response.ok) {
    if (response.status === 409)
      throw new ExecutionError(
        "This execution changed or already has work in progress. Refresh before trying again.",
      );
    if (response.status === 404) throw new ExecutionError("Execution not found.");
    throw new ExecutionError("The AI runtime could not accept this request.");
  }
  return response.json();
}
