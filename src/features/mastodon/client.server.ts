import { eq } from "drizzle-orm";
import { decryptCredential } from "../connections/credentials.server";
import { getDatabase } from "../storage/database.server";
import { connectionCredentials, connections } from "../storage/schema";
import { requireMastodonOrigin, safeMastodonRequest } from "./transport.server";

export async function requestMastodon(
  connectionId: string,
  path: string,
  query?: URLSearchParams,
): Promise<Response> {
  if (
    !path.startsWith("/api/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    path.includes("?") ||
    path.includes("#")
  ) {
    throw new Error("Invalid Mastodon API path.");
  }
  const database = getDatabase();
  const connection = database
    .select()
    .from(connections)
    .where(eq(connections.id, connectionId))
    .get();
  if (connection?.platform !== "mastodon" || connection.status !== "connected")
    throw new Error("Mastodon connection is unavailable. Reconnect this account.");
  const credential = database
    .select()
    .from(connectionCredentials)
    .where(eq(connectionCredentials.connectionId, connectionId))
    .get();
  if (!credential) throw new Error("Mastodon credentials are unavailable. Reconnect this account.");
  const url = new URL(path, requireMastodonOrigin(connection.origin));
  if (query) url.search = query.toString();
  const response = await safeMastodonRequest(url, {
    headers: {
      authorization: `Bearer ${decryptCredential(credential.encryptedToken, `connection:${connectionId}:access-token`)}`,
    },
  });
  if (response.status === 401) {
    database.transaction(
      (tx) => {
        const current = tx
          .select()
          .from(connectionCredentials)
          .where(eq(connectionCredentials.connectionId, connectionId))
          .get();
        if (current?.encryptedToken !== credential.encryptedToken) return;
        tx.update(connections)
          .set({ status: "expired", updatedAt: Date.now() })
          .where(eq(connections.id, connectionId))
          .run();
      },
      { behavior: "immediate" },
    );
  }
  return response;
}
