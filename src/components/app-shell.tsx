import { Link } from '@tanstack/react-router'

export function AppShell({
  active,
  children,
}: {
  active?: 'user' | 'search' | 'list'
  children: React.ReactNode
}) {
  return (
    <main className="app">
      <header className="app-header">
        <p className="brand">TWITTER LITE</p>
        <nav aria-label="閲覧方法" className="tabs">
          <Link aria-current={active === 'user' ? 'page' : undefined} to="/">
            ユーザー
          </Link>
          <Link
            aria-current={active === 'search' ? 'page' : undefined}
            search={{ q: '', product: 'Latest', following: false }}
            to="/search"
          >
            検索
          </Link>
          <Link
            aria-current={active === 'list' ? 'page' : undefined}
            to="/i/lists"
          >
            リスト
          </Link>
        </nav>
      </header>
      <section className="reader">{children}</section>
    </main>
  )
}
