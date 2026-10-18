# Japanese Home task composer

User priority: single tasks, multiple tasks, and deadlines. Implement an editable
preview that changes with input; never persist on inference. User explicitly wants
Shapeshift's design and animation copied as closely as possible, not merely a
generic form inspired by the concept. Directly port relevant MIT components and
motion tokens, preserving attribution while adapting parsing and persistence.

## Acceptance

- Jev evaluates Japanese text with source candidates, including negation,
  corrections, incomplete input, multiple tasks, and deadline association.
- Benchmark the actual extraction used by Home, with authored expectations fixed
  before evaluation; report failures and limitations, not only intent accuracy.
- Use date-only deadlines initially, interpreted against the browser's local date.
  Show unresolved dates for review rather than silently claiming extraction.
- Keep the textarea stable during IME composition, suppress stale async results,
  and preserve manual edits. Review/edit/remove tasks before explicit confirmation.
- Save all selected tasks in one atomic, idempotent Activity transaction. Persist
  deadlines and show them after reload; existing non-task Home commands still work.
- Server-only API credentials; existing owner/CSRF access boundary; bounded input;
  visible unavailable state and explicit manual entry, no silent mock classifier.
- Verify meaningful unit/integration tests, typecheck, build, and browser behavior
  with isolated data. Retain upstream MIT notices for copied/adapted source.

## Work split

1. Japanese parsing and real API benchmark.
2. Activity deadline support and atomic batch creation.
3. Home composer, editing, IME and asynchronous behavior, saved deadline display.
4. Integration review, documentation, browser verification, completion audit.

## Verification evidence

- Final Japanese extraction artifacts record development 12/12, observed holdout
  replay 14/15, and metadata/correction challenges 4/5. The two failures abstain;
  original failures and final source hashes are retained in the benchmark report.
- Composer tests cover IME, stale responses, edited drafts, explicit slash mode,
  unavailable service, confirmation-only saving, and oversized manual lists.
- Repository/provider tests cover atomic rollback, request replay, deadline
  validation, clearing, and persistence. Board/Focus/history render the same field.
- Desktop/mobile browser suite: 26 passed, including real Japanese API previews,
  slash palette, batch save/reload, deadline clear, Board display, accessibility,
  existing Home commands, and narrow layouts. Screenshots are in `test-results/`.
- Full unit suite: 883 passed / one opt-in skip. Subsequent composer regression:
  nine passed. Typecheck, lint, production `pnpm build`, and diff checks passed.
- MIT notice is in `docs/licenses/shapeshift-MIT.txt`; source provenance,
  configuration, keyboard behavior and limitations are in `docs/home-task-composer.md`.
- Existing production installation was not deployed or restarted.
- `flake.nix` dependency hash updated for Motion; Nix dependency retrieval with
  the new hash succeeded. Full Nix application packaging was not run; production
  application compilation was verified through `pnpm build`.
