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
} from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '#/components/dialog'

type Tone = 'green' | 'blue' | 'purple' | 'yellow'
type Metric = {
  name: string
  value: string
  unit: string
  tone: Tone
  status?: string
  min: string
  max: string
}
const metrics: Metric[] = [
  {
    name: 'Room temperature',
    value: '64.0',
    unit: '°F',
    tone: 'purple',
    status: 'Watch',
    min: '58.1',
    max: '73.6',
  },
  {
    name: 'Humidity',
    value: '64',
    unit: '%',
    tone: 'yellow',
    status: 'Watch',
    min: '47',
    max: '71',
  },
  {
    name: 'CO₂',
    value: '676',
    unit: 'ppm',
    tone: 'blue',
    status: 'Good',
    min: '437',
    max: '1,639',
  },
  {
    name: 'PM1.0',
    value: '0.0',
    unit: 'µg/m³',
    tone: 'purple',
    min: '0.0',
    max: '4.0',
  },
  {
    name: 'PM2.5',
    value: '0.8',
    unit: 'µg/m³',
    tone: 'green',
    status: 'Good',
    min: '0.0',
    max: '3.2',
  },
  {
    name: 'PM10',
    value: '1.0',
    unit: 'µg/m³',
    tone: 'purple',
    min: '0.0',
    max: '5.9',
  },
  {
    name: 'TVOC',
    value: '73',
    unit: 'ppb',
    tone: 'green',
    status: 'Good',
    min: '30',
    max: '1,252',
  },
  {
    name: 'NOx index',
    value: '1',
    unit: '',
    tone: 'green',
    status: 'Good',
    min: '1',
    max: '1',
  },
  {
    name: 'Particle count',
    value: '217',
    unit: 'particles/dL',
    tone: 'purple',
    min: '8',
    max: '817',
  },
]
const scores = [
  {
    name: 'Air quality score',
    value: '93',
    unit: '',
    status: 'Optimal',
    change: '−3',
    suffix: '',
    progress: 0.93,
  },
  {
    name: 'CO₂',
    value: '676',
    unit: 'ppm',
    status: 'Good',
    change: '+42',
    suffix: 'ppm',
    progress: 0.91,
  },
  {
    name: 'PM2.5',
    value: '0.8',
    unit: 'µg/m³',
    status: 'Good',
    change: '+0.4',
    suffix: 'µg/m³',
    progress: 0.96,
  },
  {
    name: 'Comfort index',
    value: '80',
    unit: '',
    status: 'Good',
    change: '+2',
    suffix: '',
    progress: 0.8,
  },
]
const series = [
  {
    name: 'PM2.5',
    unit: 'µg/m³',
    tone: 'green',
    values: [
      2, 1, 0, 0, 0, 1, 0, 6, 1, 1, 0, 0, 5, 21, 14, 9, 0, 0, 1, 2, 0, 2, 5, 62,
      40, 21, 11, 4, 20, 54,
    ],
  },
  {
    name: 'CO₂',
    unit: 'ppm',
    tone: 'blue',
    values: [
      38, 34, 38, 41, 39, 29, 67, 56, 50, 53, 56, 53, 54, 34, 34, 32, 40, 42,
      29, 59, 95, 58, 50, 48, 49, 50, 50, 56, 39, 48,
    ],
  },
  {
    name: 'Room temperature',
    unit: '°F',
    tone: 'purple',
    values: [
      55, 60, 66, 69, 69, 64, 62, 43, 36, 35, 33, 27, 29, 43, 57, 65, 71, 75,
      72, 69, 66, 45, 39, 34, 30, 27, 29, 33, 36, 39,
    ],
  },
  {
    name: 'Humidity',
    unit: '%',
    tone: 'yellow',
    values: [
      4, 4, 3, 3, 3, 3, 4, 4, 5, 5, 4, 4, 4, 5, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
      3, 3, 3, 4, 4,
    ],
  },
] as const

function points(values: readonly number[], width = 640, height = 190) {
  return values
    .map(
      (value, index) =>
        `${(index * width) / (values.length - 1)},${height - (value * height) / 100}`,
    )
    .join(' ')
}

