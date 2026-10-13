// @vitest-environment node

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type AppDatabase, openDatabase } from "../storage/database.server";
import { connectionCredentials, connections } from "../storage/schema";
import { listConnections, requireTwitterConnection } from "./repository.server";

let database: AppDatabase;
beforeEach(() => {
  database = openDatabase(":memory:");
  vi.stubEnv("TWITTER_RELAY_BASE_URL", "https://relay.invalid/");
  vi.stubEnv("RDT_GATEWAY_URL", "");
});

it("exposes the configured Reddit gateway as a virtual public source", async () => {
  vi.stubEnv("RDT_GATEWAY_URL", "https://rdt.home.yutakobayashi.com");
  const { connections: available } = await listConnections(database, async () => []);
  expect(available).toContainEqual({
    id: "reddit-public",
    platform: "reddit",
    origin: "https://rdt.home.yutakobayashi.com",
    accountId: null,
    displayName: "Reddit · rdt.home.yutakobayashi.com",
    status: "connected",
  });
  expect(database.select().from(connections).all()).toEqual([]);
});
afterEach(() => {
  database.$client.close();
  vi.unstubAllEnvs();
});

it("starts with no connections or relay error when Twitter is not configured", async () => {
  vi.stubEnv("TWITTER_RELAY_BASE_URL", undefined);
  const fetchProfiles = vi.fn<() => Promise<string[]>>();
  expect(await listConnections(database, fetchProfiles)).toEqual({ connections: [] });
  expect(fetchProfiles).not.toHaveBeenCalled();
});

it("disconnects saved Twitter accounts without losing their bindings when the relay is disabled", async () => {
  const original = await listConnections(database, async () => ["first"]);
  database
    .insert(connections)
    .values({
      id: "mastodon-account",
      platform: "mastodon",
      origin: "https://mastodon.invalid",
      displayName: "@owner",
      status: "connected",
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  vi.stubEnv("TWITTER_RELAY_BASE_URL", "");
  const disabled = await listConnections(database);
  expect(disabled.relayError).toBeUndefined();
  expect(disabled.connections).toEqual([
    expect.objectContaining({ id: "mastodon-account", status: "connected" }),
    { ...original.connections[0], status: "disconnected" },
  ]);
  expect(
    database.select().from(connections).where(eq(connections.platform, "twitter")).get(),
  ).toMatchObject({ id: original.connections[0]?.id, relayProfile: "first" });
  await expect(
    requireTwitterConnection(original.connections[0]?.id ?? "", database),
  ).rejects.toThrow("Set TWITTER_RELAY_BASE_URL.");
  vi.stubEnv("TWITTER_RELAY_BASE_URL", "https://relay.invalid/");
  expect((await listConnections(database, async () => ["first"])).connections).toContainEqual(
    original.connections[0],
  );
});

it("retains stable distinct IDs for multiple relay profiles across repeated discovery", async () => {
  const fetchProfiles = vi
    .fn<() => Promise<string[]>>()
    .mockResolvedValue(["first", "second", "first"]);
  const { connections: first } = await listConnections(database, fetchProfiles);
  const { connections: second } = await listConnections(database, fetchProfiles);
  expect(first).toHaveLength(2);
  expect(new Set(first.map((connection) => connection.id)).size).toBe(2);
  expect(second).toEqual(first);
  expect(await requireTwitterConnection(first[0]?.id ?? "", database, fetchProfiles)).toBe(
    first[0]?.displayName,
  );
  expect(fetchProfiles).toHaveBeenCalledWith("https://relay.invalid");
});

it("preserves unavailable bindings and reconnects the original ID when a profile returns", async () => {
  const { connections: original } = await listConnections(database, async () => ["first"]);
  const id = original[0]?.id ?? "";
  expect((await listConnections(database, async () => [])).connections).toEqual([
    expect.objectContaining({ id, status: "disconnected" }),
  ]);
  await expect(requireTwitterConnection(id, database, async () => [])).rejects.toThrow(
    "This connection is unavailable",
  );
  expect((await listConnections(database, async () => ["first"])).connections).toEqual(original);
});

it("does not reuse an old relay binding for the same profile at another origin", async () => {
  const { connections: original } = await listConnections(database, async () => ["first"]);
  vi.stubEnv("TWITTER_RELAY_BASE_URL", "https://another-relay.invalid");
  const { connections: current } = await listConnections(database, async () => ["first"]);
  expect(current).toHaveLength(2);
  expect(current).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: original[0]?.id, status: "disconnected" }),
      expect.objectContaining({
        origin: "https://another-relay.invalid",
        status: "connected",
      }),
    ]),
  );
  await expect(
    requireTwitterConnection(original[0]?.id ?? "", database, async () => ["first"]),
  ).rejects.toThrow("This connection is unavailable");
});

it("does not convert a relay outage into persisted account removal", async () => {
  const original = await listConnections(database, async () => ["first"]);
  const unavailable = vi
    .fn<() => Promise<string[]>>()
    .mockRejectedValue(new Error("private network detail"));
  const failed = await listConnections(database, unavailable);
  expect(failed.connections).toEqual(original.connections);
  expect(failed.relayError).toContain("Check the relay connection and try again.");
  expect(database.select().from(connections).get()?.status).toBe("connected");
  expect(await listConnections(database, async () => ["first"])).toEqual(original);
});

it("returns public metadata for all platforms without joining or exposing credentials", async () => {
  database
    .insert(connections)
    .values({
      id: "mastodon-account",
      platform: "mastodon",
      origin: "https://mastodon.invalid",
      accountId: "42",
      displayName: "@owner",
      status: "connected",
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  database
    .insert(connectionCredentials)
    .values({
      connectionId: "mastodon-account",
      encryptedToken: "stored-secret-envelope",
      updatedAt: 1,
    })
    .run();
  const { connections: discovered } = await listConnections(database, async () => ["first"]);
  expect(discovered[0]).toEqual({
    id: "mastodon-account",
    platform: "mastodon",
    origin: "https://mastodon.invalid",
    accountId: "42",
    displayName: "@owner",
    status: "connected",
  });
  expect(Object.keys(discovered[1] ?? {}).sort()).toEqual([
    "accountId",
    "displayName",
    "id",
    "origin",
    "platform",
    "status",
  ]);
  expect(JSON.stringify(discovered)).not.toContain("stored-secret-envelope");
  const outage = await listConnections(database, async () => {
    throw new Error("offline");
  });
  expect(outage.connections).toEqual(discovered);
  expect(outage.relayError).toBeDefined();
  await expect(
    requireTwitterConnection("mastodon-account", database, async () => ["first"]),
  ).rejects.toThrow("This connection is unavailable");
  expect(
    database.select().from(connections).where(eq(connections.id, "mastodon-account")).get()?.status,
  ).toBe("connected");
});

it("rejects an unknown connection without treating its ID as a relay profile", async () => {
  await expect(requireTwitterConnection("first", database, async () => ["first"])).rejects.toThrow(
    "This connection is unavailable",
  );
});
