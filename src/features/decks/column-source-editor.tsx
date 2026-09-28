import type { ReactElement } from "react";
import type { Connection } from "../connections/model";
import { defaultMastodonSource, MastodonSourceEditor } from "./mastodon-source-editor";
import type { DeckColumn } from "./model";
import { defaultTwitterSource, TwitterSourceEditor } from "./twitter-source-editor";

type Source = DeckColumn["source"];

export function defaultColumnSource(platform: Connection["platform"]): Source {
  switch (platform) {
    case "twitter":
      return defaultTwitterSource();
    case "mastodon":
      return defaultMastodonSource();
  }
}

/** Account-local targets never carry across bindings; compatible searches may. */
export function rebindColumnSource(source: Source, platform: Connection["platform"]): Source {
  if (source.platform === platform) {
    return source.kind === "search" ? source : { ...source, target: "" };
  }
  switch (platform) {
    case "twitter":
      return defaultTwitterSource(source.kind === "hashtag" ? "search" : source.kind);
    case "mastodon":
      return defaultMastodonSource(source.kind);
  }
}

export function ColumnSourceEditor({
  source,
  connectionId,
  onChange,
}: {
  source: Source;
  connectionId: string;
  onChange: (source: Source) => void;
}): ReactElement {
  switch (source.platform) {
    case "twitter":
      return (
        <TwitterSourceEditor source={source} connectionId={connectionId} onChange={onChange} />
      );
    case "mastodon":
      return (
        <MastodonSourceEditor source={source} connectionId={connectionId} onChange={onChange} />
      );
  }
}
