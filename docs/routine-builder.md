# Routine builder

Implemented on 2026-10-18.

## Behavior

Home's natural-language input offers routine creation or a saved routine invocation.
Creation and editing explicitly open a right-hand sheet; typing never opens it automatically.
Routine execution stays in Home: a row expands an inline form, while invoking a
routine from the composer automatically previews the same form below the input,
without a Run routine confirmation. Done-only
rows record in one click. History and graphs open only when requested.
Cards use the task-card completion indicators: an empty circle before recording
and a green check after recording for that day and schedule. Composer invocation
initially selects the nearest schedule from the current time in its timezone;
users can change it or choose Unscheduled. Explicit row invocation keeps that
row's schedule. The current-time default is computed locally without an AI request.
When input names a schedule explicitly, the preview can select that schedule.
Jev matches a saved routine and selects values present in the input for its dynamic
fields (for example, weight or systolic/diastolic readings). Users can edit the
prefilled form; saving always requires an explicit action. Routine creation still
requires opening the builder.
`/` provides the same creation and saved-routine entry points.

Codex app-server builds one or more independent routines through a single conversation.
Each turn uses `outputSchema` and returns `drafts`, missing information, and questions.
The app renders each draft as a separate working form preview. Required information gates saving; optional
information must not create an endless questionnaire. User-facing chrome is English;
conversation and owner-provided names retain the owner's language.

Each new routine represents one independently executable action and exactly one form.
Blood pressure keeps systolic and diastolic fields together, with repeatable paired
readings. Weight, medication, bathing, and toothbrushing become separate routines.
Codex must not wrap unrelated actions in a Daily Care container. A Done-only form
has no fields; other forms keep AI-designed field types, units, and layout.

Definitions include name, aliases, and one or more schedules with stable IDs,
weekdays, qualitative time of day, optional exact time, and timezone. Morning and
night blood pressure share one definition and form with two schedule slots.
An execution explicitly identifies its schedule slot or is unscheduled, and has
its own actual timestamp. Home tracks completion separately for each slot and
routine date; recording morning blood pressure does not complete the night slot.
Evening and bedtime slots belong to the previous date until 04:00 in their timezone.
Morning, afternoon and anytime slots keep the calendar date. The same rule applies
to weekday eligibility, automatic slot selection and Home's completion display.
`occurredAt` remains the actual instant used by charts; `routineDate` identifies
the intended day's slot and can be overridden under Timing. Existing records without
`routineDate` derive it from their timestamp and schedule without rewriting files.
Timing is optional: unspecified timing produces one anytime slot without blocking
creation or asking a date question. Recording defaults to now. Date/time and slot
overrides are tucked under Timing, so ordinary entry needs no date interaction.

Click a completed Done-only card's check to undo its latest matching record.
History offers Undo per entry, including measurements. Undo removes that record
from active completion counts, history and graphs; recording again creates a new
entry. Original entries are preserved, with cancellations appended separately.

The builder saves all proposed routines in one atomic, idempotent batch. Each
proposal can be targeted for changes in the conversation or removed before saving.
When editing an existing routine, the first proposal updates that routine; extra
proposals create independent routines. Existing aggregate routines can be split
through conversation while their historical versions and runs remain intact.

Saved definitions have immutable versions. A run records the version, occurrence
and recording timestamps, explicit Done actions and typed input values. Missing input
is not a negative observation. Changes to a routine never rewrite its past runs.

Numeric fields can bind to shared metrics, independently of their form field IDs.
For example, morning and night systolic readings both use
`blood_pressure.systolic`; diastolic readings use `blood_pressure.diastolic` in the
same `blood_pressure` group. Custom metrics are supported. Codex receives the
existing metric catalogue when designing or editing a form and reuses matching
identities. A metric's unit and identity are validated on save.

The Trends section inside the inline recorder's History disclosure combines matching metrics from all routines. Each
group and unit has a separate time-series chart; repeated readings stay separate,
with their paired-entry identity and source step preserved. Selecting a point shows
its value, timestamp, routine, and step. Medication selections and Done actions
remain events in History rather than numeric graph series.

