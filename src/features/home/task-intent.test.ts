import { describe, expect, it, vi, afterEach } from "vitest";
import {
  findDateCandidates,
  findTaskCandidates,
  isDateOnly,
  titleWithoutDeadline,
} from "./task-intent";
import { interpretTaskInput } from "./task-intent.server";

afterEach(() => vi.unstubAllGlobals());
describe("Japanese task drafts", () => {
  it.each([
    ["明日", "2026-12-31", "2027-01-01"],
    ["あさって", "2026-10-18", "2026-10-20"],
    ["来週月曜", "2026-10-18", "2026-10-19"],
    ["再来週金曜", "2026-10-18", "2026-10-30"],
    ["今月末", "2028-02-01", "2028-02-29"],
    ["1月1日", "2026-10-18", "2027-01-01"],
    ["2026年2月30日", "2026-10-18", null],
  ])("resolves %s relative to %s", (text, today, date) => {
    expect(findDateCandidates(text, today)).toEqual([{ source: text, date }]);
  });
  it("rejects overflowing dates rather than rolling into another month", () => {
    expect(isDateOnly("2026-02-30")).toBe(false);
  });
  it("retains per-task date evidence without prematurely stripping semantic dates", () => {
    const text = "今日メール確認、明日資料印刷";
    expect(findTaskCandidates(text)).toEqual([
      { source: "今日メール確認", title: "今日メール確認" },
      { source: "明日資料印刷", title: "明日資料印刷" },
    ]);
  });
  it("preserves a requested time that date-only deadlines cannot express", () => {
    const text = "明日15時までに宅配便を出す";
    expect(findTaskCandidates(text)).toEqual([{ source: text, title: text }]);
  });
  it("copies a shared shopping action onto each list item", () => {
    expect(findTaskCandidates("牛乳、卵、パンを買う").map((c) => c.title)).toEqual([
      "牛乳を買う",
      "卵を買う",
      "パンを買う",
    ]);
  });
  it("never silently truncates more than eight candidates", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        model: "jev",
        answers: { intent: { type: "choice", choice: "task", confidence: 1 } },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await interpretTaskInput(
      {
        text: Array.from({ length: 9 }, (_, i) => `用事${i}`).join("\n"),
        today: "2026-10-18",
      },
      { apiKey: "test" },
    );
    expect(result.status).toBe("uncertain");
    expect(result.tasks).toEqual([]);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("does not echo the upstream body or credential on HTTP errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(new Response("secret diagnostic", { status: 401 })),
    );
    await expect(
      interpretTaskInput({ text: "牛乳を買う", today: "2026-10-18" }, { apiKey: "private-key" }),
    ).rejects.toThrow("TypeSafeの解析に失敗しました（HTTP 401）。");
  });
  it("rejects model-selected values that were not offered", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          model: "jev",
          answers: { intent: { type: "choice", choice: "invented", confidence: 1 } },
        }),
      ),
    );
    await expect(
      interpretTaskInput({ text: "牛乳を買う", today: "2026-10-18" }, { apiKey: "private-key" }),
    ).rejects.toThrow("応答に必要な判定がありません");
  });
});

it("only removes the selected deadline while preserving a document date", () => {
  const text = "10月1日に届いた資料を明日までに読む";
  const dates = findDateCandidates(text, "2026-10-18");
  expect(titleWithoutDeadline(text, { source: "明日", date: "2026-10-19" }, dates)).toBe(
    "10月1日に届いた資料を読む",
  );
});

it.each([
  ["明日は資料を提出する", "資料を提出する"],
  ["明日はがきを買う", "はがきを買う"],
  ["明日までにはがきを買う", "はがきを買う"],
  ["資料は明日までに提出する", "資料は提出する"],
])("removes a date's topic particle without stripping a noun: %s", (text, expected) => {
  const dates = findDateCandidates(text, "2026-10-18");
  expect(titleWithoutDeadline(text, { source: "明日", date: "2026-10-19" }, dates)).toBe(expected);
});

it("keeps source wording and leaves a low-confidence deadline unset", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      Response.json({
        model: "jev-1.13.0",
        answers: {
          intent: { type: "choice", choice: "task", confidence: 1 },
          coverage: { type: "choice", choice: "complete", confidence: 1 },
          task_0: { type: "choice", choice: "include", confidence: 1 },
          date_0: { type: "choice", choice: "d0", confidence: 0.48 },
        },
      }),
    ),
  );
  const result = await interpretTaskInput(
    { text: "10月1日に届いた資料を読む", today: "2026-10-18" },
    { apiKey: "private-key" },
  );
  expect(result.tasks).toEqual([{ title: "10月1日に届いた資料を読む", dueDate: null }]);
  expect(result.notice).toBeNull();
});

it.each([
  "今日は散歩して気分がよかった",
  "牛乳を買った",
  "最近ちょっと疲れている",
  "メモ：会議ではまず相手の話を聞くことが大事だと感じた",
  "朝起きた。顔を洗った。散歩した。朝食を食べた。出勤した。働いた。帰宅した。夕食を食べた。よく眠れそうだ。",
])("recognizes a journal entry without task-only answers: %s", async (text) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        model: "jev-1.13.0",
        answers: { intent: { type: "choice", choice: "journal", confidence: 1 } },
      }),
    ),
  );
  const input = { text, today: "2026-10-18" };
  expect(await interpretTaskInput(input, { apiKey: "test" })).toEqual({
    status: "journal",
    tasks: [],
    notice: null,
  });
  expect(input.text).toBe(text);
});

it.each([
  ["journal", 0.2, "uncertain"],
  ["none", 1, "none"],
])("does not turn %s at confidence %s into an entry", async (choice, confidence, status) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        model: "jev-1.13.0",
        answers: { intent: { type: "choice", choice, confidence } },
      }),
    ),
  );
  expect(
    await interpretTaskInput({ text: "明日の天気は？", today: "2026-10-18" }, { apiKey: "test" }),
  ).toEqual({ status, tasks: [], notice: null });
});

it("still requires task extraction answers when a task is selected", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        model: "jev-1.13.0",
        answers: { intent: { type: "choice", choice: "task", confidence: 1 } },
      }),
    ),
  );
  await expect(
    interpretTaskInput({ text: "牛乳を買う", today: "2026-10-18" }, { apiKey: "test" }),
  ).rejects.toThrow("応答に必要な判定がありません");
});
