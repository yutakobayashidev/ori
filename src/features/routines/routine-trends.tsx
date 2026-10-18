import { useId, useState } from "react";
import type { RoutineDefinition } from "./routine-model";
import {
  projectRoutineMeasurements,
  type RoutineHistoryItem,
  type RoutineMeasurement,
} from "./routine-measurements";

const colors = ["var(--primary)", "var(--muted-foreground)", "var(--foreground)"];
const groupKey = (group: string, unit: string | null) => JSON.stringify([group, unit]);
const groupLabel = (group: string) => {
  const words = group.replace(/[._-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};
function pointLabel(point: RoutineMeasurement) {
  return `${point.label}: ${point.value}${point.unit ? ` ${point.unit}` : ""} · ${new Date(point.occurredAt).toLocaleString()} · ${point.routineName} / ${point.context} · Entry ${point.entryIndex + 1}`;
}

export function RoutineTrends({
  history,
  routines,
  routine,
}: {
  history: RoutineHistoryItem[];
  routines: RoutineDefinition[];
  routine: RoutineDefinition;
}) {
  const relevant = new Set(
    routine.steps.flatMap((step) =>
      step.fields.flatMap((field) =>
        field.metric ? [groupKey(field.metric.group, field.unit)] : [],
      ),
    ),
  );
  const groups = new Map<string, RoutineMeasurement[]>();
  for (const point of projectRoutineMeasurements(history, routines)) {
    const key = groupKey(point.group, point.unit);
    if (!relevant.has(key)) continue;
    const points = groups.get(key) ?? [];
    points.push(point);
    groups.set(key, points);
  }
  if (!groups.size) return null;
  return (
    <section aria-label="Measurement trends" className="mt-6 space-y-5 border-t border-border pt-4">
      <h3 className="text-sm font-medium">Trends</h3>
      {[...groups].map(([key, points]) => (
        <MeasurementChart key={key} points={points} />
      ))}
    </section>
  );
}

function MeasurementChart({ points }: { points: RoutineMeasurement[] }) {
  const titleId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = points.find((point) => point.id === selectedId) ?? points.at(-1);
  const first = points[0];
  if (!selected || !first) return null;
  const series = [...new Set(points.map((point) => point.metricId))];
  const times = points.map((point) => Date.parse(point.occurredAt));
  const start = Math.min(...times);
  const end = Math.max(...times);
  const sameDay = new Date(start).toDateString() === new Date(end).toDateString();
  const axisLabel = (time: number) =>
    sameDay
      ? new Date(time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
      : new Date(time).toLocaleDateString();
  const values = points.map((point) => point.value);
  const lowest = Math.min(...values);
  const highest = Math.max(...values);
  const padding = (highest - lowest) * 0.1 || Math.max(Math.abs(lowest) * 0.05, 1);
  const min = lowest - padding;
  const max = highest + padding;
  const x = (point: RoutineMeasurement) =>
    start === end ? 242 : 44 + ((Date.parse(point.occurredAt) - start) / (end - start)) * 396;
  const y = (point: RoutineMeasurement) => 164 - ((point.value - min) / (max - min)) * 144;
  const title = `${groupLabel(first.group)}${first.unit ? ` · ${first.unit}` : ""}`;
  return (
    <figure className="space-y-2" aria-labelledby={titleId}>
      <figcaption id={titleId} className="text-sm font-medium">
        {title}
        {sameDay && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {new Date(start).toLocaleDateString()}
          </span>
        )}
      </figcaption>
      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
        aria-label={`${title} series`}
      >
        {series.map((id, index) => (
          <li key={id} className="flex items-center gap-1.5">
            <svg width="16" height="8" aria-hidden="true">
              <line
                x1="0"
                x2="16"
                y1="4"
                y2="4"
                stroke={colors[index % colors.length]}
                strokeWidth="2"
                strokeDasharray={index % 2 ? "3 2" : undefined}
              />
            </svg>
            {points.find((point) => point.metricId === id)?.label}
          </li>
        ))}
      </ul>
      <svg
        viewBox="0 0 456 200"
        className="w-full overflow-visible"
        aria-label={`${title} over time`}
      >
        {[min, (min + max) / 2, max].map((value, index) => (
          <g key={index}>
            <line
              x1="44"
              x2="440"
              y1={164 - index * 72}
              y2={164 - index * 72}
              stroke="var(--border)"
            />
            <text
              x="38"
              y={168 - index * 72}
              textAnchor="end"
              fontSize="10"
              fill="var(--muted-foreground)"
            >
              {Number(value.toFixed(1))}
            </text>
          </g>
        ))}
        {series.map((id, index) => (
          <polyline
            key={id}
            fill="none"
            stroke={colors[index % colors.length]}
            strokeWidth="1.5"
            strokeDasharray={index % 2 ? "4 3" : undefined}
            points={points
              .filter((point) => point.metricId === id)
              .map((point) => `${x(point)},${y(point)}`)
              .join(" ")}
          />
        ))}
        {points.map((point) => (
          <circle
            key={point.id}
            cx={x(point)}
            cy={y(point)}
            r={selected.id === point.id ? 5 : 3.5}
            fill={colors[series.indexOf(point.metricId) % colors.length]}
            stroke="var(--background)"
            strokeWidth="1.5"
            tabIndex={0}
            role="button"
            aria-label={pointLabel(point)}
            onFocus={() => setSelectedId(point.id)}
            onMouseEnter={() => setSelectedId(point.id)}
            onClick={() => setSelectedId(point.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedId(point.id);
              }
            }}
          >
            <title>{pointLabel(point)}</title>
          </circle>
        ))}
        <text x="44" y="188" fontSize="10" fill="var(--muted-foreground)">
          {axisLabel(start)}
        </text>
        {start !== end && (
          <text x="440" y="188" textAnchor="end" fontSize="10" fill="var(--muted-foreground)">
            {axisLabel(end)}
          </text>
        )}
      </svg>
      <p className="min-h-8 text-xs text-muted-foreground wrap-anywhere" aria-live="polite">
        {pointLabel(selected)}
      </p>
    </figure>
  );
}
