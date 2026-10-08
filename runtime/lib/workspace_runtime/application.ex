defmodule WorkspaceRuntime.Application do
  use Application

  def token do
    case System.get_env("WORKSPACE_RUNTIME_TOKEN_FILE") do
      nil -> System.fetch_env!("WORKSPACE_RUNTIME_TOKEN")
      path -> File.read!(path) |> String.trim()
    end
  end

  def start(_, _) do
    token = token()
    if byte_size(token) < 24, do: raise("WORKSPACE_RUNTIME_TOKEN must have at least 24 bytes")

    children = [
      {Task.Supervisor, name: WorkspaceRuntime.Tasks},
      WorkspaceRuntime.Store,
      {Bandit,
       plug: WorkspaceRuntime.Router,
       ip: {127, 0, 0, 1},
       port: String.to_integer(System.get_env("WORKSPACE_RUNTIME_PORT", "4318"))}
    ]

    # Symphony's agent_runtime_supervisor uses this strategy: scheduler and workers
    # share a lifetime so no surviving worker can lose its scheduling authority.
    Supervisor.start_link(children, strategy: :one_for_all, name: WorkspaceRuntime.Supervisor)
  end
end
