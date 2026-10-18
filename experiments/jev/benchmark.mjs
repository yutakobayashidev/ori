/* oxlint-disable no-console -- CLI benchmark reports progress and aggregate measurements. */
// Run from the repository root: node --env-file=.env experiments/jev/benchmark.mjs
// Sends only the synthetic inputs below; never reads application data.
import { writeFileSync } from "node:fs";

const cases = [
  ["ja", "task", "明日までに見積書を送る"],
  ["ja", "task", "牛乳を買う"],
  ["ja", "task", "歯医者を予約しなきゃ"],
  ["ja", "task", "来週金曜までに確定申告の資料をまとめたい"],
  ["ja", "task", "洗濯をタスクに追加して"],
  ["ja", "task", "今日中に請求書を提出。至急！"],
  ["ja", "task", "時間があるときに本棚を整理する"],
  ["ja", "task", "牛乳は買わないで、卵を買う"],
  ["ja", "checklist", "牛乳、卵、パンを買う"],
  ["ja", "checklist", "洗濯する、掃除する、ゴミを出す"],
  ["ja", "checklist", "やること：\nメール確認\n資料印刷"],
  ["ja", "checklist", "パスポート更新とホテル予約を追加"],
  ["ja", "note", "メモ：会議室の暗証番号は1234"],
  ["ja", "note", "今日は疲れたなあ"],
  ["ja", "note", "アイデア：ホーム画面に天気を表示する"],
  ["ja", "note", "昨日、牛乳を買った"],
  ["ja", "reply", "田中さんに返信したい"],
  ["ja", "reply", "佐藤さんへの返信案を考えて"],
  ["ja", "reply", "Slackで来た依頼に返事したい"],
  ["ja", "event", "明日15時に田中さんと打ち合わせ"],
  ["ja", "event", "金曜の19時から友達と夕飯"],
  ["ja", "event", "来週月曜10時にZoomで面談"],
  ["ja", "update", "買い物タスクを完了にして"],
  ["ja", "update", "見積書のタスクを保留にする"],
  ["ja", "update", "掃除のタスクを未完了に戻す"],
  ["ja", "none", "タスクは追加しないで"],
  ["ja", "none", "牛乳を買うタスクは作らないで"],
  ["ja", "none", "明日までに"],
  ["ja", "none", "えーと"],
  ["ja", "none", ""],
  ["ja", "none", "タスクとメモの違いは何？"],
  ["ja", "none", "天気を教えて"],
  ["en", "task", "Buy milk tomorrow"],
  ["en", "task", "Submit the invoice urgently today"],
  ["en", "checklist", "Buy milk, eggs and bread"],
  ["en", "note", "Note: the meeting room code is 1234"],
  ["en", "reply", "Help me draft a reply to Alice"],
  ["en", "event", "Lunch with Bob on Friday at noon"],
  ["en", "update", "Mark the shopping task as done"],
  ["en", "none", "Do not create a task to buy milk"],
].map(([language, expected, text], i) => ({ id: i + 1, language, expected, text }));

const questions = {
  intent: {
    type: "choice",
    instructions:
      "Choose the preview card for the current input in a personal workspace. Interpret the user's actual intended action, respecting negation and whether the text is a past observation or unfinished. Select none for unsupported requests. Do not execute anything.",
    criteria: {
      task: "A single new action the user intends to do or add to their task list. Includes personal chores and making a booking; excludes drafting replies and appointments themselves.",
      checklist: "Several distinct new actions or items to do or buy, intended as a list.",
      note: "A note, idea, feeling, or observation about the past, rather than a new action to perform.",
      reply: "The user wants help composing or opening a reply to a person or conversation.",
      event: "An appointment or gathering with other people at a time; not the task of booking it.",
      update:
        "An explicit request to change the status of an existing task, such as complete, defer, or restore.",
      none: "No supported action or note: unfinished input, cancellation of creation, a question for information, or an unrelated request.",
    },
  },
  urgent: {
    type: "noul",
    instructions:
      "Does the input explicitly convey urgency or an immediate need to act? A future date alone does not imply urgency.",
  },
};

const key = process.env.TYPESAFE_API_KEY;
if (!key) throw new Error("TYPESAFE_API_KEY is missing (value not displayed)");
const output = process.argv[2] ?? "experiments/jev/results.json";
let model = "jev-latest";
const startedAt = new Date().toISOString();
async function evaluate(text) {
  const start = performance.now();
  const response = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    redirect: "error",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, state: { text }, questions }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`TypeSafe HTTP ${response.status} (response body omitted)`);
  const body = await response.json();
  const answer = body.answers?.intent;
  if (
    !body.model ||
    !answer ||
    !(answer.choice in questions.intent.criteria) ||
    typeof answer.confidence !== "number"
  ) {
    throw new Error("Unexpected TypeSafe response schema");
  }
  return { latencyMs: Math.round(performance.now() - start), ...body };
}

// Separate cold connection time from the measured samples, then pin the resolved model.
const warmup = await evaluate("接続確認用のメモ");
model = warmup.model;
console.log(JSON.stringify({ connection: "ok", model, coldLatencyMs: warmup.latencyMs }));
const results = [];
let failure = null;
for (let round = 1; round <= 2 && !failure; round++) {
  // Reverse the second pass to avoid measuring repeated inputs back-to-back.
  for (const item of round === 1 ? cases : [...cases].reverse()) {
    try {
      const result = await evaluate(item.text);
      results.push({
        ...item,
        round,
        ...result,
        correct: result.answers.intent.choice === item.expected,
      });
      if (results.length % 10 === 0)
        console.log(JSON.stringify({ completed: results.length, total: cases.length * 2 }));
    } catch (error) {
      failure = { id: item.id, round, error: error.name === "Error" ? error.message : error.name };
      break;
    }
  }
}
const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
const percentile = (p) => latencies[Math.max(0, Math.ceil(latencies.length * p) - 1)] ?? null;
const summary = {
  completed: results.length,
  planned: cases.length * 2,
  failure,
  correct: results.filter((r) => r.correct).length,
  japanese: {
    correct: results.filter((r) => r.language === "ja" && r.correct).length,
    total: results.filter((r) => r.language === "ja").length,
  },
  english: {
    correct: results.filter((r) => r.language === "en" && r.correct).length,
    total: results.filter((r) => r.language === "en").length,
  },
  latencyMs: {
    p50: percentile(0.5),
    p95: percentile(0.95),
    min: latencies[0],
    max: latencies.at(-1),
  },
  highConfidenceErrors: results.filter((r) => !r.correct && r.answers.intent.confidence >= 0.7)
    .length,
  inputTokens: [warmup, ...results].reduce((n, r) => n + (r.usage?.input_tokens ?? 0), 0),
  outputTokens: [warmup, ...results].reduce((n, r) => n + (r.usage?.output_tokens ?? 0), 0),
};
writeFileSync(
  output,
  JSON.stringify(
    {
      startedAt,
      model,
      methodology:
        "Synthetic exploratory set, labels and prompts fixed before run. Two sequential passes, reversed order on second pass; no retries or application cache. Warmup excluded from latency, included in token totals. Urgency is exploratory, not scored. Not the unmodified Shapeshift classifier. No extraction evaluation.",
      questions,
      warmup,
      summary,
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
for (const r of results.filter((r) => !r.correct))
  console.log(
    JSON.stringify({
      round: r.round,
      text: r.text,
      expected: r.expected,
      actual: r.answers.intent.choice,
      confidence: r.answers.intent.confidence,
    }),
  );
if (failure) process.exitCode = 1;
