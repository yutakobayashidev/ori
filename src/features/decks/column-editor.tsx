import { useId, useState } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import type { Connection } from "#/features/connections/model";
import {
  ColumnSourceEditor,
  defaultColumnSource,
  rebindColumnSource,
} from "./column-source-editor";
import { columnSchema, type DeckColumn } from "./model";

export function ColumnEditor({
  column,
  connections,
  onSave,
  onCancel,
}: {
  column?: DeckColumn;
  connections: Connection[];
  onSave: (column: DeckColumn) => Promise<boolean>;
  onCancel: () => void;
}) {
  const available = connections.filter((connection) => connection.status === "connected");
  const formId = useId();
  const [error, setError] = useState<string>();
  const [connectionId, setConnectionId] = useState(column?.connectionId ?? available[0]?.id ?? "");
  const [source, setSource] = useState(
    column?.source ?? defaultColumnSource(available[0]?.platform ?? "twitter"),
  );
  const validConnection = available.some((connection) => connection.id === connectionId);

  return (
    <form
      data-testid="deck-editor"
      className="m-0 p-0"
      aria-label={column ? "Edit column" : "Add column"}
      onSubmit={async (event) => {
        event.preventDefault();
        setError(undefined);
        const data = new FormData(event.currentTarget);
        const parsed = columnSchema.safeParse({
          id: column?.id ?? crypto.getRandomValues(new Uint32Array(4)).join("-"),
          title: data.get("title"),
          connectionId,
          source,
        });
        if (!parsed.success || !validConnection) {
          setError(
            parsed.success ? "Select a connection profile." : parsed.error.issues[0]?.message,
          );
          return;
        }
        await onSave(parsed.data);
      }}
    >
      <div data-testid="deck-editor-fields" className="grid gap-4">
        <Label className="grid min-w-0 gap-2 text-sm" htmlFor={`${formId}-title`}>
          Column name
          <Input
            id={`${formId}-title`}
            name="title"
            defaultValue={column?.title ?? ""}
            maxLength={80}
            placeholder="e.g. Announcements"
            required
          />
        </Label>
        <Label className="grid min-w-0 gap-2 text-sm" htmlFor={`${formId}-profile`}>
          Connection profile
          <NativeSelect
            className="w-full"
            id={`${formId}-profile`}
            value={connectionId}
            required
            onChange={(event) => {
              const connection = available.find((value) => value.id === event.target.value);
              if (!connection) return;
              setConnectionId(connection.id);
              setSource(rebindColumnSource(source, connection.platform));
            }}
          >
            <NativeSelectOption value="" disabled>
              Select an option
            </NativeSelectOption>
            {connectionId && !validConnection && (
              <NativeSelectOption value={connectionId} disabled>
                {connectionId} (unavailable)
              </NativeSelectOption>
            )}
            {available.map((connection) => (
              <NativeSelectOption key={connection.id} value={connection.id}>
                {connection.displayName}
                {connection.platform === "mastodon"
                  ? " · Mastodon"
                  : connection.platform === "reddit"
                    ? " · Reddit"
                    : ""}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Label>
      </div>
      <ColumnSourceEditor
        source={source}
        connectionId={validConnection ? connectionId : ""}
        onChange={setSource}
      />
      <p data-testid="deck-help" className="text-xs leading-normal text-muted-foreground">
        This column uses the selected connection profile.
      </p>
      {error && (
        <p
          role="alert"
          data-testid="deck-error"
          className="text-sm leading-body text-destructive wrap-anywhere"
        >
          {error}
        </p>
      )}
      <div data-testid="deck-actions" className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!validConnection}>
          {column ? "Save changes" : "Add and search"}
        </Button>
        <Button variant="outline" type="button" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
