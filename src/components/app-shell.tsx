import { Icon } from './icon'

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main className="app app-deck">
      <aside className="app-sidebar" aria-label="デッキ管理">
        <p className="brand">
          <Icon name="columns" />
          <span>Twitter Lite</span>
        </p>
        {sidebar}
      </aside>
      <section className="reader">{children}</section>
    </main>
  )
}
