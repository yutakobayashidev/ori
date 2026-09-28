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
    'Try one action at a time, such as “Add grocery shopping”, “Reply to Aoki”, or “Note: A thought”.',
}

/** Local, deterministic prototype. Returns a proposal; never performs an action. */
export function interpretAction(
  input: string,
  tasks: Array<{ id: string; title: string; steps?: string[] }>,
  contacts: Array<{ id: string; name: string }>,
): Interpretation {
  let text = input
    .trim()
    .replace(/[。！!]$/, '')
    .trim()
  // Normalize English commands into the same small, deterministic grammar.
  if (/\b(?:don't|do not|cancel|send)\b/i.test(text))
    return { error: 'Please review this action in the relevant screen.' }
  text = text
    .replace(
      /^open (messages|journal|reader|research|deck)$/i,
      (_, name: string) =>
        ({
          messages: '連絡',
          journal: '記録',
          reader: 'リーダー',
          research: 'Research',
          deck: 'デッキ',
        })[name.toLowerCase()] ?? name,
    )
    .replace(/^note\s*:/i, 'メモ:')
    .replace(/^resume(?: point)?\s*:/i, '再開地点:')
    .replace(/^weight\s*:?\s*/i, '体重:')
    .replace(/^log medication$|^took (?:my )?medication$/i, '服薬した')
    .replace(/^reply to (.+)$/i, '$1に返信')
    .replace(/^defer (.+)$/i, '$1を保留')
    .replace(/^mark (.+) (?:as )?waiting$/i, '$1を相手待ち')
    .replace(
      /^move (.+) (up|down)$/i,
      (_, title: string, direction: string) =>
        `${title}を${direction.toLowerCase() === 'up' ? '上' : '下'}に移動`,
    )
    .replace(/^complete (.+)$/i, '$1を完了')
    .replace(/^restore (.+)$/i, '$1を未完了')
    .replace(/^add routine\s*:\s*(.+)$/i, '$1をルーティンに追加')
    .replace(/^optional\s*:\s*(.+)$/i, '余裕があれば $1')
    .replace(/^add\s*:?\s+(.+)$/i, '$1を追加')
  if (!text) return { error: 'Enter what you would like to do.' }
  if (
    /しない|しなく|せず|しないで|やめ|取り消|取消|ではなく|じゃなく|不要|送信|送って|送る/.test(
      text,
    )
  ) {
    return {
      error: 'Please review this action in the relevant screen.',
    }
  }

  const navigation: Record<
    string,
    '/support' | '/journal' | '/inbox' | '/deck'
  > = {
    連絡: '/support',
    記録: '/journal',
    リーダー: '/inbox',
    Research: '/deck',
    デッキ: '/deck',
  }
  const destination = text.replace(/(?:を開いて|を開く|に移動)$/, '')
  const route = Object.hasOwn(navigation, destination)
    ? navigation[destination]
    : undefined
  if (route)
    return {
      action: { type: 'navigate', to: route },
      label: `Open ${{ '/support': 'Messages', '/journal': 'Journal', '/inbox': 'Reader', '/deck': 'Research' }[route]}`,
    }

  const note = text.match(/^(メモ|再開地点)[：:\s]+(.+)$/s)
  if (note?.[2]) {
    const kind = note[1] === 'メモ' ? 'メモ' : '再開地点'
    const body = note[2].trim()
    if (!body) return unsupported
    return {
      action: { type: 'journal', kind, text: body },
      label: `Save ${kind === 'メモ' ? 'note' : 'resume point'}`,
    }
  }
  const weight = text.match(
    /^体重(?:は|を記録[：:]?|[：:]|\s)*\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:kg|キロ)(?:を記録|だった|です)?$/i,
  )
  if (weight?.[1])
    return {
      action: { type: 'journal', kind: '体重', text: weight[1] },
      label: `Log weight: ${weight[1]} kg`,
    }
  if (
    /^(?:薬を飲んだ|服薬した|服薬を記録)(?:ので記録して|と記録して)?$/.test(
      text,
    )
  ) {
    return {
      action: { type: 'journal', kind: '服薬', text: 'Took medication' },
      label: 'Log medication',
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
        item.name
          .split(/\s+/)
          .some((part) => part.toLowerCase() === name.toLowerCase()),
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
        label: `Defer ${name}`,
      }
    }
    if (matches.length > 0 && matchingTasks.length > 0 && /保留/.test(text)) {
      return {
        error:
          'This matches both a task and a contact. Please use the relevant screen.',
      }
    }
    const person = matches[0]
    if (matches.length !== 1 || !person)
      return { error: 'Please enter the full name of one contact.' }
    if (/相手待ち|保留/.test(text)) {
      const status = text.includes('相手待ち') ? 'waiting' : 'later'
      return {
        action: { type: 'contact-status', id: person.id, status },
        label: `Mark the conversation with ${person.name} as ${status === 'waiting' ? 'waiting' : 'later'}`,
      }
    }
    return {
      action: { type: 'contact', id: person.id },
      label: `Review reply to ${person.name}`,
    }
  }

  const move = text.match(/^(.+?)を(上|下)(?:に移動|に動かして|へ|にして)$/)
  if (move?.[1]) {
    const title = move[1].trim()
    const matches = tasks.filter((task) => task.title === title)
    const task = matches[0]
    if (matches.length !== 1 || !task)
      return {
        error: 'Please use the exact name of one task from the list.',
      }
    return {
      action: {
        type: 'task-move',
        id: task.id,
        direction: move[2] === '上' ? -1 : 1,
      },
      label: `Move ${task.title} ${move[2] === '上' ? 'up' : 'down'}`,
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
        error: 'Please use the exact name of one task from the list.',
      }
    const status = /未完了|戻して/.test(change[2])
      ? 'todo'
      : /完了|終わった/.test(change[2])
        ? 'done'
        : 'later'
    const step = steps[0]
    if (steps.length === 1 && step) {
      if (status === 'later')
        return { error: 'Routine steps can be marked done or incomplete.' }
      return {
        action: {
          type: 'routine-step',
          id: step.id,
          step: step.step,
          done: status === 'done',
        },
        label: `Mark ${title} as ${status === 'done' ? 'done' : 'incomplete'}`,
      }
    }
    const task = matches[0]
    if (!task) return unsupported
    return {
      action: { type: 'task-status', id: task.id, status },
      label: `Mark ${title} as ${status === 'done' ? 'done' : status === 'later' ? 'later' : 'incomplete'}`,
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
      label: `Add “${title}” to ${section === 'routine' ? 'Routines' : section === 'optional' ? 'If there’s room' : 'Start here'}`,
    }
  }
  return unsupported
}
