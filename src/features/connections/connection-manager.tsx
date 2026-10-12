import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState } from "react";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Label } from "#/components/ui/label";
import { NativeSelect, NativeSelectOption } from "#/components/ui/native-select";
import {
  disconnectMastodonAccount,
  loadMastodonInstances,
  startMastodonOAuth,
} from "../mastodon/server-functions";
import type { Connection } from "./model";

const statusNames = {
  connected: "Connected",
  disconnected: "Disconnected",
  expired: "Reconnect required",
};

export function ConnectionManager({
  connections,
  onChanged,
  hasTemporaryDecks = false,
}: {
  connections: Connection[];
  onChanged: () => unknown;
  hasTemporaryDecks?: boolean;
}) {
  const fetchInstances = useServerFn(loadMastodonInstances);
  const authorize = useServerFn(startMastodonOAuth);
  const disconnect = useServerFn(disconnectMastodonAccount);
  const instances = useQuery({
    queryKey: ["mastodon-instances"],
    queryFn: () => fetchInstances(),
    retry: false,
  });
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const selectId = useId();
  const origin = selected || instances.data?.origins[0] || "";

  async function connect(origin: string, connectionId?: string) {
    setBusy(true);
    setError(undefined);
    try {
      const result = await authorize({
        data: { origin, ...(connectionId ? { connectionId } : {}) },
      });
      window.location.assign(result.authorizationUrl);
    } catch {
      setError("Could not start Mastodon authorization. Check the server and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(connectionId: string) {
    setBusy(true);
    setError(undefined);
    try {
      await disconnect({ data: { connectionId } });
      try {
        await onChanged();
      } catch {
        setError("Account disconnected, but the list could not be refreshed. Reload the page.");
      }
    } catch {
      setError("Could not disconnect the account. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-testid="connection-manager"
      className="grid gap-4"
      aria-label="Connected account management"
    >
      <p
        data-testid="connection-manager-description"
        className="m-0 text-research-body text-muted-foreground"
      >
        Connected accounts are available in columns on all your devices.
      </p>
      {error && <p role="alert">{error}</p>}
      {connections.length === 0 ? (
        <p>No connected accounts yet.</p>
      ) : (
        <ul data-testid="connection-manager-list" className="m-0 grid list-none gap-3 p-0">
          {connections.map((connection) => (
            <li
              className="flex items-center justify-between gap-3 border-b py-3 max-[480px]:flex-col max-[480px]:items-start"
              key={connection.id}
            >
              <div
                data-testid="connection-manager-account"
                className="grid min-w-0 gap-1 wrap-anywhere"
              >
                <strong>{connection.displayName}</strong>
                <span className="text-research-field text-muted-foreground">
                  {connection.platform === "twitter"
                    ? "Twitter"
                    : connection.platform === "reddit"
                      ? "Reddit gateway"
                      : "Mastodon"}{" "}
                  · {new URL(connection.origin).hostname}
                </span>
                <Badge variant={connection.status === "connected" ? "secondary" : "outline"}>
                  {statusNames[connection.status]}
                </Badge>
              </div>
              {connection.platform === "mastodon" && (
                <div
                  data-testid="connection-manager-actions"
                  className="flex flex-wrap justify-end gap-2"
                >
                  <Button
                    variant="outline"
                    type="button"
                    disabled={busy}
                    aria-label={`Reconnect ${connection.displayName}`}
                    onClick={() => void connect(connection.origin, connection.id)}
                  >
                    Reconnect
                  </Button>
                  {connection.status !== "disconnected" && (
                    <Button
                      variant="destructive"
                      type="button"
                      disabled={busy}
                      aria-label={`Disconnect ${connection.displayName}`}
                      onClick={() => void remove(connection.id)}
                    >
                      Disconnect
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <form
        data-testid="connection-manager-add"
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (origin) void connect(origin);
        }}
      >
        <h3 className="m-0 text-base">Add a Mastodon account</h3>
        {instances.isPending ? (
          <p role="status">Checking servers…</p>
        ) : instances.isError ? (
          <p role="alert">
            Could not load servers.
            <Button variant="outline" type="button" onClick={() => void instances.refetch()}>
              Retry
            </Button>
          </p>
        ) : instances.data.origins.length === 0 ? (
          <p>No Mastodon servers have been configured yet.</p>
        ) : (
          <>
            <Label htmlFor={selectId}>Mastodon server</Label>
            <NativeSelect
              className="w-full"
              id={selectId}
              value={origin}
              onChange={(event) => setSelected(event.target.value)}
              disabled={busy}
            >
              {instances.data.origins.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {new URL(value).hostname}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="submit" disabled={busy || !origin}>
              Authorize with Mastodon
            </Button>
          </>
        )}
        {hasTemporaryDecks && (
          <p
            data-testid="connection-manager-note"
            className="m-0 text-research-body text-muted-foreground"
          >
            Temporary decks will be lost when you leave to authorize. Save any decks you want to
            keep first.
          </p>
        )}
        {busy && <p role="status">Working…</p>}
      </form>
    </section>
  );
}
