import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { mcpApp } from "./scripts/mcp-app-plugin";

export default defineConfig({
  plugins: [mcpApp(), tailwindcss(), nitro(), tanstackStart(), viteReact()],
});
