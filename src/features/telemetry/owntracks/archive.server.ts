import { randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  fstatSync,
  ftruncateSync,
  openSync,
  readSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";

function writeAll(fd: number, bytes: Buffer) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(fd, bytes, offset, bytes.length - offset);
    if (written === 0) throw new Error("Archive write made no progress");
    offset += written;
  }
}

// A previous process may have died mid-record. Preserve its bytes before removing
// the incomplete tail so a new record cannot become part of the damaged line.
function recoverTail(fd: number, path: string, directoryFd: number) {
  const size = fstatSync(fd).size;
  if (size === 0) return;
  const chunk = Buffer.alloc(64 * 1024);
  let end = size;
  let boundary = 0;
  while (end > 0) {
    const start = Math.max(0, end - chunk.length);
    const length = end - start;
    const count = readSync(fd, chunk, 0, length, start);
    if (count !== length) throw new Error("Archive changed during recovery");
    const newline = chunk.subarray(0, count).lastIndexOf(10);
    if (newline !== -1) {
      boundary = start + newline + 1;
      break;
    }
    end = start;
  }
  if (boundary === size) return;
  const fragment = openSync(`${path}.${randomUUID()}.incomplete`, "wx", 0o600);
  try {
    for (let offset = boundary; offset < size;) {
      const count = readSync(fd, chunk, 0, Math.min(chunk.length, size - offset), offset);
      if (count === 0) throw new Error("Archive changed during recovery");
      writeAll(fragment, chunk.subarray(0, count));
      offset += count;
    }
    fsyncSync(fragment);
    fsyncSync(directoryFd);
    ftruncateSync(fd, boundary);
    fsyncSync(fd);
  } finally {
    closeSync(fragment);
  }
}

export function appendOwnTracksRecord(
  directory: string,
  record: {
    deviceId: string;
    receivedAt: string;
    recordType: string;
    rawBody: string;
  },
) {
  const line = JSON.stringify({
    version: 1,
    id: randomUUID(),
    source: "owntracks",
    device_id: record.deviceId,
    received_at: record.receivedAt,
    record_type: record.recordType,
    raw_body: record.rawBody,
  });
  const path = join(directory, `${record.receivedAt.slice(0, 10)}.jsonl`);
  // This bounded synchronous operation serializes writes within the app's single
  // server process, including across module reloads. No multi-process writers.
  const directoryFd = openSync(directory, "r");
  try {
    const fd = openSync(path, "a+", 0o600);
    try {
      recoverTail(fd, path, directoryFd);
      writeAll(fd, Buffer.from(`${line}\n`, "utf8"));
      fsyncSync(fd);
      fsyncSync(directoryFd);
    } finally {
      closeSync(fd);
    }
  } finally {
    closeSync(directoryFd);
  }
}
