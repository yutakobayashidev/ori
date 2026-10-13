import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { devNull } from "node:os";
import { fileURLToPath } from "node:url";

// Exercise the built image in a fresh project; never reuse the owner's volume.
const listener = createServer();
await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const origin = `http://localhost:${port}`;
const base = `http://127.0.0.1:${port}`;
const project = `ori-smoke-${process.pid}`;
const env = {
  ...process.env,
  ORI_PORT: String(port),
  ORI_ORIGIN: origin,
  TWITTER_RELAY_BASE_URL: "",
  RDT_GATEWAY_URL: "",
  TWITTER_LITE_MASTODON_ORIGINS: "",
  TWITTER_LITE_CREDENTIAL_KEY_FILE: "",
};
const cwd = fileURLToPath(new URL("..", import.meta.url));
function compose(...args) {
  return execFileSync(
    "docker",
    ["compose", "--env-file", devNull, "-f", "compose.yaml", "-p", project, ...args],
    { cwd, env, encoding: "utf8", timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
  );
}
function inWeb(...args) {
  return compose("exec", "-T", "web", ...args);
}
let cookie = "";
async function auth(body, requestOrigin = origin) {
  const response = await fetch(`${base}/api/auth`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: requestOrigin,
      cookie,
      connection: "close",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const nextCookie = response.headers.get("set-cookie");
  if (nextCookie) cookie = nextCookie.split(";")[0];
  return response;
}
async function state() {
  const response = await fetch(`${base}/api/auth`, {
    headers: { cookie, connection: "close" },
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.status, 200);
  return response.json();
}

try {
  compose("up", "-d", "--no-build", "--wait", "--wait-timeout", "90");
  assert.equal(inWeb("id", "-u").trim(), "1000");
  assert.equal((await state()).needsSetup, true);
  assert.equal(
    (
      await fetch(`${base}/board`, {
        redirect: "manual",
        headers: { accept: "text/html", connection: "close" },
      })
    ).status,
    303,
  );
  const setupToken = inWeb("node", ".output/server/tools/account-setup.js")
    .trim()
    .split("\n")
    .at(-1);
  const owner = { email: "smoke@example.invalid", password: "isolated-container-test-password" };
  assert.equal((await auth({ action: "setup" }, "https://untrusted.invalid")).status, 403);
  assert.equal(
    (await auth({ action: "setup", ...owner, name: "Ori smoke", setupToken })).status,
    200,
  );
  assert.equal((await auth({ action: "onboard", name: "Ori smoke" })).status, 200);
  for (const path of ["/", "/board", "/support", "/browse", "/deck", "/history"]) {
    const response = await fetch(`${base}${path}`, {
      headers: { cookie, accept: "text/html", connection: "close" },
      signal: AbortSignal.timeout(15_000),
    });
    assert.equal(response.status, 200, `${path} should render without integrations`);
    assert.match(await response.text(), /<html/);
  }
  inWeb("node", ".output/server/tools/backup-database.js", "/data/smoke-backup.sqlite");
  compose("up", "-d", "--no-build", "--force-recreate", "--wait", "--wait-timeout", "90");
  assert.equal((await state()).owner.name, "Ori smoke", "session and owner survive recreation");
  assert.equal((await auth({ action: "logout" })).status, 200);
  assert.equal((await state()).owner, null);
  assert.equal((await auth({ action: "login", ...owner })).status, 200);
  assert.equal((await state()).needsSetup, false);
  console.log(
    "Docker smoke passed: setup, login, origins, pages, backup, and persistent sessions.",
  );
} catch (error) {
  console.error(compose("logs", "--tail", "80", "web"));
  throw error;
} finally {
  compose("down", "--volumes", "--remove-orphans");
}
