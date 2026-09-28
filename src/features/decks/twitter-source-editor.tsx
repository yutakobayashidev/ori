import { type ReactElement, useId } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import { useListChoices } from "../posts/use-list-choices";
import type { DeckColumn } from "./model";

type Source = Extract<DeckColumn["source"], { platform: "twitter" }>;
type EditorProps<T extends Source = Source> = {
  source: T;
  onChange: (source: Source) => void;
};

export function defaultTwitterSource(kind: Source["kind"] = "search"): Source {
  switch (kind) {
    case "search":
      return {
        platform: "twitter",
        kind,
        query: "",
        product: "Latest",
        following: false,
      };
    case "user":
      return { platform: "twitter", kind, target: "" };
    case "list":
      return { platform: "twitter", kind, target: "" };
  }
}

export function TwitterSourceEditor({
  source,
  connectionId,
  onChange,
}: EditorProps & { connectionId: string }) {
  const id = useId();
  return (
    <>
      <Label htmlFor={id}>
        Column type
        <NativeSelect
          className="w-full"
          id={id}
          value={source.kind}
          onChange={(event) => onChange(defaultTwitterSource(event.target.value as Source["kind"]))}
        >
          <NativeSelectOption value="search">Search</NativeSelectOption>
          <NativeSelectOption value="user">User posts</NativeSelectOption>
          <NativeSelectOption value="list">List</NativeSelectOption>
        </NativeSelect>
      </Label>
      <TwitterSourceFields source={source} connectionId={connectionId} onChange={onChange} />
    </>
  );
}

function TwitterSourceFields({
  source,
  connectionId,
  onChange,
}: EditorProps & { connectionId: string }): ReactElement {
  switch (source.kind) {
    case "search":
      return <TwitterSearchEditor source={source} onChange={onChange} />;
    case "user":
      return <TwitterUserEditor source={source} onChange={onChange} />;
    case "list":
      return <TwitterListEditor source={source} connectionId={connectionId} onChange={onChange} />;
  }
}

function TwitterSearchEditor({
  source,
  onChange,
}: EditorProps<Extract<Source, { kind: "search" }>>) {
  const id = useId();
  return (
    <div className="deck-source-fields">
      <Label htmlFor={`${id}-query`}>
        Twitter search query
        <Input
          id={`${id}-query`}
          value={source.query}
          onChange={(event) => onChange({ ...source, query: event.target.value })}
          maxLength={512}
          placeholder="e.g. WebMCP lang:en"
          required
        />
      </Label>
      <Label htmlFor={`${id}-product`}>
        Sort by
        <NativeSelect
          className="w-full"
          id={`${id}-product`}
          value={source.product}
          onChange={(event) =>
            onChange({
              ...source,
              product: event.target.value as "Latest" | "Top",
            })
          }
        >
          <NativeSelectOption value="Latest">Latest</NativeSelectOption>
          <NativeSelectOption value="Top">Top</NativeSelectOption>
        </NativeSelect>
      </Label>
      <p className="deck-help">Use Twitter search operators such as from:, lang:, and since:.</p>
      <Label className="deck-checkbox">
        <Checkbox
          checked={source.following}
          onCheckedChange={(checked) => onChange({ ...source, following: checked })}
        />
        Following only
      </Label>
    </div>
  );
}

function TwitterUserEditor({ source, onChange }: EditorProps<Extract<Source, { kind: "user" }>>) {
  const id = useId();
  return (
    <div className="deck-source-fields">
      <Label htmlFor={id}>
        User
        <Input
          id={id}
          value={source.target}
          onChange={(event) => onChange({ ...source, target: event.target.value })}
          placeholder="@handle or profile URL"
          maxLength={256}
          required
        />
      </Label>
    </div>
  );
}

function TwitterListEditor({
  source,
  connectionId,
  onChange,
}: EditorProps<Extract<Source, { kind: "list" }>> & { connectionId: string }) {
  const id = useId();
  return (
    <div className="deck-source-fields">
      <Label htmlFor={id}>
        List
        <Input
          id={id}
          value={source.target}
          onChange={(event) => onChange({ ...source, target: event.target.value })}
          placeholder="List URL or ID"
          maxLength={256}
          required
        />
      </Label>
      {connectionId && (
        <TwitterListChoices
          connectionId={connectionId}
          onSelect={(target) => onChange({ ...source, target })}
        />
      )}
    </div>
  );
}

function TwitterListChoices({
  connectionId,
  onSelect,
}: {
  connectionId: string;
  onSelect: (target: string) => void;
}) {
  const lists = useListChoices(connectionId);
  if (lists.isPending) return <p role="status">Loading lists…</p>;
  if (lists.isError)
    return (
      <p role="alert">
        Unable to load lists.
        <Button variant="outline" type="button" onClick={() => void lists.refetch()}>
          Retry
        </Button>
      </p>
    );
  return (
    <section className="deck-list-choices" aria-label="Lists for this profile">
      {lists.data.length === 0 ? (
        <p>No lists found. You can enter a URL or ID instead.</p>
      ) : (
        lists.data.map((list) => (
          <Button variant="outline" type="button" key={list.id} onClick={() => onSelect(list.id)}>
            {list.name}
            {list.isPrivate ? " · Private" : ""}
          </Button>
        ))
      )}
    </section>
  );
}
