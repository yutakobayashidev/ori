import { describe, expect, it } from 'vitest'
import { interpretAction } from './interpret-action'

const tasks = [
  { id: 'stretch', title: 'ストレッチ' },
  { id: 'shop', title: '買い物' },
]
const contacts = [
  { id: 'aoki', name: '青木 遥' },
  { id: 'mori', name: '森 直人' },
]

describe('home natural-language proposals', () => {
  it.each([
    ['買い物を上に移動', -1],
    ['買い物を下に動かして', 1],
  ])('moves the named task by one position: %s', (input, direction) => {
    expect(interpretAction(input, tasks, contacts)).toMatchObject({
      action: { type: 'task-move', id: 'shop', direction },
    })
  })

  it('does not reorder a partial task match', () => {
    expect(interpretAction('買いを上に移動', tasks, contacts)).toHaveProperty(
      'error',
    )
  })

  it.each([
    ['朝の支度の水を飲むを完了', true],
    ['朝の支度の水を飲むを未完了にして', false],
  ])('targets a named routine step: %s', (input, done) => {
    expect(
      interpretAction(
        input,
        [{ id: 'morning', title: '朝の支度', steps: ['水を飲む', '着替える'] }],
        contacts,
      ),
    ).toMatchObject({
      action: { type: 'routine-step', id: 'morning', step: '水を飲む', done },
    })
  })

  it('rejects unknown and ambiguous routine steps', () => {
    const routines = [
      { id: 'morning', title: '朝の支度', steps: ['水を飲む', '水を飲む'] },
    ]
    expect(
      interpretAction('朝の支度の水を飲むを完了', routines, contacts),
    ).toHaveProperty('error')
    expect(
      interpretAction('朝の支度の着替えるを完了', routines, contacts),
    ).toHaveProperty('error')
  })

  it.each([
    ['買い物を追加', '買い物', 'focus'],
    ['追加：買い物', '買い物', 'focus'],
    ['ルーティンに追加：夜のストレッチ', '夜のストレッチ', 'routine'],
    ['夜のストレッチをルーティンに追加', '夜のストレッチ', 'routine'],
    ['余裕があれば本を読む', '本を読む', 'optional'],
  ])('proposes %s without mutating existing tasks', (input, title, section) => {
    expect(interpretAction(input, tasks, contacts)).toMatchObject({
      action: { type: 'add-task', title, section },
    })
    expect(tasks).toHaveLength(2)
  })

  it.each([
    ['ストレッチを完了', 'done'],
    ['ストレッチは終わった', 'done'],
    ['ストレッチをあとで', 'later'],
    ['ストレッチを保留', 'later'],
    ['ストレッチを未完了にして', 'todo'],
  ])('matches the whole task title for %s', (input, status) => {
    expect(interpretAction(input, tasks, contacts)).toMatchObject({
      action: { type: 'task-status', id: 'stretch', status },
    })
  })

  it('rejects partial and duplicate task names', () => {
    expect(interpretAction('買いを完了', tasks, contacts)).toHaveProperty(
      'error',
    )
    expect(
      interpretAction(
        '買い物を完了',
        [...tasks, { id: 'duplicate', title: '買い物' }],
        contacts,
      ),
    ).toHaveProperty('error')
  })

  it('opens the uniquely named contact without sending', () => {
    expect(interpretAction('青木さんに返信', tasks, contacts)).toMatchObject({
      action: { type: 'contact', id: 'aoki' },
    })
    expect(interpretAction('青木遥に返信', tasks, contacts)).toMatchObject({
      action: { type: 'contact', id: 'aoki' },
    })
  })

  it('rejects ambiguous surnames', () => {
    expect(
      interpretAction('青木さんに返信', tasks, [
        ...contacts,
        { id: 'other', name: '青木 太郎' },
      ]),
    ).toHaveProperty('error')
  })

  it.each([
    ['森さんを相手待ちにして', 'waiting'],
    ['森さんを保留', 'later'],
  ])('changes only the named contact for %s', (input, status) => {
    expect(interpretAction(input, tasks, contacts)).toMatchObject({
      action: { type: 'contact-status', id: 'mori', status },
    })
  })

  it.each([
    ['メモ：散歩でアイデアを思いついた', 'メモ', '散歩でアイデアを思いついた'],
    ['再開地点：レビューの続き', '再開地点', 'レビューの続き'],
    ['体重は65.2kg', '体重', '65.2'],
    ['薬を飲んだ', '服薬', '服薬した'],
  ])('records explicit user statements: %s', (input, kind, text) => {
    expect(interpretAction(input, tasks, contacts)).toMatchObject({
      action: { type: 'journal', kind, text },
    })
  })

  it.each([
    'ストレッチを完了にしないで',
    '買い物を追加しない',
    '青木さんに送信',
    '青木さんに返信を送って',
    '薬を何錠飲めばいい',
    '体重を記録',
    '適当に片付けて',
    'toString',
    '買い物を完了、ストレッチを追加',
    '買い物を完了して、ストレッチを追加',
  ])('leaves unsupported, negative, and compound requests unchanged: %s', (input) => {
    expect(interpretAction(input, tasks, contacts)).toHaveProperty('error')
  })

  it.each([
    ['連絡を開いて', '/support'],
    ['記録', '/journal'],
    ['リーダーを開く', '/inbox'],
    ['Twitter Liteに移動', '/deck'],
  ])('recognizes navigation: %s', (input, to) => {
    expect(interpretAction(input, tasks, contacts)).toMatchObject({
      action: { type: 'navigate', to },
    })
  })
})
