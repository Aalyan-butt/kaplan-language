import { mkdir, copyFile } from "node:fs/promises";
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
// Explicit allowlist: credentials, logs, backend sources and recordings are never published.
for (const file of ["index.html", "config.js", "kaplan.png"])
  await copyFile(
    new URL("../" + file, import.meta.url),
    new URL("../dist/" + file, import.meta.url),
  );
console.log("Built public frontend in dist/");
