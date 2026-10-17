defmodule WorkspaceRuntime.RouterTest do
  use ExUnit.Case
  import Plug.Test
  import Plug.Conn

  test "account usage requires the runtime bearer token" do
    response =
      conn(:get, "/usage") |> WorkspaceRuntime.Router.call(WorkspaceRuntime.Router.init([]))

    assert response.status == 401
  end

  test "authenticated account usage returns the normalized snapshot" do
    previous = System.get_env("WORKSPACE_CODEX_PATH")
    System.put_env("WORKSPACE_CODEX_PATH", Path.expand("fixtures/codex-usage", __DIR__))

    on_exit(fn ->
      if previous,
        do: System.put_env("WORKSPACE_CODEX_PATH", previous),
        else: System.delete_env("WORKSPACE_CODEX_PATH")
    end)

    response =
      conn(:get, "/usage")
      |> put_req_header("authorization", "Bearer " <> WorkspaceRuntime.Application.token())
      |> WorkspaceRuntime.Router.call(WorkspaceRuntime.Router.init([]))

    assert response.status == 200
    assert %{"status" => "ready", "windows" => [_, _]} = Jason.decode!(response.resp_body)
  end

  test "unknown execution stream returns 404 before opening SSE" do
    response =
      conn(:get, "/runs/missing-run/events")
      |> put_req_header("authorization", "Bearer " <> WorkspaceRuntime.Application.token())
      |> WorkspaceRuntime.Router.call(WorkspaceRuntime.Router.init([]))

    assert response.status == 404
    refute get_resp_header(response, "content-type") == ["text/event-stream; charset=utf-8"]
  end
end
