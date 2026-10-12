// @vitest-environment node
import {
  fsyncSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { handleOwnTracksRequest } from "./http.server";
import { appendOwnTracksRecord } from "./archive.server";

vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, fsyncSync: vi.fn<typeof fs.fsyncSync>(fs.fsyncSync) };
});

const password = "test-only-credential-with-at-least-32-characters";
let directory: string;
let credentialFile: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "owntracks-test-"));
  credentialFile = join(directory, "credentials.json");
  writeFileSync(
    credentialFile,
    JSON.stringify({ username: "phone", password, deviceId: "android-main" }),
  );
  vi.stubEnv("WORKSPACE_OWNTRACKS_ARCHIVE_DIR", directory);
  vi.stubEnv("WORKSPACE_OWNTRACKS_CREDENTIAL_FILE", credentialFile);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://workspace.invalid/api/collect/owntracks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${Buffer.from(`phone:${password}`).toString("base64")}`,
      ...headers,
    },
    body,
  });
}

function records() {
  return readdirSync(directory)
    .filter((file) => file.endsWith(".jsonl"))
    .flatMap((file) =>
      readFileSync(join(directory, file), "utf8")
        .trimEnd()
        .split("\n")
        .map((line) => JSON.parse(line)),
    );
}

it.each(["location", "transition", "waypoint", "waypoints", "status", "future-type"])(
  "archives %s without a browser session or normalization",
  async (type) => {
    const raw = `{ "_type": "${type}", "lat": 0, "lon": 0, "tst": 1, "future": {"text":"日本語\\nline"} }`;
    const response = await handleOwnTracksRequest(request(raw, { "X-Limit-D": "spoofed-device" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(records()).toEqual([
      expect.objectContaining({
        version: 1,
        source: "owntracks",
        device_id: "android-main",
        record_type: type,
        raw_body: raw,
        id: expect.any(String),
        received_at: expect.any(String),
      }),
    ]);
    expect(JSON.stringify(records())).not.toContain(password);
    const file = readdirSync(directory).find((name) => name.endsWith(".jsonl"));
    expect.assert(typeof file === "string");
    expect(statSync(join(directory, file)).mode & 0o777).toBe(0o600);
  },
);

it("retains retries and changed payloads as separate receipt records", async () => {
  const raw = '{"_type":"location","tst":1,"lat":35,"lon":139}';
  const responses = await Promise.all(
    Array.from({ length: 15 }, () => handleOwnTracksRequest(request(raw))),
  );
  expect(responses.map((response) => response.status)).toEqual(Array(15).fill(200));
  await handleOwnTracksRequest(request(raw.replace('"lat":35', '"lat":36')));
  expect(records()).toHaveLength(16);
  expect(new Set(records().map((record) => record.id)).size).toBe(16);
  expect(records().at(-1).raw_body).toContain('"lat":36');
});

it.each(["", "Bearer nope", `Basic ${Buffer.from("phone:wrong").toString("base64")}`])(
  "rejects invalid credentials without persisting anything: %s",
  async (authorization) => {
    const response = await handleOwnTracksRequest(
      request('{"_type":"location"}', { Authorization: authorization }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Basic");
    expect(records()).toEqual([]);
  },
);

it("is disabled without configuration", async () => {
  vi.stubEnv("WORKSPACE_OWNTRACKS_CREDENTIAL_FILE", "");
  expect((await handleOwnTracksRequest(request("{}"))).status).toBe(404);
});

it("rejects GET without returning data", async () => {
  expect(
    (await handleOwnTracksRequest(new Request("https://workspace.invalid/api/collect/owntracks")))
      .status,
  ).toBe(405);
});

it.each(["{", "null", "[]", "{}", '{"_type":4}', '{"_type":" "}'])(
  "rejects malformed messages: %s",
  async (body) => {
    expect((await handleOwnTracksRequest(request(body))).status).toBe(400);
    expect(records()).toEqual([]);
  },
);

it("acknowledges empty publishes without making an observation", async () => {
  expect((await handleOwnTracksRequest(request(""))).status).toBe(200);
  expect(records()).toEqual([]);
});

it("requires JSON media type", async () => {
  expect(
    (
      await handleOwnTracksRequest(
        request('{"_type":"location"}', { "Content-Type": "text/plain" }),
      )
    ).status,
  ).toBe(415);
  expect(records()).toEqual([]);
});

it("bounds actual incoming bytes even without Content-Length", async () => {
  const response = await handleOwnTracksRequest(
    request(JSON.stringify({ _type: "location", text: "あ".repeat(400_000) })),
  );
  expect(response.status).toBe(413);
  expect(records()).toEqual([]);
});

it("does not acknowledge failed storage", async () => {
  vi.stubEnv("WORKSPACE_OWNTRACKS_ARCHIVE_DIR", credentialFile);
  expect((await handleOwnTracksRequest(request('{"_type":"location"}'))).status).toBe(503);
  expect(records()).toEqual([]);
});

it("fails closed for broken credential configuration", async () => {
  writeFileSync(credentialFile, "bad json");
  expect((await handleOwnTracksRequest(request('{"_type":"location"}'))).status).toBe(503);
});

it("does not acknowledge an fsync failure and allows the device to retry", async () => {
  vi.mocked(fsyncSync).mockImplementationOnce(() => {
    throw new Error("Simulated disk sync failure");
  });
  const raw = '{"_type":"location"}';
  expect((await handleOwnTracksRequest(request(raw))).status).toBe(503);
  expect((await handleOwnTracksRequest(request(raw))).status).toBe(200);
  expect(records()).toHaveLength(2);
});

it("recovers a large incomplete file with no complete records", () => {
  const path = join(directory, "2026-10-12.jsonl");
  const tail = Buffer.from("{" + " ".repeat(150_000));
  writeFileSync(path, tail);
  appendOwnTracksRecord(directory, {
    deviceId: "phone",
    receivedAt: "2026-10-12T00:00:00Z",
    recordType: "status",
    rawBody: "{}",
  });
  const fragment = readdirSync(directory).find((file) => file.endsWith(".incomplete"));
  expect.assert(typeof fragment === "string");
  expect(readFileSync(join(directory, fragment))).toEqual(tail);
  expect(records()).toHaveLength(1);
});

it("preserves an incomplete tail before appending and separates UTC days", () => {
  const path = join(directory, "2026-10-12.jsonl");
  const complete = '{"existing":true}\n';
  const tail = Buffer.concat([Buffer.from('{"partial":"'), Buffer.from([0xe3, 0x81])]);
  writeFileSync(path, Buffer.concat([Buffer.from(complete), tail]));
  appendOwnTracksRecord(directory, {
    deviceId: "phone",
    receivedAt: "2026-10-12T23:59:59Z",
    recordType: "status",
    rawBody: '{"_type":"status"}',
  });
  const fragments = readdirSync(directory).filter((file) => file.endsWith(".incomplete"));
  expect(fragments).toHaveLength(1);
  const fragment = fragments[0];
  expect.assert(typeof fragment === "string");
  expect(readFileSync(join(directory, fragment))).toEqual(tail);
  expect(records()).toHaveLength(2);
  expect(readFileSync(path, "utf8").startsWith(complete)).toBe(true);
  appendOwnTracksRecord(directory, {
    deviceId: "phone",
    receivedAt: "2026-10-13T00:00:00Z",
    recordType: "status",
    rawBody: "{}",
  });
  expect(readdirSync(directory)).toContain("2026-10-13.jsonl");
});
