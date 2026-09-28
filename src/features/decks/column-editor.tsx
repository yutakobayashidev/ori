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
      className="deck-editor"
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
      <div className="deck-editor-fields">
        <Label htmlFor={`${formId}-title`}>
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
        <Label htmlFor={`${formId}-profile`}>
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
                {connection.platform === "mastodon" ? " · Mastodon" : ""}
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
      <p className="deck-help">This column uses the selected connection profile.</p>
      {error && (
        <p role="alert" className="deck-error">
          {error}
        </p>
      )}
      <div className="deck-actions">
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
