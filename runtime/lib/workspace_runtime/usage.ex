defmodule WorkspaceRuntime.Usage do
  use GenServer

  def start_link(opts \\ []) do
    name = Keyword.get(opts, :name, __MODULE__)
    GenServer.start_link(__MODULE__, opts, if(name, do: [name: name], else: []))
  end

  def read(server \\ __MODULE__), do: GenServer.call(server, :read, 25_000)

  @impl true
  def init(opts) do
    {:ok,
     %{
       reader: Keyword.get(opts, :reader, &WorkspaceRuntime.CodexUsage.read/0),
       clock: Keyword.get(opts, :clock, &DateTime.utc_now/0),
       expires_at: 0,
       snapshot: %{"status" => "unavailable", "fetchedAt" => nil, "windows" => []}
     }}
  end

  @impl true
  def handle_call(:read, _, state) do
    now = state.clock.() |> DateTime.to_unix(:millisecond)

    if now < state.expires_at do
      {:reply, state.snapshot, state}
    else
      result =
        try do
          state.reader.()
        rescue
          _ -> {:error, :unavailable}
        end

      fetched = state.clock.()
      now = DateTime.to_unix(fetched, :millisecond)

      {snapshot, expires_at} =
        case result do
          {:ok, [_ | _] = windows} ->
            resets =
              Enum.flat_map(windows, fn w ->
                case DateTime.from_iso8601(w["resetsAt"] || "") do
                  {:ok, date, _} ->
                    value = DateTime.to_unix(date, :millisecond)
                    if value > now, do: [value], else: []

                  _ ->
                    []
                end
              end)

            {%{
               "status" => "ready",
               "fetchedAt" => DateTime.to_iso8601(fetched),
               "windows" => windows
             }, Enum.min([now + 120_000 | resets])}

          _ ->
            {Map.put(state.snapshot, "status", "unavailable"), now + 60_000}
        end

      {:reply, snapshot, %{state | snapshot: snapshot, expires_at: expires_at}}
    end
  end
end
