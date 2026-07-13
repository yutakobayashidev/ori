import { Link } from '@tanstack/react-router'

export function AppShell({
  active,
  children,
}: {
  active: 'user' | 'search'
  children: React.ReactNode
}) {
  return (
    <main className="app">
      <header className="app-header">
        <p className="brand">TWITTER LITE</p>
        <nav aria-label="閲覧方法" className="tabs">
          <Link
            aria-current={active === 'user' ? 'page' : undefined}
            search={{ target: '' }}
            to="/user"
          >
            ユーザー
          </Link>
          <Link
            aria-current={active === 'search' ? 'page' : undefined}
            search={{ q: '', product: 'Latest', following: false }}
            to="/search"
          >
            検索
          </Link>
        </nav>
      </header>
      <section className="reader">{children}</section>
    </main>
  )
}
