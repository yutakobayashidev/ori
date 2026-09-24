import { Link } from '@tanstack/react-router'
import { ProfileSwitcher } from '#/features/profiles/profile-switcher'

export function AppShell({
  active,
  children,
}: {
  active?: 'user' | 'search' | 'list' | 'deck'
  children: React.ReactNode
}) {
  return (
    <main className={active === 'deck' ? 'app app-deck' : 'app'}>
      <header className="app-header">
        <p className="brand">Twitter Lite</p>
        <ProfileSwitcher />
        <nav aria-label="閲覧方法" className="tabs">
          <Link
            aria-current={active === 'deck' ? 'page' : undefined}
            to="/deck"
          >
            デッキ
          </Link>
          <Link
            aria-current={active === 'search' ? 'page' : undefined}
            search={{ q: '', product: 'Latest', following: false }}
            to="/search"
          >
            検索
          </Link>
          <Link aria-current={active === 'user' ? 'page' : undefined} to="/">
            ユーザー
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
