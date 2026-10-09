defmodule WorkspaceRuntime.Codex do
  alias WorkspaceRuntime.Store

  def run(r) do
    Process.put(:deadline, System.monotonic_time(:millisecond) + 30 * 60 * 1000)
    binary = System.get_env("WORKSPACE_CODEX_PATH", "codex") |> System.find_executable()
    if is_nil(binary), do: raise("Codex executable missing")

    allowed =
      ~w(HOME CODEX_HOME PATH LANG LC_ALL SSL_CERT_FILE SSL_CERT_DIR NIX_SSL_CERT_FILE TMPDIR)

    env = System.get_env() |> Enum.map(fn {k, v} -> {k, if(k in allowed, do: v, else: nil)} end)
    {raw, 0} = System.cmd(binary, ["mcp", "list", "--json"], env: env)
    inherited = Jason.decode!(raw)
    config = r["config"] || %{}

    overrides =
      Map.merge(
        Enum.reduce(inherited, %{}, fn server, acc ->
          transport = server["transport"]
          key = if transport["type"] == "stdio", do: "command", else: "url"

          acc
          |> Map.put("mcp_servers.#{server["name"]}.enabled", false)
          |> Map.put("mcp_servers.#{server["name"]}.#{key}", transport[key])
        end),
        %{
          "features.hooks" => false,
          "features.multi_agent" => false,
          "shell_environment_policy.inherit" => "none",
          "web_search" => "disabled"
        }
      )

    overrides =
      Enum.reduce(config["mcpServers"] || %{}, overrides, fn {name, server}, a ->
        a =
          Enum.reduce(server["tools"] || [], a, fn tool, a ->
            Map.put(a, "mcp_servers.#{name}.tools.#{tool}.approval_mode", "approve")
          end)

        a
        |> Map.put("mcp_servers.#{name}.enabled", true)
        |> Map.put("mcp_servers.#{name}.url", server["url"])
      end)

    args =
      ["app-server"] ++
        Enum.flat_map(overrides, fn {k, v} -> ["-c", k <> "=" <> Jason.encode!(v)] end)

    port_env =
      Enum.map(env, fn {k, v} ->
        {String.to_charlist(k), if(v, do: String.to_charlist(v), else: false)}
      end)

    port =
      Port.open({:spawn_executable, String.to_charlist(binary)}, [
        :binary,
        :exit_status,
        {:line, 1_048_576},
        {:args, args},
        {:cd, r["cwd"]},
        {:env, port_env}
      ])

    try do
      send_rpc(port, 1, "initialize", %{
        "clientInfo" => %{"name" => "workspace-runtime", "version" => "0.1.0"},
        "capabilities" => %{"experimentalApi" => true}
      })

      loop(port, r, "", nil)
    after
      if Port.info(port), do: Port.close(port)
    end
  rescue
    e -> Store.event(r["id"], {:patch, %{"status" => "failed", "error" => Exception.message(e)}})
  end

  defp loop(port, r, buffer, pending) do
    if System.monotonic_time(:millisecond) >= Process.get(:deadline),
      do: raise("Run exceeded 30 minute limit")

    receive do
      {^port, {:data, {:noeol, data}}} ->
        loop(port, r, buffer <> data, pending)

      {^port, {:data, {:eol, data}}} ->
        case Jason.decode(buffer <> data) do
          {:ok, m} -> handle(port, r, m, pending)
          _ -> loop(port, r, "", pending)
        end

      {^port, {:exit_status, code}} ->
        raise("Codex exited #{code}")

      {:answer, %{"requestId" => req, "answers" => answers}} when req == pending ->
        write(port, %{"id" => req, "result" => %{"answers" => answers}})
        Store.event(r["id"], {:patch, %{"status" => "running", "pendingInput" => nil}})
        loop(port, r, buffer, nil)

      _ ->
        loop(port, r, buffer, pending)
    after
      min(900_000, max(0, Process.get(:deadline) - System.monotonic_time(:millisecond))) ->
        raise("Codex idle or execution deadline exceeded")
    end
  end

  defp handle(port, r, %{"id" => 1, "result" => _}, pending) do
    write(port, %{"method" => "initialized", "params" => %{}})
    c = r["config"] || %{}

    params =
      %{
        "cwd" => r["cwd"],
        "approvalPolicy" => "never",
        "sandbox" => "workspace-write",
        "developerInstructions" => c["developerInstructions"],
        "model" => c["model"]
      }
      |> Map.reject(fn {_, v} -> is_nil(v) end)

    params = if r["threadId"], do: Map.put(params, "threadId", r["threadId"]), else: params
    send_rpc(port, 2, if(r["threadId"], do: "thread/resume", else: "thread/start"), params)
    loop(port, r, "", pending)
  end

  defp handle(port, r, %{"id" => 2, "result" => %{"thread" => %{"id" => thread}}}, pending) do
    Store.event(r["id"], {:patch, %{"threadId" => thread}})

    send_rpc(port, 3, "turn/start", %{
      "threadId" => thread,
      "input" => [%{"type" => "text", "text" => r["prompt"]}],
      "approvalPolicy" => "never"
    })

    loop(port, r, "", pending)
  end

  defp handle(
         port,
         r,
         %{"method" => "item/agentMessage/delta", "params" => %{"delta" => text}},
         pending
       ) do
    Store.event(r["id"], {:text, text})
    loop(port, r, "", pending)
  end

  defp handle(_port, r, %{"method" => "turn/completed", "params" => p}, _) do
    turn = p["turn"] || %{}
    status = if turn["status"] == "completed", do: "review", else: "failed"

    Store.event(
      r["id"],
      {:patch,
       %{
         "status" => status,
         "error" => if(turn["error"], do: Jason.encode!(turn["error"]), else: nil),
         "artifacts" => WorkspaceRuntime.Artifacts.list(r["cwd"])
       }}
    )
  end

  defp handle(port, r, %{"id" => id, "method" => "item/tool/requestUserInput", "params" => p}, _) do
    Store.event(
      r["id"],
      {:patch,
       %{
         "status" => "waiting_input",
         "pendingInput" => %{"requestId" => id, "questions" => p["questions"]}
       }}
    )

    loop(port, r, "", id)
  end

  defp handle(
         port,
         r,
         %{"method" => method, "params" => %{"item" => %{"type" => "mcpToolCall"} = item}},
         pending
       )
       when method in ["item/started", "item/completed"] do
    saved = Enum.find(Store.call({:get, r["id"]})["toolCalls"] || [], &(&1["id"] == item["id"]))

    unless saved do
      Store.event(
        r["id"],
        {:tool_start,
         %{
           "id" => item["id"],
           "name" => item["tool"],
           "arguments" => item["arguments"],
           "status" => "running"
         }}
      )
    end

    if method == "item/completed" && (is_nil(saved) || saved["status"] == "running") do
      result =
        item["result"] ||
          %{
            "content" => [
              %{
                "type" => "text",
                "text" => get_in(item, ["error", "message"]) || "MCP tool failed"
              }
            ]
          }

      result = if item["status"] == "failed", do: Map.put(result, "isError", true), else: result

      result =
        if item["mcpAppUi"],
          do:
            Map.update(
              result,
              "_meta",
              %{"ui" => item["mcpAppUi"]},
              &Map.put(&1 || %{}, "ui", item["mcpAppUi"])
            ),
          else: result

      Store.event(r["id"], {:tool_result, item["id"], result})
    end

    loop(port, r, "", pending)
  end

  defp handle(port, r, %{"id" => id, "method" => _}, pending) do
    write(port, %{
      "id" => id,
      "error" => %{"code" => -32601, "message" => "Unsupported interactive operation"}
    })

    loop(port, r, "", pending)
  end

  defp handle(_, _, %{"error" => error}, _), do: raise("Codex error: #{Jason.encode!(error)}")
  defp handle(port, r, _, pending), do: loop(port, r, "", pending)

  defp send_rpc(port, id, method, params),
    do: write(port, %{"id" => id, "method" => method, "params" => params})

  defp write(port, data), do: Port.command(port, Jason.encode!(data) <> "\n")
end
