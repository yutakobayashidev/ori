defmodule WorkspaceRuntime.Router do
  use Plug.Router
  plug(:auth)
  plug(Plug.Parsers, parsers: [:json], json_decoder: Jason, length: 1_048_576)
  plug(:match)
  plug(:dispatch)

  defp auth(conn, _) do
    expected = "Bearer " <> WorkspaceRuntime.Application.token()

    if Plug.Conn.get_req_header(conn, "authorization") == [expected],
      do: conn,
      else: conn |> send_resp(401, "Unauthorized") |> halt()
  end

  get "/health" do
    json(conn, %{"ok" => true})
  end

  get "/runs" do
    json(conn, WorkspaceRuntime.Store.call(:list))
  end

  post "/runs" do
    json(conn, WorkspaceRuntime.Store.call({:create, conn.body_params}))
  end

  get "/runs/:id/artifacts" do
    conn = fetch_query_params(conn)

    case WorkspaceRuntime.Store.call({:get, id}) do
      nil ->
        send_resp(conn, 404, "Not found")

      run ->
        case WorkspaceRuntime.Artifacts.read(run["cwd"], conn.query_params["path"] || "") do
          {:ok, body} ->
            conn |> put_resp_content_type("application/octet-stream") |> send_resp(200, body)

          {:error, error} ->
            json(conn, {:error, error})
        end
    end
  end

  get "/runs/:id" do
    json(conn, WorkspaceRuntime.Store.call({:get, id}))
  end

  post "/runs/:id/messages" do
    json(conn, WorkspaceRuntime.Store.call({:message, id, conn.body_params}))
  end

  post "/runs/:id/stop" do
    json(conn, WorkspaceRuntime.Store.call({:stop, id}))
  end

  post "/runs/:id/answers" do
    json(conn, WorkspaceRuntime.Store.call({:answer, id, conn.body_params}))
  end

  get "/runs/:id/events" do
    case WorkspaceRuntime.Store.call({:get, id}) do
      nil ->
        send_resp(conn, 404, "Not found")

      _ ->
        conn =
          conn
          |> put_resp_content_type("text/event-stream")
          |> put_resp_header("cache-control", "no-cache")
          |> send_chunked(200)

        stream(conn, id, nil)
    end
  end

  match _ do
    send_resp(conn, 404, "Not found")
  end

  defp stream(conn, id, last) do
    run = WorkspaceRuntime.Store.call({:get, id})

    if is_nil(run) do
      conn
    else
      result =
        if run["version"] != last,
          do: chunk(conn, "event: snapshot\ndata: " <> Jason.encode!(run) <> "\n\n"),
          else: chunk(conn, ": heartbeat\n\n")

      case result do
        {:ok, conn} ->
          if run["status"] in ["review", "failed", "cancelled", "interrupted"],
            do: conn,
            else:
              (
                Process.sleep(300)
                stream(conn, id, run["version"])
              )

        {:error, _} ->
          conn
      end
    end
  end

  defp json(conn, {:error, message}),
    do:
      conn
      |> put_resp_content_type("application/json")
      |> send_resp(409, Jason.encode!(%{error: message}))

  defp json(conn, nil), do: send_resp(conn, 404, "Not found")

  defp json(conn, data),
    do: conn |> put_resp_content_type("application/json") |> send_resp(200, Jason.encode!(data))
end
