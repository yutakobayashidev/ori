import { build } from "vite";

for (const entry of ["backup-database", "account-setup"]) {
  await build({
    configFile: false,
    build: {
      ssr: `scripts/${entry}.ts`,
      outDir: ".output/server/tools",
      emptyOutDir: false,
      rollupOptions: { external: ["better-sqlite3"] },
    },
  });
}
