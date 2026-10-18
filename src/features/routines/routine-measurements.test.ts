import { describe, expect, it } from "vitest";
import { projectRoutineMeasurements } from "./routine-measurements";
import { at, measurementRoutine, measurementHistory } from "./routine-measurements.fixtures";

describe("projectRoutineMeasurements", () => {
  it("combines morning and night metrics, keeps repeated pairs and actual times", () => {
    const points = projectRoutineMeasurements(measurementHistory, [measurementRoutine]);
    expect(points).toHaveLength(6);
    expect(points.map((point) => point.value)).toEqual([125, 85, 121, 81, 120, 80]);
    expect(at(points, 0).observationId).toBe(at(points, 1).observationId);
    expect(at(points, 0).observationId).not.toBe(at(points, 2).observationId);
    expect(at(points, 0).metricId).toBe(at(points, 4).metricId);
    expect(at(points, 0).occurredAt).toBe("2026-01-01T08:00:00Z");
  });
  it("uses run time only when a step time was not recorded", () => {
    const history = structuredClone(measurementHistory);
    delete at(at(history, 0).run.steps, 1).occurredAt;
    expect(
      projectRoutineMeasurements(history, [measurementRoutine]).every(
        (point) => point.occurredAt === at(history, 0).run.occurredAt,
      ),
    ).toBe(true);
  });
  it("can explicitly map historical fields while preserving original labels and units", () => {
    const history = structuredClone(measurementHistory);
    for (const step of at(history, 0).definition.steps)
      for (const field of step.fields) delete field.metric;
    expect(projectRoutineMeasurements(history, [])).toEqual([]);
    const latest = structuredClone(measurementRoutine);
    latest.name = "Renamed";
    at(latest.steps, 0).label = "Renamed morning";
    const points = projectRoutineMeasurements(history, [latest]);
    expect(points).toHaveLength(6);
    expect(at(points, 0).context).toBe("morning blood pressure");
    expect(at(points, 0).routineName).toBe("Daily health");
    latest.steps.forEach((step) =>
      step.fields.forEach((field) => {
        field.unit = "kPa";
      }),
    );
    expect(projectRoutineMeasurements(history, [latest])).toEqual([]);
  });
  it("does not reassign an existing historical metric from the latest definition", () => {
    const latest = structuredClone(measurementRoutine);
    latest.steps.forEach((step) =>
      step.fields.forEach((field) => {
        if (field.metric) field.metric.id = "different";
      }),
    );
    expect(at(projectRoutineMeasurements(measurementHistory, [latest]), 0).metricId).toBe(
      "blood_pressure.systolic",
    );
  });
  it("retains zero and ignores absent or nonnumeric values", () => {
    const history = structuredClone(measurementHistory);
    at(history, 0).run.steps = [
      { stepId: "morning", done: true, entries: [{ systolic: 0, diastolic: "" }] },
    ];
    expect(projectRoutineMeasurements(history, []).map((point) => point.value)).toEqual([0]);
  });
});
