// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  loadRoutineRuns,
  saveRoutine,
  recordRoutineRun,
} from "../../routines/routine-repository.server";
import { handleXiaomiScaleRequest } from "./http.server";
import { isScheduleRecorded } from "../../routines/routine-schedule";

vi.mock("../../routines/routine-repository.server", async (original) => {
  const repository = await original<typeof import("../../routines/routine-repository.server")>();
  return {
    ...repository,
    recordRoutineRun: vi.fn<typeof repository.recordRoutineRun>(repository.recordRoutineRun),
  };
});
const token = "test-token-with-more-than-32-characters";
let directory: string;
let credentialFile: string;
let credentials: Record<string, unknown>;
let payload: {
  id: string;
  deviceId: string;
  profileId: number;
  measuredAt: string;
  receivedAt: string;
  weightKg: number;
  rawAdvertisement: string;
};
beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "xiaomi-scale-"));
  credentialFile = join(directory, "credentials.json");
  vi.stubEnv("WORKSPACE_XIAOMI_SCALE_ARCHIVE_DIR", directory);
  vi.stubEnv("WORKSPACE_XIAOMI_SCALE_CREDENTIAL_FILE", credentialFile);
  vi.stubEnv("TWITTER_LITE_ROUTINE_DIR", join(directory, "routines"));
  const definition = await saveRoutine({
    requestId: randomUUID(),
    routineId: null,
    baseVersion: null,
    draft: {
      name: "Weight",
      description: "",
      aliases: [],
      schedules: [
        {
          id: "daily",
          weekdays: [0, 1, 2, 3, 4, 5, 6],
          timeOfDay: "morning",
          time: null,
          timeZone: "Asia/Tokyo",
        },
      ],
      steps: [
        {
          id: "measure",
          label: "Measure",
          repeatable: false,
          layout: "stack",
          fields: [
            {
              id: "weight",
              label: "Weight",
              type: "number",
              required: true,
              unit: "kg",
              metric: { id: "body_weight", label: "Weight", group: "body_weight" },
              options: [],
              min: null,
              max: null,
            },
          ],
        },
      ],
    },
  });
  credentials = {
    token,
    deviceId: "AA:BB:CC:DD:EE:FF",
    profileId: 1,
    routineId: definition.id,
    routineVersion: definition.version,
    stepId: "measure",
    fieldId: "weight",
  };
  writeFileSync(credentialFile, JSON.stringify(credentials));
  payload = {
    id: randomUUID(),
    deviceId: "AA:BB:CC:DD:EE:FF",
    profileId: 1,
    measuredAt: "2026-10-21T00:00:00Z",
    receivedAt: "2026-10-21T00:00:01Z",
    weightKg: 65.4,
    rawAdvertisement: "aabbcc",
  };
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(directory, { recursive: true, force: true });
});
function request(body = JSON.stringify(payload), authorization = `Bearer ${token}`) {
  return new Request("https://ori.invalid/api/collect/xiaomi-scale", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authorization },
    body,
  });
}
function archives() {
  return readdirSync(directory).filter((name) => /^[0-9a-f-]{36}\.json$/.test(name));
}

it("archives source data and records weight once despite concurrent retries", async () => {
  const responses = await Promise.all(
    Array.from({ length: 5 }, () => handleXiaomiScaleRequest(request())),
  );
  expect(responses.map((response) => response.status)).toEqual([200, 200, 200, 200, 200]);
  expect(archives()).toEqual([`${payload.id}.json`]);
  expect(JSON.parse(readFileSync(join(directory, `${payload.id}.json`), "utf8"))).toMatchObject({
    source: "xiaomi-s200",
    payload,
  });
  expect(await loadRoutineRuns()).toEqual([
    expect.objectContaining({
      id: payload.id,
      occurredAt: payload.measuredAt,
      scheduleId: "daily",
      steps: [{ stepId: "measure", done: false, entries: [{ weight: 65.4 }] }],
    }),
  ]);
});
it("completes the measurement day's morning slot even for delayed afternoon measurements", async () => {
  payload.measuredAt = "2026-10-21T08:00:00Z";
  payload.receivedAt = "2026-10-22T01:00:00Z";
  expect((await handleXiaomiScaleRequest(request())).status).toBe(200);
  payload = { ...payload, id: randomUUID(), measuredAt: "2026-10-21T09:00:00Z", weightKg: 65.5 };
  expect((await handleXiaomiScaleRequest(request())).status).toBe(200);
  const runs = await loadRoutineRuns();
  expect(runs).toHaveLength(2);
  expect(runs.map((run) => run.routineDate)).toEqual(["2026-10-21", "2026-10-21"]);
  const schedule = {
    id: "daily",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    timeOfDay: "morning" as const,
    time: null,
    timeZone: "Asia/Tokyo",
  };
  expect(
    isScheduleRecorded(
      String(credentials.routineId),
      schedule,
      runs,
      new Date("2026-10-21T10:00:00Z"),
    ),
  ).toBe(true);
  expect(
    isScheduleRecorded(
      String(credentials.routineId),
      schedule,
      runs,
      new Date("2026-10-22T01:00:00Z"),
    ),
  ).toBe(false);
});
it("rejects conflicting reuse of a measurement ID", async () => {
  expect((await handleXiaomiScaleRequest(request())).status).toBe(200);
  payload.weightKg = 70;
  expect((await handleXiaomiScaleRequest(request())).status).toBe(409);
  expect(await loadRoutineRuns()).toHaveLength(1);
});
it("retains raw data after projection failure and completes on retry", async () => {
  vi.mocked(recordRoutineRun).mockRejectedValueOnce(new Error("Storage unavailable"));
  expect((await handleXiaomiScaleRequest(request())).status).toBe(503);
  expect(archives()).toHaveLength(1);
  expect(await loadRoutineRuns()).toHaveLength(0);
  expect((await handleXiaomiScaleRequest(request())).status).toBe(200);
  expect(archives()).toHaveLength(1);
  expect(await loadRoutineRuns()).toHaveLength(1);
});
it("requires the collector secret", async () => {
  expect((await handleXiaomiScaleRequest(request(undefined, "Bearer wrong"))).status).toBe(401);
  expect(archives()).toHaveLength(0);
});
it.each([{ deviceId: "AA:AA:AA:AA:AA:AA" }, { profileId: 2 }])(
  "rejects another device or person: %j",
  async (change) => {
    expect(
      (await handleXiaomiScaleRequest(request(JSON.stringify({ ...payload, ...change })))).status,
    ).toBe(403);
    expect(archives()).toHaveLength(0);
  },
);
it.each(["null", "{", "{}", JSON.stringify({ weightKg: -1 })])(
  "rejects malformed measurements: %s",
  async (body) => {
    expect((await handleXiaomiScaleRequest(request(body))).status).toBe(400);
    expect(archives()).toHaveLength(0);
  },
);
it("bounds incoming bytes without relying on Content-Length", async () => {
  expect((await handleXiaomiScaleRequest(request("a".repeat(17 * 1024)))).status).toBe(413);
  expect(archives()).toHaveLength(0);
});
it("requires explicit routine binding", async () => {
  writeFileSync(credentialFile, JSON.stringify({ ...credentials, fieldId: "other" }));
  expect((await handleXiaomiScaleRequest(request())).status).toBe(503);
  expect(archives()).toHaveLength(0);
});
it("is disabled unless configured", async () => {
  vi.stubEnv("WORKSPACE_XIAOMI_SCALE_CREDENTIAL_FILE", "");
  expect((await handleXiaomiScaleRequest(request())).status).toBe(404);
});
