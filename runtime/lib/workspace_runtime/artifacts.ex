defmodule WorkspaceRuntime.Artifacts do
  @limit 8 * 1024 * 1024
  def list(cwd) do
    Path.wildcard(Path.join(cwd, "**/*"))
    |> Enum.filter(&File.regular?/1)
    |> Enum.take(1000)
    |> Enum.flat_map(fn path ->
      case safe(cwd, Path.relative_to(path, cwd)) do
        {:ok, path} -> [%{"path" => Path.relative_to(path, cwd), "size" => File.stat!(path).size}]
        _ -> []
      end
    end)
  end

  def read(cwd, path) do
    with {:ok, path} <- safe(cwd, path),
         {:ok, %{size: size, type: :regular}} <- File.stat(path),
         true <- size <= @limit,
         {:ok, body} <- File.read(path) do
      {:ok, body}
    else
      _ -> {:error, "Artifact unavailable or exceeds 8 MiB"}
    end
  end

  defp safe(cwd, path) do
    with false <- Path.type(path) == :absolute,
         {:ok, root} <- SymphonyElixir.PathSafety.canonicalize(cwd),
         {:ok, full} <- SymphonyElixir.PathSafety.canonicalize(Path.join(root, path)),
         true <- String.starts_with?(full, root <> "/"),
         false <-
           Enum.any?(Path.split(Path.relative_to(full, root)), &String.starts_with?(&1, ".")) do
      {:ok, full}
    else
      _ -> {:error, "Invalid artifact path"}
    end
  end
end
