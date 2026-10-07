import type { ReactNode } from "react";
import { Dialog } from "#/components/dialog";
import { Icon } from "#/components/icon";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import type { DeckView } from "./model";

export function DeckSwitcher({
  decks,
  activeId,
  ready,
  onSelect,
  onCreate,
  onDelete,
  dialog,
  onDialogChange,
  newTitle,
  onNewTitleChange,
  errorNotice,
}: {
  decks: DeckView[];
  activeId: string;
  ready: boolean;
  onSelect: (id: string) => void;
  onCreate: (title: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  dialog: "create" | "delete" | null;
  onDialogChange: (dialog: "create" | "delete" | null) => void;
  newTitle: string;
  onNewTitleChange: (title: string) => void;
  errorNotice?: ReactNode;
}) {
  return (
    <div data-testid="deck-workspaces" className="min-w-0">
      <div
        data-testid="deck-actions"
        className="flex flex-wrap items-stretch gap-2 [&>[data-slot=native-select-wrapper]]:flex-[1_1_100%]"
      >
        <Label className="w-full text-xs text-muted-foreground" htmlFor="deck-selection">
          Deck profile
        </Label>
        <NativeSelect
          className="w-full"
          id="deck-selection"
          value={activeId}
          disabled={!ready}
          onChange={(event) => {
            onSelect(event.target.value);
            onDialogChange(null);
          }}
        >
          {decks.map((deck) => (
            <NativeSelectOption key={deck.id} value={deck.id}>
              {deck.title}
              {deck.persisted ? "" : " (temporary)"}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          className="flex-1"
          aria-label="Create deck"
          title="Create deck"
          type="button"
          disabled={!ready}
          onClick={() => {
            onDialogChange("create");
          }}
        >
          <Icon name="plus" />
          <span>Create deck</span>
        </Button>
        <Button
          variant="ghost"
          className="flex-1"
          aria-label="Delete deck"
          title="Delete deck"
          type="button"
          disabled={!ready}
          onClick={() => {
            onDialogChange("delete");
          }}
        >
          <Icon name="trash" />
          <span>Delete deck</span>
        </Button>
      </div>
      {dialog === "create" ? (
        <Dialog title="Create deck" onClose={() => onDialogChange(null)}>
          <form
            data-testid="deck-rename"
            className="m-0 flex flex-wrap items-end gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const title = newTitle.trim();
              if (!title) return;
              if (await onCreate(title)) onDialogChange(null);
            }}
          >
            <Label className="grid min-w-0 flex-[1_1_100%] gap-2 text-sm" htmlFor="new-deck-title">
              New deck name
              <Input
                id="new-deck-title"
                name="title"
                value={newTitle}
                onChange={(event) => onNewTitleChange(event.target.value)}
                maxLength={120}
                required
              />
            </Label>
            <Button type="submit">Create</Button>
            <Button variant="outline" type="button" onClick={() => onDialogChange(null)}>
              Cancel
            </Button>
          </form>
          {errorNotice}
        </Dialog>
      ) : null}
      {dialog === "delete" ? (
        <Dialog title="Delete deck" onClose={() => onDialogChange(null)}>
          <div
            data-testid="deck-undo"
            className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm wrap-anywhere"
          >
            <p>Delete this deck and its column settings.</p>
            <Button
              variant="destructive"
              type="button"
              onClick={async () => {
                if (await onDelete()) onDialogChange(null);
              }}
            >
              Delete
            </Button>
            <Button variant="outline" type="button" onClick={() => onDialogChange(null)}>
              Cancel
            </Button>
          </div>
          {errorNotice}
        </Dialog>
      ) : null}
    </div>
  );
}
