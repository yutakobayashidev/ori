import { definePlugin } from "nitro";
import { shutdownTelemetry, startTelemetry } from "./telemetry.server";

export default definePlugin((app) => {
  startTelemetry();
  app.hooks.hook("close", shutdownTelemetry);
});
