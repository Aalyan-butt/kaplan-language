import { zipFunctions } from "@netlify/zip-it-and-ship-it";
import { readFile, access, mkdtemp, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
await mkdir(".netlify", { recursive: true });
const output = await mkdtemp(".netlify/package-check-");
const config = await readFile("netlify.toml", "utf8");
const list = (name) =>
  JSON.parse(config.match(new RegExp(name + "\\s*=\\s*(\\[[^\\n]+\\])"))[1]);
const result = await zipFunctions("netlify/functions", output, {
  archiveFormat: "none",
  basePath: process.cwd(),
  config: {
    "*": {
      nodeBundler: "esbuild",
      externalNodeModules: list("external_node_modules"),
      includedFiles: list("included_files"),
      nodeVersion: "22",
    },
  },
});
for (const f of result) {
  assert.equal(f.runtimeAPIVersion, 2);
  for (const secret of [".env", ".env.example"]) {
    let found = false;
    try {
      await access(join(f.path, secret));
      found = true;
    } catch {}
    assert.equal(found, false, secret + " must not be packaged");
  }
  const { default: handler } = await import(
    pathToFileURL(resolve(f.path, "netlify/functions/api.mjs")).href
  );
  const response = await handler(
    new Request("https://test.netlify.app/health"),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "ok");
  console.log(
    `${f.name}: Netlify v2 package starts successfully; health check passed; environment files excluded.`,
  );
}
