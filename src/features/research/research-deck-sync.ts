import type { Deck, DeckView, Workspace } from "../decks/model";

type WorkspaceActions = {
  getWorkspace: () => Workspace;
  createTemporary: (
    title: string,
    columns: Deck["columns"],
    activate?: boolean,
    preferredId?: string,
  ) => DeckView;
  save: (deck: Deck) => Promise<boolean>;
  select: (id: string, updateUrl?: boolean) => unknown;
};

/** A generated plan owns a temporary view, never a user's saved deck. */
export async function syncResearchDeck(
  plan: Deck,
  activate: boolean,
  bindings: Map<string, string>,
  workspace: WorkspaceActions,
): Promise<void> {
  const before = workspace.getWorkspace();
  const previousActiveId = before.activeDeckId;
  const previousId = bindings.get(plan.id);
  const existing = before.decks.find((deck) => deck.id === previousId);
  let viewId: string;
  if (existing && !existing.persisted) {
    if (!(await workspace.save({ ...plan, id: existing.id }))) {
      throw new Error("Unable to update the temporary deck. Try again after saving finishes.");
    }
    viewId = existing.id;
  } else {
    viewId = workspace.createTemporary(plan.title, plan.columns, false, plan.id).id;
    bindings.set(plan.id, viewId);
  }
  if (activate) {
    workspace.select(viewId);
  } else if (workspace.getWorkspace().decks.some((deck) => deck.id === previousActiveId)) {
    workspace.select(previousActiveId, false);
  }
}
