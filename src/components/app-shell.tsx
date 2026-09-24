import { Icon } from './icon'

export function AppShell({
  sidebar,
  researchChat,
  children,
}: {
  sidebar: React.ReactNode
  researchChat: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <main className="app app-deck">
      {researchChat}
      <section className="reader">
        <section className="deck-toolbar" aria-label="デッキ管理">
          <p className="brand" title="Twitter Lite">
            <Icon name="columns" />
          </p>
          {sidebar}
        </section>
        {children}
      </section>
    </main>
  )
}
