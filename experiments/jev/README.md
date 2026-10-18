# Jev Home intent benchmark

Exploratory benchmark for an Ori-specific preview classifier, not the original
Shapeshift classifier. Uses the TypeSafe HTTP API directly with no added dependencies.

Set `TYPESAFE_API_KEY` in the repository's ignored `.env`, then run from the root:

```sh
node --env-file=.env experiments/jev/benchmark.mjs
```

Requires Node.js 22+. The script sends 40 synthetic inputs (32 Japanese, 8 English)
twice, plus one warmup request: at most 81 paid API requests. It resolves
`jev-latest` during warmup and uses the returned model version for the two passes.
No application data or other environment values are sent. The second pass reverses
input order; requests are sequential with no retries or application cache.

`results.json` records the fixed questions, expected labels, responses, confidence,
token usage, and client-observed latency. Warmup is excluded from latency summaries
and included in token totals. A failure stops the run and saves partial results
after successful warmup. Authentication failures during warmup stop without results.

The seven labels are task, checklist, note, reply, event, update, and none. Labels
and questions are fixed before running. Urgency is collected but not scored. This
small authored set is a smoke benchmark, not evidence of general Japanese accuracy;
repeated cases are not independent examples. It does not evaluate title/date
extraction, UI behavior, or Activity persistence.

References: [API](https://docs.typesafe.ai/api),
[Choice](https://docs.typesafe.ai/primitives/choice),
[intent routing](https://docs.typesafe.ai/patterns/intent-routing).

## Initial result — 2026-10-18

Model: `jev-1.13.0`. All 81 API calls completed (one warmup plus 80 measured
requests). The prompts and labels were not changed after observing responses.

| Metric                                  | Result                               |
| --------------------------------------- | ------------------------------------ |
| Japanese intent accuracy                | 64/64 (32 unique inputs, two passes) |
| English intent accuracy                 | 16/16 (8 unique inputs, two passes)  |
| Client latency p50 / p95                | 158 ms / 258 ms                      |
| Client latency min / max                | 134 ms / 438 ms                      |
| Cold warmup latency                     | 234 ms                               |
| Input / output tokens, including warmup | 47,933 / 6,905                       |

The full responses are in [results.json](results.json). The seven intent classes
all matched the authored labels. This supports trying a preview UI but does not
establish generalization to real user input. It is not a comparison against the
existing Ori parser or Shapeshift's 19-card classifier. Network latency is included;
browser debounce, rendering, and Ori server overhead are not. Accuracy does not
measure confidence-threshold coverage; the lowest winning confidence was 0.53.
Next validation should use previously unseen, realistic Japanese inputs, especially
ambiguous fragments and corrections, followed by separate extraction tests.

## Japanese task extraction — 2026-10-18

The integrated parser is evaluated separately from the original seven-way intent
classifier. It proposes editable tasks; it never saves them. Code finds source
clauses and date candidates. One Jev request judges overall intent, candidate
coverage, whether each task is active, and which date belongs to each task.
The full source remains in model state so negations and corrections can be judged.
No generated free-text titles are accepted.

```sh
node --env-file=.env --import tsx experiments/jev/japanese-benchmark.ts dev
node --env-file=.env --import tsx experiments/jev/japanese-benchmark.ts holdout
```

Each command sends respectively 12 or 15 synthetic Japanese examples once, with
no warmup, retries or cache. These are paid API calls. Model: `jev-1.13.0`.
The benchmark invokes the actual server parser. Exact match requires the ordered
task titles and their date-only deadlines to match, plus a warning on specified
unsupported cases. Latencies include the network call and exclude browser
input debounce, rendering and persistence.

| Set                                    | Exact result | p50 / p95    |
| -------------------------------------- | ------------ | ------------ |
| Development, after two candidate fixes | 12/12        | 152 / 411 ms |
| First frozen holdout evaluation        | 14/15        | 161 / 295 ms |

The first development evaluation was 10/12: shared shopping verbs were absent
from candidate titles, and one deadline was assigned to the wrong task. Preserving
per-task source clauses and providing them explicitly in date questions fixed
those development examples. The holdout labels were fixed before evaluating it;
it is a small authored set, not independent real-world validation.

The holdout failure was `2026年2月30日までに書類を送る`: Jev excluded the task instead
of proposing an undated editable task with a warning. The failure remains in
[japanese-holdout-results.json](japanese-holdout-results.json). After that run,
the generic no-selected-candidate path was changed to show an uncertain-input
notice; this does not count as fixing the failed extraction. Date stripping was
also improved to handle dates inside a sentence. Therefore the frozen holdout
artifact records the version before these two changes, not a claimed fresh
holdout score for every later change.

[japanese-exploratory-results.json](japanese-exploratory-results.json) contains
additional unscored probes for corrected deadlines and conjunctions, after the
holdout evaluation. These are exploratory evidence, not additional accuracy.

Supported date normalization: today/tomorrow/day-after-tomorrow, numeric days
from now, weekdays, this/next/following week (Monday starts the week), month ends,
Japanese month/day, slash dates and ISO dates. A month/day without a year uses its
next occurrence; a bare weekday includes today. All relative dates use the
client's supplied local calendar day, without UTC timezone shifts.

Time-of-day deadlines, recurring schedules and vague dates are left unset with a
review notice; their wording is retained in titles. Invalid dates are never
normalized into another month. Complex clauses that candidate generation cannot
represent request a rewrite rather than silently dropping tasks. Inputs are
limited to 500 characters, eight task candidates and twelve date mentions.
The .35 intent and .5 review confidence thresholds are provisional UX rules,
not calibrated guarantees. Every proposed task requires an explicit user save.

Relevant live docs: [pre-parsed value extraction](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook),
[date extraction](https://docs.typesafe.ai/cookbooks/date_extraction_cookbook),
and [HTTP API](https://docs.typesafe.ai/api).

The metadata-preservation review changed candidate generation to keep all dates
until Jev selects the task's deadline. Only that selected deadline is removed from
the display title; other dates remain part of the task's meaning. A separate
five-example challenge includes source/document dates, date corrections, and a
mid-sentence deadline. Its first pass was 4/5: Jev selected a document receipt date
as a deadline with confidence 0.48. That error is retained in
[japanese-challenge-results.json](japanese-challenge-results.json).

Final regression after applying the existing 0.5 date-review threshold to leave
uncertain deadlines **unset** (and preserve source text):

| Observed set replayed on final code | Exact result | p50 / p95      |
| ----------------------------------- | ------------ | -------------- |
| Development                         | 12/12        | 166 / 352 ms   |
| Previously observed holdout         | 14/15        | 154 / 376 ms   |
| Metadata/correction challenges      | 4/5          | not aggregated |

These are regression results, not fresh holdout scores. The original holdout and
challenge artifacts are retained; final artifacts have `japanese-final-` prefixes
and include a SHA-256 of the two parser source files. The challenge's prior wrong
document-date assignment now leaves the title intact and deadline empty. However,
`10月1日に届いた資料を明日までに読む` was declined as uncertain on the final run,
after succeeding in the prior run. This demonstrates model variability near the
task-selection boundary; the two final failures request clarification instead of
proposing an incorrect task/date. The authored set is too small to estimate
production accuracy or calibrate confidence thresholds.

To preserve historical artifacts when repeating the regression:

```sh
node --env-file=.env --import tsx experiments/jev/japanese-benchmark.ts dev experiments/jev/japanese-final-dev-results.json
node --env-file=.env --import tsx experiments/jev/japanese-benchmark.ts holdout experiments/jev/japanese-final-regression-results.json
```
