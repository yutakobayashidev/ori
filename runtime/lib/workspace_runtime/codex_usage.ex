defmodule WorkspaceRuntime.CodexUsage do
  @moduledoc false

  # This connection only reads account limits. It never creates a thread or turn.
  def read(opts \\ []) do
    binary = Keyword.get(opts, :binary, System.get_env("WORKSPACE_CODEX_PATH", "codex"))
    binary = System.find_executable(binary) || raise "Codex executable missing"

    allowed =
      ~w(HOME CODEX_HOME PATH LANG LC_ALL SSL_CERT_FILE SSL_CERT_DIR NIX_SSL_CERT_FILE TMPDIR)

    env =
      Enum.map(System.get_env(), fn {k, v} ->
        {String.to_charlist(k), if(k in allowed, do: String.to_charlist(v), else: false)}
      end)

    port =
      Port.open({:spawn_executable, String.to_charlist(binary)}, [
        :binary,
        :exit_status,
        {:line, 1_048_576},
        {:args, ["app-server"]},
        {:env, env}
      ])

    deadline = System.monotonic_time(:millisecond) + Keyword.get(opts, :timeout, 10_000)

    try do
      write(port, %{
        "id" => 1,
        "method" => "initialize",
        "params" => %{"clientInfo" => %{"name" => "ori-usage", "version" => "0.1.0"}}
      })

      receive_response(port, deadline, "")
    after
      # Closing stdin alone can leave app-server waiting on an in-flight account
      # request. This dedicated, read-only process has no turn to preserve.
      case Port.info(port, :os_pid) do
        {:os_pid, pid} ->
          System.cmd("sh", ["-c", "kill -TERM \"$1\"", "--", Integer.to_string(pid)],
            stderr_to_stdout: true
          )

        nil ->
          :ok
      end

      try do
        Port.close(port)
      rescue
        ArgumentError -> :ok
      end
    end
  rescue
    _ -> {:error, :unavailable}
  end

  defp receive_response(port, deadline, buffer) do
    if System.monotonic_time(:millisecond) >= deadline do
      {:error, :timeout}
    else
      receive_message(port, deadline, buffer)
    end
  end

  defp receive_message(port, deadline, buffer) do
    receive do
      {^port, {:data, {:noeol, data}}} when byte_size(buffer) + byte_size(data) <= 1_048_576 ->
        receive_response(port, deadline, buffer <> data)

      {^port, {:data, {:eol, data}}} ->
        case Jason.decode(buffer <> data) do
          {:ok, %{"id" => 1, "result" => _}} ->
            write(port, %{"method" => "initialized", "params" => %{}})
            write(port, %{"id" => 2, "method" => "account/rateLimits/read", "params" => %{}})
            receive_response(port, deadline, "")

          {:ok, %{"id" => 2, "result" => result}} ->
            parse(result)

          {:ok, %{"error" => _}} ->
            {:error, :unavailable}

          _ ->
            receive_response(port, deadline, "")
        end

      {^port, {:exit_status, _}} ->
        {:error, :unavailable}

      {^port, _} ->
        {:error, :invalid_response}
    after
      max(0, deadline - System.monotonic_time(:millisecond)) -> {:error, :timeout}
    end
  end

  def parse(result) when is_map(result) do
    limits = get_in(result, ["rateLimitsByLimitId", "codex"]) || result["rateLimits"] || %{}

    windows =
      Enum.flat_map(["primary", "secondary"], fn id ->
        case limits[id] do
          %{"usedPercent" => used, "windowDurationMins" => duration} = window
          when is_number(used) and used >= 0 and is_integer(duration) and duration > 0 ->
            [
              %{
                "id" => id,
                "usedPercent" => used,
                "windowDurationMins" => duration,
                "resetsAt" => reset_time(window["resetsAt"])
              }
            ]

          _ ->
            []
        end
      end)

    if windows == [], do: {:error, :unavailable}, else: {:ok, windows}
  end

  def parse(_), do: {:error, :invalid_response}

  defp reset_time(value) when is_integer(value) do
    case DateTime.from_unix(value) do
      {:ok, date} -> DateTime.to_iso8601(date)
      _ -> nil
    end
  end

  defp reset_time(_), do: nil
  defp write(port, data), do: Port.command(port, Jason.encode!(data) <> "\n")
end
