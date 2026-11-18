const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

module.exports = async () => {
  const root = path.resolve(__dirname, "..", "..", "..");
  // The API needs its generated database client; generating is quick and idempotent.
  const gen = spawnSync("pnpm", ["--filter", "@chartnexa/api", "generate"], {
    cwd: root,
    encoding: "utf8",
  });
  if (gen.status !== 0) throw new Error(`api generate failed:\n${gen.stdout}\n${gen.stderr}`);

  const child = spawn(
    "pnpm",
    ["--filter", "@chartnexa/api", "exec", "tsx", "scripts/test-server.ts"],
    {
      cwd: root,
      env: { ...process.env, EXPO_NO_TELEMETRY: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  globalThis.__CONTRACT_API__ = child;

  await new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`API did not start in time:\n${out}`)), 60000);
    child.stdout.on("data", (d) => {
      out += d.toString();
      const m = /READY (\d+) (\S+) (\S+)/.exec(out);
      if (m) {
        clearTimeout(timer);
        process.env.CONTRACT_API_URL = `http://127.0.0.1:${m[1]}`;
        process.env.CONTRACT_MAIL_DIR = m[2].trim();
        process.env.CONTRACT_DATABASE_URL = m[3].trim();
        resolve();
      }
    });
    child.stderr.on("data", (d) => (out += d.toString()));
    child.on("exit", (code) => reject(new Error(`API exited early (${code}):\n${out}`)));
  });
};
