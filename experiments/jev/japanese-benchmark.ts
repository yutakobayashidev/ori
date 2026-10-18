/// <reference types="node" />
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import process from "node:process";
import { evaluateTaskInput } from "../../src/features/home/task-intent.server";
import { cases, today } from "./japanese-cases";
const split = process.argv[2] ?? "dev";
if (!["dev", "holdout"].includes(split)) throw Error("Choose dev or holdout");
const results = [];
for (const item of cases.filter((c) => c.split === split)) {
  const { result, diagnostics } = await evaluateTaskInput({ text: item.text, today });
  const titles = result.tasks.map((t) => t.title),
    dates = result.tasks.map((t) => t.dueDate);
  const exact =
    JSON.stringify(titles) === JSON.stringify(item.titles) &&
    JSON.stringify(dates) === JSON.stringify(item.dates) &&
    (!item.notice || !!result.notice);
  results.push({ expected: item, result, exact, diagnostics });
  process.stdout.write(JSON.stringify({ text: item.text, exact, result }) + "\n");
}
const latencies = results
  .flatMap((r) => (r.diagnostics ? [r.diagnostics.latencyMs] : []))
  .sort((a, b) => a - b);
const summary = {
  split,
  exact: results.filter((r) => r.exact).length,
  total: results.length,
  abstained: results.filter((r) => r.result.status === "uncertain").length,
  p50Ms: latencies[Math.ceil(latencies.length * 0.5) - 1],
  p95Ms: latencies[Math.ceil(latencies.length * 0.95) - 1],
};
const implementationSha256 = createHash("sha256")
  .update(readFileSync("src/features/home/task-intent.ts"))
  .update(readFileSync("src/features/home/task-intent.server.ts"))
  .digest("hex");
writeFileSync(
  process.argv[3] ?? `experiments/jev/japanese-${split}-results.json`,
  JSON.stringify(
    { at: new Date().toISOString(), implementationSha256, today, summary, results },
    null,
    2,
  ) + "\n",
);
process.stdout.write(JSON.stringify(summary) + "\n");
