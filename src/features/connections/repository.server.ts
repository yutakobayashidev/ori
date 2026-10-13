import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { ProfileUnavailableError } from "../profiles/errors";
import { fetchProfileNames } from "../profiles/profile-service.server";
import { type AppDatabase, getDatabase } from "../storage/database.server";
import { connections } from "../storage/schema";
import type { Connection } from "./model";
import { redditGatewayConnection } from "./reddit-gateway.server";

function relayOrigin(): string {
  const configured = process.env.TWITTER_RELAY_BASE_URL;
  if (!configured) throw new ProfileUnavailableError("Set TWITTER_RELAY_BASE_URL.");
  return new URL(configured).origin;
}

async function syncTwitterConnections(
  database: AppDatabase,
  fetchProfiles: typeof fetchProfileNames,
) {
  const origin = relayOrigin();
  const profiles = new Set(
    await fetchProfiles(origin).catch(() => {
      throw new ProfileUnavailableError(
        "Could not verify connection profiles. Check the relay connection and try again.",
      );
    }),
  );
  database.transaction((tx) => {
    const existing = tx.select().from(connections).where(eq(connections.platform, "twitter")).all();
    const now = Date.now();
    for (const connection of existing) {
      const status =
        connection.origin === origin &&
        connection.relayProfile !== null &&
        profiles.has(connection.relayProfile)
          ? "connected"
          : "disconnected";
      if (connection.status !== status) {
        tx.update(connections)
          .set({ status, updatedAt: now })
          .where(eq(connections.id, connection.id))
          .run();
      }
    }
    const known = new Set(
      existing
        .filter((connection) => connection.origin === origin)
        .map((connection) => connection.relayProfile),
    );
    for (const profile of profiles) {
      if (known.has(profile)) continue;
      tx.insert(connections)
        .values({
          id: randomUUID(),
          platform: "twitter",
          origin,
          relayProfile: profile,
          displayName: profile,
          status: "connected",
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
  });
  return origin;
}

const publicFields = {
  id: connections.id,
  platform: connections.platform,
  origin: connections.origin,
  accountId: connections.accountId,
  displayName: connections.displayName,
  status: connections.status,
};

export async function listConnections(
  database = getDatabase(),
  fetchProfiles = fetchProfileNames,
): Promise<{ connections: Connection[]; relayError?: string }> {
  let relayError: string | undefined;
  if (process.env.TWITTER_RELAY_BASE_URL) {
    try {
      await syncTwitterConnections(database, fetchProfiles);
    } catch (error) {
      if (!(error instanceof ProfileUnavailableError)) throw error;
      relayError = error.message;
    }
  } else {
    database
      .update(connections)
      .set({ status: "disconnected", updatedAt: Date.now() })
      .where(and(eq(connections.platform, "twitter"), eq(connections.status, "connected")))
      .run();
  }
  const saved = database
    .select(publicFields)
    .from(connections)
    .orderBy(asc(connections.createdAt), asc(connections.id))
    .all();
  const reddit = redditGatewayConnection();
  return {
    connections: [...saved, ...(reddit ? [reddit] : [])],
    ...(relayError ? { relayError } : {}),
  };
}

export async function requireTwitterConnection(
  id: string,
  database = getDatabase(),
  fetchProfiles = fetchProfileNames,
): Promise<string> {
  const origin = await syncTwitterConnections(database, fetchProfiles);
  const connection = database.select().from(connections).where(eq(connections.id, id)).get();
  if (
    connection?.platform !== "twitter" ||
    connection.origin !== origin ||
    connection.status !== "connected" ||
    !connection.relayProfile
  ) {
    throw new ProfileUnavailableError(
      "This connection is unavailable. Check the connected account for this column.",
    );
  }
  return connection.relayProfile;
}
