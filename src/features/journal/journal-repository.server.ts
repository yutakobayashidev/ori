import { mkdir, open, readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { appendJournalInput, journalEntrySchema, type JournalEntry } from "./journal-model";

const queues = new Map<string, Promise<unknown>>();
const metadataSchema = journalEntrySchema.omit({ text: true }).extend({
  textBytes: z.number().int().positive().max(400_000),
});
const clock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
function directory() {
  return resolve(
    process.env.TWITTER_LITE_JOURNAL_DIR || join(homedir(), ".local/state/twitter-lite/journal"),
  );
}
async function serialized<T>(dir: string, operation: () => Promise<T>): Promise<T> {
  const pending = (queues.get(dir) ?? Promise.resolve()).catch(() => undefined).then(operation);
  queues.set(dir, pending);
  try {
    return await pending;
  } finally {
    if (queues.get(dir) === pending) queues.delete(dir);
  }
}
function parseFile(bytes: Buffer, date: string): JournalEntry[] {
  const header = Buffer.from(`# ${date}\n\n`);
  if (!bytes.subarray(0, header.length).equals(header))
    throw new Error(`Invalid journal header: ${date}`);
  const entries: JournalEntry[] = [];
  let offset = header.length;
  while (offset < bytes.length) {
    const headingEnd = bytes.indexOf("\n\n", offset);
    const heading = bytes.subarray(offset, headingEnd).toString("utf8");
    if (headingEnd < 0 || !/^## \d{2}:\d{2}:\d{2}$/.test(heading))
      throw new Error(`Invalid journal entry: ${date}`);
    offset = headingEnd + 2;
    const metadataEnd = bytes.indexOf("\n", offset);
    const line = bytes.subarray(offset, metadataEnd).toString("utf8");
    const match = /^<!-- ori-journal (.+) -->$/.exec(line);
    if (metadataEnd < 0 || !match?.[1]) throw new Error(`Invalid journal metadata: ${date}`);
    const { textBytes, ...metadata } = metadataSchema.parse(JSON.parse(match[1]));
    offset = metadataEnd + 1;
    const end = offset + textBytes;
    if (end + 2 > bytes.length || bytes.subarray(end, end + 2).toString() !== "\n\n")
      throw new Error(`Incomplete journal entry: ${date}`);
    const text = bytes.subarray(offset, end).toString("utf8");
    if (Buffer.byteLength(text) !== textBytes) throw new Error(`Invalid journal text: ${date}`);
    entries.push(journalEntrySchema.parse({ ...metadata, text }));
    offset = end + 2;
  }
  return entries;
}
async function readEntries(dir: string): Promise<JournalEntry[]> {
  let files: string[];
  try {
    files = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const entries: JournalEntry[] = [];
  for (const file of files.filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name)).sort()) {
    entries.push(...parseFile(await readFile(join(dir, file)), file.slice(0, -3)));
  }
  return entries.reverse().sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}
export function listJournalEntries(): Promise<JournalEntry[]> {
  const dir = directory();
  return serialized(dir, () => readEntries(dir));
}
export function appendJournalEntry(input: unknown): Promise<JournalEntry> {
  const parsed = appendJournalInput.parse(input);
  const dir = directory();
  return serialized(dir, async () => {
    const entries = await readEntries(dir);
    const existing = entries.find((entry) => entry.id === parsed.id);
    if (existing) {
      const same =
        existing.kind === parsed.kind &&
        existing.text === parsed.text &&
        existing.source === parsed.source &&
        existing.occurredAt === parsed.occurredAt &&
        existing.correctionOf === parsed.correctionOf;
      if (!same)
        throw new Error("This journal entry ID has already been used with different content.");
      return existing;
    }
    if (parsed.correctionOf && !entries.some((entry) => entry.id === parsed.correctionOf))
      throw new Error("The journal entry being corrected does not exist.");
    const entry: JournalEntry = { ...parsed, recordedAt: new Date().toISOString() };
    const [date, time] = clock.format(new Date(entry.recordedAt)).split(" ");
    const { text, ...fields } = entry;
    const metadata = JSON.stringify({ ...fields, textBytes: Buffer.byteLength(text) })
      .replaceAll("<", "\\u003c")
      .replaceAll(">", "\\u003e");
    const record = `## ${time}\n\n<!-- ori-journal ${metadata} -->\n${text}\n\n`;
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const file = await open(join(dir, `${date}.md`), "a", 0o600);
    try {
      const { size } = await file.stat();
      await file.writeFile((size === 0 ? `# ${date}\n\n` : "") + record);
      await file.sync();
    } finally {
      await file.close();
    }
    return entry;
  });
}
