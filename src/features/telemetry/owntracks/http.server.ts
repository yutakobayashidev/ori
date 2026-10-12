import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { z } from "zod";
import { appendOwnTracksRecord } from "./archive.server";

const credentialsSchema = z.object({
  username: z
    .string()
    .min(1)
    .max(128)
    .refine((value) => !value.includes(":")),
  password: z.string().min(32).max(1024),
  deviceId: z.string().min(1).max(128),
});
const maxBodyBytes = 1024 * 1024;

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function sameSecret(left: string, right: string) {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(left), digest(right));
}

export async function handleOwnTracksRequest(request: Request): Promise<Response> {
  const directory = process.env.WORKSPACE_OWNTRACKS_ARCHIVE_DIR;
  const credentialFile = process.env.WORKSPACE_OWNTRACKS_CREDENTIAL_FILE;
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
  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(authorization);
  const provided = match?.[1] ? Buffer.from(match[1], "base64").toString("utf8") : "";
  if (!sameSecret(provided, `${credentials.username}:${credentials.password}`)) {
    return json({ error: "Unauthorized" }, 401, { "WWW-Authenticate": 'Basic realm="OwnTracks"' });
  }

  const receivedAt = new Date().toISOString();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = request.body?.getReader();
  try {
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > maxBodyBytes) {
          void reader.cancel().catch(() => {});
          return json({ error: "Payload too large" }, 413);
        }
        chunks.push(chunk.value);
      }
    }
  } catch {
    return json({ error: "Could not read payload" }, 400);
  } finally {
    reader?.releaseLock();
  }
  // OwnTracks can publish an empty body when a friend is removed.
  if (size === 0) return json([]);
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json"
  )
    return json({ error: "Expected application/json" }, 415);

  let rawBody: string;
  let recordType: string;
  try {
    rawBody = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      Buffer.concat(chunks),
    );
    const payload: unknown = JSON.parse(rawBody);
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("_type" in payload))
      throw new Error("Expected an OwnTracks object");
    if (typeof payload._type !== "string" || !payload._type.trim() || payload._type.length > 128)
      throw new Error("Expected a message type");
    recordType = payload._type;
  } catch {
    return json({ error: "Invalid OwnTracks JSON" }, 400);
  }
  try {
    appendOwnTracksRecord(directory, {
      deviceId: credentials.deviceId,
      receivedAt,
      recordType,
      rawBody,
    });
  } catch {
    return json({ error: "Could not save payload" }, 503);
  }
  return json([]);
}
