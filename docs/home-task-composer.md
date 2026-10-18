# Home task composer

Home's input previews Japanese tasks while typing. Interface labels stay in English. Review the extracted titles and
date-only deadlines, edit or remove rows, then confirm to save the selected tasks
as Activities. Saving a list is atomic: the whole list succeeds or none is saved.
Tasks and deadlines survive reload and appear in the shared task views.

Set `TYPESAFE_API_KEY` in the web server's environment to enable automatic previews.
Keep it server-side; never use a `VITE_` or public environment prefix. For a local
shell, load the ignored `.env` before starting the server, for example:

```sh
node --env-file=.env node_modules/vite/bin/vite.js --host 127.0.0.1 --port 3000
```

For production, supply the same environment variable to the web service. The
preview sends the Home text, derived task/date candidates, and browser-local
calendar date to TypeSafe. It does not send other Activities, messages, or account
credentials. Owner-session and CSRF checks apply to this server function.

Automatic preview never saves a task. If the service is unavailable, the UI says so
and offers explicit manual task entry. Uncertain or unsupported dates require
review. Deadlines are calendar dates, not notification schedules or times of day.

Press `/` in an empty input to open the searchable card palette. Choose a task,
task list, or task with a deadline using the arrow keys and Enter. Escape closes
the palette or clears the composer. Tab keeps the current automatic preview for
editing. Explicit card selection and edits stop automatic replacement. The palette
contains the three task types supported here, not Shapeshift's unrelated utilities.

The live browser integration check is opt-in (it makes real API calls) and uses an
isolated test database:

```sh
TWITTER_LITE_JEV_LIVE=1 node --env-file=.env node_modules/@playwright/test/cli.js test e2e/integrations/home-task-composer.test.ts --grep 'live Japanese' --project=desktop
```

Use the project's Nix development shell and `PLAYWRIGHT_CHROMIUM_EXECUTABLE` as
for the existing E2E suite. Ordinary composer E2E cases use the manual palette;
unit tests exercise automatic preview with controlled service responses.

The composer uses Ori's 12px panel corners, standard buttons, and 16px input text.
The upstream motion is retained without the colored edge or persistent shortcut copy.

## Upstream

The composer ports/adapts Shapeshift's MIT-licensed shell, motion constants,
card/row transitions, and command-palette interaction. The reference is
[anishfn/shapeshift](https://github.com/anishfn/shapeshift/tree/5e24166dcbde6e794f0bd5b1b4bd395aaee5fc19),
especially `MorphContainer.tsx`, `CardView.tsx`, `IntentPalette.tsx`, `TodoList.tsx`,
`ReminderPill.tsx`, `RecentStack.tsx`, `lib/motion.ts`, and `app/globals.css`. Ori supplies Japanese task extraction and
Activity persistence instead of the upstream English parsers/localStorage store.
The [MIT copyright and permission notice](licenses/shapeshift-MIT.txt) is retained.

## Verification

The initial intent-only benchmark and Japanese extraction benchmarks live in
[`experiments/jev`](../experiments/jev/README.md). The initial 40-example classification
result does not measure task extraction; use extraction results for integration
decisions. These are small authored datasets, not general-language guarantees.

Current limits: 500 input characters and eight tasks per preview. Relative dates
use the browser's current calendar date; unqualified weekdays mean the next
occurrence including today, and next week starts on Monday. Date-only deadlines
support common Japanese relative days, named weekdays, month ends, numeric dates,
and day offsets. Specific times, recurring schedules, and unresolved timing remain
in the title and require review. The model selects from source-derived candidates;
it does not rewrite arbitrary prose into polished task names.

Verification on 2026-10-18: 26 Home browser checks passed across desktop and mobile,
including real Jev extraction, slash palette, atomic save/reload, deadline clearing,
Board display, accessibility, and existing commands. The full unit suite passed
883 tests (one opt-in test skipped); a subsequent oversized-manual-list regression
also passed in the nine-test composer suite. Typecheck, lint, and production build
were checked. This does not deploy or restart an existing installation.
