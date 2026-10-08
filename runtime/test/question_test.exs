defmodule WorkspaceRuntime.QuestionTest do
  use ExUnit.Case

  test "question is durable, wrong answer rejected and correct answer completes" do
    System.put_env("WORKSPACE_CODEX_PATH", Path.expand("test/fixtures/codex-question"))
    id = "question-#{System.unique_integer([:positive])}"
    WorkspaceRuntime.Store.call({:create, %{"id" => id, "prompt" => "hello"}})
    run = await(id, "waiting_input", 100)
    assert run["pendingInput"]["requestId"] == 42

    assert {:error, _} =
             WorkspaceRuntime.Store.call({:answer, id, %{"requestId" => 41, "answers" => %{}}})

    assert %{"ok" => true} =
             WorkspaceRuntime.Store.call(
               {:answer, id,
                %{
                  "requestId" => 42,
                  "answers" => %{
                    "choice" => %{"answers" => ["A"]},
                    "secret" => %{"answers" => ["sensitive-answer"]}
                  }
                }}
             )

    completed = await(id, "review", 100)
    assert completed["status"] == "review"

    assert Enum.any?(
             completed["messages"],
             &(&1["role"] == "user" and &1["text"] == "Which?: A\nPassword?: [redacted]")
           )

    refute Jason.encode!(completed) =~ "sensitive-answer"

    assert {:error, _} =
             WorkspaceRuntime.Store.call({:answer, id, %{"requestId" => 42, "answers" => %{}}})
  end

  defp await(id, _, 0), do: WorkspaceRuntime.Store.call({:get, id})

  defp await(id, status, n) do
    run = WorkspaceRuntime.Store.call({:get, id})

    if run["status"] != status,
      do:
        (
          Process.sleep(20)
          await(id, status, n - 1)
        ),
      else: run
  end
end
