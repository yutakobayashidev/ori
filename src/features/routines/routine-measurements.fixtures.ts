import type { RoutineHistoryItem } from "./routine-measurements";
import type { RoutineDefinition } from "./routine-model";
export const measurementRoutine: RoutineDefinition = {
  id: "11111111-1111-4111-8111-111111111111",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  name: "Daily health",
  description: "",
  aliases: [],
  schedule: { weekdays: [1], timeOfDay: "anytime", time: null, timeZone: "Asia/Tokyo" },
  steps: ["morning", "night"].map((id) => ({
    id,
    label: `${id} blood pressure`,
    repeatable: true,
    layout: "inline",
    fields: ["systolic", "diastolic"].map((field) => ({
      id: field,
      label: field,
      type: "number",
      required: true,
      unit: "mmHg",
      min: null,
      max: null,
      options: [],
      metric: { id: `blood_pressure.${field}`, label: field, group: "blood_pressure" },
    })),
  })),
};
export const measurementHistory: RoutineHistoryItem[] = [
  {
    definition: measurementRoutine,
    run: {
      id: "22222222-2222-4222-8222-222222222222",
      routineId: measurementRoutine.id,
      routineVersion: 1,
      occurredAt: "2026-01-01T21:00:00Z",
      recordedAt: "2026-01-01T22:00:00Z",
      steps: [
        {
          stepId: "night",
          done: true,
          occurredAt: "2026-01-01T21:00:00Z",
          entries: [{ systolic: 120, diastolic: 80 }],
        },
        {
          stepId: "morning",
          done: true,
          occurredAt: "2026-01-01T08:00:00Z",
          entries: [
            { systolic: 125, diastolic: 85 },
            { systolic: 121, diastolic: 81 },
          ],
        },
      ],
    },
  },
];

export function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`Missing fixture at ${index}`);
  return item;
}
