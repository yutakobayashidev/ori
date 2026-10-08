defmodule WorkspaceRuntime.RouterTest do
  use ExUnit.Case
  import Plug.Test
  import Plug.Conn

  test "unknown execution stream returns 404 before opening SSE" do
    response =
      conn(:get, "/runs/missing-run/events")
      |> put_req_header("authorization", "Bearer " <> WorkspaceRuntime.Application.token())
      |> WorkspaceRuntime.Router.call(WorkspaceRuntime.Router.init([]))

    assert response.status == 404
    refute get_resp_header(response, "content-type") == ["text/event-stream; charset=utf-8"]
  end
end
