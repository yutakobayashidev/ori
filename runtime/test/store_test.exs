defmodule WorkspaceRuntime.StoreTest do
  use ExUnit.Case

  test "persists cancelled runs and deduplicates create" do
    id = "check-#{System.unique_integer([:positive])}"
    first = WorkspaceRuntime.Store.call({:create, %{"id" => id, "prompt" => "hello"}})
    assert first["status"] == "queued"
    WorkspaceRuntime.Store.call({:stop, id})
    again = WorkspaceRuntime.Store.call({:create, %{"id" => id, "prompt" => "hello"}})
    assert again["status"] == "cancelled"
    assert hd(again["messages"])["text"] == "hello"
  end

  test "rejects traversal in run id" do
    assert {:error, _} =
             WorkspaceRuntime.Store.call({:create, %{"id" => "../bad", "prompt" => "hello"}})
  end

  test "invalid workspace does not crash scheduler or interrupt existing records" do
    pid = Process.whereis(WorkspaceRuntime.Store)

    assert {:error, _} =
             WorkspaceRuntime.Store.call(
               {:create,
                %{
                  "id" => "invalid-cwd",
                  "prompt" => "hello",
                  "cwd" => "/dev/null/child"
                }}
             )

    assert Process.whereis(WorkspaceRuntime.Store) == pid

    assert {:error, _} =
             WorkspaceRuntime.Store.call(
               {:create,
                %{
                  "id" => "invalid-config",
                  "prompt" => "hello",
                  "config" => []
                }}
             )

    assert Process.whereis(WorkspaceRuntime.Store) == pid
  end
end
