defmodule WorkspaceRuntime.ArtifactsTest do
  use ExUnit.Case

  test "artifacts reject traversal, symlink escape and secrets" do
    root = Path.join(System.tmp_dir!(), "artifacts-#{System.unique_integer([:positive])}")
    File.mkdir_p!(root)
    File.write!(Path.join(root, "report.md"), "report")
    File.write!(Path.join(root, ".secret"), "secret")
    File.ln_s!("/etc/passwd", Path.join(root, "escape"))
    assert {:ok, "report"} = WorkspaceRuntime.Artifacts.read(root, "report.md")
    assert {:error, _} = WorkspaceRuntime.Artifacts.read(root, "../etc/passwd")
    assert {:error, _} = WorkspaceRuntime.Artifacts.read(root, "escape")
    assert {:error, _} = WorkspaceRuntime.Artifacts.read(root, ".secret")
    assert [%{"path" => "report.md"}] = WorkspaceRuntime.Artifacts.list(root)
    File.rm_rf!(root)
  end
end
