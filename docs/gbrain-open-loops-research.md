# gbrain open loops and personal execution support

Research, 2026-09-28. Source inspection at gbrain revision
`e78f1c38b947b053f3a46881340f74f316be855a`; upstream tests were read, not executed.
Application behavior below is proposed, not implemented. This supplements
[external Codex publishing](agent-publishing-design.md).

## What gbrain implements

### Scope: ingestion is broader than the open-loop engine

gbrain as a whole is not Gmail-only. Its implemented ingestion paths include:

- Google: Gmail, Calendar and Contacts.
- GitHub: issues, pull requests, comments, reviews and associated metadata.
- ChatGPT and Claude account history through live session-cookie connectors.
- Imported agent transcripts, including Codex, Claude Code, OpenClaw and Hermes,
  plus consumer conversation exports.
- Markdown repositories and files, inbox-folder capture, CLI/MCP page writes,
  and the HTTP ingest endpoint.

See [data ingestion](https://github.com/garrytan/gbrain/blob/e78f1c38b947b053f3a46881340f74f316be855a/docs/guides/data-ingestion.md),
[GitHub source](https://github.com/garrytan/gbrain/blob/e78f1c38b947b053f3a46881340f74f316be855a/docs/guides/github-source.md),
and the [live connector registry](https://github.com/garrytan/gbrain/blob/e78f1c38b947b053f3a46881340f74f316be855a/src/core/connectors/registry.ts).

Custom ingestion extensions and agent-side service access are separate from
native synchronization. Documentation mentions Slack, iMessage and other
messaging services through external agent gateways; this does not establish
built-in history sync or open-loop detection for each service. No native Beeper
source was identified. The automatic open-loop detection path inspected below
is specifically wired to Google email threads, not every ingested page.

### Detection

Collection itself is implemented code, not an LLM asked to copy every item.
`gbrain sync --source <id>` dispatches to native Google/GitHub synchronization;
`gbrain connectors sync chatgpt` fetches conversation history and passes it to
the transcript importer. Agents can invoke these commands, but a scheduler can
invoke them directly without an interactive agent. Semantic extraction and
optional embeddings are separate model-using stages.

The [email recipe](https://github.com/garrytan/gbrain/blob/e78f1c38b947b053f3a46881340f74f316be855a/recipes/email-to-brain.md)
explicitly says that earlier versions asked agents to build a collector script,
while current versions ship that logic in the native connector. The illustrative
`scripts/email-collector/email-collector.mjs` path in the deterministic-collectors
guide is not a shipped script at this revision. Agent-authored memory and custom
external integrations remain distinct ingestion paths; not every integration
mentioned in a recipe is a built-in connector.

The engine operates on Google/Gmail threads. It is not a ready-made Beeper
integration. It distinguishes five kinds of unfinished interaction:

| Kind                  | Detection                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Unanswered inbound    | Last substantive message is from someone else, owner is in To, at least 24 hours old                                 |
| Unanswered outbound   | Last substantive message is from owner, external To recipient exists, body contains ASCII `?`, at least 72 hours old |
| Commitment owed by me | LLM extracts an unresolved promise by the owner                                                                      |
| Commitment owed to me | LLM extracts an unresolved promise by someone else                                                                   |
| Decision pending      | LLM extracts an explicit unresolved choice or question                                                               |

The [detector](https://github.com/garrytan/gbrain/blob/e78f1c38b947b053f3a46881340f74f316be855a/src/core/google/loop-detect.ts)
filters machine senders, calendar system messages, self-only threads, muted
senders/threads, and inbound list mail or CC-only delivery. Outbound attribution
uses the first external To recipient. Evidence includes the last message ID and
up to 200 characters of its body.

These rules are useful candidate detection, not proof that a response is owed.
Inbound messages need not contain a request. Outbound requests without `?`,
including full-width Japanese `？`, can be missed. In group chat, a third party's
message is not evidence that the intended recipient answered.

The [LLM extractor](https://github.com/garrytan/gbrain/blob/e78f1c38b947b053f3a46881340f74f316be855a/src/core/google/loops-extract.ts)
processes eligible threads whose newest message is within 30 days. It sends the
newest 12,000 characters, requesting structured direction, counterparty, promise,
due date and quotation. Spam/trash and machine-only conversations are excluded;
owner participation can override bulk-mail exclusions. Updates remain eligible
because they may contain invoices or contracts.

Important implementation limits:

- A malformed item rejects the whole parsed response before writes. This does
  not make the subsequent facts, loops and graph writes one atomic transaction.
- A quotation is checked against the supplied text after whitespace
  normalization. A mismatch removes the quotation **but retains the loop**.
- Commitment confidence is a fixed `0.85`; decision confidence is `0.8`.
  Neither is a calibrated probability or a model-generated confidence estimate.
- LLM evidence references a page; it does not require a specific message ID.
- Date-only deadlines are stored at `23:59:59Z`, not the user's local end of day.
- Deduplication hashes thread, direction and generated text. A paraphrase can
  produce a second loop for the same real-world promise.

## Resolution and persistence

The [store](https://github.com/garrytan/gbrain/blob/e78f1c38b947b053f3a46881340f74f316be855a/src/core/loops/loops-store.ts)
keeps `open`, `done`, `dropped` and `stale`, with closure history.

- A change in whose turn it is automatically closes the appropriate
  deterministic unanswered loop. Muting or a same-side reminder does not.
- Reply-driven closure applies only to `deterministic_thread` loops.
- LLM extraction upserts candidates. It does **not** reconcile previously
  stored promises that disappear from a later extraction. Asking the model to
  omit fulfilled promises is insufficient to close those records.
- Users can mark a loop done or dropped. Reprocessing the same observed activity
  does not resurrect it; genuinely newer activity can reopen it.
- LLM loops become stale after a deadline is over 14 days past **and** activity
  is over 14 days old, or after 90 days without activity. Stale is not fulfilled.
- Dedicated snooze/defer operations are absent. Mutes prevent future detection;
  they do not close existing loops.

For example, “I will send the document Friday” and “Thanks!” can settle the
reply exchange while leaving the document promise open. Completion needs its
own evidence or the user's decision.

## Scheduling, freshness and ranking

The detector runs when
[Google source processing](https://github.com/garrytan/gbrain/blob/e78f1c38b947b053f3a46881340f74f316be855a/src/core/google/google-source.ts)
loads a thread. Delta sync processes threads changed in Gmail history. No
dedicated elapsed-time reevaluation was found in that path: a thread skipped
inside the grace period may not be reconsidered merely because 24/72 hours pass,
until a full sync or another touch. This is a code-based inference, not a
reproduced runtime failure.

Extraction jobs use source, page slug and newest-message timestamp as their key.
Pending work has a 500-job ceiling per source. Overflow is logged, but a durable
backlog of excluded candidates is not maintained; another thread change may be
needed to enqueue them. Successful source sync therefore does not imply complete
or current inference results.

The [waiting operations](https://github.com/garrytan/gbrain/blob/e78f1c38b947b053f3a46881340f74f316be855a/src/core/ops/loops.ts)
group loops by person, defaulting to three groups. Ranking combines loop count,
deadline proximity, age and backlinks to the person's page. It is not a
personal-capacity or action-readiness model. Retrieval considers up to 500
recent loops before ranking and reports truncation.

The [CLI](https://github.com/garrytan/gbrain/blob/e78f1c38b947b053f3a46881340f74f316be855a/src/commands/loops.ts)
normally refuses a waiting report if all Google sources are over 24 hours stale.
One fresh source permits display, so per-source freshness still matters. Remote
operations omit quotations, deep links and entity context that trusted-local
calls may expose.

## Proposed application flow

Keep life as CRM truth and external Codex as the reasoning and filesystem writer.
The app accepts structured proposals and records user decisions and execution.

1. Beeper supplies conversation events. External scheduled Codex runs also
   reconsider items whose review time has arrived, even without a new message.
2. Codex distinguishes a request, an accepted promise, an unanswered exchange
   and a decision. A request must not automatically become an accepted obligation.
3. Publish candidates with stable identities, source message references,
   observations, direction, counterparty and any real deadline. Avoid using
   generated prose as the only identity.
4. Home selects a small set of actionable activities alongside routines and
   measurements. Open loops are candidate context, not automatically today's list.
5. Replies open conversation and draft review; document promises open the actual
   next action. Weight entries and routines retain their own execution controls.
6. Keep waiting items available outside the active list. A review date can bring
   a follow-up back without pretending the other person's work is the user's task.
7. Record done, not needed, defer and corrections separately. Codex consumes
   these decisions and maintains life. New messages alone should not override
   an explicit rejection of the same obligation.

Track source observation and inference completion separately. An old successful
report can remain visible with its timestamp; incomplete coverage must not be
presented as certainty that nothing remains. Old promises should enter review,
not silently count as resolved.

## ADHD-oriented design hypothesis

The intended benefit is to externalize remembering, choosing, starting and
resuming work. These are product hypotheses for personal use, not evidence that
this application treats ADHD or that all people with ADHD need the same UI.

[NICE guidance](https://www.nice.org.uk/guidance/ng87/chapter/recommendations)
describes individually chosen environmental modifications, reducing distraction,
shorter periods of focus with breaks, and written support for verbal requests.
[NIMH guidance](https://www.nimh.nih.gov/health/publications/attention-deficit-hyperactivity-disorder-what-you-need-to-know)
includes routines, written reminders and breaking large tasks into manageable
steps. These support the general direction, not a specific dashboard layout.

Design hypotheses to evaluate:

- Show a few concrete next actions with the material needed to start. Three is
  a possible initial display limit, not a clinically established number.
- Store the broader context out of the user's working memory while keeping it
  retrievable. Do not turn every detected message into another decision to triage.
- Support restarting after an interruption: what was last done, what remains,
  and a small next step. A missed day must not require clearing a wall of debt.
- Keep flexible routines while preserving genuine external deadlines. Hiding
  real deadlines is different from avoiding a rigid minute-by-minute schedule.
- Let ordinary actions use direct controls; natural language is an additional
  route, not a requirement to formulate a prompt before every action.
- Use restrained reminders and easy correction. False positives and repeated
  resurfacing are additional work, even when recall improves.
- Review routine fit and effort as well as completion. Useful questions include
  whether important promises were missed, whether suggestions were wrong, and
  whether the app made starting or resuming easier. Avoid optimizing a completion
  percentage at the cost of meaningful work or rest.

An initial trial can combine one routine, one genuine promise and one waiting
item, then review the actual friction before expanding automatic capture.
