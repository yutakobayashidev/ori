import { useRouteContext } from "@tanstack/react-router";
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
} from "lucide-react";
import { useState } from "react";
import { Dialog } from "#/components/dialog";
import { Button } from "#/components/ui/button";
import { SidebarProvider } from "#/components/ui/sidebar";
import { TooltipProvider } from "#/components/ui/tooltip";
import { WorkspaceNavigation } from "#/components/workspace-navigation";
import { useUrlState } from "#/features/navigation/use-url-state";
import { EnvironmentPanel } from "./environment-panel";

const systems = [
  { name: "Cardiovascular", score: 68, count: 19, tone: "red", icon: Heart },
  { name: "Liver", score: 95, count: 11, tone: "yellow", icon: Shield },
  { name: "Immune", score: 95, count: 19, tone: "purple", icon: Shield },
  { name: "Metabolic", score: 92, count: 6, tone: "green", icon: Waves },
  { name: "Endocrine", score: 94, count: 25, tone: "yellow", icon: Waves },
  { name: "Blood", score: 100, count: 17, tone: "red", icon: Activity },
  { name: "Kidney", score: 98, count: 33, tone: "purple", icon: Waves },
  { name: "Nutrients", score: 97, count: 17, tone: "green", icon: Leaf },
] as const;
const nav = [
  { name: "Home", icon: House },
  { name: "Body", icon: UserRound },
  { name: "Vitals", icon: Activity },
  { name: "Nutrition", icon: Utensils },
  { name: "Care", icon: Stethoscope },
  { name: "Environment", icon: Wind },
  { name: "Lights", icon: Lightbulb },
  { name: "Records", icon: ClipboardList },
  { name: "Analysis", icon: ChartNoAxesCombined },
  { name: "Profile", icon: UserRound },
];
export function VitalsPage() {
  const { auth } = useRouteContext({ from: "__root__" });
  const [search, setSearch] = useUrlState();
  const section = search.vitalSection ?? "Body";
  const tab = systems.some((item) => item.name === search.vitalTab) ? search.vitalTab : "Overview";
  const detail = [
    ...systems.map((item) => item.name),
    ...nav.map((item) => item.name),
    "Log with Claude",
    "Help",
    "Notifications",
    "Recent result",
    "Insights",
  ].includes(search.vitalDetail ?? "")
    ? search.vitalDetail
    : undefined;
  const history = search.vitalHistory ?? false;
  const setSection = (value: "Body" | "Environment") =>
    setSearch({ vitalSection: value === "Body" ? undefined : value });
  const setTab = (value: string) =>
    setSearch({ vitalTab: value === "Overview" ? undefined : value });
  const setDetail = (value: string | undefined) => setSearch({ vitalDetail: value });
  const setHistory = (value: boolean) => setSearch({ vitalHistory: value || undefined });
  const [mobileMenu, setMobileMenu] = useState(false);
  return (
    <TooltipProvider>
      <SidebarProvider className="h-[100dvh] min-h-0 overflow-hidden bg-vital-bg text-vital-text font-arial">
        <WorkspaceNavigation />
        <div className="flex flex-1 min-w-0 h-full">
          <aside
            className="w-[208px] shrink-0 flex flex-col bg-vital-bg border-r border-vital-border pt-0 pb-0 px-px-10 max-[1401px]:w-[170px] max-[1101px]:w-[150px] max-[768px]:hidden max-[768px]:data-[open=true]:flex max-[768px]:data-[open=true]:fixed max-[768px]:data-[open=true]:left-[56px] max-[768px]:data-[open=true]:top-0 max-[768px]:data-[open=true]:bottom-0 max-[768px]:data-[open=true]:z-[40] max-[768px]:data-[open=true]:w-[220px] max-[768px]:data-[open=true]:shadow-vital-menu"
            data-open={mobileMenu}
            aria-label="Health navigation"
          >
            <div className="h-[64px] flex items-center gap-px-12 pt-0 pb-0 px-px-12 text-ui-18 font-semibold whitespace-nowrap max-[1101px]:text-ui-14 max-[1101px]:px-px-4">
              <Activity className="w-[24px] text-vital-muted" />
              <span>
                1F2T <span className="text-vital-muted font-normal">Health</span>
              </span>
              <button
                className="items-center gap-px-14 pt-px-10 pb-px-10 px-px-12 rounded-ui-8 text-left text-ui-14 cursor-pointer text-vital-muted hover:text-vital-text hidden max-[768px]:flex max-[768px]:ml-auto"
                type="button"
                aria-label="Close menu"
                onClick={() => setMobileMenu(false)}
              >
                <X className="w-[17px] h-[17px] shrink-0" />
              </button>
            </div>
            <nav className="grid gap-px-3 mt-px-14">
              {nav.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="flex items-center gap-px-14 pt-px-10 pb-px-10 px-px-12 rounded-ui-8 text-left text-ui-14 cursor-pointer text-vital-muted data-[active=true]:bg-muted data-[active=true]:text-vital-text hover:text-vital-text"
                  data-active={section === item.name}
                  onClick={() => {
                    if (item.name === "Body" || item.name === "Environment") {
                      setSection(item.name);
                      setMobileMenu(false);
                    } else setDetail(item.name);
                  }}
                >
                  <item.icon className="w-[17px] h-[17px] shrink-0" />
                  <span>{item.name}</span>
                </button>
              ))}
            </nav>
            <div className="mt-auto pb-px-20">
              <button
                className="flex items-center gap-px-14 pt-px-10 pb-px-10 px-px-12 rounded-ui-8 text-left text-ui-14 cursor-pointer text-vital-muted hover:text-vital-text"
                type="button"
                onClick={() => setDetail("Log with Claude")}
              >
                <Plus className="w-[17px] h-[17px] shrink-0" />
                Log with Claude
              </button>
              <button
                className="flex items-center gap-px-14 pt-px-10 pb-px-10 px-px-12 rounded-ui-8 text-left text-ui-14 cursor-pointer text-vital-muted hover:text-vital-text"
                type="button"
                onClick={() => setDetail("Help")}
              >
                <CircleHelp className="w-[17px] h-[17px] shrink-0" />
                Help
              </button>
              <p className="text-ui-11 pt-px-8 pb-px-8 px-px-12 text-vital-muted">
                Reference preview
              </p>
            </div>
          </aside>
          <div className="flex flex-col flex-1 min-w-0">
            <header className="h-[64px] shrink-0 flex items-center pt-0 pb-0 px-px-28 border-b border-vital-border gap-px-12 max-[768px]:pt-0 max-[768px]:pb-0 max-[768px]:px-px-12 max-[768px]:h-[56px]">
              <button
                className="hidden max-[768px]:flex"
                type="button"
                aria-label="Open Health menu"
                onClick={() => setMobileMenu(true)}
              >
                <Menu className="w-[17px] h-[17px] text-vital-muted" />
              </button>
              <h1 className="text-ui-16 font-medium">{section}</h1>
              <div className="ml-auto flex items-center gap-px-28 text-ui-14 max-[768px]:gap-px-14">
                <span className="flex items-center gap-px-10 text-vital-muted max-[768px]:hidden">
                  <Heart className="w-[17px] h-[17px] text-vital-red" />
                  86 bpm
                </span>
                <button
                  className="flex items-center gap-px-10 cursor-pointer max-[768px]:hidden"
                  type="button"
                  aria-label="Open notifications"
                  onClick={() => setDetail("Notifications")}
                >
                  <Bell className="w-[17px] h-[17px] text-vital-muted" />
                </button>
                <button
                  type="button"
                  className="flex items-center gap-px-10 cursor-pointer"
                  onClick={() => setDetail("Profile")}
                >
                  <span className="grid place-items-center w-[30px] h-[30px] rounded-full bg-muted text-ui-12">
                    {auth.owner?.name.slice(0, 1).toUpperCase()}
                  </span>
                  {auth.owner?.name}
                  <ChevronDown className="w-[17px] h-[17px] text-vital-muted max-[768px]:hidden" />
                </button>
              </div>
            </header>
            <main className="overflow-auto flex-1 min-h-0 p-px-32 max-[1401px]:p-px-24 max-[768px]:pt-px-16 max-[768px]:pb-px-16 max-[768px]:px-px-12">
              {section === "Environment" ? (
                <EnvironmentPanel />
              ) : (
                <div>
                  <div
                    className="inline-flex max-w-full overflow-x-auto border border-vital-border rounded-ui-10 p-px-3 gap-px-2 whitespace-nowrap"
                    role="group"
                    aria-label="Body systems"
                  >
                    {[
                      "Overview",
                      "Cardiovascular",
                      "Metabolic",
                      "Liver",
                      "Kidney",
                      "Endocrine",
                      "Immune",
                      "Blood",
                      "Nutrients",
                    ].map((name) => (
                      <button
                        className="pt-px-7 pb-px-7 px-px-12 text-vital-muted text-ui-14 rounded-ui-7 cursor-pointer data-[active=true]:text-vital-text data-[active=true]:bg-muted data-[active=true]:inset-ring-1 data-[active=true]:inset-ring-vital-border"
                        type="button"
                        key={name}
                        data-active={tab === name}
                        onClick={() => setTab(name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-[minmax(0,_1fr)_290px] gap-px-20 mt-px-20 items-start min-[1700px]:grid-cols-[minmax(0,_1fr)_350px] max-[1401px]:grid-cols-[minmax(0,_1fr)_250px] max-[1101px]:grid-cols-[1fr] max-[768px]:gap-px-16">
                    <div className="bg-vital-card border border-vital-border rounded-ui-16 min-w-0 overflow-hidden">
                      <div className="grid grid-cols-[0.95fr_1.15fr] border-b border-vital-border max-[1401px]:grid-cols-[1fr]">
                        <section className="p-px-26 min-w-0 max-[768px]:p-px-16">
                          <header className="flex items-center justify-between pb-px-16 border-b border-vital-border gap-px-12">
                            <h2 className="text-ui-15 font-medium">Lab score</h2>
                            <span className="text-ui-10 text-vital-muted">
                              Latest draw · Jul 28
                            </span>
                          </header>
                          <div className="flex items-center gap-px-20 mt-px-24 max-[768px]:gap-px-12">
                            <div className="w-[142px] h-[160px] relative shrink-0 max-[768px]:w-[90px] max-[768px]:h-[120px]">
                              <svg
                                className="w-full h-full -rotate-90"
                                viewBox="0 0 160 160"
                                aria-hidden="true"
                              >
                                <circle
                                  fill="none"
                                  className="stroke-vital-border"
                                  strokeWidth={9}
                                  cx="80"
                                  cy="80"
                                  r="67"
                                />
                                <circle
                                  fill="none"
                                  className="stroke-vital-green drop-shadow-vital-glow"
                                  strokeWidth={9}
                                  strokeLinecap="round"
                                  cx="80"
                                  cy="80"
                                  r="67"
                                  pathLength="100"
                                  strokeDasharray="92 100"
                                />
                              </svg>
                              <span className="absolute inset-0 flex flex-col justify-center items-center text-ui-40 font-light max-[768px]:text-ui-28">
                                92
                                <small className="text-ui-12 text-vital-muted mt-px-4">
                                  Lab score
                                </small>
                              </span>
                            </div>
                            <div className="border-l border-vital-border pl-px-20 min-w-0 max-[768px]:pl-px-12">
                              <h3 className="text-ui-23 whitespace-nowrap max-[768px]:text-ui-19">
                                Optimal <span className="text-ui-13 text-vital-yellow">▾ 1</span>
                              </h3>
                              <p className="text-ui-11 text-vital-muted leading-normal">
                                7 of 8 systems optimal · 21 of 161 biomarkers out of range
                              </p>
                              <div className="flex items-center gap-px-16 mt-px-20 border-t border-vital-border pt-px-16">
                                <div>
                                  <span className="text-ui-13 text-vital-muted">Change ⓘ</span>
                                  <strong className="block text-ui-20 font-medium text-vital-yellow">
                                    −1 <small className="text-ui-12">pt</small>
                                  </strong>
                                  <p className="text-ui-11 text-vital-muted leading-normal">
                                    Since last draw
                                  </p>
                                </div>
                                <svg
                                  className="w-[120px] min-w-[40px] text-vital-green max-[768px]:hidden"
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
                        <section className="border-l border-vital-border p-px-24 max-[1401px]:hidden">
                          <h2 className="text-ui-15 font-medium mb-px-10">Recent results</h2>
                          {[1, 2, 3].map((index) => (
                            <button
                              className="flex items-center gap-px-16 w-full pt-px-16 pb-px-16 px-0 border-b border-vital-border cursor-pointer last:border-0"
                              key={index}
                              type="button"
                              onClick={() => setDetail("Recent result")}
                            >
                              <span className="grid place-items-center w-[34px] h-[34px] rounded-ui-9 bg-muted text-vital-yellow text-ui-23">
                                △
                              </span>
                              <span
                                className="flex flex-col gap-px-10 flex-1 min-w-0"
                                role="img"
                                aria-label="Reference text obscured"
                              >
                                <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
                                <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
                              </span>
                              <ChevronRight className="w-[16px] text-vital-muted" />
                            </button>
                          ))}
                        </section>
                      </div>
                      <section>
                        <header className="flex items-center justify-between p-px-20 gap-px-12 max-[768px]:p-px-16 max-[768px]:flex-wrap">
                          <h2 className="text-ui-15 font-medium">
                            {tab === "Overview" ? "Body systems" : tab}
                          </h2>
                          <div
                            className="inline-flex max-w-full overflow-x-auto border border-vital-border rounded-ui-10 p-px-3 gap-px-2 whitespace-nowrap"
                            role="group"
                            aria-label="Body systems"
                          >
                            <button
                              className="pt-px-7 pb-px-7 px-px-12 text-vital-muted text-ui-14 rounded-ui-7 cursor-pointer data-[active=true]:text-vital-text data-[active=true]:bg-muted data-[active=true]:inset-ring-1 data-[active=true]:inset-ring-vital-border"
                              type="button"
                              data-active={!history}
                              onClick={() => setHistory(false)}
                            >
                              Systems
                            </button>
                            <button
                              className="pt-px-7 pb-px-7 px-px-12 text-vital-muted text-ui-14 rounded-ui-7 cursor-pointer data-[active=true]:text-vital-text data-[active=true]:bg-muted data-[active=true]:inset-ring-1 data-[active=true]:inset-ring-vital-border"
                              type="button"
                              data-active={history}
                              onClick={() => setHistory(true)}
                            >
                              Lab history
                            </button>
                          </div>
                        </header>
                        {history ? (
                          <div data-testid="vital-history" className="min-h-[440px] p-px-30">
                            <h3 className="mb-px-28">Lab history</h3>
                            {[
                              ["Jul 28", "92"],
                              ["May 16", "93"],
                              ["Mar 04", "89"],
                            ].map(([date, score]) => (
                              <div
                                className="flex justify-between pt-px-24 pb-px-24 px-0 border-b border-vital-border"
                                key={date}
                              >
                                <span>{date}</span>
                                <span>
                                  {score}
                                  <small className="text-vital-muted"> Lab score</small>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-[minmax(0,_1fr)_230px_minmax(0,_1fr)] items-center min-h-[505px] pt-px-22 pb-0 px-px-20 min-[1700px]:grid-cols-[minmax(0,_1fr)_280px_minmax(0,_1fr)] max-[1401px]:grid-cols-[minmax(0,_1fr)_155px_minmax(0,_1fr)] max-[1401px]:px-px-12 max-[1101px]:grid-cols-[minmax(0,_1fr)_210px_minmax(0,_1fr)] max-[768px]:grid-cols-[1fr_1fr] max-[768px]:gap-px-12 max-[768px]:p-px-12">
                            <div className="grid gap-px-12 relative z-[1]">
                              {systems
                                .slice(0, 4)
                                .filter((item) => tab === "Overview" || tab === item.name)
                                .map((item) => (
                                  <SystemCard
                                    key={item.name}
                                    item={item}
                                    onSelect={() => setDetail(item.name)}
                                  />
                                ))}
                            </div>
                            <div
                              className="h-[500px] w-[230px] relative overflow-hidden self-end min-[1700px]:w-[280px] max-[1401px]:w-[155px] max-[1101px]:w-[210px] max-[768px]:col-span-full max-[768px]:row-start-1 max-[768px]:justify-self-center max-[768px]:h-[420px] max-[768px]:w-[230px]"
                              role="img"
                              aria-label="Reference illustration of the body and its systems"
                            >
                              <img
                                className="absolute max-w-none w-[2008px] h-auto left-[-831px] top-[-563px] mix-blend-lighten min-[1700px]:left-[-806px] max-[1401px]:left-[-868px] max-[1101px]:left-[-841px] max-[768px]:w-[1687px] max-[768px]:left-[-695px] max-[768px]:top-[-473px]"
                                src="/vitals/body-reference.jpg"
                                alt=""
                              />
                            </div>
                            <div className="grid gap-px-12 relative z-[1]">
                              {systems
                                .slice(4)
                                .filter((item) => tab === "Overview" || tab === item.name)
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
                    <aside className="bg-vital-card border border-vital-border rounded-ui-16 min-w-0 overflow-hidden p-px-22 max-[1101px]:block max-[768px]:p-px-16">
                      <h2 className="text-ui-15 font-medium mb-px-20">Insights</h2>
                      <div className="border border-vital-border rounded-ui-12 p-px-16 flex items-start gap-px-12 flex-wrap">
                        <span className="text-vital-red">△</span>
                        <div
                          className="flex flex-col gap-px-10 flex-1 min-w-0 min-h-[80px]"
                          role="img"
                          aria-label="Reference text obscured"
                        >
                          <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
                          <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
                          <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
                        </div>
                        <button
                          className="border border-vital-border rounded-ui-7 pt-px-6 pb-px-6 px-px-10 text-ui-12 cursor-pointer"
                          type="button"
                          onClick={() => setHistory(true)}
                        >
                          View lab history
                        </button>
                      </div>
                      <h3 className="text-ui-14 mt-px-24 mb-px-10 mx-0 text-vital-muted">
                        Summary
                      </h3>
                      <div className="flex flex-wrap gap-px-8">
                        <span className="border border-vital-border rounded-ui-7 pt-px-5 pb-px-5 px-px-8 text-ui-12 text-vital-muted flex items-center gap-px-7">
                          <b className="text-vital-red inline-block w-[7px] h-[7px] rounded-full bg-current shrink-0" />
                          4 need attention
                        </span>
                        <span className="border border-vital-border rounded-ui-7 pt-px-5 pb-px-5 px-px-8 text-ui-12 text-vital-muted flex items-center gap-px-7">
                          <b className="text-vital-yellow inline-block w-[7px] h-[7px] rounded-full bg-current shrink-0" />
                          3 to watch
                        </span>
                        <span className="border border-vital-border rounded-ui-7 pt-px-5 pb-px-5 px-px-8 text-ui-12 text-vital-muted flex items-center gap-px-7">
                          <b className="text-vital-green inline-block w-[7px] h-[7px] rounded-full bg-current shrink-0" />
                          4 going well
                        </span>
                      </div>
                      <h3 className="text-ui-14 mt-px-24 mb-px-10 mx-0 text-vital-muted">
                        More insights
                      </h3>
                      {[0, 1, 2].map((index) => (
                        <div
                          className="flex items-start gap-px-10 mb-px-20 min-h-[85px]"
                          key={index}
                        >
                          <b
                            className="inline-block w-[7px] h-[7px] rounded-full bg-current shrink-0 data-[tone=red]:text-vital-red data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow"
                            data-tone={index === 2 ? "yellow" : "red"}
                          />
                          <div
                            className="flex flex-col gap-px-10 flex-1 min-w-0"
                            role="img"
                            aria-label="Reference text obscured"
                          >
                            <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
                            <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
                            <i className="block h-[9px] w-[90%] bg-vital-muted opacity-30 blur-xs nth-2:w-[72%] nth-3:w-[84%]" />
                          </div>
                        </div>
                      ))}
                      <button
                        className="text-ui-13 text-vital-muted cursor-pointer"
                        type="button"
                        onClick={() => setDetail("Insights")}
                      >
                        Show 6 more
                      </button>
                      <p className="text-ui-12 text-vital-muted mt-px-28">
                        Reference data · Sep 25
                      </p>
                    </aside>
                  </div>
                </div>
              )}
            </main>
          </div>
        </div>
        {detail && (
          <Dialog title={detail} className="sm:max-w-xl" onClose={() => setDetail(undefined)}>
            <p className="text-sm leading-relaxed text-muted-foreground">
              This preview uses sample data from the reference image. It is not connected to health
              measurements, diagnoses, or device controls.
            </p>
            {systems.find((item) => item.name === detail) && (
              <p className="text-3xl">
                {systems.find((item) => item.name === detail)?.score}
                <span className="ml-2 text-sm text-muted-foreground">score</span>
              </p>
            )}
            <Button variant="outline" onClick={() => setDetail(undefined)}>
              Close
            </Button>
          </Dialog>
        )}
      </SidebarProvider>
    </TooltipProvider>
  );
}
function SystemCard({ item, onSelect }: { item: (typeof systems)[number]; onSelect: () => void }) {
  return (
    <button
      data-testid="vital-system-card"
      type="button"
      className="flex items-center gap-px-12 border border-vital-border rounded-ui-10 p-px-16 cursor-pointer text-left min-w-0 relative hover:bg-muted min-[1700px]:p-px-18 max-[1401px]:pt-px-12 max-[1401px]:pb-px-12 max-[1401px]:px-px-8 max-[1401px]:gap-px-8 max-[1401px]:flex-wrap max-[768px]:p-px-12"
      onClick={onSelect}
    >
      <span
        className="grid place-items-center w-[34px] h-[34px] border border-vital-border rounded-ui-7 shrink-0 max-[768px]:w-[28px] max-[768px]:h-[28px] data-[tone=red]:text-vital-red data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow"
        data-tone={item.tone}
      >
        <item.icon className="w-[17px] h-[17px]" />
      </span>
      <span className="flex-1 text-ui-14 max-[1401px]:text-ui-12 max-[768px]:text-ui-11">
        {item.name}
        <small className="block text-ui-11 mt-px-4 whitespace-nowrap text-vital-muted max-[768px]:text-ui-9">
          {item.count} biomarkers
        </small>
      </span>
      <span className="text-right text-ui-23 max-[1401px]:ml-auto max-[768px]:text-ui-20">
        {item.score}
        <small
          className="block text-ui-11 mt-px-4 whitespace-nowrap max-[768px]:text-ui-9 data-[tone=red]:text-vital-red data-[tone=green]:text-vital-green data-[tone=blue]:text-vital-blue data-[tone=purple]:text-vital-purple data-[tone=yellow]:text-vital-yellow"
          data-tone={item.score < 70 ? "yellow" : "green"}
        >
          ● {item.score < 70 ? "Watch" : "Optimal"}
        </small>
      </span>
    </button>
  );
}
