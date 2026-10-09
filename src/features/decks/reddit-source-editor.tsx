import { type ReactElement, useId } from "react";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import type { RedditSource } from "#/features/platforms/reddit-source";

export function defaultRedditSource(): RedditSource {
  return {
    platform: "reddit",
    kind: "search",
    query: "",
    sort: "relevance",
    time: "all",
  };
}

export function RedditSourceEditor({
  source,
  onChange,
}: {
  source: RedditSource;
  onChange: (source: RedditSource) => void;
}): ReactElement {
  const queryId = useId();
  const sortId = useId();
  const timeId = useId();
  return (
    <div data-testid="deck-source-fields" className="my-4 grid gap-4">
      <Label className="grid min-w-0 gap-2 text-sm" htmlFor={queryId}>
        Reddit search query
        <Input
          id={queryId}
          value={source.query}
          onChange={(event) => onChange({ ...source, query: event.target.value })}
          maxLength={512}
          placeholder="e.g. self-hosted AI agent"
          required
        />
      </Label>
      <div className="grid grid-cols-2 gap-3">
        <Label className="grid min-w-0 gap-2 text-sm" htmlFor={sortId}>
          Sort
          <NativeSelect
            className="w-full"
            id={sortId}
            value={source.sort}
            onChange={(event) =>
              onChange({ ...source, sort: event.target.value as RedditSource["sort"] })
            }
          >
            <NativeSelectOption value="relevance">Relevance</NativeSelectOption>
            <NativeSelectOption value="new">New</NativeSelectOption>
            <NativeSelectOption value="top">Top</NativeSelectOption>
            <NativeSelectOption value="comments">Most comments</NativeSelectOption>
          </NativeSelect>
        </Label>
        <Label className="grid min-w-0 gap-2 text-sm" htmlFor={timeId}>
          Time range
          <NativeSelect
            className="w-full"
            id={timeId}
            value={source.time}
            onChange={(event) =>
              onChange({ ...source, time: event.target.value as RedditSource["time"] })
            }
          >
            <NativeSelectOption value="all">Any time</NativeSelectOption>
            <NativeSelectOption value="hour">Past hour</NativeSelectOption>
            <NativeSelectOption value="day">Past day</NativeSelectOption>
            <NativeSelectOption value="week">Past week</NativeSelectOption>
            <NativeSelectOption value="month">Past month</NativeSelectOption>
            <NativeSelectOption value="year">Past year</NativeSelectOption>
          </NativeSelect>
        </Label>
      </div>
    </div>
  );
}
