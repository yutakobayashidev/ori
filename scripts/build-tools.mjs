import { build } from "vite";

for (const entry of ["backup-database", "account-setup", "events-worker"]) {
  await build({
    configFile: false,
    ssr: { noExternal: true, external: ["better-sqlite3"] },
    build: {
      ssr: `scripts/${entry}.ts`,
      outDir: ".output/server/tools",
      emptyOutDir: false,
      rollupOptions: { external: ["better-sqlite3"] },
    },
  });
}
