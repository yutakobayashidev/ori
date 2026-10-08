defmodule WorkspaceRuntime.RestartTest do
  use ExUnit.Case

  test "restart retains pending question and thread but does not replay work" do
    id = "restart-#{System.unique_integer([:positive])}"

    record = %{
      "id" => id,
      "status" => "waiting_input",
      "threadId" => "saved-thread",
      "pendingInput" => %{"requestId" => 42, "questions" => []},
      "messages" => [],
      "toolCalls" => [
        %{
          "id" => "unfinished",
          "status" => "running",
          "name" => "save_reply_draft",
          "arguments" => %{}
        }
      ],
      "version" => 1
    }

    :ok = :dets.insert(:runs, {id, record})
    :ok = :dets.sync(:runs)
    :ok = Supervisor.terminate_child(WorkspaceRuntime.Supervisor, WorkspaceRuntime.Store)
    {:ok, _} = Supervisor.restart_child(WorkspaceRuntime.Supervisor, WorkspaceRuntime.Store)
    run = WorkspaceRuntime.Store.call({:get, id})
    assert run["status"] == "interrupted"
    assert run["threadId"] == "saved-thread"
    assert run["pendingInput"]["requestId"] == 42
    assert [%{"status" => "failed", "result" => %{"isError" => true}}] = run["toolCalls"]
  end
end
