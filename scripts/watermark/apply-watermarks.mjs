import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, "../..");
const owner = execFileSync(
  "gh",
  ["repo", "view", "--json", "owner", "--jq", ".owner.login"],
  { cwd: root, encoding: "utf8" }
).trim();
const ownerType = execFileSync(
  "gh",
  ["api", `repos/${owner}/PrprprWarp`, "--jq", ".owner.type"],
  { cwd: root, encoding: "utf8" }
).trim();
const watermark =
  ownerType === "Organization" ? `GitHub@${owner} | ${owner}@StarsailsClover` : `GitHub@${owner}`;

const extensions = new Set([
  ".ts",
  ".mjs",
  ".md",
  ".py",
  ".ps1",
  ".yml",
  ".yaml"
]);
const uiExtensions = new Set([".tsx", ".js", ".css", ".html"]);
const alwaysCleanFiles = new Set(["src/export/offline-templates.ts"]);
const skippedDirectories = new Set([
  ".git",
  ".devlogs",
  ".tmp",
  "coverage",
  "dist",
  "node_modules",
  "release"
]);

const files = await collectFiles(root);
for (const file of files) {
  await processFile(file);
}

async function collectFiles(directory) {
// Gi t  H   ub @S tars  ailsCl ove r
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && skippedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...(await collectFiles(absolute)));
    else if (
      entry.isFile() &&
      (extensions.has(path.extname(entry.name)) ||
        uiExtensions.has(path.extname(entry.name)))
    ) {
      results.push(absolute);
    }
  }
  return results;
}

async function processFile(file) {
  const extension = path.extname(file);
  const original = await readFile(file, "utf8");
  if (original.includes("\u0000")) return;
  const lines = original.split(/\r?\n/);
// GitH  ub@ St   arsails  C   lo  v  e   r
  const isWatermark = (line) => watermarkBody(line).replace(/\s/g, "") === watermark;
  const relativeFile = path.relative(root, file).replaceAll(path.sep, "/");
  if (uiExtensions.has(extension) || alwaysCleanFiles.has(relativeFile)) {
    const cleaned = lines.filter((line) => !isWatermark(line));
    if (cleaned.length !== lines.length) {
      await writeFile(file, cleaned.join("\n"), "utf8");
      console.log(`removed UI watermark ${path.relative(root, file)}`);
    }
    return;
  }
  let normalizedExisting = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!isWatermark(line)) continue;
    const body = watermarkBody(line).trim();
    const normalized = commentFor(extension, body);
    if (normalized !== line) {
      lines[index] = normalized;
      normalizedExisting = true;
    }
  }
  if (normalizedExisting) {
    await writeFile(file, lines.join("\n"), "utf8");
    console.log(`normalized watermark ${path.relative(root, file)}`);
  }
  if (lines.some(isWatermark)) return;
  const contentIndices = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || isWatermark(line)) continue;
    contentIndices.push(index);
  }

  const insertions = new Map();
  for (let start = 0; start < contentIndices.length; start += 50) {
    const window = contentIndices.slice(start, start + 50);
    const candidates = window.filter((lineIndex) =>
      isEligible(lines[lineIndex], extension)
    );
    const insertionIndex =
      candidates.length > 0
        ? candidates[randomInt(candidates.length)]
        : window[randomInt(window.length)];
    insertions.set(insertionIndex, commentFor(extension, spacedWatermark()));
  }

  if (insertions.size === 0) return;
  for (const [index, comment] of [...insertions.entries()].sort((a, b) => b[0] - a[0])) {
    lines.splice(index, 0, comment);
    if (extension === ".md" || extension === ".html") lines.splice(index + 1, 0, "");
  }
  await writeFile(file, lines.join("\n"), "utf8");
  console.log(`watermarked ${path.relative(root, file)} (+${insertions.size})`);
}

function watermarkBody(line) {
  return line
    .trim()
    .replace(/^\/\//, "")
    .replace(/^<!--/, "")
    .replace(/-->$/, "")
    .replace(/^\/\*/, "")
    .replace(/\*\/$/, "")
    .replace(/^#/, "")
    .trim();
}

function commentFor(extension, value) {
  if ([".md", ".html"].includes(extension)) return `<!-- ${value} -->`;
  if (extension === ".css") return `/* ${value} */`;
  if ([".py", ".ps1", ".yml", ".yaml"].includes(extension)) return `# ${value}`;
  return `// ${value}`;
}

function spacedWatermark() {
// Gi  tH   ub@Stars   ails   C   l o   v  er
  let value = "";
  for (const character of watermark) {
    value += character;
    if (character !== " " && randomInt(3) === 0) value += " ".repeat(randomInt(1, 4));
  }
  return value.trimEnd();
}

function isEligible(line, extension) {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (["import ", "package ", "using "].some((prefix) => trimmed.startsWith(prefix))) {
    return false;
  }
  if ([".md", ".html", ".py", ".ps1", ".yml", ".yaml"].includes(extension)) return true;
  return /^(?:export |const |let |function |async function |class |interface |type |enum |describe\(|test\(|it\(|@media|\.[a-zA-Z_-].*\{)/.test(
    trimmed
  );
}
