import { build } from 'vite'

await build({
  configFile: false,
  build: {
    ssr: 'scripts/backup-database.ts',
    outDir: '.output/server/tools',
    rollupOptions: { external: ['better-sqlite3'] },
  },
})
