import { spawn, spawnSync } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

// This process is independent of Vite / the web backend. Keep it running while
// restarting the app. Codex owns its own login and refreshes that login normally.
const reportRoot = resolve(
  process.env.TWITTER_LITE_REPORT_ROOT || '.data/research',
)
const endpoint = new URL(
  process.env.TWITTER_LITE_CODEX_URL || 'ws://127.0.0.1:4500',
)
if (
  endpoint.protocol !== 'ws:' ||
  endpoint.hostname !== '127.0.0.1' ||
  endpoint.username ||
  endpoint.password
) {
  throw new Error('The prototype Codex endpoint must be ws://127.0.0.1:<port>.')
}
await mkdir(reportRoot, { recursive: true, mode: 0o700 })
const env = {
  HOME: homedir(),
  PATH: process.env.PATH,
  CODEX_HOME: process.env.CODEX_HOME || resolve(homedir(), '.codex'),
}
for (const name of [
  'LANG',
  'LC_ALL',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NIX_SSL_CERT_FILE',
  'TMPDIR',
]) {
  if (process.env[name]) env[name] = process.env[name]
}
// Enumerate the effective config, including CLI-wrapper and project settings.
// Keep this output private: MCP transport settings can contain credentials.
const configured = spawnSync('codex', ['mcp', 'list', '--json'], {
  cwd: reportRoot,
  env,
  encoding: 'utf8',
  timeout: 15_000,
  maxBuffer: 4 * 1024 * 1024,
})
let mcpOverrides
try {
  if (configured.error || configured.status !== 0) throw new Error()
  const servers = JSON.parse(configured.stdout)
  if (!Array.isArray(servers)) throw new Error()
  mcpOverrides = servers.flatMap((server) => {
    if (
      typeof server?.name !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(server.name)
    )
      throw new Error()
    return ['-c', `mcp_servers.${server.name}.enabled=false`]
  })
} catch {
  throw new Error(
    'Could not inspect Codex MCP configuration safely. Check codex mcp list locally.',
  )
}
const child = spawn(
  'codex',
  [
    // Keep overrides before the subcommand so they merge with wrapper settings.
    '-c',
    'shell_environment_policy.inherit="none"',
    '-c',
    'features.multi_agent=false',
    '-c',
    'features.hooks=false',
    '-c',
    'web_search="disabled"',
    ...mcpOverrides,
    'app-server',
    '--listen',
    endpoint.origin,
  ],
  { cwd: reportRoot, env, stdio: 'inherit' },
)
child.on('error', () => {
  console.error(
    'Could not start Codex. Install codex and run codex login first.',
  )
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => child.kill(signal))
