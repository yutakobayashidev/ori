import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

export function Home() {
  return (
    <main className="landing">
      <p className="brand">TWITTER LITE</p>
      <h1>目的を決めてから開く</h1>
      <p>ユーザー名か検索語を入力するまで、投稿は表示しません。</p>
    </main>
  )
}
