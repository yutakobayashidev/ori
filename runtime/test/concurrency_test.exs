defmodule WorkspaceRuntime.ConcurrencyTest do
  use ExUnit.Case

  test "global limit queues FIFO and cancellation frees exactly one slot" do
    System.put_env("WORKSPACE_CODEX_PATH", Path.expand("test/fixtures/codex-hold"))
    ids = Enum.map(1..4, fn n -> "queue-#{System.unique_integer([:positive])}-#{n}" end)
    on_exit(fn -> Enum.each(ids, &WorkspaceRuntime.Store.call({:stop, &1})) end)

    Enum.each(ids, fn id ->
      WorkspaceRuntime.Store.call({:create, %{"id" => id, "prompt" => "hold"}})
      Process.sleep(5)
    end)

    [first, second, third, fourth] = ids
    assert await_status(first, "running")["status"] == "running"
    assert await_status(second, "running")["status"] == "running"
    assert WorkspaceRuntime.Store.call({:get, third})["status"] == "queued"
    assert WorkspaceRuntime.Store.call({:get, fourth})["status"] == "queued"
    WorkspaceRuntime.Store.call({:stop, first})
    assert await_status(third, "running")["status"] == "running"
    assert WorkspaceRuntime.Store.call({:get, fourth})["status"] == "queued"
    WorkspaceRuntime.Store.call({:stop, second})
    assert await_status(fourth, "running")["status"] == "running"
  end

  test "followup request replay does not duplicate a message and mismatched reuse fails" do
    System.put_env("WORKSPACE_CODEX_PATH", Path.expand("test/fixtures/codex-hold"))
    id = "followup-#{System.unique_integer([:positive])}"
    on_exit(fn -> WorkspaceRuntime.Store.call({:stop, id}) end)
    WorkspaceRuntime.Store.call({:create, %{"id" => id, "prompt" => "first"}})
    WorkspaceRuntime.Store.call({:stop, id})
    request = %{"requestId" => "same-request", "text" => "followup"}
    WorkspaceRuntime.Store.call({:message, id, request})
    replay = WorkspaceRuntime.Store.call({:message, id, request})

    assert Enum.count(replay["messages"], &(&1["role"] == "user" and &1["text"] == "followup")) ==
             1

    assert {:error, _} =
             WorkspaceRuntime.Store.call({:message, id, Map.put(request, "text", "different")})
  end

  defp await_status(id, status, n \\ 100)
  defp await_status(id, _, 0), do: WorkspaceRuntime.Store.call({:get, id})

  defp await_status(id, status, n) do
    run = WorkspaceRuntime.Store.call({:get, id})

    if run["status"] == status,
      do: run,
      else:
        (
          Process.sleep(10)
          await_status(id, status, n - 1)
        )
  end

  test "activity claim is atomic and stale workers cannot overwrite cancellation" do
    System.put_env("WORKSPACE_CODEX_PATH", Path.expand("test/fixtures/codex"))
    suffix = System.unique_integer([:positive])
    activity = "activity-#{suffix}"
    first = "claim-a-#{suffix}"
    second = "claim-b-#{suffix}"

    WorkspaceRuntime.Store.call(
      {:create, %{"id" => first, "activityId" => activity, "prompt" => "hold"}}
    )

    assert {:error, _} =
             WorkspaceRuntime.Store.call(
               {:create, %{"id" => second, "activityId" => activity, "prompt" => "hold"}}
             )

    WorkspaceRuntime.Store.call({:stop, first})
    WorkspaceRuntime.Store.event(first, {:patch, %{"status" => "review"}})
    assert WorkspaceRuntime.Store.call({:get, first})["status"] == "cancelled"

    assert {:error, _} =
             WorkspaceRuntime.Store.call({:answer, first, %{"requestId" => 1, "answers" => %{}}})
  end
end
