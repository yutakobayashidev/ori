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
          {sidebar}
        </section>
        {children}
      </section>
    </main>
  )
}
