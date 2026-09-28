import {
  Activity,
  Bell,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Heart,
  House,
  Leaf,
  Lightbulb,
  Menu,
  Plus,
  Shield,
  Stethoscope,
  UserRound,
  Utensils,
  Waves,
  Wind,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '#/components/dialog'
import { Button } from '#/components/ui/button'
import { SidebarProvider } from '#/components/ui/sidebar'
import { TooltipProvider } from '#/components/ui/tooltip'
import { WorkspaceNavigation } from '#/components/workspace-navigation'
import { EnvironmentPanel } from './environment-panel'
import './vitals.css'

const systems = [
  { name: 'Cardiovascular', score: 68, count: 19, tone: 'red', icon: Heart },
  { name: 'Liver', score: 95, count: 11, tone: 'yellow', icon: Shield },
  { name: 'Immune', score: 95, count: 19, tone: 'purple', icon: Shield },
  { name: 'Metabolic', score: 92, count: 6, tone: 'green', icon: Waves },
  { name: 'Endocrine', score: 94, count: 25, tone: 'yellow', icon: Waves },
  { name: 'Blood', score: 100, count: 17, tone: 'red', icon: Activity },
  { name: 'Kidney', score: 98, count: 33, tone: 'purple', icon: Waves },
  { name: 'Nutrients', score: 97, count: 17, tone: 'green', icon: Leaf },
] as const
const nav = [
  { name: 'Home', icon: House },
  { name: 'Body', icon: UserRound },
  { name: 'Vitals', icon: Activity },
  { name: 'Nutrition', icon: Utensils },
  { name: 'Care', icon: Stethoscope },
  { name: 'Environment', icon: Wind },
  { name: 'Lights', icon: Lightbulb },
  { name: 'Records', icon: ClipboardList },
  { name: 'Analysis', icon: ChartNoAxesCombined },
  { name: 'Profile', icon: UserRound },
]
export function VitalsPage() {
  const [section, setSection] = useState('Body')
  const [mobileMenu, setMobileMenu] = useState(false)
  const [detail, setDetail] = useState<string>()
  const [tab, setTab] = useState('Overview')
  const [history, setHistory] = useState(false)
  return (
    <TooltipProvider>
      <SidebarProvider className="vital-workspace">
        <WorkspaceNavigation />
        <div className="vital-app">
          <aside
            className={`vital-navigation ${mobileMenu ? 'is-open' : ''}`}
            aria-label="Health navigation"
          >
            <div className="vital-brand">
              <Activity />
              <span>
                1F2T <span>Health</span>
              </span>
              <button
                className="vital-mobile-close"
                type="button"
                aria-label="メニューを閉じる"
                onClick={() => setMobileMenu(false)}
              >
                <X />
              </button>
            </div>
            <nav>
              {nav.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className={section === item.name ? 'is-active' : ''}
                  onClick={() => {
                    if (item.name === 'Body' || item.name === 'Environment') {
                      setSection(item.name)
                      setMobileMenu(false)
                    } else setDetail(item.name)
                  }}
                >
                  <item.icon />
                  <span>{item.name}</span>
                </button>
              ))}
            </nav>
            <div className="vital-navigation-bottom">
              <button
                type="button"
                onClick={() => setDetail('Log with Claude')}
              >
                <Plus />
                Log with Claude
              </button>
              <button type="button" onClick={() => setDetail('Help')}>
                <CircleHelp />
                Help
              </button>
              <p>Reference preview</p>
            </div>
          </aside>
          <div className="vital-surface">
            <header className="vital-topbar">
              <button
                className="vital-mobile-toggle"
                type="button"
                aria-label="Healthメニューを開く"
                onClick={() => setMobileMenu(true)}
              >
                <Menu />
              </button>
              <h1>{section}</h1>
              <div className="vital-topbar-right">
                <span className="vital-pulse">
                  <Heart />
                  86 bpm
                </span>
                <button
                  type="button"
                  aria-label="通知を開く"
                  onClick={() => setDetail('Notifications')}
                >
                  <Bell />
                </button>
                <button
                  type="button"
                  className="vital-profile"
                  onClick={() => setDetail('Profile')}
                >
                  <span className="vital-avatar">Y</span>Yuta
                  <ChevronDown />
                </button>
              </div>
            </header>
            <main className="vital-scroll">
              {section === 'Environment' ? (
                <EnvironmentPanel />
              ) : (
                <div className="vital-body-page">
                  <div className="vital-tabs">
                    {[
                      'Overview',
                      'Cardiovascular',
                      'Metabolic',
                      'Liver',
                      'Kidney',
                      'Endocrine',
                      'Immune',
                      'Blood',
                      'Nutrients',
                    ].map((name) => (
                      <button
                        type="button"
                        key={name}
                        className={tab === name ? 'is-active' : ''}
                        onClick={() => setTab(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <div className="vital-body-columns">
                    <div className="vital-card vital-body-main">
                      <div className="vital-lab-row">
                        <section className="vital-lab-score">
                          <header>
                            <h2>Lab score</h2>
                            <span>Latest draw · Jul 28</span>
                          </header>
                          <div className="vital-lab-value">
                            <div className="vital-ring">
                              <svg viewBox="0 0 160 160" aria-hidden="true">
                                <circle cx="80" cy="80" r="67" />
                                <circle
                                  cx="80"
                                  cy="80"
                                  r="67"
                                  pathLength="100"
                                  strokeDasharray="92 100"
                                />
                              </svg>
                              <span>
                                92<small>Lab score</small>
                              </span>
                            </div>
                            <div className="vital-lab-description">
                              <h3>
                                Optimal <span>▾ 1</span>
                              </h3>
                              <p>
                                7 of 8 systems optimal · 21 of 161 biomarkers
                                out of range
                              </p>
                              <div className="vital-lab-change">
                                <div>
                                  <span>Change ⓘ</span>
                                  <strong>
                                    −1 <small>pt</small>
                                  </strong>
                                  <p>Since last draw</p>
                                </div>
                                <svg
                                  viewBox="0 0 190 65"
                                  aria-label="Lab score trend"
                                  role="img"
                                >
                                  <path
                                    d="M2 12 L24 12 Q34 8 39 29 T65 57 Q76 66 85 20 T105 19 L132 17 Q145 17 153 49 T174 48 L188 51"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                  />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </section>
                        <section className="vital-recent">
                          <h2>Recent results</h2>
                          {[1, 2, 3].map((index) => (
                            <button
                              key={index}
                              type="button"
                              onClick={() => setDetail('Recent result')}
                            >
                              <span className="vital-warning">△</span>
                              <span
                                className="vital-obscured"
                                role="img"
                                aria-label="Reference text obscured"
                              >
                                <i />
                                <i />
                              </span>
                              <ChevronRight />
                            </button>
                          ))}
                        </section>
                      </div>
                      <section className="vital-systems">
                        <header>
                          <h2>{tab === 'Overview' ? 'Body systems' : tab}</h2>
                          <div className="vital-tabs">
                            <button
                              type="button"
                              className={!history ? 'is-active' : ''}
                              onClick={() => setHistory(false)}
                            >
                              Systems
                            </button>
                            <button
                              type="button"
                              className={history ? 'is-active' : ''}
                              onClick={() => setHistory(true)}
                            >
                              Lab history
                            </button>
                          </div>
                        </header>
                        {history ? (
                          <div className="vital-history">
                            <h3>Lab history</h3>
                            {[
                              ['Jul 28', '92'],
                              ['May 16', '93'],
                              ['Mar 04', '89'],
                            ].map(([date, score]) => (
                              <div key={date}>
                                <span>{date}</span>
                                <span>
                                  {score}
                                  <small> Lab score</small>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="vital-anatomy-grid">
                            <div className="vital-system-list">
                              {systems
                                .slice(0, 4)
                                .filter(
                                  (item) =>
                                    tab === 'Overview' || tab === item.name,
                                )
                                .map((item) => (
                                  <SystemCard
                                    key={item.name}
                                    item={item}
                                    onSelect={() => setDetail(item.name)}
                                  />
                                ))}
                            </div>
                            <div
                              className="vital-anatomy"
                              role="img"
                              aria-label="人体と各系統の位置を示す参照図"
                            >
                              <img src="/vitals/body-reference.jpg" alt="" />
                            </div>
                            <div className="vital-system-list">
                              {systems
                                .slice(4)
                                .filter(
                                  (item) =>
                                    tab === 'Overview' || tab === item.name,
                                )
                                .map((item) => (
                                  <SystemCard
                                    key={item.name}
                                    item={item}
                                    onSelect={() => setDetail(item.name)}
                                  />
                                ))}
                            </div>
                          </div>
                        )}
                      </section>
                    </div>
                    <aside className="vital-card vital-insights">
                      <h2>Insights</h2>
                      <div className="vital-insight-feature">
                        <span className="vital-red">△</span>
                        <div
                          className="vital-obscured"
                          role="img"
                          aria-label="Reference text obscured"
                        >
                          <i />
                          <i />
                          <i />
                        </div>
                        <button type="button" onClick={() => setHistory(true)}>
                          View lab history
                        </button>
                      </div>
                      <h3>Summary</h3>
                      <div className="vital-summary">
                        <span>
                          <b className="vital-dot vital-red" />4 need attention
                        </span>
                        <span>
                          <b className="vital-dot vital-yellow" />3 to watch
                        </span>
                        <span>
                          <b className="vital-dot vital-green" />4 going well
                        </span>
                      </div>
                      <h3>More insights</h3>
                      {[0, 1, 2].map((index) => (
                        <div className="vital-insight-placeholder" key={index}>
                          <b
                            className={`vital-dot ${index === 2 ? 'vital-yellow' : 'vital-red'}`}
                          />
                          <div
                            className="vital-obscured"
                            role="img"
                            aria-label="Reference text obscured"
                          >
                            <i />
                            <i />
                            <i />
                          </div>
                        </div>
                      ))}
                      <button
                        className="vital-text-button"
                        type="button"
                        onClick={() => setDetail('Insights')}
                      >
                        Show 6 more
                      </button>
                      <p className="vital-updated">Reference data · Sep 25</p>
                    </aside>
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
        {detail && (
          <Dialog
            title={detail}
            className="sm:max-w-xl"
            onClose={() => setDetail(undefined)}
          >
            <p className="text-sm leading-relaxed text-muted-foreground">
              画像をもとにした表示サンプルです。実際の測定・診断・機器の操作には接続していません。
            </p>
            {systems.find((item) => item.name === detail) && (
              <p className="text-3xl">
                {systems.find((item) => item.name === detail)?.score}
                <span className="ml-2 text-sm text-muted-foreground">
                  score
                </span>
              </p>
            )}
            <Button variant="outline" onClick={() => setDetail(undefined)}>
              閉じる
            </Button>
          </Dialog>
        )}
      </SidebarProvider>
    </TooltipProvider>
  )
}
function SystemCard({
  item,
  onSelect,
}: {
  item: (typeof systems)[number]
  onSelect: () => void
}) {
  return (
    <button type="button" className="vital-system-card" onClick={onSelect}>
      <span className={`vital-system-icon vital-${item.tone}`}>
        <item.icon />
      </span>
      <span className="vital-system-label">
        {item.name}
        <small>{item.count} biomarkers</small>
      </span>
      <span className="vital-system-score">
        {item.score}
        <small className={item.score < 70 ? 'vital-yellow' : 'vital-green'}>
          ● {item.score < 70 ? 'Watch' : 'Optimal'}
        </small>
      </span>
    </button>
  )
}