For a routine created before metric bindings existed, edit it and ask Codex to link
its measurement fields to shared metrics. The chart then includes older records
with the same stable field IDs and units, without modifying stored observations.
Labels alone never trigger a merge. Unmapped values remain available in History.
When splitting a legacy aggregate whose fields have no metric bindings, older
values for actions moved into new routine IDs are not retroactively bound to those
new routines. Already-mapped historical measurements still share the same graph.

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
`definitions.jsonl` contains immutable definition versions (new batches share one JSONL record); `YYYY-MM-DD.jsonl`
contains execution records partitioned by recording date in Asia/Tokyo. Files are
accompanied by `cancellations.jsonl`, whose idempotent events reference undone run IDs.
Retrying an old save after its cancellation does not restore the record. Files are
append-only, mode 0600 in a 0700 directory. Back up this directory along with the
separate Journal Markdown directory and SQLite database. Routine observations
remain typed JSON values; they are not flattened into Journal prose.

Existing single-schedule records are read as a single default slot without rewriting files.
Historical aggregate forms remain readable; newly saved forms must contain one action.
Every execution references the exact definition version. History renders with that
version's labels and units. Reusing a field ID with a different type or unit is
rejected; meaningful semantic changes should also receive a new ID. Retries reuse
request IDs, and stale definition edits are rejected instead of overwriting newer
work. This local repository assumes one writer process (the existing web service).

Scheduling specifies days, qualitative time or an exact clock time and timezone.
Home shows today's schedule and lets the owner invoke any routine on demand.
This release does not send notifications. No record is inferred for untouched forms. Done-only actions record completion time;
measurement steps preserve false and zero separately from missing input. The
execution timestamp can be adjusted under Timing for earlier observations.
Legacy aggregate forms retain their per-step time overrides. Morning and
evening are saved as independent runs of the same form. The app never invents a clock time from the step's name; without
an override, the execution timestamp applies to that step's entries.

Routine creation/editing calls the existing authenticated Elixir runtime through
`WORKSPACE_RUNTIME_URL` and `WORKSPACE_RUNTIME_TOKEN[_FILE]`. That runtime's Codex
installation and login are used, with no separate OpenAI API key. Each builder
request sends the conversation and current drafts in a bounded, read-only turn,
using `turn/start.outputSchema`. The runtime exposes the final completed answer
separately from commentary. Replies are parsed and validated before rendering.
Errors preserve the conversation and offer retry. Unsaved drafts currently live
in the open sheet; close/reload discards them. Saved forms run without Codex.

## Original builder verification (2026-10-18)

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

## Multi-routine verification (2026-10-19)

Batch persistence tests cover all-or-nothing validation, concurrent retry, legacy
aggregate splitting and unchanged historical records. Schedule tests distinguish
morning and night and use each slot’s local day. Builder tests cover independent
previews, removing proposals, edits and retries. Live Codex returned three separate
routines for blood pressure, weight and medication, with two blood-pressure slots.

The full unit suite passed 989 tests before the optional-timing refinement; the
final routine suite passed 69 tests. Desktop/mobile browser tests passed for batch
creation, morning/night recording, shared charts, immediate Done/medication/weight
entry and history-preserving edits, including axe checks. A second live Codex check
created toothbrushing and bathing without asking for dates or times. Typecheck,
lint and production build passed.

Inline recording verification: 77 routine tests, desktop/mobile E2E including
accessibility checks, typecheck, lint and production build passed.

Automatic form preview verification: 203 Home/routine tests and desktop/mobile E2E
passed. Six live Jev checks covered weight, paired blood pressure with an explicit
morning slot, a bare routine name, a Done completion, a reflection, and a negated
measurement. These checks did not save production records.

Overnight/undo verification: Home and routine tests cover the 04:00 boundary,
weekday selection, timezone/DST boundaries, date overrides, idempotent cancellation
and original-record preservation. Desktop/mobile E2E records at 01:00 local time,
toggles Done → Undo → Done and removes a measurement from the active chart.
