defmodule WorkspaceRuntime.ConcurrencyTest do
  use ExUnit.Case

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
