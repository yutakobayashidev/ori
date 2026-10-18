import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoutineForm, type RoutineValues } from "./routine-form";
import type { RoutineDraft, RoutineField } from "./routine-model";
const numberField = (id: string, label: string): RoutineField => ({
  id,
  label,
  type: "number",
  required: true,
  unit: "mmHg",
  options: [],
  min: 0,
  max: null,
});
const draft: RoutineDraft = {
  name: "Evening",
  description: "",
  aliases: [],
  schedule: { weekdays: [1], timeOfDay: "evening", time: null, timeZone: "Asia/Tokyo" },
  steps: [
    { id: "brush", label: "Brush teeth", repeatable: false, layout: "stack", fields: [] },
    {
      id: "bp",
      label: "Blood pressure",
      repeatable: true,
      layout: "inline",
      fields: [numberField("upper", "Systolic"), numberField("lower", "Diastolic")],
    },
    {
      id: "context",
      label: "Context",
      repeatable: false,
      layout: "stack",
      fields: [
        {
          id: "rested",
          label: "Rested",
          type: "boolean",
          required: false,
          unit: null,
          options: [],
          min: null,
          max: null,
        },
        {
          id: "meds",
          label: "Medication",
          type: "multiChoice",
          required: false,
          unit: null,
          options: [
            { value: "a", label: "Medicine A" },
            { value: "b", label: "Medicine B" },
          ],
          min: null,
          max: null,
        },
      ],
    },
  ],
};
function Harness({
  definition = draft,
  disabled = false,
  recordedFor,
}: {
  definition?: RoutineDraft;
  disabled?: boolean;
  recordedFor?: string;
}) {
  const [value, setValue] = useState<RoutineValues>({});
  return (
    <>
      <RoutineForm
        draft={definition}
        value={value}
        onChange={setValue}
        disabled={disabled}
        recordedFor={recordedFor}
      />
      <output data-testid="values">{JSON.stringify(value)}</output>
    </>
  );
}
function values(): RoutineValues {
  return JSON.parse(screen.getByTestId("values").textContent ?? "{}");
}
describe("dynamic routine forms", () => {
  it("allows an explicit measurement time without marking an untouched step complete", () => {
    render(<Harness recordedFor="2026-10-19T21:00" />);
    fireEvent.change(screen.getByLabelText("Blood pressure time"), {
      target: { value: "2026-10-19T08:30" },
    });
    expect(values().bp?.done).toBe(false);
    expect(values().bp?.occurredAt).toBe("2026-10-19T08:30");
    fireEvent.change(screen.getByLabelText("Systolic (mmHg)"), { target: { value: "120" } });
    expect(values().bp?.done).toBe(true);
    expect(values().bp?.occurredAt).toBe("2026-10-19T08:30");
    expect(values().context).toBeUndefined();
  });
  it("records Done-only steps without touching measurement fields", () => {
    render(<Harness />);
    fireEvent.click(
      within(screen.getByRole("group", { name: "Brush teeth" })).getByRole("checkbox", {
        name: "Done",
      }),
    );
    expect(values().brush?.done).toBe(true);
    expect(values().bp).toBeUndefined();
    fireEvent.click(screen.getByRole("checkbox", { name: "Done" }));
    expect(values().brush?.done).toBe(false);
  });
  it("keeps repeated measurement pairs together when adding and removing rows", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Systolic (mmHg)"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Diastolic (mmHg)"), { target: { value: "80" } });
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
    fireEvent.change(screen.getAllByLabelText("Systolic (mmHg)")[1] as HTMLElement, {
      target: { value: "118" },
    });
    fireEvent.change(screen.getAllByLabelText("Diastolic (mmHg)")[1] as HTMLElement, {
      target: { value: "78" },
    });
    expect(values().bp?.entries).toEqual([
      { upper: 120, lower: 80 },
      { upper: 118, lower: 78 },
    ]);
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0] as HTMLElement);
    expect(values().bp?.entries).toEqual([{ upper: 118, lower: 78 }]);
    expect(screen.getByLabelText("Systolic (mmHg)")).toHaveValue(118);
    expect(screen.getByLabelText("Diastolic (mmHg)")).toHaveValue(78);
  });
  it("preserves zero and explicit false separately from untouched fields", () => {
    render(<Harness />);
    expect(values().context).toBeUndefined();
    fireEvent.change(screen.getByLabelText("Systolic (mmHg)"), { target: { value: "0" } });
    expect(values().bp?.entries[0]).toEqual({ upper: 0 });
    fireEvent.change(screen.getByRole("combobox", { name: /Rested/ }), {
      target: { value: "false" },
    });
    expect(values().context?.entries[0]).toEqual({ rested: false });
    fireEvent.change(screen.getByLabelText("Systolic (mmHg)"), { target: { value: "" } });
    expect(values().bp?.entries[0]).toEqual({});
    expect(values().bp?.done).toBe(false);
    expect(values().context?.done).toBe(true);
    expect(values().context?.entries[0]?.rested).toBe(false);
    fireEvent.change(screen.getByRole("combobox", { name: /Rested/ }), { target: { value: "" } });
    expect(values().context?.entries[0]).toEqual({});
    expect(values().context?.done).toBe(false);
  });
  it("clears completion when the only populated repeated entry is removed", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Systolic (mmHg)"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Remove" })[0] as HTMLElement);
    expect(values().bp?.entries).toEqual([{}]);
    expect(values().bp?.done).toBe(false);
  });
  it("preserves other selections and measurements when changing one field", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("Systolic (mmHg)"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Medicine A" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Medicine B" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Medicine A" }));
    expect(values().context?.entries[0]?.meds).toEqual(["b"]);
    expect(values().bp?.entries[0]?.upper).toBe(120);
    fireEvent.click(screen.getByRole("checkbox", { name: "Medicine B" }));
    expect(values().context?.entries[0]).toEqual({});
    expect(values().context?.done).toBe(false);
  });
  it("retains values by stable field ID when the preview labels and order change", () => {
    const view = render(<Harness />);
    fireEvent.change(screen.getByLabelText("Systolic (mmHg)"), { target: { value: "120" } });
    const changed = structuredClone(draft);
    changed.steps.reverse();
    const field = changed.steps.find((step) => step.id === "bp")?.fields[0];
    if (!field) throw new Error("Fixture missing field");
    field.label = "Upper";
    view.rerender(<Harness definition={changed} />);
    expect(screen.getByLabelText("Upper (mmHg)")).toHaveValue(120);
    expect(values().bp?.entries[0]?.upper).toBe(120);
  });
  it("disables every input while saving", () => {
    render(<Harness disabled />);
    for (const input of screen.getAllByRole("checkbox")) expect(input).toBeDisabled();
    for (const input of screen.getAllByRole("spinbutton")) expect(input).toBeDisabled();
    for (const input of screen.getAllByRole("combobox")) expect(input).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add entry" })).toBeDisabled();
  });
});