function Sparkline({ index, tone = 'green' }: { index: number; tone?: Tone }) {
  const values =
    index === 7
      ? Array<number>(30).fill(20)
      : (series[index % series.length]?.values ?? series[0].values)
  return (
    <svg
      className="vital-sparkline"
      viewBox="0 0 300 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        points={points(values, 300, 36)}
        fill="none"
        stroke={`var(--vital-${tone})`}
        strokeWidth="1.8"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function Gauge({ value }: { value: number }) {
  return (
    <svg className="vital-gauge" viewBox="0 0 110 65" aria-hidden="true">
      <path
        d="M 5 58 A 50 50 0 0 1 105 58"
        fill="none"
        stroke="var(--vital-border)"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M 5 58 A 50 50 0 0 1 105 58"
        fill="none"
        stroke="var(--vital-green)"
        strokeWidth="5"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray={`${value * 100} 100`}
      />
    </svg>
  )
}

function Trends() {
  const [range, setRange] = useState('48H')
  const [metric, setMetric] = useState('Overview')
  const visible = series.filter(
    (item) => metric === 'Overview' || item.name === metric,
  )
  const labels =
    range === '7D'
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : range === '24H'
        ? ['12 AM', '4 AM', '8 AM', '12 PM', '4 PM', '8 PM']
        : [
            'Mon 7 PM',
            'Tue 3 AM',
            'Tue 11 AM',
            'Tue 7 PM',
            'Wed 3 AM',
            'Wed 11 AM',
          ]
  return (
    <section
      className="vital-trends vital-card"
      aria-label="Environmental trends"
    >
      <div className="vital-card-header">
        <h2>Trends</h2>
        <fieldset className="vital-segmented" aria-label="Trend period">
          {['24H', '48H', '7D'].map((item) => (
            <button
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
        className="vital-chart-tabs vital-segmented"
        aria-label="Trend metric"
      >
        {['Overview', ...series.map((item) => item.name)].map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={metric === item}
            onClick={() => setMetric(item)}
          >
            {item}
          </button>
        ))}
      </fieldset>
      <div className="vital-chart-legend">
        {visible.map((item) => (
          <span key={item.name} data-tone={item.tone}>
            <i />
            {item.name} ({item.unit})
          </span>
        ))}
      </div>
      <svg
        className="vital-trend-chart"
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
              stroke="var(--vital-border)"
            />
            <text
              x="46"
              y={35 + index * 62}
              textAnchor="end"
              fill="var(--vital-muted)"
              fontSize="12"
            >
              {['1,500', '1,000', '500', '0'][index]}
            </text>
          </g>
        ))}
        <text x="6" y="14" fill="var(--vital-muted)" fontSize="12">
          ppm / %
        </text>
        <text x="712" y="14" fill="var(--vital-purple)" fontSize="12">
          °F
        </text>
        <g transform="translate(56,26)">
          {visible.map((item) => {
            const values =
              range === '24H'
                ? item.values.slice(15)
                : range === '7D'
                  ? [...item.values.slice(10), ...item.values.slice(0, 10)]
                  : item.values
            return (
              <polyline
                key={item.name}
                points={points(values)}
                fill="none"
                stroke={`var(--vital-${item.tone})`}
                strokeWidth="2.3"
                strokeLinejoin="round"
              />
            )
          })}
        </g>
        {labels.map((label, index) => (
          <text
            key={label}
            x={75 + (index * 610) / (labels.length - 1)}
            y="242"
            fill="var(--vital-muted)"
            fontSize="12"
            textAnchor="middle"
          >
            {label}
          </text>
        ))}
      </svg>
    </section>
  )
}

