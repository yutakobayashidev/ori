# Routine builder

Implemented on 2026-10-18.

## Behavior

Home's natural-language input offers routine creation or a saved routine invocation.
The owner explicitly opens a right-hand sheet; typing never opens it automatically.
`/` provides the same creation and saved-routine entry points.

Codex app-server builds a routine through conversation. Each turn uses `outputSchema`
and returns a proposed definition, missing information, and questions. The app renders
that definition as a working form preview. Required information gates saving; optional
information must not create an endless questionnaire. User-facing chrome is English;
conversation and owner-provided names retain the owner's language.

Definitions include name, aliases, schedule (weekdays, qualitative time of day,
optional exact time, timezone), and ordered steps. A step can be Done-only or contain
AI-designed typed fields. Repeated steps support multiple measurements; layout can
place related inputs together. No medication names or routine contents are compiled
into the application. Exact notification scheduling is not implied by a qualitative
time such as bedtime.

Saved definitions have immutable versions. A run records the version, occurrence
and recording timestamps, explicit Done actions and typed input values. Missing input
is not a negative observation. Changes to a routine never rewrite its past runs.

## Implementation research

- [Codex app-server](https://learn.chatgpt.com/docs/app-server): `turn/start.outputSchema`
  constrains the final response. Completed agent messages, rather than commentary,
  supply the structured result. Use the existing authenticated runtime service.
- [TypeSafe function calling](https://docs.typesafe.ai/cookbooks/function_calling):
  bounded selection is appropriate for routing to creation or a registered routine;
  generative Codex turns own schema construction and follow-up questions.
- [OmniTrack (2017)](https://younghokim.net/files/papers/omnitrack-kim.pdf):
  configurable data collection combines user-selected fields and input types.
- [MigraineTracker (2024)](https://www.smunson.com/portfolio/projects/lifelogs/MigraineTracker-Patient_Experiences_with_Goal-Directed_Self-Tracking.pdf):
  configuration, data entry and review are separate; tracking configuration evolves.
- [ODK form versioning](https://docs.getodk.org/central-forms/#updating-forms-to-a-new-version):
  retain prior submissions and the meaning of fields across form revisions.

These sources motivate the design; they do not establish accuracy of Ori's prompts
or that a particular storage implementation improves tracking adherence.

## Storage and operation

`TWITTER_LITE_ROUTINE_DIR` defaults to `~/.local/state/twitter-lite/routines`.
`definitions.jsonl` contains immutable definition versions; `YYYY-MM-DD.jsonl`
contains execution records partitioned by recording date in Asia/Tokyo. Files are
append-only, mode 0600 in a 0700 directory. Back up this directory along with the
separate Journal Markdown directory and SQLite database. Routine observations
remain typed JSON values; they are not flattened into Journal prose.

Every execution references the exact definition version. History renders with that
version's labels and units. Reusing a field ID with a different type or unit is
rejected; meaningful semantic changes should also receive a new ID. Retries reuse
request IDs, and stale definition edits are rejected instead of overwriting newer
work. This local repository assumes one writer process (the existing web service).

Scheduling specifies days, qualitative time or an exact clock time and timezone.
Home shows today's schedule and lets the owner invoke any routine on demand.
This release does not send notifications. A routine can be partly recorded; no
record is inferred for untouched steps. Done-only actions record completion time;
measurement steps preserve false and zero separately from missing input. The
execution timestamp can be adjusted for earlier observations.

Routine creation/editing calls the existing authenticated Elixir runtime through
`WORKSPACE_RUNTIME_URL` and `WORKSPACE_RUNTIME_TOKEN[_FILE]`. That runtime's Codex
installation and login are used, with no separate OpenAI API key. Each builder
request sends the conversation and current draft in a bounded, read-only turn,
using `turn/start.outputSchema`. The runtime exposes the final completed answer
separately from commentary. Replies are parsed and validated before rendering.
Errors preserve the conversation and offer retry. Unsaved drafts currently live
in the open sheet; close/reload discards them. Saved forms run without Codex.

## Verification (2026-10-18)

- Full unit suite: 961 passed, one opt-in test skipped; runtime suite: 27 passed.
- Home/Journal/routine browser suite: 36 passed across desktop and mobile.
- Expanded medication-selection scenario: both desktop/mobile passed, including
  exact typed values on disk and readable history. Builder checked at widths
  320, 375, 414 and 768 with no horizontal overflow and axe accessibility checks.
- Live Codex app-server: vague request produced questions; follow-up produced
  Done-only steps and repeated inline blood pressure fields using the actual output
  schema. This live check saved no production data.
- Live Jev routing: eight cases covered creation, registered names/aliases,
  past-tense observations, ordinary tasks and refusal.
- Typecheck and lint passed. Browser scenarios use an isolated protocol fixture
  for deterministic Codex replies; live Codex is verified separately as above.
