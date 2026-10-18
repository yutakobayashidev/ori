import type { RoutineDefinition, RoutineRun } from "./routine-model";

export type RoutineHistoryItem = { run: RoutineRun; definition: RoutineDefinition };
export type RoutineMeasurement = {
  id: string;
  observationId: string;
  metricId: string;
  label: string;
  group: string;
  unit: string | null;
  value: number;
  occurredAt: string;
  routineId: string;
  routineName: string;
  context: string;
  entryIndex: number;
};

/** Project original observations without averaging or guessing metric identities from labels. */
export function projectRoutineMeasurements(
  history: RoutineHistoryItem[],
  routines: RoutineDefinition[],
): RoutineMeasurement[] {
  const latest = new Map(routines.map((routine) => [routine.id, routine]));
  const measurements: RoutineMeasurement[] = [];
  for (const { run, definition } of history) {
    for (const result of run.steps) {
      const step = definition.steps.find((candidate) => candidate.id === result.stepId);
      if (!step) continue;
      for (const [entryIndex, entry] of result.entries.entries()) {
        for (const field of step.fields) {
          const value = entry[field.id];
          if (field.type !== "number" || typeof value !== "number" || !Number.isFinite(value))
            continue;
          const currentField = latest
            .get(run.routineId)
            ?.steps.find((candidate) => candidate.id === step.id)
            ?.fields.find((candidate) => candidate.id === field.id);
          const metric =
            field.metric ??
            (currentField?.type === field.type && currentField.unit === field.unit
              ? currentField.metric
              : null);
          if (!metric) continue;
          const observationId = `${run.id}/${step.id}/${entryIndex}`;
          measurements.push({
            id: `${observationId}/${field.id}`,
            observationId,
            metricId: metric.id,
            label: metric.label,
            group: metric.group,
            unit: field.unit,
            value,
            occurredAt: result.occurredAt ?? run.occurredAt,
            routineId: run.routineId,
            routineName: definition.name,
            context: step.label,
            entryIndex,
          });
        }
      }
    }
  }
  return measurements.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}
