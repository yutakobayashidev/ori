ExUnit.start()

root =
  Path.join(System.tmp_dir!(), "workspace-runtime-tests-#{System.unique_integer([:positive])}")

System.put_env("WORKSPACE_RUNTIME_ROOT", root)
System.put_env("WORKSPACE_RUNTIME_TOKEN", "runtime-test-token-0123456789")
System.delete_env("WORKSPACE_RUNTIME_TOKEN_FILE")
System.put_env("WORKSPACE_RUNTIME_PORT", "0")
Application.ensure_all_started(:workspace_runtime)

ExUnit.after_suite(fn _ ->
  Application.stop(:workspace_runtime)
  File.rm_rf!(root)
end)
