import type { RoutineValues } from "../routines/routine-form";
import type { RoutineCandidate, TaskIntentResult } from "./task-intent";

type Question = { type: "choice"; instructions: string; criteria: Record<string, string> };
type Answer = { choice: string; confidence: number };
type Value = string | number | boolean | string[];

// Candidates always come from source text. Jev chooses their meaning, never generates values.
export function routinePrefillPlan(text: string, routine: RoutineCandidate) {
  const numbers = [...text.matchAll(/[-+−]?[0-9０-９]+(?:[.．][0-9０-９]+)?/g)]
    .slice(0, 24)
    .map((match) => ({
      source: match[0],
      offset: match.index,
      value: Number(match[0].normalize("NFKC").replace("−", "-")),
    }));
  const spans = [...text.matchAll(/[「"]([^」"]+)[」"]|[：:]\s*([^、,。\n]+)/g)]
    .map((match) => match[1] ?? match[2] ?? "")
    .filter(Boolean)
    .slice(0, 12);
  const questions: Record<string, Question> = {};
  const setters: ((answers: Record<string, Answer>, values: RoutineValues) => void)[] = [];
  function add(
    id: string,
    instructions: string,
    criteria: Record<string, string>,
    apply: (choice: string, values: RoutineValues) => void,
  ) {
    if (Object.keys(questions).length >= 32) return;
    questions[id] = {
      type: "choice",
      instructions,
      criteria: {
        none: "Not explicitly supported by the user's text, negated, hypothetical, a target, superseded, or ambiguous.",
        ...criteria,
      },
    };
    setters.push((answers, values) => {
      const answer = answers[id];
      if (
        answer &&
        answer.confidence >= 0.65 &&
        answer.choice !== "none" &&
        Object.hasOwn(criteria, answer.choice)
      )
        apply(answer.choice, values);
    });
  }
  for (const [si, step] of (routine.steps ?? []).entries()) {
    const base = `Use only explicit evidence in text about the user's actual current observation or completed action for step ${JSON.stringify(step)}. Ignore goals, examples, future plans, negated/superseded values, and observations about someone else. Do not infer missing values. Do not convert units; choose none if the source unit differs from the field unit. If multiple readings are stated, choose none rather than mix readings.`;
    function put(fieldId: string, value: Value, append = false, values: RoutineValues) {
      const state = (values[step.id] ??= { done: true, entries: [{}] });
      const entry = (state.entries[0] ??= {});
      entry[fieldId] = append
        ? [...(Array.isArray(entry[fieldId]) ? entry[fieldId] : []), String(value)]
        : value;
    }
    if (!step.fields.length) {
      add(
        `done_${si}`,
        `${base} Is this action explicitly completed? A bare action name opens the form but does not assert completion.`,
        { done: "The user explicitly says they completed this action." },
        (_choice, values) => {
          values[step.id] = { done: true, entries: [] };
        },
      );
    }
    for (const [fi, field] of step.fields.entries()) {
      const id = `field_${si}_${fi}`;
      const instruction = `${base} Select the source value for field ${JSON.stringify(field)}.`;
      if (field.type === "number") {
        const candidates = numbers.filter(
          (candidate) =>
            Number.isFinite(candidate.value) &&
            (field.min === null || candidate.value >= field.min) &&
            (field.max === null || candidate.value <= field.max),
        );
        if (candidates.length)
          add(
            id,
            instruction,
            Object.fromEntries(
              candidates.map((candidate, index) => [`v${index}`, JSON.stringify(candidate)]),
            ),
            (choice, values) => {
              const candidate = candidates[Number(choice.slice(1))];
              if (candidate) put(field.id, candidate.value, false, values);
            },
          );
      } else if (field.type === "text") {
        if (spans.length)
          add(
            id,
            instruction,
            Object.fromEntries(spans.map((span, index) => [`v${index}`, span])),
            (choice, values) => {
              const span = spans[Number(choice.slice(1))];
              if (span) put(field.id, span, false, values);
            },
          );
      } else if (field.type === "boolean") {
        add(
          id,
          instruction,
          {
            yes: "The text explicitly states this field is true.",
            no: "The text explicitly states this field is false (not just missing).",
          },
          (choice, values) => put(field.id, choice === "yes", false, values),
        );
      } else if (field.type === "choice") {
        add(
          id,
          instruction,
          Object.fromEntries(
            field.options.map((option, index) => [`o${index}`, JSON.stringify(option)]),
          ),
          (choice, values) => {
            const option = field.options[Number(choice.slice(1))];
            if (option) put(field.id, option.value, false, values);
          },
        );
      } else {
        for (const [oi, option] of field.options.entries())
          add(
            `${id}_${oi}`,
            `${instruction} Is option ${JSON.stringify(option)} explicitly selected or recorded?`,
            { selected: "The text explicitly supports this option." },
            (_choice, values) => put(field.id, option.value, true, values),
          );
      }
    }
  }
  let selectedSchedule: string | undefined;
  if (routine.schedules?.length)
    add(
      "schedule",
      "Choose a saved schedule ONLY if text explicitly states its time or daypart (e.g. 朝 / morning, 夜 / night). Do not infer the current time or choose a slot merely because it is the only one.",
      Object.fromEntries(
        routine.schedules.map((schedule, index) => [`s${index}`, JSON.stringify(schedule)]),
      ),
      (choice) => {
        selectedSchedule = routine.schedules?.[Number(choice.slice(1))]?.id;
      },
    );
  return {
    questions,
    state: { text, routine, numbers, spans },
    read(
      answers: Record<string, Answer>,
    ): Pick<TaskIntentResult, "routineValues" | "routineScheduleId"> {
      const values: RoutineValues = {};
      selectedSchedule = undefined;
      for (const set of setters) set(answers, values);
      return {
        ...(Object.keys(values).length ? { routineValues: values } : {}),
        ...(selectedSchedule ? { routineScheduleId: selectedSchedule } : {}),
      };
    },
  };
}
