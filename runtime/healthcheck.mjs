import { readFileSync } from "node:fs";

const token = readFileSync(process.env.WORKSPACE_RUNTIME_TOKEN_FILE, "utf8").trim();
const response = await fetch(`http://127.0.0.1:${process.env.WORKSPACE_RUNTIME_PORT}/runs`, {
  headers: { Authorization: `Bearer ${token}` },
  signal: AbortSignal.timeout(4000),
});
if (!response.ok) process.exit(1);
