defmodule WorkspaceRuntime.McpToolsTest do
  use ExUnit.Case
  alias WorkspaceRuntime.Store

  test "MCP results retain app metadata and conversation ordering across restart" do
    id = create()
    run = await(id, "review")
    assert [%{"text" => "hello"}, before, %{"text" => "After"}] = run["messages"]
    assert before["text"] == "Before"
    assert [call] = run["toolCalls"]
    assert call["afterMessageId"] == before["id"]
    assert call["name"] == "update_activity_progress"
    assert call["status"] == "completed"
    assert call["result"]["_meta"]["ui"]["resourceUri"] == "ui://draft"
    assert call["result"]["_meta"]["workspace"]["toolName"] == "get_activity_context"
    assert call["result"]["structuredContent"] == %{"draft" => "draft"}
    :ok = Supervisor.terminate_child(WorkspaceRuntime.Supervisor, Store)
    {:ok, _} = Supervisor.restart_child(WorkspaceRuntime.Supervisor, Store)
    assert Store.call({:get, id})["toolCalls"] == run["toolCalls"]
  end

  test "MCP failure is a persisted tool error and the agent can finish" do
    id = create("failure")
    run = await(id, "review")
    assert [call] = run["toolCalls"]
    assert call["status"] == "failed"
    assert call["result"]["isError"]
    assert hd(call["result"]["content"])["text"] == "Revision conflict"
  end

  test "cancelling an MCP call fails pending records" do
    id = create("hold")
    wait_call(id)
    run = Store.call({:stop, id})
    assert run["status"] == "cancelled"
    assert [call] = run["toolCalls"]
    assert call["status"] == "failed"
    assert call["result"]["isError"]
  end

  test "followups resume the saved thread with fresh MCP configuration" do
    id = create()
    run = await(id, "review")

    Store.call(
      {:message, id,
       %{"requestId" => "follow", "text" => "Continue", "config" => %{"mcpServers" => %{}}}}
    )

    await(id, "review")

    protocol =
      Path.join(run["cwd"], "protocol.jsonl")
      |> File.read!()
      |> String.split("\n", trim: true)
      |> Enum.map(&Jason.decode!/1)

    assert Enum.any?(
             protocol,
             &(&1["method"] == "thread/resume" && &1["params"]["threadId"] == "mcp-thread")
           )

    refute Enum.any?(protocol, &Map.has_key?(&1["params"] || %{}, "dynamicTools"))
  end

  defp create(marker \\ nil) do
    System.put_env("WORKSPACE_CODEX_PATH", Path.expand("test/fixtures/codex-mcp"))
    id = "mcp-#{System.unique_integer([:positive])}"
    cwd = Path.join(System.fetch_env!("WORKSPACE_RUNTIME_ROOT"), id)
    File.mkdir_p!(cwd)
    if marker, do: File.write!(Path.join(cwd, marker), "")

    Store.call(
      {:create,
       %{"id" => id, "cwd" => cwd, "prompt" => "hello", "config" => %{"mcpServers" => %{}}}}
    )

    on_exit(fn -> Store.call({:stop, id}) end)
    id
  end

  defp wait_call(id, count \\ 100)
  defp wait_call(_id, 0), do: flunk("MCP call did not start")

  defp wait_call(id, count) do
    if (Store.call({:get, id})["toolCalls"] || []) == [] do
      Process.sleep(20)
      wait_call(id, count - 1)
    end
  end

  defp await(id, status, count \\ 100)
  defp await(_id, _status, 0), do: flunk("Run did not reach expected status")

  defp await(id, status, count) do
    run = Store.call({:get, id})

    if run["status"] == status do
      run
    else
      Process.sleep(20)
      await(id, status, count - 1)
    end
  end
end
