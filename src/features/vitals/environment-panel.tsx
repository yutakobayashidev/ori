import {
  Check,
  ChevronRight,
  Cloud,
  Droplets,
  Grid2X2,
  Radio,
  RefreshCw,
  Thermometer,
  TriangleAlert,
  Wifi,
  Wind,
} from "lucide-react";
import { useState } from "react";
import { Dialog } from "#/components/dialog";
import { useUrlState } from "#/features/navigation/use-url-state";

type Tone = "green" | "blue" | "purple" | "yellow";
type Metric = {
  name: string;
  value: string;
  unit: string;
  tone: Tone;
  status?: string;
  min: string;
  max: string;
};
const metrics: Metric[] = [
  {
    name: "Room temperature",
    value: "64.0",
    unit: "°F",
    tone: "purple",
    status: "Watch",
    min: "58.1",
    max: "73.6",
  },
  {
    name: "Humidity",
    value: "64",
    unit: "%",
    tone: "yellow",
    status: "Watch",
    min: "47",
    max: "71",
  },
  {
    name: "CO₂",
    value: "676",
    unit: "ppm",
    tone: "blue",
    status: "Good",
    min: "437",
    max: "1,639",
  },
  {
    name: "PM1.0",
    value: "0.0",
    unit: "µg/m³",
    tone: "purple",
    min: "0.0",
    max: "4.0",
  },
  {
    name: "PM2.5",
    value: "0.8",
    unit: "µg/m³",
    tone: "green",
    status: "Good",
    min: "0.0",
    max: "3.2",
  },
  {
    name: "PM10",
    value: "1.0",
    unit: "µg/m³",
    tone: "purple",
    min: "0.0",
    max: "5.9",
  },
  {
    name: "TVOC",
    value: "73",
    unit: "ppb",
    tone: "green",
    status: "Good",
    min: "30",
    max: "1,252",
  },
  {
    name: "NOx index",
    value: "1",
    unit: "",
    tone: "green",
    status: "Good",
    min: "1",
    max: "1",
  },
  {
    name: "Particle count",
    value: "217",
    unit: "particles/dL",
    tone: "purple",
    min: "8",
    max: "817",
  },
];
const scores = [
  {
    name: "Air quality score",
    value: "93",
    unit: "",
    status: "Optimal",
    change: "−3",
    suffix: "",
    progress: 0.93,
  },
  {
    name: "CO₂",
    value: "676",
    unit: "ppm",
    status: "Good",
    change: "+42",
    suffix: "ppm",
    progress: 0.91,
  },
  {
    name: "PM2.5",
    value: "0.8",
    unit: "µg/m³",
    status: "Good",
    change: "+0.4",
    suffix: "µg/m³",
    progress: 0.96,
  },
  {
    name: "Comfort index",
    value: "80",
    unit: "",
    status: "Good",
    change: "+2",
    suffix: "",
    progress: 0.8,
  },
];
const series = [
  {
    name: "PM2.5",
    unit: "µg/m³",
    tone: "green",
    values: [
      2, 1, 0, 0, 0, 1, 0, 6, 1, 1, 0, 0, 5, 21, 14, 9, 0, 0, 1, 2, 0, 2, 5, 62, 40, 21, 11, 4, 20,
      54,
    ],
  },
  {
    name: "CO₂",
    unit: "ppm",
    tone: "blue",
    values: [
      38, 34, 38, 41, 39, 29, 67, 56, 50, 53, 56, 53, 54, 34, 34, 32, 40, 42, 29, 59, 95, 58, 50,
      48, 49, 50, 50, 56, 39, 48,
    ],
  },
  {
    name: "Room temperature",
    unit: "°F",
    tone: "purple",
    values: [
      55, 60, 66, 69, 69, 64, 62, 43, 36, 35, 33, 27, 29, 43, 57, 65, 71, 75, 72, 69, 66, 45, 39,
      34, 30, 27, 29, 33, 36, 39,
    ],
  },
  {
    name: "Humidity",
    unit: "%",
    tone: "yellow",
    values: [
      4, 4, 3, 3, 3, 3, 4, 4, 5, 5, 4, 4, 4, 5, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4,
    ],
  },
] as const;

function points(values: readonly number[], width = 640, height = 190) {
  return values
    .map(
      (value, index) =>
        `${(index * width) / (values.length - 1)},${height - (value * height) / 100}`,
    )
    .join(" ");
}

