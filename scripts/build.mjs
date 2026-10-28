import { mkdir, copyFile, readFile, writeFile } from "node:fs/promises";
import { transform } from "esbuild";
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
// Explicit allowlist: credentials, logs, backend sources and recordings are never published.
for (const file of ["config.js", "kaplan.png"])
  await copyFile(
    new URL("../" + file, import.meta.url),
    new URL("../dist/" + file, import.meta.url),
  );
let html = await readFile(new URL("../index.html", import.meta.url), "utf8");
html = html.replaceAll('minlength="10"', 'minlength="6"');
html = await replaceAsync(
  html,
  /<style>([\s\S]*?)<\/style>/g,
  async (match, source) =>
    `<style>${(await transform(source, { loader: "css", minify: true })).code}</style>`,
);
html = await replaceAsync(
  html,
  /<script>([\s\S]*?)<\/script>/g,
  async (match, source) =>
    `<script>${(await transform(source, { loader: "js", minify: true, target: "es2022" })).code}</script>`,
);
await writeFile(new URL("../dist/index.html", import.meta.url), html);
console.log(
  `Built optimised public frontend in dist/ (${Buffer.byteLength(html)} bytes).`,
);

async function replaceAsync(input, pattern, replacer) {
  const matches = [...input.matchAll(pattern)];
  const replacements = await Promise.all(
    matches.map((match) => replacer(...match)),
  );
  let output = "",
    position = 0;
  matches.forEach((match, index) => {
    output += input.slice(position, match.index) + replacements[index];
    position = match.index + match[0].length;
  });
  return output + input.slice(position);
}
