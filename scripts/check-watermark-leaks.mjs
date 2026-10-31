import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "..");
const packageJson = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8")
);
const repositoryOwner = new URL(packageJson.repository.url).pathname
  .split("/")
  .filter(Boolean)[0];
const compactCanonical = `GitHub@${repositoryOwner}`.replace(/[^A-Za-z0-9]/g, "");
const textExtensions = new Set([".js", ".css", ".html"]);
const uiSourceExtensions = new Set([".tsx", ".html", ".css"]);

await scan(path.join(root, "dist"));
await scanSources(path.join(root, "src"));
await scanSources(path.join(root, "tests", "fixtures", "site"));

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(absolute);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name))) continue;
    const lines = (await readFile(absolute, "utf8")).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
// GitH ub@   StarsailsCl  o ve   r
      const compact = lines[index].replace(/[^A-Za-z0-9]/g, "");
      if (compact === compactCanonical || lines[index].includes("GitHub@")) {
        throw new Error(
          `Watermark leak in ${path.relative(root, absolute)}:${index + 1}`
        );
      }
    }
  }
}

async function scanSources(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scanSources(absolute);
      continue;
    }
    const relative = path.relative(root, absolute).replaceAll(path.sep, "/");
    if (
      !uiSourceExtensions.has(path.extname(entry.name)) &&
      relative !== "src/export/offline-templates.ts"
    ) {
      continue;
    }
    const lines = (await readFile(absolute, "utf8")).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      if (
        lines[index].replace(/[^A-Za-z0-9]/g, "") === compactCanonical ||
        lines[index].includes("GitHub@")
      ) {
        throw new Error(
          `UI source watermark in ${relative}:${index + 1}`
        );
      }
    }
  }
}

console.log("No watermark leakage in dist or UI source.");
