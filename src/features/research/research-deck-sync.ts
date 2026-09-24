import type { Deck, DeckView, Workspace } from '../decks/model'

type WorkspaceActions = {
  getWorkspace: () => Workspace
  createTemporary: (title: string, columns: Deck['columns']) => DeckView
  save: (deck: Deck) => Promise<boolean>
  select: (id: string) => unknown
}

/** A generated plan owns a temporary view, never a user's saved deck. */
export async function syncResearchDeck(
  plan: Deck,
  activate: boolean,
  bindings: Map<string, string>,
  workspace: WorkspaceActions,
): Promise<void> {
  const before = workspace.getWorkspace()
  const previousActiveId = before.activeDeckId
  const previousId = bindings.get(plan.id)
  const existing = before.decks.find((deck) => deck.id === previousId)
  let viewId: string
  if (existing && !existing.persisted) {
    if (!(await workspace.save({ ...plan, id: existing.id }))) {
      throw new Error(
        '一時デッキを更新できませんでした。保存処理の完了後に再試行してください。',
      )
    }
    viewId = existing.id
  } else {
    viewId = workspace.createTemporary(plan.title, plan.columns).id
    bindings.set(plan.id, viewId)
  }
  if (activate) {
    workspace.select(viewId)
  } else if (
    previousId &&
    workspace.getWorkspace().decks.some((deck) => deck.id === previousActiveId)
  ) {
    workspace.select(previousActiveId)
  }
}
