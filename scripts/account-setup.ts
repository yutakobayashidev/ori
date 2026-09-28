import { getSetupToken, readAuthState } from "../src/features/auth/auth.server";

if (!readAuthState().needsSetup) {
  console.error("This workspace already has an owner. Sign in with your existing account.");
  process.exitCode = 1;
} else {
  console.log("Open /setup in your workspace and enter this one-time setup code:");
  console.log(getSetupToken());
}
