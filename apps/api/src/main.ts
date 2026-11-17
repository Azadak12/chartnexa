import "reflect-metadata";
import { createApp } from "./app.factory.js";
import { ConfigError, loadConfig } from "./config/config.js";

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (e) {
    // Messages name variables only, never values.
    console.error(e instanceof ConfigError ? e.message : "Failed to load configuration");
    process.exit(1);
  }
  const app = await createApp(config);
  app.enableShutdownHooks();
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}

main().catch((e: unknown) => {
  console.error("Fatal startup error", e instanceof Error ? e.message : "unknown");
  process.exit(1);
});
