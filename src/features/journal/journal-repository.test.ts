// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { appendJournalEntry, listJournalEntries } from "./journal-repository.server";

let dir: string;
const draft = () => ({
  id: randomUUID(),
  kind: "メモ",
  text: "散歩した。",
  source: "Home",
  occurredAt: "",
});
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ori-journal-test-"));
  vi.stubEnv("TWITTER_LITE_JOURNAL_DIR", join(dir, "journal"));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-12-31T15:00:01.000Z"));
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});
it("creates a private Markdown day file using authoritative JST recording time", async () => {
  expect(await listJournalEntries()).toEqual([]);
  const entry = await appendJournalEntry({ ...draft(), recordedAt: "2000-01-01T00:00:00Z" });
  expect(entry.recordedAt).toBe("2026-12-31T15:00:01.000Z");
  const path = join(dir, "journal", "2027-01-01.md");
  expect(await readFile(path, "utf8")).toContain("# 2027-01-01\n\n## 00:00:01\n\n");
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect((await stat(join(dir, "journal"))).mode & 0o777).toBe(0o700);
  expect(await listJournalEntries()).toEqual([entry]);
});
it("round-trips arbitrary Unicode Markdown and fake framing without duplicating the text", async () => {
  const text = '散歩 🌿\n\n## 12:34:56\n\n<!-- ori-journal {"textBytes":1} -->\n# fake\n\n';
  const first = await appendJournalEntry({ ...draft(), text, source: "source -->\n<script>" });
  const second = await appendJournalEntry(draft());
  expect(await listJournalEntries()).toEqual([second, first]);
  const markdown = await readFile(join(dir, "journal", "2027-01-01.md"), "utf8");
  expect(markdown.split(text)).toHaveLength(2);
  expect(markdown).not.toContain('"text":');
});
it("serializes concurrent appends and identical retries without duplicates or lost records", async () => {
  const first = draft();
  const inputs = [first, ...Array.from({ length: 15 }, draft), first];
  const results = await Promise.all(inputs.map(appendJournalEntry));
  expect(results[0]).toEqual(results[16]);
  const entries = await listJournalEntries();
  expect(entries).toHaveLength(16);
  expect(new Set(entries.map((entry) => entry.id))).toEqual(
    new Set(inputs.map((entry) => entry.id)),
  );
  const before = await readFile(join(dir, "journal", "2027-01-01.md"));
  vi.setSystemTime(new Date("2027-01-02T00:00:00Z"));
  expect(await appendJournalEntry({ ...first, recordedAt: "2030-01-01T00:00:00Z" })).toEqual(
    results[0],
  );
  expect(await readdir(join(dir, "journal"))).toEqual(["2027-01-01.md"]);
  expect(await readFile(join(dir, "journal", "2027-01-01.md"))).toEqual(before);
});
it("adds corrections without changing the original entry or file prefix", async () => {
  const original = await appendJournalEntry({
    ...draft(),
    kind: "体重",
    text: "61.2",
    occurredAt: "2026-12-30T08:30",
    source: "Scale",
  });
  const path = join(dir, "journal", "2027-01-01.md");
  const before = await readFile(path, "utf8");
  const correction = await appendJournalEntry({
    ...draft(),
    kind: "体重",
    text: "61.7",
    correctionOf: original.id,
    occurredAt: original.occurredAt,
    source: "Scale",
  });
  expect((await readFile(path, "utf8")).startsWith(before)).toBe(true);
  expect(await listJournalEntries()).toEqual([correction, original]);
});
it("rejects reused IDs with changed content and allows subsequent valid writes", async () => {
  const original = draft();
  await appendJournalEntry(original);
  await expect(appendJournalEntry({ ...original, text: "Changed" })).rejects.toThrow(
    "different content",
  );
  await expect(appendJournalEntry({ ...draft(), correctionOf: randomUUID() })).rejects.toThrow(
    "does not exist",
  );
  await appendJournalEntry(draft());
  expect(await listJournalEntries()).toHaveLength(2);
});
it("does not append to malformed existing Markdown", async () => {
  await appendJournalEntry(draft());
  const path = join(dir, "journal", "2027-01-01.md");
  const damaged = "# 2027-01-01\n\nHand-edited text without record framing";
  await writeFile(path, damaged);
  await expect(appendJournalEntry(draft())).rejects.toThrow("Invalid journal entry");
  expect(await readFile(path, "utf8")).toBe(damaged);
});
it("ignores unrelated files without using entry IDs as filesystem paths", async () => {
  await appendJournalEntry(draft());
  await writeFile(join(dir, "journal", "README.md"), "Personal notes");
  expect(await listJournalEntries()).toHaveLength(1);
  expect(() => appendJournalEntry({ ...draft(), id: "../../outside" })).toThrow("Invalid UUID");
  expect(await readFile(join(dir, "journal", "README.md"), "utf8")).toBe("Personal notes");
});
