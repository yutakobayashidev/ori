import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Dialog } from "#/components/dialog";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { Input } from "#/components/ui/input";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import { newId, type DeckColumn } from "#/features/decks/model";
import {
  loadSavedDecks,
  createSavedDeck,
  replaceSavedDeck,
} from "#/features/decks/server-functions";

export function AddToDeckDialog({ column, onClose }: { column: DeckColumn; onClose: () => void }) {
  const load = useServerFn(loadSavedDecks);
  const create = useServerFn(createSavedDeck);
  const replace = useServerFn(replaceSavedDeck);
  const decks = useQuery({ queryKey: ["browse-saved-decks"], queryFn: () => load(), staleTime: 0 });
  const [selected, setSelected] = useState("new");
  const [newDeckId] = useState(newId);
  const [columnId] = useState(newId);
  const [title, setTitle] = useState(column.title);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string>();
  const available = decks.data?.ok ? decks.data.data : [];
  return (
    <Dialog title="Add to deck" onClose={onClose}>
      {saved ? (
        <div className="grid gap-4">
          <p role="status">Added to deck.</p>
          <Link
            to="/deck"
            search={(previous) => ({ ...previous, deck: saved })}
            className="underline"
          >
            Open deck →
          </Link>
        </div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(undefined);
            setSaving(true);
            try {
              const deck = available.find((item) => item.id === selected);
              if (selected !== "new" && !deck) throw new Error("Select a deck.");
              const columnToSave = { ...column, id: columnId };
              if (deck?.columns.some((item) => item.id === columnId)) {
                setSaved(deck.id);
                return;
              }
              const result = deck
                ? await replace({
                    data: {
                      deck: {
                        id: deck.id,
                        title: deck.title,
                        columns: [...deck.columns, columnToSave],
                      },
                      expectedRevision: deck.revision,
                    },
                  })
                : await create({
                    data: { id: newDeckId, title: title.trim(), columns: [columnToSave] },
                  });
              if (!result.ok) {
                setError(result.error.message);
                await decks.refetch();
              } else setSaved(result.data.id);
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : "Unable to save deck.");
            } finally {
              setSaving(false);
            }
          }}
        >
          <Label className="grid gap-2 text-sm">
            Deck
            <NativeSelect
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
              disabled={saving}
            >
              <NativeSelectOption value="new">Create a new deck</NativeSelectOption>
              {available.map((deck) => (
                <NativeSelectOption key={deck.id} value={deck.id}>
                  {deck.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Label>
          {selected === "new" && (
            <Label className="grid gap-2 text-sm">
              Deck name
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                maxLength={120}
                disabled={saving}
              />
            </Label>
          )}
          {(decks.isError || (decks.data && !decks.data.ok)) && (
            <p role="alert">
              Unable to load saved decks.{" "}
              <Button type="button" variant="outline" onClick={() => void decks.refetch()}>
                Retry
              </Button>
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={saving || decks.isPending || !title.trim()}>
            {saving ? "Saving…" : "Add to deck"}
          </Button>
        </form>
      )}
    </Dialog>
  );
}
