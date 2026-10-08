defmodule WorkspaceRuntime.MixProject do
  use Mix.Project

  def project,
    do: [
      app: :workspace_runtime,
      aliases: [test: "test --no-start"],
      version: "0.1.0",
      elixir: "~> 1.18",
      deps: [{:bandit, "~> 1.8"}, {:plug, "~> 1.18"}, {:jason, "~> 1.4"}]
    ]

  def application,
    do: [
      mod: {WorkspaceRuntime.Application, []},
      extra_applications: [:logger, :crypto, :inets, :ssl]
    ]
end
