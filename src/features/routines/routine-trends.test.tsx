import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoutineTrends } from "./routine-trends";
import { at, measurementRoutine, measurementHistory } from "./routine-measurements.fixtures";

describe("RoutineTrends", () => {
  it("shows paired metrics in one graph and exposes exact observation context", () => {
    render(
      <RoutineTrends
        history={measurementHistory}
        routines={[measurementRoutine]}
        routine={measurementRoutine}
      />,
    );
    expect(screen.getAllByRole("figure")).toHaveLength(1);
    expect(screen.getByText("Blood pressure · mmHg")).toBeInTheDocument();
    const points = screen.getAllByRole("button");
    expect(points).toHaveLength(6);
    const first = screen.getByRole("button", {
      name: /systolic: 125 mmHg.*morning blood pressure.*Entry 1/,
    });
    fireEvent.focus(first);
    expect(
      screen.getByText(/systolic: 125 mmHg.*morning blood pressure.*Entry 1/, { selector: "p" }),
    ).toBeInTheDocument();
  });
  it("includes the same metric from another routine and separates incompatible units", () => {
    const other = structuredClone(at(measurementHistory, 0));
    other.definition.id = "33333333-3333-4333-8333-333333333333";
    other.run.routineId = other.definition.id;
    other.run.id = "44444444-4444-4444-8444-444444444444";
    other.definition.name = "Travel";
    const history = [...measurementHistory, other];
    const current = structuredClone(measurementRoutine);
    const extraStep = structuredClone(at(current.steps, 0));
    extraStep.id = "other_unit";
    extraStep.fields.forEach((field) => {
      field.unit = "kPa";
    });
    current.steps.push(extraStep);
    at(other.definition.steps, 1).fields.forEach((field) => {
      field.unit = "kPa";
    });
    render(
      <RoutineTrends history={history} routines={[current, other.definition]} routine={current} />,
    );
    const figures = screen.getAllByRole("figure");
    expect(figures).toHaveLength(2);
    expect(within(at(figures, 0)).getAllByRole("button")).toHaveLength(10);
    expect(within(at(figures, 1)).getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /systolic: 125 mmHg.*Travel/ })).toBeInTheDocument();
  });
  it("spaces points by elapsed time rather than by observation order", () => {
    const history = structuredClone(measurementHistory);
    const run = at(history, 0).run;
    run.steps = [
      {
        stepId: "morning",
        done: true,
        occurredAt: "2026-01-01T00:00:00Z",
        entries: [{ systolic: 120 }],
      },
      {
        stepId: "night",
        done: true,
        occurredAt: "2026-01-01T04:00:00Z",
        entries: [{ systolic: 121 }],
      },
    ];
    const later = structuredClone(at(history, 0));
    later.run.id = "55555555-5555-4555-8555-555555555555";
    later.run.steps = [
      {
        stepId: "morning",
        done: true,
        occurredAt: "2026-01-01T16:00:00Z",
        entries: [{ systolic: 122 }],
      },
    ];
    render(
      <RoutineTrends
        history={[...history, later]}
        routines={[measurementRoutine]}
        routine={measurementRoutine}
      />,
    );
    const points = screen.getAllByRole("button");
    const positions = points.map((point) => Number(point.getAttribute("cx")));
    expect((at(positions, 1) - at(positions, 0)) / (at(positions, 2) - at(positions, 0))).toBe(
      0.25,
    );
    fireEvent.keyDown(at(points, 1), { key: "Enter" });
    expect(screen.getByText(/systolic: 121 mmHg/, { selector: "p" })).toBeInTheDocument();
  });
  it("shows times for same-day endpoints and dates across days", () => {
    const history = structuredClone(measurementHistory);
    const morning = new Date(2026, 0, 1, 8);
    const night = new Date(2026, 0, 1, 21);
    const run = at(history, 0).run;
    at(run.steps, 0).occurredAt = night.toISOString();
    at(run.steps, 1).occurredAt = morning.toISOString();
    const { rerender } = render(
      <RoutineTrends
        history={history}
        routines={[measurementRoutine]}
        routine={measurementRoutine}
      />,
    );
    const timeLabel = (date: Date) =>
      date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    expect(screen.getByText(timeLabel(morning), { selector: "text" })).toBeInTheDocument();
    expect(screen.getByText(timeLabel(night), { selector: "text" })).toBeInTheDocument();
    expect(
      screen.getByText(morning.toLocaleDateString(), { selector: "figcaption span" }),
    ).toBeInTheDocument();
    const tomorrow = new Date(2026, 0, 2, 21);
    at(run.steps, 0).occurredAt = tomorrow.toISOString();
    rerender(
      <RoutineTrends
        history={history}
        routines={[measurementRoutine]}
        routine={measurementRoutine}
      />,
    );
    expect(
      screen.getByText(morning.toLocaleDateString(), { selector: "text" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(tomorrow.toLocaleDateString(), { selector: "text" }),
    ).toBeInTheDocument();
  });
  it("does not show an empty chart", () => {
    render(
      <RoutineTrends history={[]} routines={[measurementRoutine]} routine={measurementRoutine} />,
    );
    expect(screen.queryByRole("region", { name: "Measurement trends" })).not.toBeInTheDocument();
  });
});
