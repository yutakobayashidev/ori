import type { APIRequestContext } from "@playwright/test";

export async function mcpAuthorization(client: APIRequestContext) {
  const response = await client.post("https://127.0.0.1:6913/test/access-token", {
    ignoreHTTPSErrors: true,
    data: {},
  });
  if (!response.ok()) throw new Error("Test issuer did not issue an access token.");
  return `Bearer ${(await response.json()).access_token}`;
}