function Sparkline({
  index,
  tone = "green",
  variant = "metric",
}: {
  index: number;
  tone?: Tone;
  variant?: "metric" | "score";
}) {
  const values =
    index === 7
      ? Array<number>(30).fill(20)
      : (series[index % series.length]?.values ?? series[0].values);
  return (
    <svg
      className="block w-full min-w-0 h-[24px] data-[variant=score]:mt-px-28 data-[variant=score]:h-[36px] min-[1700px]:data-[variant=score]:h-[40px] min-[1700px]:data-[variant=score]:mt-px-34 max-[1401px]:data-[variant=score]:mt-px-18"
      data-variant={variant}
      viewBox="0 0 300 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points(values, 300, 36)}
        fill="none"
        data-tone={tone}
        className="data-[tone=green]:stroke-vital-green data-[tone=blue]:stroke-vital-blue data-[tone=purple]:stroke-vital-purple data-[tone=yellow]:stroke-vital-yellow"
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Gauge({ value }: { value: number }) {
  return (
    <svg className="w-[43%] shrink-0" viewBox="0 0 110 65" aria-hidden="true">
      <path
        d="M 5 58 A 50 50 0 0 1 105 58"
        fill="none"
        className="stroke-vital-border"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M 5 58 A 50 50 0 0 1 105 58"
        fill="none"
        className="stroke-vital-green"
        strokeWidth="5"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray={`${value * 100} 100`}
      />
    </svg>
  );
}

function Trends() {
  const [search, setSearch] = useUrlState();
  const range = search.environmentRange ?? "48H";
  const metric = series.some((item) => item.name === search.environmentMetric)
    ? search.environmentMetric
    : "Overview";
  const setRange = (value: "24H" | "48H" | "7D") =>
    setSearch({ environmentRange: value === "48H" ? undefined : value });
  const setMetric = (value: string) =>
    setSearch({ environmentMetric: value === "Overview" ? undefined : value });
  const visible = series.filter((item) => metric === "Overview" || item.name === metric);
  const labels =
    range === "7D"
      ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      : range === "24H"
        ? ["12 AM", "4 AM", "8 AM", "12 PM", "4 PM", "8 PM"]
        : ["Mon 7 PM", "Tue 3 AM", "Tue 11 AM", "Tue 7 PM", "Wed 3 AM", "Wed 11 AM"];
  return (
    <section
      className="bg-vital-card border border-vital-border rounded-ui-16 min-w-0 overflow-hidden p-px-20 max-[768px]:p-px-12"
      aria-label="Environmental trends"
    >
      <div className="flex items-center justify-between gap-px-10 mb-px-18 max-[768px]:flex-wrap">
        <h2 className="text-ui-15 font-medium">Trends</h2>
        <fieldset
          className="inline-flex max-w-full overflow-x-auto border border-vital-border rounded-ui-10 p-px-3 gap-px-2 whitespace-nowrap"
          aria-label="Trend period"
        >
          {(["24H", "48H", "7D"] as const).map((item) => (
            <button
              className="pt-px-7 pb-px-7 px-px-12 text-vital-muted text-ui-14 rounded-ui-7 cursor-pointer aria-pressed:text-vital-text aria-pressed:bg-muted aria-pressed:inset-ring-1 aria-pressed:inset-ring-vital-border max-[768px]:text-ui-12 max-[768px]:pt-px-7 max-[768px]:pb-px-7 max-[768px]:px-px-9"
              type="button"
              key={item}
              aria-pressed={range === item}
              onClick={() => setRange(item)}
            >
              {item}
            </button>
          ))}
        </fieldset>
      </div>
      <fieldset
        className="inline-flex max-w-full overflow-x-auto border border-vital-border rounded-ui-10 p-px-3 gap-px-2 whitespace-nowrap"
        aria-label="Trend metric"
      >
        {["Overview", ...series.map((item) => item.name)].map((item) => (
          <button
            className="pt-px-7 pb-px-7 px-px-12 text-vital-muted rounded-ui-7 cursor-pointer aria-pressed:text-vital-text aria-pressed:bg-muted aria-pressed:inset-ring-1 aria-pressed:inset-ring-vital-border text-ui-12 max-[768px]:text-ui-12 max-[768px]:pt-px-7 max-[768px]:pb-px-7 max-[768px]:px-px-9"
            type="button"
            key={item}
            aria-pressed={metric === item}
            onClick={() => setMetric(item)}
          >
            {item}
          </button>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-px-15 mt-px-20 mb-px-20 mx-0 text-ui-10">
        {visible.map((item) => (
          <span
            className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow flex items-center gap-px-7"
            key={item.name}
            data-tone={item.tone}
          >
            <i className="w-[8px] h-[8px] rounded-ui-2 bg-current" />
            {item.name} ({item.unit})
          </span>
        ))}
      </div>
      <svg
        className="w-full h-auto min-h-[220px] max-[768px]:min-h-[140px]"
        viewBox="0 0 740 260"
        role="img"
        aria-label={`${range} ${metric} simulated environmental readings`}
      >
        {[0, 1, 2, 3].map((index) => (
          <g key={index}>
            <line
              x1="56"
              x2="696"
              y1={30 + index * 62}
              y2={30 + index * 62}
              className="stroke-vital-border"
            />
            <text
              x="46"
              y={35 + index * 62}
              textAnchor="end"
              className="fill-vital-muted"
              fontSize="12"
            >
              {["1,500", "1,000", "500", "0"][index]}
            </text>
          </g>
        ))}
        <text x="6" y="14" className="fill-vital-muted" fontSize="12">
          ppm / %
        </text>
        <text x="712" y="14" className="fill-vital-purple" fontSize="12">
          °F
        </text>
        <g transform="translate(56,26)">
          {visible.map((item) => {
            const values =
              range === "24H"
                ? item.values.slice(15)
                : range === "7D"
                  ? [...item.values.slice(10), ...item.values.slice(0, 10)]
                  : item.values;
            return (
              <polyline
                key={item.name}
                points={points(values)}
                fill="none"
                data-tone={item.tone}
                className="data-[tone=green]:stroke-vital-green data-[tone=blue]:stroke-vital-blue data-[tone=purple]:stroke-vital-purple data-[tone=yellow]:stroke-vital-yellow"
                strokeWidth="2.3"
                strokeLinejoin="round"
              />
            );
          })}
        </g>
        {labels.map((label, index) => (
          <text
            key={label}
            x={75 + (index * 610) / (labels.length - 1)}
            y="242"
            className="fill-vital-muted"
            fontSize="12"
            textAnchor="middle"
          >
            {label}
          </text>
        ))}
      </svg>
    </section>
  );
}

function AirMonitor() {
  const [synced, setSynced] = useState(false);
  return (
    <section className="bg-vital-card border border-vital-border rounded-ui-16 min-w-0 overflow-hidden p-px-20 max-[768px]:p-px-12">
      <div className="flex items-center justify-between gap-px-10 mb-px-18 max-[768px]:flex-wrap">
        <h2 className="text-ui-15 font-medium">Air monitor</h2>
        <button
          className="inline-flex items-center justify-center gap-px-7 text-ui-12 pt-px-7 pb-px-7 px-px-10 border border-vital-border rounded-ui-7 cursor-pointer"
          type="button"
          onClick={() => setSynced(true)}
        >
          <RefreshCw size={15} />
          {synced ? "Synced" : "Sync now"}
        </button>
      </div>
      <div className="flex items-center gap-px-12 pt-px-16 pb-px-16 px-px-12 border border-vital-border rounded-ui-12">
        <Radio
          className="text-vital-muted shrink-0 max-[1101px]:w-[50px]"
          size={66}
          strokeWidth={1}
        />
        <div className="flex-1 min-w-0">
          <div className="flex gap-px-8 flex-wrap justify-between">
            <strong className="text-ui-14">Room</strong>
            <span
              className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow text-ui-10"
              data-tone="green"
            >
              ● Connected
            </span>
          </div>
          <p className="text-ui-12 text-vital-muted mt-px-8">Air monitor</p>
          <p className="text-ui-12 text-vital-muted mt-px-8" role="status">
            {synced ? "Sample readings refreshed" : "Updated just now"}
          </p>
          <div className="flex flex-wrap gap-px-5 mt-px-10">
            {["CO₂", "PM2.5", "Temp", "Humidity", "VOC", "NOx"].map((item) => (
              <span
                className="text-ui-10 text-vital-muted bg-muted pt-px-3 pb-px-3 px-px-6 rounded-ui-12"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-px-48 text-ui-11 text-vital-muted">
        {synced
          ? "71 sample readings synced. No device connected."
          : "71 sample readings · simulated device"}
      </p>
    </section>
  );
}

function Insights() {
  return (
    <aside className="grid gap-px-16 max-[1101px]:grid-cols-[1fr_1fr] max-[768px]:grid-cols-[1fr]">
      <section className="bg-vital-card border border-vital-border rounded-ui-16 min-w-0 overflow-hidden p-px-22 max-[1101px]:block max-[768px]:p-px-16">
        <div className="flex items-center justify-between gap-px-10 mb-px-18 max-[768px]:flex-wrap">
          <h2 className="text-ui-15 font-medium m-0">Insights</h2>
          <span className="text-ui-12 text-vital-muted">today</span>
        </div>
        <div className="flex items-start gap-px-14 pt-px-22 pb-px-22 px-0 border-b border-vital-border last:border-b-0 last:pb-0">
          <TriangleAlert
            className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow shrink-0"
            data-tone="yellow"
            size={20}
          />
          <div
            className="flex flex-col gap-px-10 flex-1 min-w-0 min-h-[105px]"
            role="img"
            aria-label="Text obscured in reference image"
          >
            <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
            <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
            <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
            <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
          </div>
        </div>
        <div className="flex items-start gap-px-14 pt-px-22 pb-px-22 px-0 border-b border-vital-border last:border-b-0 last:pb-0">
          <Check
            className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow shrink-0"
            data-tone="green"
            size={20}
          />
          <div>
            <h3 className="text-ui-14 m-0 text-vital-text leading-normal">
              Particulates stayed low
            </h3>
            <p className="text-ui-13 text-vital-muted leading-chat mt-px-5">
              The sample PM2.5 reading is 0.8 µg/m³. View its recent pattern in Trends.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-px-14 pt-px-22 pb-px-22 px-0 border-b border-vital-border last:border-b-0 last:pb-0">
          <Check
            className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow shrink-0"
            data-tone="green"
            size={20}
          />
          <div>
            <h3 className="text-ui-14 m-0 text-vital-text leading-normal">
              Humidity through the day
            </h3>
            <p className="text-ui-13 text-vital-muted leading-chat mt-px-5">
              The room’s current sample reading is 64%. Select Humidity to explore the chart.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-px-14 pt-px-22 pb-px-22 px-0 border-b border-vital-border last:border-b-0 last:pb-0">
          <Check
            className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow shrink-0"
            data-tone="green"
            size={20}
          />
          <div>
            <h3 className="text-ui-14 m-0 text-vital-text leading-normal">Room temperature</h3>
            <p className="text-ui-13 text-vital-muted leading-chat mt-px-5">
              The current sample temperature is 64.0°F. Recent readings are shown alongside the
              other room metrics.
            </p>
          </div>
        </div>
      </section>
      <section className="bg-vital-card border border-vital-border rounded-ui-16 min-w-0 overflow-hidden p-px-22 max-[1101px]:block max-[768px]:p-px-16">
        <h2 className="text-ui-15 font-medium mb-px-20">Recommended actions</h2>
        <div className="flex items-start gap-px-14 pt-px-22 pb-px-22 px-0 border-b border-vital-border last:border-b-0 last:pb-0">
          <Grid2X2 className="shrink-0" size={20} />
          <div
            className="flex flex-col gap-px-10 flex-1 min-w-0 min-h-[105px]"
            role="img"
            aria-label="Text obscured in reference image"
          >
            <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
            <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
          </div>
        </div>
        <div className="flex items-start gap-px-14 pt-px-22 pb-px-22 px-0 border-b border-vital-border last:border-b-0 last:pb-0">
          <Droplets
            className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow shrink-0"
            data-tone="yellow"
            size={20}
          />
          <div>
            <h3 className="text-ui-14 m-0 text-vital-text leading-normal">Review room humidity</h3>
            <p className="text-ui-13 text-vital-muted leading-chat mt-px-5">
              Explore the climate controls with simulated settings.
            </p>
          </div>
        </div>
      </section>
    </aside>
  );
}

function ClimateControl() {
  const [temperature, setTemperature] = useState(68);
  const [mode, setMode] = useState("Auto");
  const [purifier, setPurifier] = useState(true);
  return (
    <section className="bg-vital-card border border-vital-border rounded-ui-16 min-w-0 overflow-hidden max-w-[650px] mt-px-20 p-px-30 grid gap-px-24 max-[768px]:p-px-18">
      <h2 className="text-ui-15 font-medium">Room climate</h2>
      <p className="text-vital-muted text-ui-13">
        Simulated controls. Changes stay on this screen.
      </p>
      <label className="flex justify-between text-ui-14" htmlFor="vital-temperature">
        Target temperature <strong>{temperature}°F</strong>
      </label>
      <input
        className="accent-vital-green w-full"
        id="vital-temperature"
        type="range"
        min="60"
        max="80"
        value={temperature}
        onChange={(event) => setTemperature(Number(event.target.value))}
      />
      <fieldset
        className="inline-flex max-w-full overflow-x-auto border border-vital-border rounded-ui-10 p-px-3 gap-px-2 whitespace-nowrap"
        aria-label="Climate mode"
      >
        {["Auto", "Cool", "Heat", "Off"].map((item) => (
          <button
            className="pt-px-7 pb-px-7 px-px-12 text-vital-muted text-ui-14 rounded-ui-7 cursor-pointer aria-pressed:text-vital-text aria-pressed:bg-muted aria-pressed:inset-ring-1 aria-pressed:inset-ring-vital-border max-[768px]:text-ui-12 max-[768px]:pt-px-7 max-[768px]:pb-px-7 max-[768px]:px-px-9"
            type="button"
            key={item}
            aria-pressed={item === mode}
            onClick={() => setMode(item)}
          >
            {item}
          </button>
        ))}
      </fieldset>
      <button
        className="inline-flex items-center justify-center gap-px-7 text-ui-12 pt-px-7 pb-px-7 px-px-10 border border-vital-border rounded-ui-7 cursor-pointer"
        type="button"
        aria-pressed={purifier}
        onClick={() => setPurifier(!purifier)}
      >
        <Wind size={18} />
        Air purifier · {purifier ? "On" : "Off"}
      </button>
    </section>
  );
}

export function EnvironmentPanel() {
  const [search, setSearch] = useUrlState();
  const tab = search.environmentTab ?? "Overview";
  const detail = [...scores, ...metrics].find((item) => item.name === search.environmentDetail);
  const setTab = (value: "Overview" | "Climate control") =>
    setSearch({ environmentTab: value === "Overview" ? undefined : value });
  const setDetail = (value: { name: string } | null) =>
    setSearch({ environmentDetail: value?.name });
  return (
    <>
      <fieldset
        className="inline-flex max-w-full overflow-x-auto border border-vital-border rounded-ui-10 p-px-3 gap-px-2 whitespace-nowrap"
        aria-label="Environment view"
      >
        {(["Overview", "Climate control"] as const).map((item) => (
          <button
            className="pt-px-7 pb-px-7 px-px-12 text-vital-muted text-ui-14 rounded-ui-7 cursor-pointer aria-pressed:text-vital-text aria-pressed:bg-muted aria-pressed:inset-ring-1 aria-pressed:inset-ring-vital-border max-[768px]:text-ui-12 max-[768px]:pt-px-7 max-[768px]:pb-px-7 max-[768px]:px-px-9"
            type="button"
            key={item}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </fieldset>
      {tab === "Climate control" ? (
        <ClimateControl />
      ) : (
        <div className="grid grid-cols-[minmax(0,_1fr)_290px] gap-px-20 mt-px-20 items-start min-[1700px]:grid-cols-[minmax(0,_1fr)_350px] max-[1401px]:grid-cols-[minmax(0,_1fr)_230px] max-[1101px]:grid-cols-[1fr]">
          <div className="min-w-0">
            <div className="grid grid-cols-[repeat(4,_minmax(0,_1fr))] gap-px-14 max-[1401px]:grid-cols-[repeat(2,_minmax(0,_1fr))] max-[768px]:gap-px-10">
              {scores.map((score, index) => (
                <button
                  type="button"
                  className="bg-vital-card border border-vital-border min-w-0 overflow-hidden text-left pt-px-20 pb-0 px-px-18 cursor-pointer rounded-ui-15 min-[1700px]:pt-px-24 max-[768px]:pt-px-14 max-[768px]:pb-0 max-[768px]:px-px-10"
                  key={score.name}
                  onClick={() => setDetail(score)}
                >
                  <span className="flex items-center justify-between gap-px-8 text-ui-14 text-vital-muted max-[768px]:text-ui-11">
                    {score.name}
                    <ChevronRight size={16} />
                  </span>
                  <div className="flex items-center gap-px-15 mt-px-24 max-[1401px]:mt-px-16 max-[768px]:gap-px-6 max-[768px]:flex-wrap">
                    <Gauge value={score.progress} />
                    <div>
                      <strong className="text-ui-36 font-light tracking-score min-[1700px]:text-ui-42 max-[768px]:text-ui-30">
                        {score.value}
                      </strong>
                      <small className="text-ui-10 text-vital-muted">{score.unit}</small>
                      <p
                        className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow text-ui-13"
                        data-tone="green"
                      >
                        {score.status}
                      </p>
                    </div>
                  </div>
                  <p className="text-vital-muted text-ui-12 mt-px-16 max-[768px]:text-ui-10">
                    <span
                      className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow"
                      data-tone={index === 3 ? "green" : "yellow"}
                    >
                      {score.change}
                    </span>{" "}
                    {score.suffix} vs yesterday
                  </p>
                  <Sparkline index={index} variant="score" />
                </button>
              ))}
            </div>
            <div className="grid grid-cols-[repeat(5,_minmax(0,_1fr))] gap-px-14 mt-px-14 max-[1401px]:grid-cols-[repeat(3,_minmax(0,_1fr))] max-[1101px]:grid-cols-[repeat(3,_minmax(0,_1fr))] max-[768px]:grid-cols-[repeat(2,_minmax(0,_1fr))] max-[768px]:gap-px-10">
              {metrics.map((metric, index) => {
                const MetricIcon =
                  index === 0
                    ? Thermometer
                    : index === 1
                      ? Droplets
                      : index === 2
                        ? Cloud
                        : Grid2X2;
                return (
                  <button
                    type="button"
                    className="bg-vital-card border border-vital-border min-w-0 overflow-hidden pt-px-16 pb-px-8 px-px-12 flex gap-px-8 flex-wrap text-left rounded-ui-12 cursor-pointer max-[768px]:pt-px-12 max-[768px]:pb-px-12 max-[768px]:px-px-10"
                    key={metric.name}
                    data-testid="vital-metric"
                    onClick={() => setDetail(metric)}
                  >
                    <MetricIcon
                      className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow max-[768px]:w-[14px]"
                      size={17}
                      data-tone={metric.tone}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-vital-muted text-ui-12">{metric.name}</span>
                      <div className="flex items-baseline flex-wrap gap-px-3">
                        <strong className="text-ui-23 font-normal">{metric.value}</strong>
                        <small className="text-ui-10 text-vital-muted">{metric.unit}</small>
                        {metric.status && (
                          <em
                            className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow not-italic text-ui-11 ml-auto"
                            data-tone={metric.status === "Watch" ? "yellow" : "green"}
                          >
                            {metric.status}
                          </em>
                        )}
                      </div>
                    </div>
                    <div className="flex items-end w-full gap-px-4">
                      <small className="text-ui-9 text-vital-muted">{metric.min}</small>
                      <Sparkline index={index} tone={metric.tone} />
                      <small className="text-ui-9 text-vital-muted">{metric.max}</small>
                    </div>
                  </button>
                );
              })}
              <div className="bg-vital-card border border-vital-border min-w-0 overflow-hidden pt-px-16 pb-px-8 px-px-12 flex gap-px-8 flex-wrap text-left rounded-ui-12 cursor-pointer max-[768px]:pt-px-12 max-[768px]:pb-px-12 max-[768px]:px-px-10">
                <Wifi
                  className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow max-[768px]:w-[14px]"
                  size={17}
                  data-tone="green"
                />
                <div>
                  <span className="text-vital-muted text-ui-12">Room</span>
                  <strong className="block text-ui-14 font-medium mt-px-3 mb-px-3 mx-0">
                    Connected
                  </strong>
                  <p className="text-ui-10 text-vital-muted">
                    <span
                      className="data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow"
                      data-tone="green"
                    >
                      ●
                    </span>{" "}
                    Updated just now
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-[1.65fr_1fr] gap-px-14 mt-px-14 max-[1401px]:grid-cols-[1fr]">
              <Trends />
              <AirMonitor />
            </div>
          </div>
          <Insights />
        </div>
      )}
      {detail && (
        <Dialog title={detail.name} onClose={() => setDetail(null)}>
          <p className="text-ui-32">
            {detail.value} <small className="text-ui-14">{detail.unit}</small>
          </p>
          <p>
            This is a sample reading for the dashboard preview. No health or environmental device is
            connected.
          </p>
          <button
            className="inline-flex items-center justify-center gap-px-7 text-ui-12 pt-px-7 pb-px-7 px-px-10 border border-vital-border rounded-ui-7 cursor-pointer"
            type="button"
            onClick={() => setDetail(null)}
          >
            Back to overview
          </button>
        </Dialog>
      )}
    </>
  );
}
