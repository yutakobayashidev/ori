export type HomeAction =
  | {
      type: 'add-task'
      title: string
      section: 'focus' | 'routine' | 'optional'
    }
  | { type: 'task-status'; id: string; status: 'todo' | 'done' | 'later' }
  | { type: 'task-move'; id: string; direction: -1 | 1 }
  | { type: 'routine-step'; id: string; step: string; done: boolean }
  | { type: 'contact'; id: string }
  | { type: 'contact-status'; id: string; status: 'later' | 'waiting' }
  | {
      type: 'journal'
      kind: 'メモ' | '再開地点' | '服薬' | '体重'
      text: string
    }
  | { type: 'navigate'; to: '/support' | '/journal' | '/inbox' | '/deck' }

type Interpretation = { action: HomeAction; label: string } | { error: string }

const unsupported = {
  error:
    'まだ読み取れません。「買い物を追加」「青木さんに返信」「メモ：気づいたこと」のように、ひとつずつ入力してください。',
}

/** Local, deterministic prototype. Returns a proposal; never performs an action. */
export function interpretAction(
  input: string,
  tasks: Array<{ id: string; title: string; steps?: string[] }>,
  contacts: Array<{ id: string; name: string }>,
): Interpretation {
  const text = input
    .trim()
    .replace(/[。！!]$/, '')
    .trim()
  if (!text) return { error: 'やりたいことを入力してください。' }
  if (
    /しない|しなく|せず|しないで|やめ|取り消|取消|ではなく|じゃなく|不要|送信|送って|送る/.test(
      text,
    )
  ) {
    return {
      error: 'この内容は自動で変更できません。対象の画面で確認してください。',
    }
  }

  const navigation: Record<
    string,
    '/support' | '/journal' | '/inbox' | '/deck'
  > = {
    連絡: '/support',
    記録: '/journal',
    リーダー: '/inbox',
    'Twitter Lite': '/deck',
    デッキ: '/deck',
  }
  const destination = text.replace(/(?:を開いて|を開く|に移動)$/, '')
  const route = Object.hasOwn(navigation, destination)
    ? navigation[destination]
    : undefined
  if (route)
    return {
      action: { type: 'navigate', to: route },
      label: `${destination}を開く`,
    }

  const note = text.match(/^(メモ|再開地点)[：:\s]+(.+)$/s)
  if (note?.[2]) {
    const kind = note[1] === 'メモ' ? 'メモ' : '再開地点'
    const body = note[2].trim()
    if (!body) return unsupported
    return {
      action: { type: 'journal', kind, text: body },
      label: `${kind}を記録する`,
    }
  }
  const weight = text.match(
    /^体重(?:は|を記録[：:]?|[：:]|\s)*\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg|キロ)(?:を記録|だった|です)?$/i,
  )
  if (weight?.[1])
    return {
      action: { type: 'journal', kind: '体重', text: weight[1] },
      label: `体重 ${weight[1]} kg を記録する`,
    }
  if (
    /^(?:薬を飲んだ|服薬した|服薬を記録)(?:ので記録して|と記録して)?$/.test(
      text,
    )
  ) {
    return {
      action: { type: 'journal', kind: '服薬', text: '服薬した' },
      label: '服薬したことを記録する',
    }
  }

  const contact = text.match(
    /^(.+?)(?:さん)?(?:に返信(?:したい|する)?|の返信(?:を開いて|を開く)?|を相手待ち(?:にして|にする)?|を保留(?:にして|にする)?)$/,
  )
  if (contact?.[1]) {
    const name = contact[1].trim()
    const matches = contacts.filter(
      (item) =>
        item.name === name ||
        item.name.replace(/\s/g, '') === name ||
        item.name.split(/\s+/)[0] === name,
    )
    const matchingTasks = tasks.filter((task) => task.title === name)
    const matchingTask = matchingTasks[0]
    if (
      matches.length === 0 &&
      matchingTasks.length === 1 &&
      matchingTask &&
      /保留/.test(text)
    ) {
      return {
        action: {
          type: 'task-status',
          id: matchingTask.id,
          status: 'later',
        },
        label: `${name}をあとでにする`,
      }
    }
    if (matches.length > 0 && matchingTasks.length > 0 && /保留/.test(text)) {
      return {
        error:
          'タスクと連絡先の両方に当てはまります。対象の画面で確認してください。',
      }
    }
    const person = matches[0]
    if (matches.length !== 1 || !person)
      return { error: '連絡先をひとりに絞れません。氏名を入力してください。' }
    if (/相手待ち|保留/.test(text)) {
      const status = text.includes('相手待ち') ? 'waiting' : 'later'
      return {
        action: { type: 'contact-status', id: person.id, status },
        label: `${person.name}との連絡を${status === 'waiting' ? '相手待ち' : '保留'}にする`,
      }
    }
    return {
      action: { type: 'contact', id: person.id },
      label: `${person.name}への返信を確認する`,
    }
  }

  const move = text.match(/^(.+?)を(上|下)(?:に移動|に動かして|へ|にして)$/)
  if (move?.[1]) {
    const title = move[1].trim()
    const matches = tasks.filter((task) => task.title === title)
    const task = matches[0]
    if (matches.length !== 1 || !task)
      return {
        error:
          'タスクをひとつに絞れません。一覧の名前をそのまま指定してください。',
      }
    return {
      action: {
        type: 'task-move',
        id: task.id,
        direction: move[2] === '上' ? -1 : 1,
      },
      label: `${task.title}をひとつ${move[2]}に移動する`,
    }
  }

  const change = text.match(
    /^(.+?)(?:を|は)(完了(?:にして|にする)?|終わった|あとで(?:にして|にする)?|後で(?:にして|にする)?|保留(?:にして|にする)?|未完了(?:にして|にする)?|戻して)$/,
  )
  if (change?.[1] && change[2]) {
    const title = change[1].trim()
    const matches = tasks.filter((task) => task.title === title)
    const steps = tasks.flatMap((task) =>
      (task.steps ?? [])
        .filter((step) => `${task.title}の${step}` === title)
        .map((step) => ({ id: task.id, step })),
    )
    if (matches.length + steps.length !== 1)
      return {
        error:
          'タスクをひとつに絞れません。一覧の名前をそのまま指定してください。',
      }
    const status = /未完了|戻して/.test(change[2])
      ? 'todo'
      : /完了|終わった/.test(change[2])
        ? 'done'
        : 'later'
    const step = steps[0]
    if (steps.length === 1 && step) {
      if (status === 'later')
        return { error: 'ルーティンの手順は完了・未完了に変更できます。' }
      return {
        action: {
          type: 'routine-step',
          id: step.id,
          step: step.step,
          done: status === 'done',
        },
        label: `${title}を${status === 'done' ? '完了' : '未完了'}にする`,
      }
    }
    const task = matches[0]
    if (!task) return unsupported
    return {
      action: { type: 'task-status', id: task.id, status },
      label: `${title}を${status === 'done' ? '完了' : status === 'later' ? 'あとで' : '未完了'}にする`,
    }
  }

  const routine =
    text.match(/^(.+?)をルーティンに追加(?:して)?$/) ??
    text.match(/^ルーティンに追加[：:]\s*(.+)$/)
  const optional = text.match(/^余裕があれば[、\s]*(.+)$/)
  const add =
    text.match(/^(.+?)を(?:タスクに)?追加(?:して)?$/) ??
    text.match(/^追加[：:]\s*(.+)$/)
  const title = (routine?.[1] ?? optional?.[1] ?? add?.[1])?.trim()
  if (title && !/[。、\n]|(?:してから|それから|と一緒に)/.test(title)) {
    const section = routine ? 'routine' : optional ? 'optional' : 'focus'
    return {
      action: { type: 'add-task', title, section },
      label: `「${title}」を${section === 'routine' ? 'ルーティン' : section === 'optional' ? '余裕があれば' : '今日のタスク'}に追加する`,
    }
  }
  return unsupported
}
