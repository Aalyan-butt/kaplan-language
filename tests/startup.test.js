import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { once } from "node:events";
import { spawn } from "node:child_process";
test(
  "startup reports an occupied port instead of claiming success",
  { timeout: 15000 },
  async (t) => {
    const listener = createServer().listen(0);
    await once(listener, "listening");
    t.after(() => new Promise((resolve) => listener.close(resolve)));
    const child = spawn(process.execPath, ["app/index.js"], {
      env: { ...process.env, PORT: String(listener.address().port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(() => {
      if (child.exitCode === null) child.kill();
    });
    let output = "";
    child.stdout.on("data", (b) => (output += b));
    child.stderr.on("data", (b) => (output += b));
    const [code] = await once(child, "exit");
    assert.equal(code, 1);
    assert.match(output, /already in use/);
    assert.ok(!output.includes("Kaplan is running"));
  },
);
