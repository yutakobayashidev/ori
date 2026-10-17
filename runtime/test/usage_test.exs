defmodule WorkspaceRuntime.UsageTest do
  use ExUnit.Case
  alias WorkspaceRuntime.{Usage, CodexUsage}

  @window %{
    "id" => "primary",
    "usedPercent" => 32,
    "windowDurationMins" => 300,
    "resetsAt" => nil
  }

  test "successful readings refresh after two minutes without a reset timestamp" do
    start = ~U[2030-01-01 00:00:00Z]
    {:ok, clock} = Agent.start_link(fn -> start end)
    {:ok, calls} = Agent.start_link(fn -> 0 end)

    reader = fn ->
      n = Agent.get_and_update(calls, fn n -> {n, n + 1} end)
      {:ok, [%{@window | "usedPercent" => n}]}
    end

    server =
      start_supervised!(
        {Usage, name: nil, reader: reader, clock: fn -> Agent.get(clock, & &1) end}
      )

    first = Usage.read(server)
    Agent.update(clock, fn _ -> DateTime.add(start, 119) end)
    assert Usage.read(server) == first
    Agent.update(clock, fn _ -> DateTime.add(start, 120) end)
    assert [%{"usedPercent" => 1}] = Usage.read(server)["windows"]
  end

  test "coalesces simultaneous requests and caches successful reads" do
    {:ok, calls} = Agent.start_link(fn -> 0 end)

    reader = fn ->
      Agent.update(calls, &(&1 + 1))
      Process.sleep(30)
      {:ok, [@window]}
    end

    server = start_supervised!({Usage, name: nil, reader: reader})

    results =
      1..10
      |> Enum.map(fn _ -> Task.async(fn -> Usage.read(server) end) end)
      |> Enum.map(&Task.await/1)

    assert Enum.all?(results, &(&1["status"] == "ready"))
    assert Agent.get(calls, & &1) == 1
    assert Usage.read(server) == hd(results)
  end

  test "expires on reset, keeps last successful snapshot on failure, and retries after failure TTL" do
    start = ~U[2030-01-01 00:00:00Z]
    {:ok, clock} = Agent.start_link(fn -> start end)
    {:ok, calls} = Agent.start_link(fn -> 0 end)
    window = %{@window | "resetsAt" => "2030-01-01T00:00:30Z"}

    reader = fn ->
      n = Agent.get_and_update(calls, fn n -> {n, n + 1} end)
      if n == 0, do: {:ok, [window]}, else: {:error, :timeout}
    end

    server =
      start_supervised!(
        {Usage, name: nil, reader: reader, clock: fn -> Agent.get(clock, & &1) end}
      )

    ready = Usage.read(server)
    Agent.update(clock, fn _ -> DateTime.add(start, 29) end)
    assert Usage.read(server) == ready
    Agent.update(clock, fn _ -> DateTime.add(start, 30) end)
    stale = Usage.read(server)
    assert stale == %{ready | "status" => "unavailable"}
    Agent.update(clock, fn _ -> DateTime.add(start, 89) end)
    assert Usage.read(server) == stale
    assert Agent.get(calls, & &1) == 2
    Agent.update(clock, fn _ -> DateTime.add(start, 90) end)
    Usage.read(server)
    assert Agent.get(calls, & &1) == 3
  end

  test "empty readings and exceptions are unavailable with no invented usage" do
    for reader <- [fn -> {:ok, []} end, fn -> raise "offline" end] do
      {:ok, server} = Usage.start_link(name: nil, reader: reader)

      assert Usage.read(server) == %{
               "status" => "unavailable",
               "fetchedAt" => nil,
               "windows" => []
             }

      GenServer.stop(server)
    end
  end

  test "normalizes the Codex bucket and ignores other model quotas" do
    result = %{
      "rateLimits" => %{"primary" => %{"usedPercent" => 99, "windowDurationMins" => 300}},
      "rateLimitsByLimitId" => %{
        "codex" => %{
          "secondary" => %{
            "usedPercent" => 61,
            "windowDurationMins" => 10080,
            "resetsAt" => 2_000_000_000
          }
        }
      }
    }

    assert {:ok,
            [%{"id" => "secondary", "usedPercent" => 61, "resetsAt" => "2033-05-18T03:33:20Z"}]} =
             CodexUsage.parse(result)

    assert {:error, :unavailable} = CodexUsage.parse(%{"rateLimits" => %{}})

    assert {:error, :unavailable} =
             CodexUsage.parse(%{"rateLimits" => %{"primary" => %{"usedPercent" => 0}}})
  end

  test "read-only app-server handshake returns account windows and closes the port" do
    before = MapSet.new(Port.list())

    assert {:ok, [primary, secondary]} =
             CodexUsage.read(binary: Path.expand("fixtures/codex-usage", __DIR__))

    assert primary["usedPercent"] == 32
    assert secondary["windowDurationMins"] == 10080
    assert MapSet.new(Port.list()) == before
  end

  test "missing executable and unresponsive process fail without leaving a port" do
    assert {:error, :unavailable} = CodexUsage.read(binary: "/does/not/exist")
    before = MapSet.new(Port.list())

    assert {:error, :timeout} =
             CodexUsage.read(binary: Path.expand("fixtures/codex-hold", __DIR__), timeout: 20)

    assert MapSet.new(Port.list()) == before
  end

  test "account RPC errors produce unavailable without leaking upstream details" do
    assert {:error, :unavailable} =
             CodexUsage.read(binary: Path.expand("fixtures/codex-usage-error", __DIR__))
  end
end
