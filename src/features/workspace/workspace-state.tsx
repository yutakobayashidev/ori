import { useRouteContext } from "@tanstack/react-router";
import { ActivityStateProvider } from "#/features/activities/activity-state";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useState,
} from "react";

export type Task = {
  id: string;
  title: string;
  section: "focus" | "routine" | "optional";
  status: "todo" | "done" | "later";
  steps?: string[];
  completedSteps?: string[];
};

export type EntryKind = "メモ" | "再開地点" | "服薬" | "体重";
export const entryKindLabels: Record<EntryKind, string> = {
  メモ: "Note",
  再開地点: "Resume point",
  服薬: "Medication",
  体重: "Weight",
};

export type JournalEntry = {
  id: string;
  kind: EntryKind;
  text: string;
  source: string;
  occurredAt: string;
  recordedAt: string;
  correctionOf?: string;
};

type WorkspaceState = {
  tasks: Task[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  entries: JournalEntry[];
  setEntries: Dispatch<SetStateAction<JournalEntry[]>>;
};

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function WorkspaceStateProvider({ children }: { children: ReactNode }) {
  const { auth } = useRouteContext({ from: "__root__" });
  const [tasks, setTasks] = useState<Task[]>([
    {
      id: "morning",
      title: "Morning routine",
      section: "routine",
      status: "todo",
      steps: ["Drink water", "Get ready", "Have breakfast"],
    },
  ]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  return (
    <ActivityStateProvider enabled={Boolean(auth.owner?.onboardingCompletedAt)}>
      <WorkspaceContext.Provider
        value={{
          tasks,
          setTasks,
          entries,
          setEntries,
        }}
      >
        {children}
      </WorkspaceContext.Provider>
    </ActivityStateProvider>
  );
}

export function useWorkspaceState() {
  const state = useContext(WorkspaceContext);
  if (!state) throw new Error("WorkspaceStateProvider is required");
  return state;
}
