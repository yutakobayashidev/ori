defmodule WorkspaceRuntime.CodexTest do
  use ExUnit.Case

  test "Codex protocol stores thread, streamed response, and review state" do
    System.put_env("WORKSPACE_CODEX_PATH", Path.expand("test/fixtures/codex"))
    id = "protocol-#{System.unique_integer([:positive])}"
    request = %{"id" => id, "prompt" => "hello"}
    WorkspaceRuntime.Store.call({:create, request})
    run = await(id, 100)
    assert run["status"] == "review"
    assert run["threadId"] == "thread-fixture"
    assert List.last(run["messages"])["text"] == "Hello world"
    assert is_binary(List.last(run["messages"])["id"])
    assert WorkspaceRuntime.Store.call({:stop, id})["status"] == "review"

    assert {:error, _} =
             WorkspaceRuntime.Store.call({:create, Map.put(request, "prompt", "different")})
  end

  defp await(id, 0), do: WorkspaceRuntime.Store.call({:get, id})

  defp await(id, n) do
    run = WorkspaceRuntime.Store.call({:get, id})

    if run["status"] in ["queued", "running"],
      do:
        (
          Process.sleep(20)
          await(id, n - 1)
        ),
      else: run
  end
end
