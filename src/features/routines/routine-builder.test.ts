import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { canSaveRoutine, type RoutineBuilderReply } from "./routine-builder";
import { buildRoutineReply } from "./routine-builder.server";
import { generateRoutineDraft } from "./routine-builder-provider.server";
import { listRoutineMetrics } from "./routine-repository.server";

vi.mock("./routine-repository.server", () => ({
  listRoutineMetrics: vi.fn<typeof listRoutineMetrics>(async () => []),
}));

vi.mock("./routine-builder-provider.server", () => ({
  generateRoutineDraft: vi.fn<typeof generateRoutineDraft>(),
}));
const generate = vi.mocked(generateRoutineDraft);
afterEach(() => vi.resetAllMocks());

function readyReply(): RoutineBuilderReply {
  return {
    message: "Ready to review.",
    questions: [],
    missingFields: [],
    draft: {
      name: "Bedtime",
      description: "",
      aliases: ["寝る前"],
      schedule: {
        weekdays: [0, 1, 2, 3, 4, 5, 6],
        timeOfDay: "bedtime",
        time: null,
        timeZone: "Asia/Tokyo",
      },
      steps: [
        { id: "brush", label: "Brush teeth", repeatable: false, layout: "stack", fields: [] },
      ],
    },
  };
}

it("allows a complete done-only routine without an exact time or measurement fields", () => {
  expect(canSaveRoutine(readyReply())).toBe(true);
});

it.each([
  { name: "no reply", reply: null },
  { name: "no draft", reply: { ...readyReply(), draft: null } },
  { name: "unanswered question", reply: { ...readyReply(), questions: ["Which days?"] } },
  { name: "missing decision", reply: { ...readyReply(), missingFields: ["schedule"] } },
])("does not allow saving with $name", ({ reply }) => {
  expect(canSaveRoutine(reply)).toBe(false);
});

it("does not allow duplicate step IDs even if the AI claims all decisions are resolved", () => {
  const reply = readyReply();
  if (!reply.draft) throw new Error("Expected fixture draft.");
  reply.draft.steps.push({
    id: "brush",
    label: "Take a bath",
    repeatable: false,
    layout: "stack",
    fields: [],
  });
  expect(canSaveRoutine(reply)).toBe(false);
});

it("passes the full conversation, current definition, and exact response schema to Codex", async () => {
  const reply = readyReply();
  const input = {
    messages: [
      { role: "user", text: "寝る前に歯を磨く" },
      { role: "assistant", text: "毎日ですか？" },
      { role: "user", text: "毎日" },
    ],
    currentDraft: reply.draft,
  };
  generate.mockResolvedValue(reply);
  await expect(buildRoutineReply(input)).resolves.toEqual(reply);
  expect(generate).toHaveBeenCalledExactlyOnceWith({
    ...input,
    outputSchema: expect.any(Object),
    instructions: expect.any(String),
  });
});

it("supplies existing shared metrics and requires explicit nullable metric bindings in AI output", async () => {
  const metric = { id: "body_weight", label: "Weight", group: "body_weight", unit: "kg" };
  vi.mocked(listRoutineMetrics).mockResolvedValue([metric]);
  generate.mockResolvedValue(readyReply());
  await buildRoutineReply({
    messages: [{ role: "user", text: "Track my weight daily" }],
    currentDraft: null,
  });
  const args = generate.mock.calls[0]?.[0];
  expect(args?.instructions).toContain(JSON.stringify([metric]));
  const fieldSchemas: Array<Record<string, unknown>> = [];
  function visit(value: unknown) {
    if (!value || typeof value !== "object") return;
    const schema = value as Record<string, unknown>;
    if ((schema.properties as Record<string, unknown> | undefined)?.metric)
      fieldSchemas.push(schema);
    Object.values(schema).forEach(visit);
  }
  visit(args?.outputSchema);
  expect(fieldSchemas.length).toBeGreaterThan(0);
  for (const schema of fieldSchemas) expect(schema.required).toContain("metric");
});

it("returns necessary questions without requiring an initial draft", async () => {
  const reply = {
    message: "何をするルーティンですか？",
    questions: ["何をするルーティンですか？"],
    missingFields: ["steps"],
    draft: null,
  };
  generate.mockResolvedValue(reply);
  await expect(
    buildRoutineReply({
      messages: [{ role: "user", text: "ルーティンを作りたい" }],
      currentDraft: null,
    }),
  ).resolves.toEqual(reply);
});

it.each([
  { name: "missing fields", result: { message: "Ready" } },
  { name: "unknown properties", result: { ...readyReply(), executableCode: "run()" } },
  { name: "too many questions", result: { ...readyReply(), questions: ["1", "2", "3", "4"] } },
  {
    name: "invalid schedule",
    result: { ...readyReply(), draft: { ...readyReply().draft, schedule: { weekdays: [8] } } },
  },
])("rejects invalid Codex output: $name", async ({ result }) => {
  generate.mockResolvedValue(result);
  await expect(
    buildRoutineReply({
      messages: [{ role: "user", text: "Every night" }],
      currentDraft: null,
    }),
  ).rejects.toThrow(z.ZodError);
});

it("requires a new user message before invoking Codex", async () => {
  await expect(
    buildRoutineReply({
      messages: [{ role: "assistant", text: "Which days?" }],
      currentDraft: null,
    }),
  ).rejects.toThrow("A new message is required.");
  expect(generate).not.toHaveBeenCalled();
});