function AirMonitor() {
  const [synced, setSynced] = useState(false)
  return (
    <section className="vital-monitor vital-card">
      <div className="vital-card-header">
        <h2>Air monitor</h2>
        <button
          className="vital-outline-button"
          type="button"
          onClick={() => setSynced(true)}
        >
          <RefreshCw size={15} />
          {synced ? 'Synced' : 'Sync now'}
        </button>
      </div>
      <div className="vital-device">
        <Radio className="vital-device-icon" size={66} strokeWidth={1} />
        <div>
          <div className="vital-device-heading">
            <strong>Room</strong>
            <span data-tone="green">● Connected</span>
          </div>
          <p>Air monitor</p>
          <p role="status">
            {synced ? 'Sample readings refreshed' : 'Updated just now'}
          </p>
          <div className="vital-device-badges">
            {['CO₂', 'PM2.5', 'Temp', 'Humidity', 'VOC', 'NOx'].map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </div>
      <p className="vital-monitor-footnote">
        {synced
          ? '71 sample readings synced. No device connected.'
          : '71 sample readings · simulated device'}
      </p>
    </section>
  )
}

function Insights() {
  return (
    <aside className="vital-env-insights">
      <section className="vital-insights vital-card">
        <div className="vital-card-header">
          <h2>Insights</h2>
          <span>today</span>
        </div>
        <div className="vital-insight">
          <TriangleAlert data-tone="yellow" size={20} />
          <div
            className="vital-obscured"
            role="img"
            aria-label="Text obscured in reference image"
          >
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
        <div className="vital-insight">
          <Check data-tone="green" size={20} />
          <div>
            <h3>Particulates stayed low</h3>
            <p>
              The sample PM2.5 reading is 0.8 µg/m³. View its recent pattern in
              Trends.
            </p>
          </div>
        </div>
        <div className="vital-insight">
          <Check data-tone="green" size={20} />
          <div>
            <h3>Humidity through the day</h3>
            <p>
              The room’s current sample reading is 64%. Select Humidity to
              explore the chart.
            </p>
          </div>
        </div>
        <div className="vital-insight">
          <Check data-tone="green" size={20} />
          <div>
            <h3>Room temperature</h3>
            <p>
              The current sample temperature is 64.0°F. Recent readings are
              shown alongside the other room metrics.
            </p>
          </div>
        </div>
      </section>
      <section className="vital-insights vital-card">
        <h2>Recommended actions</h2>
        <div className="vital-insight">
          <Grid2X2 size={20} />
          <div
            className="vital-obscured"
            role="img"
            aria-label="Text obscured in reference image"
          >
            <i />
            <i />
          </div>
        </div>
        <div className="vital-insight">
          <Droplets data-tone="yellow" size={20} />
          <div>
            <h3>Review room humidity</h3>
            <p>Explore the climate controls with simulated settings.</p>
          </div>
        </div>
      </section>
    </aside>
  )
}

function ClimateControl() {
  const [temperature, setTemperature] = useState(68)
  const [mode, setMode] = useState('Auto')
  const [purifier, setPurifier] = useState(true)
  return (
    <section className="vital-climate vital-card">
      <h2>Room climate</h2>
      <p>Simulated controls. Changes stay on this screen.</p>
      <label htmlFor="vital-temperature">
        Target temperature <strong>{temperature}°F</strong>
      </label>
      <input
        id="vital-temperature"
        type="range"
        min="60"
        max="80"
        value={temperature}
        onChange={(event) => setTemperature(Number(event.target.value))}
      />
      <fieldset className="vital-segmented" aria-label="Climate mode">
        {['Auto', 'Cool', 'Heat', 'Off'].map((item) => (
          <button
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
        className="vital-outline-button"
        type="button"
        aria-pressed={purifier}
        onClick={() => setPurifier(!purifier)}
      >
        <Wind size={18} />
        Air purifier · {purifier ? 'On' : 'Off'}
      </button>
    </section>
  )
}

export function EnvironmentPanel() {
  const [tab, setTab] = useState('Overview')
  const [detail, setDetail] = useState<{
    name: string
    value: string
    unit: string
  } | null>(null)
  return (
    <>
      <fieldset
        className="vital-env-tabs vital-segmented"
        aria-label="Environment view"
      >
        {['Overview', 'Climate control'].map((item) => (
          <button
            type="button"
            key={item}
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </fieldset>
      {tab === 'Climate control' ? (
        <ClimateControl />
      ) : (
        <div className="vital-env-layout">
          <div className="vital-env-main">
            <div className="vital-env-scores">
              {scores.map((score, index) => (
                <button
                  type="button"
                  className="vital-env-score vital-card"
                  key={score.name}
                  onClick={() => setDetail(score)}
                >
                  <span className="vital-score-heading">
                    {score.name}
                    <ChevronRight size={16} />
                  </span>
                  <div className="vital-score-reading">
                    <Gauge value={score.progress} />
                    <div>
                      <strong>{score.value}</strong>
                      <small>{score.unit}</small>
                      <p data-tone="green">{score.status}</p>
                    </div>
                  </div>
                  <p className="vital-delta">
                    <span data-tone={index === 3 ? 'green' : 'yellow'}>
                      {score.change}
                    </span>{' '}
                    {score.suffix} vs yesterday
                  </p>
                  <Sparkline index={index} />
                </button>
              ))}
            </div>
            <div className="vital-env-metrics">
              {metrics.map((metric, index) => {
                const MetricIcon =
                  index === 0
                    ? Thermometer
                    : index === 1
                      ? Droplets
                      : index === 2
                        ? Cloud
                        : Grid2X2
                return (
                  <button
                    type="button"
                    className="vital-metric vital-card"
                    key={metric.name}
                    onClick={() => setDetail(metric)}
                  >
                    <MetricIcon size={17} data-tone={metric.tone} />
                    <div className="vital-metric-content">
                      <span>{metric.name}</span>
                      <div className="vital-metric-reading">
                        <strong>{metric.value}</strong>
                        <small>{metric.unit}</small>
                        {metric.status && (
                          <em
                            data-tone={
                              metric.status === 'Watch' ? 'yellow' : 'green'
                            }
                          >
                            {metric.status}
                          </em>
                        )}
                      </div>
                    </div>
                    <div className="vital-metric-spark">
                      <small>{metric.min}</small>
                      <Sparkline index={index} tone={metric.tone} />
                      <small>{metric.max}</small>
                    </div>
                  </button>
                )
              })}
              <div className="vital-metric vital-card vital-room">
                <Wifi size={17} data-tone="green" />
                <div>
                  <span>Room</span>
                  <strong>Connected</strong>
                  <p>
                    <span data-tone="green">●</span> Updated just now
                  </p>
                </div>
              </div>
            </div>
            <div className="vital-env-bottom">
              <Trends />
              <AirMonitor />
            </div>
          </div>
          <Insights />
        </div>
      )}
      {detail && (
        <Dialog title={detail.name} onClose={() => setDetail(null)}>
          <p className="vital-detail-value">
            {detail.value} <small>{detail.unit}</small>
          </p>
          <p>
            This is a sample reading for the dashboard preview. No health or
            environmental device is connected.
          </p>
          <button
            className="vital-outline-button"
            type="button"
            onClick={() => setDetail(null)}
          >
            Back to overview
          </button>
        </Dialog>
      )}
    </>
  )
}
