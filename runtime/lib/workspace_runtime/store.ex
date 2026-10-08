defmodule WorkspaceRuntime.Store do
  use GenServer
  def start_link(_), do: GenServer.start_link(__MODULE__, nil, name: __MODULE__)
  def call(message), do: GenServer.call(__MODULE__, message)
  def event(id, event), do: GenServer.call(__MODULE__, {:event, id, event})

  def init(_) do
    root =
      System.get_env("WORKSPACE_RUNTIME_ROOT", Path.expand("~/.local/state/workspace-runtime"))

    File.mkdir_p!(root)

    {:ok, table} =
      :dets.open_file(:runs, file: String.to_charlist(Path.join(root, "runs.dets")), type: :set)

    :dets.foldl(
      fn {id, run}, _ ->
        if run["status"] in ["running", "waiting_input", "queued"],
          do:
            :dets.insert(
              table,
              {id,
               Map.put(run, "status", "interrupted")
               |> fail_pending_tools("Execution interrupted")}
            )
      end,
      nil,
      table
    )

    :dets.sync(table)

    {:ok,
     %{
       table: table,
       root: root,
       running: %{},
       limit: String.to_integer(System.get_env("WORKSPACE_RUNTIME_CONCURRENCY", "2"))
     }}
  end

  def handle_call(:list, _, s),
    do: {:reply, :dets.foldl(fn {_, r}, a -> [public(r) | a] end, [], s.table), s}

  def handle_call({:get, id}, _, s), do: {:reply, fetch(s, id) |> maybe_public(), s}

  def handle_call({:create, p}, _, s) do
    id = p["id"]

    cond do
      not is_binary(id) or not Regex.match?(~r/^[a-zA-Z0-9_-]{1,128}$/, id) ->
        {:reply, {:error, "Invalid id"}, s}

      not is_binary(p["prompt"]) or String.trim(p["prompt"]) == "" ->
        {:reply, {:error, "Prompt required"}, s}

      not is_nil(p["cwd"]) and not is_binary(p["cwd"]) ->
        {:reply, {:error, "cwd must be a path string"}, s}

      not is_nil(p["config"]) and not is_map(p["config"]) ->
        {:reply, {:error, "config must be an object"}, s}

      fetch(s, id) != nil ->
        r = fetch(s, id)

        {:reply,
         if(r["creation"] == p,
           do: public(r),
           else: {:error, "Run id reused with different request"}
         ), s}

      active_activity?(s, p["activityId"], id) ->
        {:reply, {:error, "Activity already has an active run"}, s}

      true ->
        cwd = p["cwd"] || Path.join(s.root, id)
        File.mkdir_p!(cwd)
        {:ok, cwd} = SymphonyElixir.PathSafety.canonicalize(cwd)

        r =
          Map.merge(p, %{
            "cwd" => cwd,
            "status" => "queued",
            "threadId" => p["threadId"],
            "messages" => [message("user", p["prompt"])],
            "artifacts" => [],
            "toolCalls" => [],
            "requests" => %{},
            "creation" => p,
            "createdAt" => now(),
            "updatedAt" => now(),
            "version" => 1
          })

        save(s, r)
        send(self(), :dispatch)
        {:reply, public(r), s}
    end
  rescue
    e in [File.Error, MatchError, ArgumentError] ->
      {:reply, {:error, "Could not prepare execution workspace: " <> Exception.message(e)}, s}
  end

  def handle_call({:message, id, p}, _, s) do
    r = fetch(s, id)

    cond do
      is_nil(r) ->
        {:reply, {:error, "Not found"}, s}

      not is_binary(p["requestId"]) or not is_binary(p["text"]) ->
        {:reply, {:error, "requestId and text required"}, s}

      Map.has_key?(r["requests"], p["requestId"]) ->
        {:reply,
         if(r["requests"][p["requestId"]] == p,
           do: public(r),
           else: {:error, "Request id reused with different body"}
         ), s}

      active_activity?(s, r["activityId"], id) ->
        {:reply, {:error, "Activity already has an active run"}, s}

      r["status"] in ["running", "queued", "waiting_input"] ->
        {:reply, {:error, "Run is active"}, s}

      true ->
        upgrade =
          get_in(p, ["config", "dynamicTools"]) && is_nil(get_in(r, ["config", "dynamicTools"]))

        prompt =
          if upgrade do
            history = Enum.map_join(r["messages"], "\n\n", &(&1["role"] <> ": " <> &1["text"]))

            "Previous conversation (context only; do not repeat completed actions):\n" <>
              history <> "\n\nCurrent request:\n" <> p["text"]
          else
            p["text"]
          end

        r = if upgrade, do: Map.put(r, "threadId", nil), else: r

        r =
          r
          |> Map.put("prompt", prompt)
          |> Map.put("status", "queued")
          |> Map.put("error", nil)
          |> Map.put("pendingInput", nil)
          |> Map.put("requests", Map.put(r["requests"], p["requestId"], p))
          |> Map.update!("messages", &(&1 ++ [message("user", p["text"])]))
          |> bump()

        r = if p["config"], do: Map.put(r, "config", p["config"]), else: r
        save(s, r)
        send(self(), :dispatch)
        {:reply, public(r), s}
    end
  end

  def handle_call({:stop, id}, _, s) do
    if pid = s.running[id], do: Task.Supervisor.terminate_child(WorkspaceRuntime.Tasks, pid)

    case fetch(s, id) do
      nil ->
        {:reply, {:error, "Not found"}, s}

      r ->
        r =
          if r["status"] in ["queued", "running", "waiting_input"],
            do:
              Map.put(r, "status", "cancelled")
              |> fail_pending_tools("Execution cancelled")
              |> bump(),
            else: r

        save(s, r)
        send(self(), :dispatch)
        {:reply, public(r), %{s | running: Map.delete(s.running, id)}}
    end
  end

  def handle_call({:answer, id, p}, _, s) do
    r = fetch(s, id)

    if r && r["status"] == "waiting_input" &&
         get_in(r, ["pendingInput", "requestId"]) == p["requestId"] && is_map(p["answers"]) &&
         s.running[id] do
      text =
        Enum.map_join(r["pendingInput"]["questions"] || [], "\n", fn question ->
          values = get_in(p, ["answers", question["id"], "answers"]) || []
          answer = if question["isSecret"], do: "[redacted]", else: Enum.join(values, ", ")
          (question["question"] || question["header"] || question["id"]) <> ": " <> answer
        end)

      save(
        s,
        r
        |> Map.update!("messages", &(&1 ++ [message("user", text)]))
        |> Map.put("pendingInput", nil)
        |> Map.put("status", "running")
        |> bump()
      )

      send(s.running[id], {:answer, p})
      {:reply, %{"ok" => true}, s}
    else
      {:reply, {:error, "Run is not awaiting live input; submit a follow-up to resume"}, s}
    end
  end

  def handle_call({:event, id, event}, {pid, _}, s) do
    if s.running[id] != pid do
      {:reply, :ok, s}
    else
      r = fetch(s, id)

      r =
        case event do
          {:text, text} ->
            boundary = r["toolBoundary"]

            Map.update!(r, "messages", fn messages ->
              case List.last(messages) do
                %{"role" => "assistant", "id" => message_id} when message_id != boundary ->
                  List.update_at(
                    messages,
                    -1,
                    &Map.update!(&1, "text", fn old -> old <> text end)
                  )

                _ ->
                  messages ++ [message("assistant", text)]
              end
            end)

          {:tool_start, call} ->
            after_id = List.last(r["messages"])["id"]

            r
            |> Map.put("toolBoundary", after_id)
            |> Map.update(
              "toolCalls",
              [Map.put(call, "afterMessageId", after_id)],
              &(&1 ++ [Map.put(call, "afterMessageId", after_id)])
            )

          {:tool_result, call_id, result} ->
            Map.update!(r, "toolCalls", fn calls ->
              Enum.map(calls, fn call ->
                if call["id"] == call_id,
                  do:
                    Map.merge(call, %{
                      "status" => if(result["isError"] == true, do: "failed", else: "completed"),
                      "result" => result
                    }),
                  else: call
              end)
            end)

          {:patch, patch} ->
            updated = Map.merge(r, patch)

            if patch["status"] in ["failed", "interrupted", "cancelled"],
              do: fail_pending_tools(updated, patch["error"] || "Execution stopped"),
              else: updated
        end
        |> bump()

      save(s, r)
      {:reply, :ok, s}
    end
  end

  def handle_info(:dispatch, s) do
    queued =
      :dets.foldl(
        fn {_, r}, a -> if r["status"] == "queued", do: [r | a], else: a end,
        [],
        s.table
      )
      |> Enum.sort_by(& &1["createdAt"])
      |> Enum.take(max(0, s.limit - map_size(s.running)))

    s =
      Enum.reduce(queued, s, fn r, s ->
        r = Map.put(r, "status", "running") |> bump()
        save(s, r)

        {:ok, pid} =
          Task.Supervisor.start_child(WorkspaceRuntime.Tasks, fn ->
            WorkspaceRuntime.Codex.run(r)
          end)

        Process.monitor(pid)
        %{s | running: Map.put(s.running, r["id"], pid)}
      end)

    {:noreply, s}
  end

  def handle_info({:DOWN, _, :process, pid, reason}, s) do
    case Enum.find(s.running, fn {_, p} -> p == pid end) do
      nil ->
        {:noreply, s}

      {id, _} ->
        r = fetch(s, id)

        if r["status"] in ["running", "waiting_input"],
          do:
            save(
              s,
              Map.merge(r, %{"status" => "failed", "error" => inspect(reason)})
              |> fail_pending_tools("Execution stopped")
              |> bump()
            )

        send(self(), :dispatch)
        {:noreply, %{s | running: Map.delete(s.running, id)}}
    end
  end

  def terminate(_, s), do: :dets.close(s.table)

  defp fetch(s, id),
    do:
      (case :dets.lookup(s.table, id) do
         [{_, r}] -> r
         [] -> nil
       end)

  defp public(r), do: Map.drop(r, ["config", "prompt", "requests", "creation", "toolBoundary"])
  defp maybe_public(nil), do: nil
  defp maybe_public(r), do: public(r)

  defp save(s, r) do
    :ok = :dets.insert(s.table, {r["id"], r})
    :ok = :dets.sync(s.table)
  end

  defp message(role, text),
    do: %{
      "id" => Base.url_encode64(:crypto.strong_rand_bytes(12), padding: false),
      "role" => role,
      "text" => text
    }

  defp active_activity?(_, nil, _), do: false

  defp active_activity?(s, activity, id),
    do:
      :dets.foldl(
        fn {other, r}, found ->
          found or
            (other != id and r["activityId"] == activity and
               r["status"] in ["queued", "running", "waiting_input"])
        end,
        false,
        s.table
      )

  defp fail_pending_tools(r, reason) do
    Map.update(r, "toolCalls", [], fn calls ->
      Enum.map(calls, fn call ->
        if call["status"] == "running",
          do:
            Map.merge(call, %{
              "status" => "failed",
              "result" => %{
                "isError" => true,
                "content" => [%{"type" => "text", "text" => reason}]
              }
            }),
          else: call
      end)
    end)
  end

  defp now, do: System.system_time(:millisecond)
  defp bump(r), do: r |> Map.put("updatedAt", now()) |> Map.update!("version", &(&1 + 1))
end
