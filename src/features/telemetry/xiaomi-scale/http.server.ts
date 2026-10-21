import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { listRoutines, recordRoutineRun } from "../../routines/routine-repository.server";
import { routineRunInputSchema, validateRoutineRun } from "../../routines/routine-model";
import { inferRoutineSchedule } from "../../routines/routine-schedule";

const deviceId = z.string().regex(/^(?:[0-9A-F]{2}:){5}[0-9A-F]{2}$/);
const identifier = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const profileId = z.number().int().min(0).max(255);
const credentialsSchema = z.strictObject({
  token: z.string().min(32).max(1024),
  deviceId,
  profileId,
  routineId: z.uuid(),
  routineVersion: z.number().int().positive(),
  stepId: identifier,
  fieldId: identifier,
});
const payloadSchema = z.strictObject({
  id: z.uuid(),
  deviceId,
  measuredAt: z.iso.datetime(),
  receivedAt: z.iso.datetime(),
  weightKg: z.number().positive().max(150),
  profileId,
  rawAdvertisement: z
    .string()
    .min(2)
    .max(4096)
    .regex(/^(?:[0-9a-fA-F]{2})+$/),
});
const archiveSchema = z.strictObject({
  version: z.literal(1),
  source: z.literal("xiaomi-s200"),
  payload: payloadSchema,
  run: routineRunInputSchema,
});

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

// Atomic immutable per-measurement records. A retry also syncs a record left by
// an interrupted request before projecting it. One application server owns storage.
function persist(directory: string, path: string, record: z.infer<typeof archiveSchema>) {
  const temporary = join(directory, `.${randomUUID()}.tmp`);
  try {
    writeFileSync(temporary, JSON.stringify(record) + "\n", { flag: "wx", mode: 0o600 });
    const fd = openSync(temporary, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    linkSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}
function syncRecord(directory: string, path: string) {
  for (const name of [path, directory]) {
    const fd = openSync(name, "r");
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  }
}

export async function handleXiaomiScaleRequest(request: Request): Promise<Response> {
  const directory = process.env.WORKSPACE_XIAOMI_SCALE_ARCHIVE_DIR;
  const credentialFile = process.env.WORKSPACE_XIAOMI_SCALE_CREDENTIAL_FILE;
  if (!directory || !credentialFile) return json({ error: "Not found" }, 404);
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  let credentials: z.infer<typeof credentialsSchema>;
  try {
    if (!isAbsolute(directory) || !isAbsolute(credentialFile))
      throw new Error("Absolute paths required");
    credentials = credentialsSchema.parse(JSON.parse(readFileSync(credentialFile, "utf8")));
  } catch {
    return json({ error: "Collector unavailable" }, 503);
  }
  if (
    !timingSafeEqual(
      digest(request.headers.get("authorization") ?? ""),
      digest(`Bearer ${credentials.token}`),
    )
  )
    return json({ error: "Unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  )
    return json({ error: "Expected application/json" }, 415);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  try {
    if (reader)
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 16 * 1024) {
          void reader.cancel().catch(() => {});
          return json({ error: "Payload too large" }, 413);
        }
        chunks.push(chunk.value);
      }
  } catch {
    return json({ error: "Could not read payload" }, 400);
  } finally {
    reader?.releaseLock();
  }
  let payload: z.infer<typeof payloadSchema>;
  try {
    payload = payloadSchema.parse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))),
    );
  } catch {
    return json({ error: "Invalid scale measurement" }, 400);
  }
  if (payload.deviceId !== credentials.deviceId || payload.profileId !== credentials.profileId)
    return json({ error: "Device or profile mismatch" }, 403);

  try {
    const path = join(directory, `${payload.id}.json`);
    let archived: z.infer<typeof archiveSchema> | undefined;
    try {
      archived = archiveSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (!archived) {
      const definition = (await listRoutines()).find(
        (routine) =>
          routine.id === credentials.routineId && routine.version === credentials.routineVersion,
      );
      const field = definition?.steps
        .find((step) => step.id === credentials.stepId)
        ?.fields.find((field) => field.id === credentials.fieldId);
      if (
        !definition ||
        field?.type !== "number" ||
        field.unit !== "kg" ||
        field.metric?.id !== "body_weight"
      )
        return json({ error: "Configure a current body_weight routine field in kg" }, 503);
      const run = routineRunInputSchema.parse({
        id: payload.id,
        routineId: definition.id,
        routineVersion: definition.version,
        scheduleId: inferRoutineSchedule(definition.schedules, new Date(payload.measuredAt)),
        occurredAt: payload.measuredAt,
        steps: definition.steps.map((step) => ({
          stepId: step.id,
          done: false,
          entries:
            step.id === credentials.stepId ? [{ [credentials.fieldId]: payload.weightKg }] : [],
        })),
      });
      validateRoutineRun(definition, run);
      // listRoutines yields; another request may have installed the same ID.
      const record = { version: 1 as const, source: "xiaomi-s200" as const, payload, run };
      try {
        persist(directory, path, record);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
      archived = archiveSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    }
    if (JSON.stringify(archived.payload) !== JSON.stringify(payload))
      return json({ error: "Measurement ID already used" }, 409);
    syncRecord(directory, path);
    await recordRoutineRun(archived.run);
    return json({ id: payload.id });
  } catch {
    return json({ error: "Could not save measurement" }, 503);
  }
}
