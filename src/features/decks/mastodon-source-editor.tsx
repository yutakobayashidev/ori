import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { type ReactElement, useId } from "react";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import { loadMastodonLists } from "../platforms/mastodon-server-functions";
import type { MastodonSource } from "../platforms/mastodon-source";

type EditorProps<T extends MastodonSource = MastodonSource> = {
  source: T;
  onChange: (source: MastodonSource) => void;
};

export function defaultMastodonSource(kind: MastodonSource["kind"] = "search"): MastodonSource {
  switch (kind) {
    case "search":
      return { platform: "mastodon", kind, query: "" };
    case "user":
      return { platform: "mastodon", kind, target: "" };
    case "list":
      return { platform: "mastodon", kind, target: "" };
    case "hashtag":
      return { platform: "mastodon", kind, target: "" };
  }
}

export function MastodonSourceEditor({
  source,
  connectionId,
  onChange,
}: EditorProps & { connectionId: string }) {
  const id = useId();
  return (
    <>
      <Label className="grid min-w-0 gap-2 text-sm" htmlFor={id}>
        Column type
        <NativeSelect
          className="w-full"
          id={id}
          value={source.kind}
          onChange={(event) =>
            onChange(defaultMastodonSource(event.target.value as MastodonSource["kind"]))
          }
        >
          <NativeSelectOption value="search">Search</NativeSelectOption>
          <NativeSelectOption value="user">User posts</NativeSelectOption>
          <NativeSelectOption value="list">List</NativeSelectOption>
          <NativeSelectOption value="hashtag">Hashtag</NativeSelectOption>
        </NativeSelect>
      </Label>
      <MastodonSourceFields source={source} connectionId={connectionId} onChange={onChange} />
    </>
  );
}

function MastodonSourceFields({
  source,
  connectionId,
  onChange,
}: EditorProps & { connectionId: string }): ReactElement {
  switch (source.kind) {
    case "search":
      return <MastodonSearchEditor source={source} onChange={onChange} />;
    case "user":
      return <MastodonUserEditor source={source} onChange={onChange} />;
    case "list":
      return <MastodonListEditor source={source} connectionId={connectionId} onChange={onChange} />;
    case "hashtag":
      return <MastodonHashtagEditor source={source} onChange={onChange} />;
  }
}

function MastodonSearchEditor({
  source,
  onChange,
}: EditorProps<Extract<MastodonSource, { kind: "search" }>>) {
  const id = useId();
  return (
    <div data-testid="deck-source-fields" className="my-4 grid gap-4">
      <Label className="grid min-w-0 gap-2 text-sm" htmlFor={id}>
        Mastodon search query
        <Input
          id={id}
          value={source.query}
          onChange={(event) => onChange({ ...source, query: event.target.value })}
          maxLength={512}
          placeholder="e.g. WebMCP"
          required
        />
      </Label>
      <p data-testid="deck-help" className="text-xs leading-normal text-muted-foreground">
        Full-text search depends on server settings. Zero results do not necessarily mean search is
        supported.
      </p>
    </div>
  );
}

function MastodonUserEditor({
  source,
  onChange,
}: EditorProps<Extract<MastodonSource, { kind: "user" }>>) {
  const id = useId();
  return (
    <div data-testid="deck-source-fields" className="my-4 grid gap-4">
      <Label className="grid min-w-0 gap-2 text-sm" htmlFor={id}>
        User
        <Input
          id={id}
          value={source.target}
          onChange={(event) => onChange({ ...source, target: event.target.value })}
          placeholder="user@server or account ID"
          maxLength={256}
          required
        />
      </Label>
    </div>
  );
}

function MastodonHashtagEditor({
  source,
  onChange,
}: EditorProps<Extract<MastodonSource, { kind: "hashtag" }>>) {
  const id = useId();
  return (
    <div data-testid="deck-source-fields" className="my-4 grid gap-4">
      <Label className="grid min-w-0 gap-2 text-sm" htmlFor={id}>
        Hashtag
        <Input
          id={id}
          value={source.target}
          onChange={(event) => onChange({ ...source, target: event.target.value })}
          placeholder="Tag without #"
          maxLength={128}
          required
        />
      </Label>
    </div>
  );
}

function MastodonListEditor({
  source,
  connectionId,
  onChange,
}: EditorProps<Extract<MastodonSource, { kind: "list" }>> & {
  connectionId: string;
}) {
  const id = useId();
  return (
    <div data-testid="deck-source-fields" className="my-4 grid gap-4">
      <Label className="grid min-w-0 gap-2 text-sm" htmlFor={id}>
        List
        <Input
          id={id}
          value={source.target}
          onChange={(event) => onChange({ ...source, target: event.target.value })}
          placeholder="List ID for this account"
          maxLength={32}
          required
        />
      </Label>
      {connectionId && (
        <MastodonListChoices
          connectionId={connectionId}
          onSelect={(target) => onChange({ ...source, target })}
        />
      )}
    </div>
  );
}

function MastodonListChoices({
  connectionId,
  onSelect,
}: {
  connectionId: string;
  onSelect: (target: string) => void;
}) {
  const fetchLists = useServerFn(loadMastodonLists);
  const lists = useQuery({
    queryKey: ["mastodon-lists", connectionId],
    queryFn: () => fetchLists({ data: { connectionId } }),
    retry: false,
  });
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
    <section
      data-testid="deck-list-choices"
      className="flex flex-wrap gap-2"
      aria-label="Lists for this account"
    >
      {lists.data.lists.length === 0 ? (
        <p>This account has no lists.</p>
      ) : (
        lists.data.lists.map((list) => (
          <Button variant="outline" type="button" key={list.id} onClick={() => onSelect(list.id)}>
            {list.name}
          </Button>
        ))
      )}
    </section>
  );
}
