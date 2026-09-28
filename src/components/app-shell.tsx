import { Columns3, MessageSquare, PanelLeftClose } from 'lucide-react'
import { type CSSProperties, type ReactNode, useState } from 'react'
import {
  Sidebar,
  SidebarInset,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '#/components/ui/sidebar'
import { TooltipProvider } from '#/components/ui/tooltip'
import { WorkspaceNavigation } from '#/components/workspace-navigation'

type ShellProps = {
  hasTemporaryDecks: boolean
  sidebar: ReactNode
  researchChat: (closeMobileSidebar: () => void) => ReactNode
  children: ReactNode
}

export function AppShell(props: ShellProps) {
  return (
    <TooltipProvider delay={800}>
      <SidebarProvider
        className="workspace h-dvh min-h-0 overflow-hidden"
        style={
          {
            '--sidebar-width': '25rem',
            '--sidebar-width-icon': '4rem',
          } as CSSProperties
        }
      >
        <Workspace {...props} />
      </SidebarProvider>
    </TooltipProvider>
  )
}

function Workspace({
  sidebar,
  researchChat,
  children,
  hasTemporaryDecks,
}: ShellProps) {
  const [panel, setPanel] = useState<'chat' | 'decks'>('chat')
  const { setOpen, setOpenMobile, isMobile } = useSidebar()
  const navigation = [
    { id: 'chat', title: 'Research chat', icon: MessageSquare },
    { id: 'decks', title: 'Deck manager', icon: Columns3 },
  ] as const

  return (
    <>
      <Sidebar
        collapsible="icon"
        className="overflow-hidden transition-none *:data-[sidebar=sidebar]:flex-row"
      >
        <WorkspaceNavigation
          hasTemporaryDecks={hasTemporaryDecks}
          footer={
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-label="Close sidebar"
                tooltip={{ children: 'Close sidebar', hidden: false }}
                onClick={() =>
                  isMobile ? setOpenMobile(false) : setOpen(false)
                }
                className="size-10 justify-center p-0"
              >
                <PanelLeftClose />
              </SidebarMenuButton>
            </SidebarMenuItem>
          }
        >
          {navigation.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                aria-label={item.title}
                tooltip={{ children: item.title, hidden: false }}
                isActive={panel === item.id}
                onClick={() => {
                  setPanel(item.id)
                  if (isMobile) setOpenMobile(true)
                  else setOpen(true)
                }}
                className="size-10 justify-center p-0"
              >
                <item.icon />
                <span className="sr-only">{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </WorkspaceNavigation>
        <Sidebar
          collapsible="none"
          className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"
        >
          <div
            className={
              panel === 'chat' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'
            }
          >
            {researchChat(() => setOpenMobile(false))}
          </div>
          <section
            aria-label="Deck manager"
            className={
              panel === 'decks'
                ? 'flex min-h-0 flex-1 flex-col overflow-y-auto p-4'
                : 'hidden'
            }
          >
            <h2 className="mb-4 text-base font-semibold">Decks</h2>
            <div className="flex flex-col gap-4">{sidebar}</div>
          </section>
        </Sidebar>
      </Sidebar>
      <SidebarInset className="min-w-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <SidebarTrigger aria-label="Toggle sidebar" />
          <span className="text-sm font-medium">Twitter Lite</span>
          <span className="ml-auto text-xs text-muted-foreground">
            Research workspace
          </span>
        </header>
        <section
          className="reader flex min-h-0 min-w-0 flex-1 flex-col"
          aria-label="Decks"
        >
          {children}
        </section>
      </SidebarInset>
    </>
  )
}
