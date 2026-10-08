defmodule WorkspaceRuntime.DynamicCallback do
  import Plug.Conn
  def init(options), do: options

  def call(conn, options) do
    {:ok, body, conn} = read_body(conn)
    send(options[:test], {:callback, Jason.decode!(body)})
    if options[:hold], do: Process.sleep(2_000)

    result = %{
      "content" => [%{"type" => "text", "text" => "Saved"}],
      "structuredContent" => %{"draft" => "draft"},
      "_meta" => %{"ui" => %{"resourceUri" => "ui://draft"}}
    }

    conn
    |> put_resp_content_type("application/json")
    |> send_resp(options[:status] || 200, Jason.encode!(result))
  end
end

defmodule WorkspaceRuntime.DynamicToolsTest do
  use ExUnit.Case
  alias WorkspaceRuntime.Store

  test "dynamic callback persists full app result between assistant messages and survives restart" do
    id = create()

    assert_receive {:callback,
                    %{
                      "toolCallId" => "call-draft",
                      "name" => "save_reply_draft",
                      "arguments" => %{"text" => "draft"}
                    }},
                   2000

    run = await(id, "review")
    refute_receive {:callback, _}, 50
    assert [%{"text" => "hello"}, before, %{"text" => "After"}] = run["messages"]
    assert before["text"] == "Before"
    assert [call] = run["toolCalls"]
    assert call["afterMessageId"] == before["id"]
    assert call["status"] == "completed"
    assert call["result"]["_meta"]["ui"]["resourceUri"] == "ui://draft"
    assert call["result"]["structuredContent"] == %{"draft" => "draft"}

    :ok = Supervisor.terminate_child(WorkspaceRuntime.Supervisor, Store)
    {:ok, _} = Supervisor.restart_child(WorkspaceRuntime.Supervisor, Store)
    assert Store.call({:get, id})["toolCalls"] == run["toolCalls"]
  end

  test "callback HTTP failure is a persisted tool error and agent can finish" do
    id = create(status: 500)
    assert_receive {:callback, _}, 2000
    run = await(id, "review")
    assert [call] = run["toolCalls"]
    assert call["status"] == "failed"
    assert call["result"]["isError"]
  end

  test "cancelling during callback finishes pending record without accepting late result" do
    id = create(hold: true)
    assert_receive {:callback, _}, 2000
    run = Store.call({:stop, id})
    assert run["status"] == "cancelled"
    assert [call] = run["toolCalls"]
    assert call["status"] == "failed"
    assert call["result"]["isError"]
    Process.sleep(50)
    assert Store.call({:get, id}) == run
  end

  test "legacy conversation upgrades once with context then resumes the new thread" do
    System.put_env("WORKSPACE_CODEX_PATH", Path.expand("test/fixtures/codex"))
    id = "upgrade-#{System.unique_integer([:positive])}"
    Store.call({:create, %{"id" => id, "prompt" => "Original request"}})
    old = await(id, "review")
    assert old["threadId"] == "thread-fixture"
    System.put_env("WORKSPACE_CODEX_PATH", Path.expand("test/fixtures/codex-dynamic"))

    config = %{
      "dynamicTools" => [
        %{
          "name" => "save_reply_draft",
          "description" => "Draft",
          "inputSchema" => %{"type" => "object"}
        }
      ],
      "toolEndpoint" => "http://127.0.0.1:1/tool"
    }

    Store.call(
      {:message, id, %{"requestId" => "upgrade", "text" => "New request", "config" => config}}
    )

    upgraded = await(id, "review")
    assert upgraded["threadId"] == "dynamic-thread"
    [start, turn] = protocol(upgraded["cwd"])
    assert start["method"] == "thread/start"
    assert turn["params"]["input"] |> hd() |> Map.fetch!("text") =~ "Original request"
    assert turn["params"]["input"] |> hd() |> Map.fetch!("text") =~ "Hello world"
    assert Enum.at(upgraded["messages"], 2)["text"] == "New request"

    Store.call(
      {:message, id, %{"requestId" => "follow", "text" => "Continue", "config" => config}}
    )

    resumed = await(id, "review")
    assert [_, _, %{"method" => "thread/resume"}, _] = protocol(resumed["cwd"])
  end

  defp protocol(cwd) do
    Path.join(cwd, "protocol.jsonl")
    |> File.read!()
    |> String.split("\n", trim: true)
    |> Enum.map(&Jason.decode!/1)
    |> Enum.filter(&(&1["method"] in ["thread/start", "thread/resume", "turn/start"]))
  end

  defp create(options \\ []) do
    System.put_env("WORKSPACE_CODEX_PATH", Path.expand("test/fixtures/codex-dynamic"))

    server =
      start_supervised!(
        {Bandit,
         plug: {WorkspaceRuntime.DynamicCallback, [{:test, self()} | options]},
         ip: {127, 0, 0, 1},
         port: 0}
      )

    {:ok, {_address, port}} = ThousandIsland.listener_info(server)
    id = "dynamic-#{System.unique_integer([:positive])}"

    config = %{
      "toolEndpoint" => "http://127.0.0.1:#{port}/tool",
      "dynamicTools" => [
        %{
          "name" => "save_reply_draft",
          "description" => "Save draft",
          "inputSchema" => %{"type" => "object"}
        }
      ]
    }

    Store.call({:create, %{"id" => id, "prompt" => "hello", "config" => config}})
    on_exit(fn -> Store.call({:stop, id}) end)
    id
  end

  defp await(id, status, count \\ 100)
  defp await(id, _status, 0), do: Store.call({:get, id})

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
