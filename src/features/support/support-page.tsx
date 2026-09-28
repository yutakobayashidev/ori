import { ArrowLeft, Search } from 'lucide-react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from '#/components/ui/sidebar'
import { TooltipProvider } from '#/components/ui/tooltip'
import { WorkspaceNavigation } from '#/components/workspace-navigation'
import {
  type Status,
  useWorkspaceState,
} from '#/features/workspace/workspace-state'
import { ConversationDetail } from './conversation-detail'
import { conversations } from './mock-conversations'
import './support.css'

const views = [
  { id: 'now', label: 'Now' },
  { id: 'later', label: 'Later' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'done', label: 'History' },
  { id: 'all', label: 'All' },
] as const
export function SupportPage() {
  const [view, setView] = useState<string>('now')
  const [query, setQuery] = useState('')
  const { statuses, setStatuses, outcomes, setOutcomes } = useWorkspaceState()
  const [selectedId, setSelectedId] = useState<string>()
  const [reading, setReading] = useState(false)
  const [notice, setNotice] = useState('')
  const matches = conversations.filter((item) => {
    const status = statuses[item.id] ?? 'now'
    return (
      (view === 'all'
        ? true
        : view === 'done'
          ? status === 'sent' || status === 'dismissed'
          : status === view) && `${item.name} ${item.subject}`.includes(query)
    )
  })
  const visible = view === 'now' ? matches.slice(0, 3) : matches
  const selected = visible.find((item) => item.id === selectedId) ?? visible[0]
  function resolve(id: string, status: Exclude<Status, 'now'>, note?: string) {
    setStatuses((current) => ({ ...current, [id]: status }))
    if (note) setOutcomes((current) => ({ ...current, [id]: note }))
    setNotice(
      status === 'sent'
        ? 'Reply preview recorded'
        : status === 'later'
          ? 'Moved to Later'
          : status === 'waiting'
            ? 'Moved to Waiting'
            : 'Marked as no action needed',
    )
    setReading(false)
  }
  return (
    <TooltipProvider>
      <SidebarProvider className="support-workspace" data-reading={reading}>
        <Sidebar collapsible="none" className="support-sidebar">
          <WorkspaceNavigation />
          <Sidebar collapsible="none" className="support-list">
            <SidebarHeader className="border-b p-5 gap-4">
              <h1 className="text-base font-semibold">Messages</h1>
              <div className="flex gap-1 flex-wrap">
                {views.map((tab) => (
                  <Button
                    key={tab.id}
                    size="sm"
                    variant={view === tab.id ? 'secondary' : 'ghost'}
                    aria-pressed={view === tab.id}
                    onClick={() => {
                      setView(tab.id)
                      setSelectedId(undefined)
                      setReading(false)
                      setNotice('')
                    }}
                  >
                    {tab.label}
                  </Button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-2 size-4 text-muted-foreground" />
                <Input
                  aria-label="Search messages"
                  placeholder="Search"
                  className="pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </SidebarHeader>
            <SidebarContent className="gap-0">
              {visible.map((item) => (
                <button
                  type="button"
                  className="support-row"
                  aria-current={selected?.id === item.id ? 'true' : undefined}
                  key={item.id}
                  onClick={() => {
                    setSelectedId(item.id)
                    setReading(true)
                  }}
                >
                  <span className="text-xs text-muted-foreground">
                    {item.name}
                  </span>
                  <span className="font-medium text-sm">{item.subject}</span>
                </button>
              ))}
              {!visible.length && (
                <p className="p-5 text-sm text-muted-foreground">
                  {query
                    ? 'No results found'
                    : 'No messages to handle right now'}
                </p>
              )}
              {view === 'now' && matches.length > 3 && (
                <p className="p-5 text-xs text-muted-foreground">
                  {matches.length - 3} more
                </p>
              )}
            </SidebarContent>
          </Sidebar>
        </Sidebar>
        <SidebarInset className="support-main">
          <header className="support-toolbar">
            <Button
              variant="ghost"
              size="icon"
              className="support-back"
              aria-label="Back to messages"
              onClick={() => setReading(false)}
            >
              <ArrowLeft />
            </Button>
            <span className="text-sm">{selected?.name}</span>
            <span
              role="status"
              className="ml-auto text-xs text-muted-foreground"
            >
              {notice}
            </span>
          </header>
          <section
            className="support-detail"
            aria-label="Message details"
            // biome-ignore lint/a11y/noNoninteractiveTabindex: Independent region needs keyboard scrolling.
            tabIndex={0}
          >
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                hidden={selected?.id !== conversation.id}
              >
                <ConversationDetail
                  conversation={conversation}
                  onResolve={(status, note) =>
                    resolve(conversation.id, status, note)
                  }
                />
              </div>
            ))}
            {selected ? (
              <>
                {outcomes[selected.id] && (
                  <div className="support-outcome">
                    <h2 className="font-medium text-sm">Activity log</h2>
                    <p className="whitespace-pre-wrap mt-2 text-sm">
                      {outcomes[selected.id]}
                    </p>
                  </div>
                )}
                {view !== 'now' && (
                  <Button
                    variant="outline"
                    className="m-6"
                    onClick={() => {
                      setStatuses((current) => ({
                        ...current,
                        [selected.id]: 'now',
                      }))
                      setView('now')
                    }}
                  >
                    Move to Now
                  </Button>
                )}
              </>
            ) : (
              <div className="support-empty">Select a conversation</div>
            )}
          </section>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
