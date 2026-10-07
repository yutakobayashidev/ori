import { Link, useHydrated, useLocation, useRouteContext } from "@tanstack/react-router";
import { Activity, House, Inbox, Layers3, MessagesSquare, NotebookPen, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
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
} from "#/components/ui/sidebar";
import { ConnectionManagerDialog } from "#/features/connections/connection-manager-dialog";
import { useUrlState } from "#/features/navigation/use-url-state";

type WorkspaceNavigationProps = {
  children?: ReactNode;
  footer?: ReactNode;
  hasTemporaryDecks?: boolean;
};

export function WorkspaceNavigation({
  children,
  footer,
  hasTemporaryDecks,
}: WorkspaceNavigationProps) {
  const { auth } = useRouteContext({ from: "__root__" });
  const hydrated = useHydrated();
  const [search, updateSearch] = useUrlState();
  const managingAccounts = search.accounts;
  const setManagingAccounts = (open: boolean) => updateSearch({ accounts: open || undefined });
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigation = [
    { title: "Home", to: "/", icon: House, active: pathname === "/" },
    {
      title: "Vitals",
      to: "/vitals",
      icon: Activity,
      active: pathname === "/vitals",
    },
    {
      title: "Messages",
      to: "/support",
      icon: MessagesSquare,
      active: pathname === "/support",
    },
    {
      title: "Journal",
      to: "/journal",
      icon: NotebookPen,
      active: pathname === "/journal",
    },
    {
      title: "Reader",
      to: "/inbox",
      icon: Inbox,
      active: pathname === "/inbox",
    },
    {
      title: "Research",
      to: "/deck",
      icon: Search,
      active: pathname === "/deck",
    },
  ] as const;

  return (
    <Sidebar collapsible="none" className="w-16! shrink-0 border-r">
      <SidebarHeader className="items-center py-4">
        <div
          className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
          role="img"
          aria-label="Workspace"
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
                    aria-current={item.active ? "page" : undefined}
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
              render={
                <button type="button" aria-label="Manage connected accounts" disabled={!hydrated} />
              }
              tooltip={{ children: "Manage connected accounts", hidden: false }}
              className="size-10 justify-center p-0"
              onClick={() => setManagingAccounts(true)}
            >
              <Avatar className="size-8">
                <AvatarFallback>{auth.owner?.name.slice(0, 1).toUpperCase()}</AvatarFallback>
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
  );
}
