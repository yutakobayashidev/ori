import type { JournalEntry } from "#/features/journal/journal-model";
export type { JournalEntry } from "#/features/journal/journal-model";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { loadJournalEntries, saveJournalEntry } from "#/features/journal/journal-functions";
import { useRouteContext } from "@tanstack/react-router";
import { ActivityStateProvider } from "#/features/activities/activity-state";
import { FocusProvider } from "#/features/focus/focus-state";
import { FocusMiniTimer } from "#/features/focus/focus-controls";
import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useState,
  useRef,
} from "react";

export type Task = {
  id: string;
  title: string;
  section: "focus" | "routine" | "optional";
  status: "todo" | "done" | "later";
  steps?: string[];
  completedSteps?: string[];
};

export type EntryKind = JournalEntry["kind"];
export const entryKindLabels: Record<EntryKind, string> = {
  メモ: "Note",
  再開地点: "Resume point",
  服薬: "Medication",
  体重: "Weight",
};

type WorkspaceState = {
  tasks: Task[];
  setTasks: Dispatch<SetStateAction<Task[]>>;
  entries: JournalEntry[];
  appendEntry: (draft: Omit<JournalEntry, "id" | "recordedAt">) => Promise<boolean>;
  journalSaving: boolean;
  journalLoading: boolean;
  journalError: string | null;
  reloadJournal: () => void;
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
  const queryClient = useQueryClient();
  const journal = useQuery({
    queryKey: ["journal"],
    queryFn: () => loadJournalEntries(),
    enabled: Boolean(auth.owner?.onboardingCompletedAt),
  });
  const mutation = useMutation({
    mutationFn: (entry: JournalEntry) => saveJournalEntry({ data: entry }),
  });
  const pending = useRef(new Map<string, JournalEntry>());
  const [saveError, setSaveError] = useState<string | null>(null);
  async function appendEntry(draft: Omit<JournalEntry, "id" | "recordedAt">) {
    const key = JSON.stringify(draft);
    const entry = pending.current.get(key) ?? {
      ...draft,
      id: crypto.randomUUID(),
      recordedAt: new Date().toISOString(),
    };
    pending.current.set(key, entry);
    setSaveError(null);
    try {
      await queryClient.cancelQueries({ queryKey: ["journal"] });
      const saved = await mutation.mutateAsync(entry);
      queryClient.setQueryData<JournalEntry[]>(["journal"], (previous = []) => [
        saved,
        ...previous.filter((item) => item.id !== saved.id),
      ]);
      void queryClient.invalidateQueries({ queryKey: ["journal"] });
      pending.current.delete(key);
      return true;
    } catch {
      setSaveError("Couldn’t save the entry. Try again.");
      return false;
    }
  }

  return (
    <ActivityStateProvider enabled={Boolean(auth.owner?.onboardingCompletedAt)}>
      <WorkspaceContext.Provider
        value={{
          tasks,
          setTasks,
          entries: journal.data ?? [],
          appendEntry,
          journalSaving: mutation.isPending,
          journalLoading: journal.isLoading,
          journalError: saveError ?? (journal.error ? "Couldn’t load the journal." : null),
          reloadJournal: () => {
            void journal.refetch();
          },
        }}
      >
        {auth.owner?.onboardingCompletedAt ? (
          <FocusProvider>
            {children}
            <FocusMiniTimer />
          </FocusProvider>
        ) : (
          children
        )}
      </WorkspaceContext.Provider>
    </ActivityStateProvider>
  );
}

export function useWorkspaceState() {
  const state = useContext(WorkspaceContext);
  if (!state) throw new Error("WorkspaceStateProvider is required");
  return state;
}
