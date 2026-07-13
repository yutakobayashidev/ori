import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { createServer } from 'vite'

const server = await createServer({
  configFile: false,
  plugins: [tanstackStart()],
  server: { middlewareMode: true },
})
await server.close()
