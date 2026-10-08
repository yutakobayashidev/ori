import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { build, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// A separate client build keeps TanStack Start/Nitro and the MCP server SDK out
// of the iframe. The resulting HTML is embedded in the server bundle.
export function mcpApp(): Plugin {
  const id = "\0virtual:workspace-mcp-app";
  let html: Promise<string> | undefined;
  async function bundle() {
    const result = await build({
      configFile: false,
      plugins: [tailwindcss(), react(), viteSingleFile()],
      resolve: { alias: { "#": resolve("src") } },
      logLevel: "warn",
      build: {
        write: false,
        rollupOptions: { input: resolve("src/features/mcp-app/index.html") },
      },
    });
    if (Array.isArray(result) || !("output" in result)) throw new Error("MCP App build failed");
    const asset = result.output.find(
      (item) => item.type === "asset" && item.fileName.endsWith(".html"),
    );
    if (!asset || asset.type !== "asset") throw new Error("MCP App HTML missing");
    return String(asset.source);
  }
  return {
    name: "workspace-mcp-app",
    resolveId(source) {
      if (source === "virtual:workspace-mcp-app") return id;
    },
    async load(source) {
      if (source === id) return `export default ${JSON.stringify(await (html ??= bundle()))}`;
    },
    configureServer(server) {
      server.watcher.on("change", (file) => {
        if (!file.startsWith(resolve("src"))) return;
        html = undefined;
        const module = server.moduleGraph.getModuleById(id);
        if (module) server.moduleGraph.invalidateModule(module);
      });
    },
  };
}
