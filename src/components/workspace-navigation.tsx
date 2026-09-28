import { Link, useLocation } from '@tanstack/react-router'
import {
  Inbox,
  Layers3,
  MessagesSquare,
  NotebookPen,
  Search,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Avatar, AvatarFallback } from '#/components/ui/avatar'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '#/components/ui/sidebar'
import { ConnectionManagerDialog } from '#/features/connections/connection-manager-dialog'

type WorkspaceNavigationProps = {
  children?: ReactNode
  footer?: ReactNode
  hasTemporaryDecks?: boolean
}

export function WorkspaceNavigation({
  children,
  footer,
  hasTemporaryDecks,
}: WorkspaceNavigationProps) {
  const [managingAccounts, setManagingAccounts] = useState(false)
  const pathname = useLocation({ select: (location) => location.pathname })
  const navigation = [
    {
      title: '連絡',
      to: '/support',
      icon: MessagesSquare,
      active: pathname === '/support',
    },
    {
      title: '記録',
      to: '/journal',
      icon: NotebookPen,
      active: pathname === '/journal',
    },
    {
      title: 'リーダー',
      to: '/inbox',
      icon: Inbox,
      active: pathname === '/inbox',
    },
    {
      title: 'Twitter Lite',
      to: '/deck',
      icon: Search,
      active: pathname === '/' || pathname === '/deck',
    },
  ] as const

  return (
    <Sidebar
      collapsible="none"
      className="workspace-navigation w-16! shrink-0 border-r"
    >
      <SidebarHeader className="items-center py-4">
        <div
          className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
          role="img"
          aria-label="ワークスペース"
        >
          <Layers3 className="size-5" aria-hidden="true" />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="px-3">
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    aria-label={item.title}
                    aria-current={item.active ? 'page' : undefined}
                    tooltip={{ children: item.title, hidden: false }}
                    isActive={item.active}
                    render={<Link to={item.to} />}
                    className="size-10 justify-center p-0"
                  >
                    <item.icon />
                    <span className="sr-only">{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {children && (
          <>
            <SidebarSeparator className="mx-3 w-auto" />
            <SidebarGroup className="px-3">
              <SidebarGroupContent>
                <SidebarMenu>{children}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>
      <SidebarFooter className="items-center px-3 pb-4">
        {footer && <SidebarMenu>{footer}</SidebarMenu>}
        <SidebarMenu className="mt-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              aria-label="接続アカウントを管理"
              tooltip={{ children: '接続アカウントを管理', hidden: false }}
              className="size-10 justify-center p-0"
              onClick={() => setManagingAccounts(true)}
            >
              <Avatar className="size-8">
                <AvatarFallback>Y</AvatarFallback>
              </Avatar>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      {managingAccounts && (
        <ConnectionManagerDialog
          onClose={() => setManagingAccounts(false)}
          hasTemporaryDecks={hasTemporaryDecks}
        />
      )}
    </Sidebar>
  )
}
