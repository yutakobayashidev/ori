import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useState,
} from 'react'

export type Task = {
  id: string
  title: string
  section: 'focus' | 'routine' | 'optional'
  status: 'todo' | 'done' | 'later'
  steps?: string[]
  completedSteps?: string[]
}

export type Status = 'now' | 'later' | 'waiting' | 'sent' | 'dismissed'
export type EntryKind = 'メモ' | '再開地点' | '服薬' | '体重'
export type JournalEntry = {
  id: string
  kind: EntryKind
  text: string
  source: string
  occurredAt: string
  recordedAt: string
  correctionOf?: string
}

type WorkspaceState = {
  tasks: Task[]
  setTasks: Dispatch<SetStateAction<Task[]>>
  statuses: Record<string, Status>
  setStatuses: Dispatch<SetStateAction<Record<string, Status>>>
  outcomes: Record<string, string>
  setOutcomes: Dispatch<SetStateAction<Record<string, string>>>
  entries: JournalEntry[]
  setEntries: Dispatch<SetStateAction<JournalEntry[]>>
}

const WorkspaceContext = createContext<WorkspaceState | null>(null)

export function WorkspaceStateProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: 'review',
      title: 'レビュー資料を確認する',
      section: 'focus',
      status: 'todo',
    },
    {
      id: 'morning',
      title: '朝の支度',
      section: 'routine',
      status: 'todo',
      steps: ['水を飲む', '身支度をする', '朝食をとる'],
    },
    { id: 'walk', title: '散歩する', section: 'optional', status: 'todo' },
  ])
  const [statuses, setStatuses] = useState<Record<string, Status>>({})
  const [outcomes, setOutcomes] = useState<Record<string, string>>({})
  const [entries, setEntries] = useState<JournalEntry[]>([])

  return (
    <WorkspaceContext.Provider
      value={{
        tasks,
        setTasks,
        statuses,
        setStatuses,
        outcomes,
        setOutcomes,
        entries,
        setEntries,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspaceState() {
  const state = useContext(WorkspaceContext)
  if (!state) throw new Error('WorkspaceStateProvider is required')
  return state
}
