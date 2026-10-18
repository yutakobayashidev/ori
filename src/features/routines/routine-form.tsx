import { useId } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import type { RoutineDraft, RoutineField } from "./routine-model";

export type RoutineValues = Record<
  string,
  { done: boolean; entries: Record<string, string | number | boolean | string[]>[] }
>;

export function RoutineForm({
  draft,
  value,
  onChange,
  disabled = false,
}: {
  draft: RoutineDraft;
  value: RoutineValues;
  onChange: (value: RoutineValues) => void;
  disabled?: boolean;
}) {
  const scope = useId();
  return (
    <div className="space-y-5">
      {draft.steps.map((step) => {
        const state = value[step.id] ?? { done: false, entries: [{}] };
        const update = (next: typeof state) =>
          onChange({
            ...value,
            [step.id]: {
              ...next,
              done: step.fields.length
                ? next.entries.some((entry) => Object.keys(entry).length > 0)
                : next.done,
            },
          });
        return (
          <fieldset
            key={step.id}
            disabled={disabled}
            className="min-w-0 space-y-3 border-b border-border pb-5 last:border-0"
          >
            <legend className="mb-2 text-sm font-medium">{step.label}</legend>
            {!step.fields.length ? (
              <label className="flex min-h-10 cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={state.done}
                  onChange={(event) => update({ ...state, done: event.target.checked })}
                  className="size-4 accent-primary"
                />
                Done
              </label>
            ) : (
              <>
                {state.entries.map((entry, index) => (
                  <div key={index} className="space-y-2">
                    {step.repeatable && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Entry {index + 1}</span>
                        {state.entries.length > 1 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              update({
                                ...state,
                                entries: state.entries.filter((_, i) => i !== index),
                              })
                            }
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    )}
                    <div
                      className={step.layout === "inline" ? "grid grid-cols-2 gap-3" : "space-y-3"}
                    >
                      {step.fields.map((field) => (
                        <RoutineFieldInput
                          key={field.id}
                          field={field}
                          id={`${scope}-${step.id}-${index}-${field.id}`}
                          value={entry[field.id]}
                          onChange={(next) => {
                            const row = { ...entry };
                            if (next === undefined || (Array.isArray(next) && !next.length))
                              delete row[field.id];
                            else row[field.id] = next;
                            update({
                              ...state,
                              entries: state.entries.map((item, i) => (i === index ? row : item)),
                            });
                          }}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {step.repeatable && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={state.entries.length >= 20}
                    onClick={() => update({ ...state, entries: [...state.entries, {}] })}
                  >
                    Add entry
                  </Button>
                )}
              </>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

function RoutineFieldInput({
  field,
  id,
  value,
  onChange,
}: {
  field: RoutineField;
  id: string;
  value: string | number | boolean | string[] | undefined;
  onChange: (value: string | number | boolean | string[] | undefined) => void;
}) {
  const label = `${field.label}${field.unit ? ` (${field.unit})` : ""}`;
  if (field.type === "boolean")
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
        <select
          id={id}
          value={typeof value === "boolean" ? String(value) : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : event.target.value === "true")
          }
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="">Select…</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>
    );
  if (field.type === "multiChoice")
    return (
      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 text-sm">{label}</legend>
        {field.options.map((option) => (
          <label key={option.value} className="flex min-h-9 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={Array.isArray(value) && value.includes(option.value)}
              onChange={(event) => {
                const selected = Array.isArray(value) ? value : [];
                onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((item) => item !== option.value),
                );
              }}
            />
            {option.label}
          </label>
        ))}
      </fieldset>
    );
  return (
    <div className="min-w-0 space-y-1.5">
      <label htmlFor={id} className="block text-sm wrap-anywhere">
        {label}
        {!field.required && <span className="ml-1 text-xs text-muted-foreground">Optional</span>}
      </label>
      {field.type === "choice" ? (
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value || undefined)}
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="">Select…</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === "number" ? (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step="any"
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : event.target.valueAsNumber)
          }
        />
      ) : (
        <Textarea
          id={id}
          rows={2}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value || undefined)}
        />
      )}
    </div>
  );
}
